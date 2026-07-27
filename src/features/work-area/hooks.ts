import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import {
  useMutation,
  useQuery,
  useQueryClient,
  type UseMutationResult,
} from "@tanstack/react-query";
import { workAreaKeys } from "@/lib/workspace-keys";
import {
  useEstadoInstitucional,
  isDefensor,
} from "@/hooks/use-estado-institucional";
import {
  archivePanel,
  createPanel,
  ensureWorkArea,
  readWorkArea,
  renamePanel,
  reorderPanels,
  WorkAreaForbiddenError,
  WorkAreaNotInitializedError,
  type CreatePanelInput,
  type RenamePanelInput,
  type ReorderPanelsInput,
  type ArchivePanelInput,
} from "./api";
import type { PanelSummary, WorkArea, WorkspaceAccess } from "./types";
import { PANEL_MAX } from "./types";
import { panelErrorFromUnknown } from "./errors";

function uuid(): string {
  return crypto.randomUUID();
}

export type UseWorkAreaResult = {
  isOwner: boolean;
  viewerId: string | null;
  notInitialized: boolean;
  forbidden: boolean;
};

/**
 * Carrega a Área de Trabalho do Defensor.
 * - Owner: tenta leitura; se WORK_AREA_NOT_INITIALIZED, chama ensure e refaz a leitura.
 * - Membro/Admin Técnico: leitura pura. Se não inicializada, expõe estado vazio orientativo.
 */
export function useWorkArea(defenderUserId: string | null | undefined) {
  const { data: estado } = useEstadoInstitucional();
  const viewerId = estado?.user_id ?? null;
  const isOwner = !!defenderUserId && viewerId === defenderUserId;

  const query = useQuery({
    queryKey: defenderUserId
      ? workAreaKeys.panels(defenderUserId)
      : ["work-area", "unknown"],
    enabled: !!defenderUserId,
    queryFn: async (): Promise<WorkArea> => {
      try {
        return await readWorkArea({ defenderUserId: defenderUserId! });
      } catch (err) {
        if (err instanceof WorkAreaNotInitializedError && isOwner) {
          await ensureWorkArea({ defenderUserId: defenderUserId! });
          return await readWorkArea({ defenderUserId: defenderUserId! });
        }
        throw err;
      }
    },
    retry: (failureCount, err) => {
      if (
        err instanceof WorkAreaNotInitializedError ||
        err instanceof WorkAreaForbiddenError
      ) {
        return false;
      }
      return failureCount < 2;
    },
    staleTime: 15_000,
  });

  const notInitialized =
    query.error instanceof WorkAreaNotInitializedError;
  const forbidden = query.error instanceof WorkAreaForbiddenError;

  return {
    ...query,
    isOwner,
    viewerId,
    notInitialized,
    forbidden,
  } satisfies UseWorkAreaResult & typeof query;
}

// -------- create --------

export function useCreatePanel(
  defenderUserId: string,
): UseMutationResult<
  Awaited<ReturnType<typeof createPanel>>,
  unknown,
  { name: string; icon?: string | null; expectedCount: number }
> {
  const qc = useQueryClient();
  // uma idempotency key por "ação do usuário" — regenerada a cada mutate()
  const keyRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: async (vars) => {
      if (!keyRef.current) keyRef.current = uuid();
      const input: CreatePanelInput = {
        defenderUserId,
        name: vars.name,
        icon: vars.icon ?? null,
        expectedCount: vars.expectedCount,
        idempotencyKey: keyRef.current,
      };
      return createPanel(input);
    },
    onSettled: () => {
      keyRef.current = null;
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: workAreaKeys.panels(defenderUserId) });
    },
  });
}

// -------- rename --------

export function useRenamePanel(defenderUserId: string) {
  const qc = useQueryClient();
  const keyRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: async (vars: {
      panelId: string;
      name: string;
      icon?: string | null;
      expectedVersion: number;
    }) => {
      if (!keyRef.current) keyRef.current = uuid();
      const input: RenamePanelInput = {
        panelId: vars.panelId,
        name: vars.name,
        icon: vars.icon ?? null,
        expectedVersion: vars.expectedVersion,
        idempotencyKey: keyRef.current,
      };
      return renamePanel(input);
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: workAreaKeys.panels(defenderUserId) });
      const prev = qc.getQueryData<WorkArea>(
        workAreaKeys.panels(defenderUserId),
      );
      if (prev) {
        qc.setQueryData<WorkArea>(workAreaKeys.panels(defenderUserId), {
          ...prev,
          panels: prev.panels.map((p) =>
            p.id === vars.panelId
              ? { ...p, name: vars.name, icon: vars.icon ?? p.icon }
              : p,
          ),
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(workAreaKeys.panels(defenderUserId), ctx.prev);
      }
    },
    onSettled: () => {
      keyRef.current = null;
      qc.invalidateQueries({ queryKey: workAreaKeys.panels(defenderUserId) });
    },
  });
}

