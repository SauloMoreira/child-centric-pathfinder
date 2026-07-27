import { describe, it, expect, vi, beforeEach } from "vitest";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { QueryClientProvider } from "@tanstack/react-query";
import { useArchivePanel, useCreatePanel, useRenamePanel, useReorderPanels } from "../hooks";
import { workAreaKeys } from "@/lib/workspace-keys";
import { createTestQueryClient } from "@/test/test-utils";
import {
  SYN_DEFENDER_A,
  SYN_DEFENDER_B,
  SYN_PANEL_1,
  SYN_PANEL_2,
  createPanelFixture,
  createWorkAreaFixture,
} from "@/test/fixtures/work-area";
import type { WorkArea } from "../types";

// Mock da fronteira de API — jamais fala com Supabase real.
vi.mock("../api", async () => {
  const actual = await vi.importActual<typeof import("../api")>("../api");
  return {
    ...actual,
    createPanel: vi.fn(),
    renamePanel: vi.fn(),
    reorderPanels: vi.fn(),
    archivePanel: vi.fn(),
  };
});

import * as api from "../api";

const createPanelMock = vi.mocked(api.createPanel);
const renamePanelMock = vi.mocked(api.renamePanel);
const reorderPanelsMock = vi.mocked(api.reorderPanels);
const archivePanelMock = vi.mocked(api.archivePanel);

function makeWrapper() {
  const client = createTestQueryClient();
  const wrapper = ({ children }: { children: ReactNode }) => (
    <QueryClientProvider client={client}>{children}</QueryClientProvider>
  );
  return { client, wrapper };
}

beforeEach(() => {
  createPanelMock.mockReset();
  renamePanelMock.mockReset();
  reorderPanelsMock.mockReset();
  archivePanelMock.mockReset();
});

// ---------------- useCreatePanel ----------------

describe("useCreatePanel", () => {
  it("envia payload correto (defensor, nome, ícone, expectedCount, idempotencyKey)", async () => {
    createPanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      initialColumnId: "col-1",
      orderPosition: 0,
      optimisticVersion: 1,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreatePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({
        name: "Novo",
        icon: "folder",
        expectedCount: 0,
      });
    });
    expect(createPanelMock).toHaveBeenCalledTimes(1);
    const arg = createPanelMock.mock.calls[0][0];
    expect(arg.defenderUserId).toBe(SYN_DEFENDER_A);
    expect(arg.name).toBe("Novo");
    expect(arg.icon).toBe("folder");
    expect(arg.expectedCount).toBe(0);
    expect(arg.idempotencyKey).toMatch(
      /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i,
    );
  });

  it("invalida workAreaKeys.panels(defensor) em sucesso", async () => {
    createPanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      initialColumnId: "c",
      orderPosition: 0,
      optimisticVersion: 1,
    });
    const { client, wrapper } = makeWrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreatePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ name: "N", expectedCount: 0 });
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: workAreaKeys.panels(SYN_DEFENDER_A),
    });
  });

  it("gera nova idempotency key para ação subsequente (após onSettled)", async () => {
    createPanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      initialColumnId: "c",
      orderPosition: 0,
      optimisticVersion: 1,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreatePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ name: "A", expectedCount: 0 });
    });
    await act(async () => {
      await result.current.mutateAsync({ name: "B", expectedCount: 1 });
    });
    const k1 = createPanelMock.mock.calls[0][0].idempotencyKey;
    const k2 = createPanelMock.mock.calls[1][0].idempotencyKey;
    expect(k1).not.toBe(k2);
  });

  it("propaga erro do backend (PANEL_LIMIT_REACHED)", async () => {
    createPanelMock.mockRejectedValue(new Error("PANEL_LIMIT_REACHED"));
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useCreatePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await expect(result.current.mutateAsync({ name: "X", expectedCount: 8 })).rejects.toThrow(
      /PANEL_LIMIT_REACHED/,
    );
  });

  it("não invalida cache de outro Defensor", async () => {
    createPanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      initialColumnId: "c",
      orderPosition: 0,
      optimisticVersion: 1,
    });
    const { client, wrapper } = makeWrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useCreatePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ name: "N", expectedCount: 0 });
    });
    const calls = spy.mock.calls.map((c) => JSON.stringify(c[0]));
    expect(calls.some((c) => c.includes(SYN_DEFENDER_B))).toBe(false);
  });
});

