import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

type SidebarBreakpoint = "default" | "wide";

interface SidebarContextValue {
  breakpoint: SidebarBreakpoint;
  setBreakpoint: (breakpoint: SidebarBreakpoint) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  expandedGroup: string | null;
  expandGroup: (id: string) => void;
}

const SIDEBAR_COLLAPSED_KEY = "commerce-admin-sidebar-collapsed";
const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

const readCollapsedPreference = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    // Browsers may block access to localStorage. Navigation must still work.
    return false;
  }
};

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [breakpoint, setBreakpoint] = useState<SidebarBreakpoint>("default");
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // A private browser session still gets an in-memory toggle.
    }
  }, [collapsed]);

  const expandGroup = (id: string) => {
    setExpandedGroup(id);
    setCollapsed(false);
  };

  return (
    <SidebarContext.Provider
      value={{ breakpoint, setBreakpoint, collapsed, setCollapsed, expandedGroup, expandGroup }}
    >
      {children}
    </SidebarContext.Provider>
  );
};

export const useSidebarBreakpointContext = () => {
  const context = useContext(SidebarContext);

  if (context === undefined) {
    throw new Error("useSidebarBreakpoint must be used within a SidebarProvider");
  }

  return context;
};

/**
 * A page can request a wider desktop drawer. Restores default on unmount.
 */
export const useCustomSidebarBreakpoint = (breakpoint: SidebarBreakpoint) => {
  const { setBreakpoint } = useSidebarBreakpointContext();

  useEffect(() => {
    setBreakpoint(breakpoint);

    return () => {
      setBreakpoint("default");
    };
  }, [breakpoint, setBreakpoint]);
};