// -------- reorder --------

export function useReorderPanels(defenderUserId: string) {
  const qc = useQueryClient();
  const keyRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: async (vars: { items: PanelSummary[] }) => {
      if (!keyRef.current) keyRef.current = uuid();
      const input: ReorderPanelsInput = {
        defenderUserId,
        items: vars.items.map((p) => ({
          panelId: p.id,
          expectedVersion: p.optimisticVersion,
        })),
        idempotencyKey: keyRef.current,
      };
      return reorderPanels(input);
    },
    onMutate: async (vars) => {
      await qc.cancelQueries({ queryKey: workAreaKeys.panels(defenderUserId) });
      const prev = qc.getQueryData<WorkArea>(
        workAreaKeys.panels(defenderUserId),
      );
      if (prev) {
        const reordered = vars.items.map((p, idx) => ({ ...p, position: idx }));
        qc.setQueryData<WorkArea>(workAreaKeys.panels(defenderUserId), {
          ...prev,
          panels: reordered,
        });
      }
      return { prev };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.prev) {
        qc.setQueryData(workAreaKeys.panels(defenderUserId), ctx.prev);
      }
    },
    onSettled: () => {
      keyRef.current = null;
      qc.invalidateQueries({ queryKey: workAreaKeys.panels(defenderUserId) });
    },
  });
}

// -------- archive --------

export function useArchivePanel(defenderUserId: string) {
  const qc = useQueryClient();
  const keyRef = useRef<string | null>(null);

  return useMutation({
    mutationFn: async (vars: {
      panelId: string;
      expectedVersion: number;
    }) => {
      if (!keyRef.current) keyRef.current = uuid();
      const input: ArchivePanelInput = {
        panelId: vars.panelId,
        expectedVersion: vars.expectedVersion,
        idempotencyKey: keyRef.current,
      };
      return archivePanel(input);
    },
    onSettled: () => {
      keyRef.current = null;
      qc.invalidateQueries({ queryKey: workAreaKeys.panels(defenderUserId) });
    },
  });
}

// -------- Painel selecionado --------

const SELECTED_STORAGE_PREFIX = "orienta-dpe:selected-panel:";

function readSelected(defenderUserId: string): string | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage.getItem(SELECTED_STORAGE_PREFIX + defenderUserId);
  } catch {
    return null;
  }
}

function writeSelected(defenderUserId: string, panelId: string | null) {
  if (typeof window === "undefined") return;
  try {
    const key = SELECTED_STORAGE_PREFIX + defenderUserId;
    if (panelId) window.localStorage.setItem(key, panelId);
    else window.localStorage.removeItem(key);
  } catch {
    /* silencioso */
  }
}

export function useSelectedPanel(
  defenderUserId: string | null | undefined,
  panels: PanelSummary[] | undefined,
) {
  const [selectedId, setSelectedIdState] = useState<string | null>(null);

  // resolve o painel válido a cada mudança de defensor ou lista
  useEffect(() => {
    if (!defenderUserId) {
      setSelectedIdState(null);
      return;
    }
    const stored = readSelected(defenderUserId);
    const list = panels ?? [];
    const exists = stored ? list.some((p) => p.id === stored) : false;
    if (exists) {
      setSelectedIdState(stored);
      return;
    }
    const fallback = [...list].sort((a, b) => a.position - b.position)[0]?.id ?? null;
    setSelectedIdState(fallback);
    writeSelected(defenderUserId, fallback);
  }, [defenderUserId, panels]);

  const select = useCallback(
    (panelId: string | null) => {
      if (!defenderUserId) return;
      setSelectedIdState(panelId);
      writeSelected(defenderUserId, panelId);
    },
    [defenderUserId],
  );

  const selectedPanel = useMemo(
    () => panels?.find((p) => p.id === selectedId) ?? null,
    [panels, selectedId],
  );

  return { selectedId, selectedPanel, select };
}

// -------- Helpers de permissão derivadas --------

export function usePanelPermissions(access: WorkspaceAccess | undefined) {
  return useMemo(() => {
    const a = access;
    const isOwner = a?.accessMode === "owner";
    const isTeamReadonly = a?.accessMode === "team_readonly";
    const isTechnicalReadonly = a?.accessMode === "technical_readonly";
    return {
      isOwner,
      isTeamReadonly,
      isTechnicalReadonly,
      canCreatePanel: !!a?.canManagePanels,
      canRenamePanel: !!a?.canManagePanels,
      canReorderPanels: !!a?.canManagePanels,
      canArchivePanel: !!a?.canManagePanels,
      canManageColumns: !!a?.canManageColumns,
      canMoveCards: !!a?.canMoveCards,
      canAddItems: !!a?.canAddItems,
    };
  }, [access]);
}

// -------- Handler compartilhado de erro (i18n) --------

export function useHandlePanelError() {
  return useCallback((err: unknown) => panelErrorFromUnknown(err), []);
}

export const PANEL_LIMIT = PANEL_MAX;