// ---------------- useRenamePanel ----------------

describe("useRenamePanel", () => {
  it("envia payload esperado", async () => {
    renamePanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      optimisticVersion: 2,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useRenamePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({
        panelId: SYN_PANEL_1,
        name: "Novo Nome",
        icon: "star",
        expectedVersion: 1,
      });
    });
    const arg = renamePanelMock.mock.calls[0][0];
    expect(arg.panelId).toBe(SYN_PANEL_1);
    expect(arg.name).toBe("Novo Nome");
    expect(arg.icon).toBe("star");
    expect(arg.expectedVersion).toBe(1);
    expect(arg.idempotencyKey).toBeTruthy();
  });

  it("aplica optimistic update no cache", async () => {
    renamePanelMock.mockImplementation(async () => {
      // trava para observar cache otimista
      await new Promise((r) => setTimeout(r, 5));
      return { panelId: SYN_PANEL_1, optimisticVersion: 2 };
    });
    const { client, wrapper } = makeWrapper();
    const wa = createWorkAreaFixture({
      defenderUserId: SYN_DEFENDER_A,
      panels: [
        createPanelFixture({
          id: SYN_PANEL_1,
          defenderUserId: SYN_DEFENDER_A,
          name: "Antigo",
          position: 0,
        }),
        createPanelFixture({
          id: SYN_PANEL_2,
          defenderUserId: SYN_DEFENDER_A,
          name: "Outro",
          position: 1,
        }),
      ],
    });
    client.setQueryData(workAreaKeys.panels(SYN_DEFENDER_A), wa);
    const { result } = renderHook(() => useRenamePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.mutateAsync({
        panelId: SYN_PANEL_1,
        name: "Novo",
        expectedVersion: 1,
      });
    });
    await waitFor(() => {
      const now = client.getQueryData<WorkArea>(workAreaKeys.panels(SYN_DEFENDER_A));
      expect(now?.panels.find((p) => p.id === SYN_PANEL_1)?.name).toBe("Novo");
      // Outros painéis preservados.
      expect(now?.panels.find((p) => p.id === SYN_PANEL_2)?.name).toBe("Outro");
    });
    await act(async () => {
      await promise;
    });
  });

  it("rollback restaura snapshot em erro", async () => {
    renamePanelMock.mockRejectedValue(new Error("PANEL_NAME_ALREADY_EXISTS"));
    const { client, wrapper } = makeWrapper();
    const wa = createWorkAreaFixture({
      defenderUserId: SYN_DEFENDER_A,
      panels: [
        createPanelFixture({
          id: SYN_PANEL_1,
          defenderUserId: SYN_DEFENDER_A,
          name: "Antigo",
          position: 0,
        }),
        createPanelFixture({
          id: SYN_PANEL_2,
          defenderUserId: SYN_DEFENDER_A,
          name: "Outro",
          position: 1,
        }),
      ],
    });
    client.setQueryData(workAreaKeys.panels(SYN_DEFENDER_A), wa);
    const before = client.getQueryData<WorkArea>(workAreaKeys.panels(SYN_DEFENDER_A));
    const { result } = renderHook(() => useRenamePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({
          panelId: SYN_PANEL_1,
          name: "Novo",
          expectedVersion: 1,
        }),
      ).rejects.toThrow();
    });
    // onSettled invalida a query, mas sem observer + queryFn, o cache mantém o snapshot restaurado.
    const after = client.getQueryData<WorkArea>(workAreaKeys.panels(SYN_DEFENDER_A));
    expect(after?.panels.find((p) => p.id === SYN_PANEL_1)?.name).toBe(
      before?.panels.find((p) => p.id === SYN_PANEL_1)?.name,
    );
  });
});

// ---------------- useReorderPanels ----------------

