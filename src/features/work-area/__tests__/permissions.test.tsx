import { describe, it, expect } from "vitest";
import { renderHook } from "@testing-library/react";
import { usePanelPermissions } from "../hooks";
import { createAccessFixture } from "@/test/fixtures/work-area";

describe("usePanelPermissions", () => {
  it("owner libera todas as capabilities", () => {
    const { result } = renderHook(() =>
      usePanelPermissions(createAccessFixture("owner")),
    );
    expect(result.current.isOwner).toBe(true);
    expect(result.current.canCreatePanel).toBe(true);
    expect(result.current.canRenamePanel).toBe(true);
    expect(result.current.canReorderPanels).toBe(true);
    expect(result.current.canArchivePanel).toBe(true);
    expect(result.current.canManageColumns).toBe(true);
    expect(result.current.canMoveCards).toBe(true);
    expect(result.current.canAddItems).toBe(true);
  });

  it("team_readonly desabilita todas as mutações", () => {
    const { result } = renderHook(() =>
      usePanelPermissions(createAccessFixture("team_readonly")),
    );
    expect(result.current.isTeamReadonly).toBe(true);
    expect(result.current.canCreatePanel).toBe(false);
    expect(result.current.canRenamePanel).toBe(false);
    expect(result.current.canReorderPanels).toBe(false);
    expect(result.current.canArchivePanel).toBe(false);
    expect(result.current.canManageColumns).toBe(false);
    expect(result.current.canMoveCards).toBe(false);
    expect(result.current.canAddItems).toBe(false);
  });

  it("technical_readonly desabilita todas as mutações", () => {
    const { result } = renderHook(() =>
      usePanelPermissions(createAccessFixture("technical_readonly")),
    );
    expect(result.current.isTechnicalReadonly).toBe(true);
    expect(result.current.canCreatePanel).toBe(false);
    expect(result.current.canManageColumns).toBe(false);
  });

  it("access indefinido → tudo negado", () => {
    const { result } = renderHook(() => usePanelPermissions(undefined));
    expect(result.current.isOwner).toBe(false);
    expect(result.current.canCreatePanel).toBe(false);
    expect(result.current.canManageColumns).toBe(false);
    expect(result.current.canMoveCards).toBe(false);
  });

  it("access.canManagePanels=false NÃO libera criação/renomeio/reorder/arquivo mesmo com accessMode=owner", () => {
    const { result } = renderHook(() =>
      usePanelPermissions({
        ...createAccessFixture("owner"),
        canManagePanels: false,
      }),
    );
    // Comportamento mais restritivo prevalece: capability granular manda.
    expect(result.current.canCreatePanel).toBe(false);
    expect(result.current.canRenamePanel).toBe(false);
    expect(result.current.canReorderPanels).toBe(false);
    expect(result.current.canArchivePanel).toBe(false);
  });
});
