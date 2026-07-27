import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";

const STORAGE_KEY = "reintegra.sidebar.collapsed.v1";
const MOBILE_BREAKPOINT = 1024; // lg

type SidebarContextValue = {
  collapsed: boolean;
  toggleCollapsed: () => void;
  setCollapsed: (v: boolean) => void;
  mobileOpen: boolean;
  setMobileOpen: (v: boolean) => void;
  isMobile: boolean;
};

const SidebarContext = createContext<SidebarContextValue | null>(null);

function readStoredCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "1";
  } catch {
    return false;
  }
}

function writeStoredCollapsed(v: boolean) {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, v ? "1" : "0");
  } catch {
    /* silencia falhas de storage (modo privado, etc.) */
  }
}

export function SidebarProvider({ children }: { children: ReactNode }) {
  // SSR-safe: começa expandida; hidrata a preferência após montar.
  const [collapsed, setCollapsedState] = useState(false);
  const [hydrated, setHydrated] = useState(false);
  const [mobileOpen, setMobileOpen] = useState(false);
  const [isMobile, setIsMobile] = useState(false);

  useEffect(() => {
    setCollapsedState(readStoredCollapsed());
    setHydrated(true);
  }, []);

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`);
    const apply = () => setIsMobile(mql.matches);
    apply();
    mql.addEventListener("change", apply);
    return () => mql.removeEventListener("change", apply);
  }, []);

  const setCollapsed = useCallback((v: boolean) => {
    setCollapsedState(v);
    writeStoredCollapsed(v);
  }, []);

  const toggleCollapsed = useCallback(() => {
    setCollapsedState((prev) => {
      const next = !prev;
      writeStoredCollapsed(next);
      return next;
    });
  }, []);

  // Atalho Ctrl/Cmd + B (somente desktop; ignora inputs/edições).
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      const isToggle =
        (e.ctrlKey || e.metaKey) && !e.shiftKey && !e.altKey && (e.key === "b" || e.key === "B");
      if (!isToggle) return;
      const target = e.target as HTMLElement | null;
      const tag = target?.tagName;
      if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT" || target?.isContentEditable)
        return;
      if (window.matchMedia(`(max-width: ${MOBILE_BREAKPOINT - 1}px)`).matches) return;
      e.preventDefault();
      toggleCollapsed();
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [toggleCollapsed]);

  const value = useMemo<SidebarContextValue>(
    () => ({
      collapsed: hydrated ? collapsed : false,
      toggleCollapsed,
      setCollapsed,
      mobileOpen,
      setMobileOpen,
      isMobile,
    }),
    [collapsed, hydrated, toggleCollapsed, setCollapsed, mobileOpen, isMobile],
  );

  return <SidebarContext.Provider value={value}>{children}</SidebarContext.Provider>;
}

export function useSidebarState() {
  const ctx = useContext(SidebarContext);
  if (!ctx) throw new Error("useSidebarState deve ser usado dentro de SidebarProvider");
  return ctx;
}