describe("useReorderPanels", () => {
  it("envia todos os Painéis com panelId + expectedVersion", async () => {
    reorderPanelsMock.mockResolvedValue({ ok: true, count: 2 });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useReorderPanels(SYN_DEFENDER_A), {
      wrapper,
    });
    const items = [
      createPanelFixture({
        id: SYN_PANEL_2,
        defenderUserId: SYN_DEFENDER_A,
        position: 1,
        optimisticVersion: 3,
      }),
      createPanelFixture({
        id: SYN_PANEL_1,
        defenderUserId: SYN_DEFENDER_A,
        position: 0,
        optimisticVersion: 5,
      }),
    ];
    await act(async () => {
      await result.current.mutateAsync({ items });
    });
    const arg = reorderPanelsMock.mock.calls[0][0];
    expect(arg.defenderUserId).toBe(SYN_DEFENDER_A);
    expect(arg.items).toEqual([
      { panelId: SYN_PANEL_2, expectedVersion: 3 },
      { panelId: SYN_PANEL_1, expectedVersion: 5 },
    ]);
  });

  it("aplica ordem otimista no cache (positions 0..n-1)", async () => {
    reorderPanelsMock.mockImplementation(async () => {
      await new Promise((r) => setTimeout(r, 5));
      return { ok: true, count: 2 };
    });
    const { client, wrapper } = makeWrapper();
    const p1 = createPanelFixture({ id: SYN_PANEL_1, defenderUserId: SYN_DEFENDER_A, position: 0 });
    const p2 = createPanelFixture({ id: SYN_PANEL_2, defenderUserId: SYN_DEFENDER_A, position: 1 });
    const wa = createWorkAreaFixture({ defenderUserId: SYN_DEFENDER_A, panels: [p1, p2] });
    client.setQueryData(workAreaKeys.panels(SYN_DEFENDER_A), wa);
    const { result } = renderHook(() => useReorderPanels(SYN_DEFENDER_A), {
      wrapper,
    });
    let promise!: Promise<unknown>;
    act(() => {
      promise = result.current.mutateAsync({ items: [p2, p1] });
    });
    await waitFor(() => {
      const now = client.getQueryData<WorkArea>(workAreaKeys.panels(SYN_DEFENDER_A));
      expect(now?.panels.map((p) => p.id)).toEqual([SYN_PANEL_2, SYN_PANEL_1]);
      expect(now?.panels.map((p) => p.position)).toEqual([0, 1]);
    });
    await act(async () => {
      await promise;
    });
  });

  it("rollback restaura ordem anterior em erro", async () => {
    reorderPanelsMock.mockRejectedValue(new Error("CONCURRENT_CHANGE"));
    const { client, wrapper } = makeWrapper();
    const p1 = createPanelFixture({ id: SYN_PANEL_1, defenderUserId: SYN_DEFENDER_A, position: 0 });
    const p2 = createPanelFixture({ id: SYN_PANEL_2, defenderUserId: SYN_DEFENDER_A, position: 1 });
    client.setQueryData(
      workAreaKeys.panels(SYN_DEFENDER_A),
      createWorkAreaFixture({ defenderUserId: SYN_DEFENDER_A, panels: [p1, p2] }),
    );
    const { result } = renderHook(() => useReorderPanels(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await expect(result.current.mutateAsync({ items: [p2, p1] })).rejects.toThrow();
    });
    const after = client.getQueryData<WorkArea>(workAreaKeys.panels(SYN_DEFENDER_A));
    expect(after?.panels.map((p) => p.id)).toEqual([SYN_PANEL_1, SYN_PANEL_2]);
  });

  it("não perde nem duplica painel após reorder", async () => {
    reorderPanelsMock.mockResolvedValue({ ok: true, count: 2 });
    const { client, wrapper } = makeWrapper();
    const p1 = createPanelFixture({ id: SYN_PANEL_1, defenderUserId: SYN_DEFENDER_A, position: 0 });
    const p2 = createPanelFixture({ id: SYN_PANEL_2, defenderUserId: SYN_DEFENDER_A, position: 1 });
    client.setQueryData(
      workAreaKeys.panels(SYN_DEFENDER_A),
      createWorkAreaFixture({ defenderUserId: SYN_DEFENDER_A, panels: [p1, p2] }),
    );
    const { result } = renderHook(() => useReorderPanels(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ items: [p2, p1] });
    });
    const after = client.getQueryData<WorkArea>(workAreaKeys.panels(SYN_DEFENDER_A));
    const ids = after?.panels.map((p) => p.id) ?? [];
    expect(ids).toHaveLength(2);
    expect(new Set(ids).size).toBe(2);
  });
});

// ---------------- useArchivePanel ----------------

describe("useArchivePanel", () => {
  it("envia payload com panelId, expectedVersion e idempotencyKey", async () => {
    archivePanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      nextActivePanelId: SYN_PANEL_2,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useArchivePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({
        panelId: SYN_PANEL_1,
        expectedVersion: 3,
      });
    });
    const arg = archivePanelMock.mock.calls[0][0];
    expect(arg.panelId).toBe(SYN_PANEL_1);
    expect(arg.expectedVersion).toBe(3);
    expect(arg.idempotencyKey).toBeTruthy();
  });

  it("invalida cache do defensor em onSettled (sucesso e erro)", async () => {
    archivePanelMock.mockRejectedValueOnce(new Error("LAST_PANEL_CANNOT_BE_DELETED"));
    const { client, wrapper } = makeWrapper();
    const spy = vi.spyOn(client, "invalidateQueries");
    const { result } = renderHook(() => useArchivePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await expect(
        result.current.mutateAsync({ panelId: SYN_PANEL_1, expectedVersion: 1 }),
      ).rejects.toThrow();
    });
    expect(spy).toHaveBeenCalledWith({
      queryKey: workAreaKeys.panels(SYN_DEFENDER_A),
    });
  });

  it("nova idempotency key entre chamadas subsequentes", async () => {
    archivePanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      nextActivePanelId: null,
    });
    const { wrapper } = makeWrapper();
    const { result } = renderHook(() => useArchivePanel(SYN_DEFENDER_A), {
      wrapper,
    });
    await act(async () => {
      await result.current.mutateAsync({ panelId: SYN_PANEL_1, expectedVersion: 1 });
    });
    await act(async () => {
      await result.current.mutateAsync({ panelId: SYN_PANEL_2, expectedVersion: 1 });
    });
    const k1 = archivePanelMock.mock.calls[0][0].idempotencyKey;
    const k2 = archivePanelMock.mock.calls[1][0].idempotencyKey;
    expect(k1).not.toBe(k2);
  });
});

// ---------------- Ciclo de idempotência transversal ----------------

describe("idempotency keys entre ações distintas", () => {
  it("create/rename/archive não compartilham chaves", async () => {
    createPanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      initialColumnId: "c",
      orderPosition: 0,
      optimisticVersion: 1,
    });
    renamePanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      optimisticVersion: 2,
    });
    archivePanelMock.mockResolvedValue({
      panelId: SYN_PANEL_1,
      nextActivePanelId: null,
    });
    const { wrapper } = makeWrapper();
    const { result: create } = renderHook(() => useCreatePanel(SYN_DEFENDER_A), { wrapper });
    const { result: rename } = renderHook(() => useRenamePanel(SYN_DEFENDER_A), { wrapper });
    const { result: archive } = renderHook(() => useArchivePanel(SYN_DEFENDER_A), { wrapper });
    await act(async () => {
      await create.current.mutateAsync({ name: "N", expectedCount: 0 });
    });
    await act(async () => {
      await rename.current.mutateAsync({
        panelId: SYN_PANEL_1,
        name: "R",
        expectedVersion: 1,
      });
    });
    await act(async () => {
      await archive.current.mutateAsync({
        panelId: SYN_PANEL_1,
        expectedVersion: 2,
      });
    });
    const kc = createPanelMock.mock.calls[0][0].idempotencyKey;
    const kr = renamePanelMock.mock.calls[0][0].idempotencyKey;
    const ka = archivePanelMock.mock.calls[0][0].idempotencyKey;
    expect(new Set([kc, kr, ka]).size).toBe(3);
  });
});
