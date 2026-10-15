import { createContext, type ReactNode, useContext, useEffect, useState } from "react";

type SidebarBreakpoint = "default" | "wide";

export const ADMIN_ACCENTS = {
  blue: "#496786",
  slate: "#475569",
  teal: "#0f766e",
} as const;

export type AdminAccent = keyof typeof ADMIN_ACCENTS;

interface SidebarContextValue {
  breakpoint: SidebarBreakpoint;
  setBreakpoint: (breakpoint: SidebarBreakpoint) => void;
  collapsed: boolean;
  setCollapsed: (collapsed: boolean) => void;
  expandedGroup: string | null;
  expandGroup: (id: string) => void;
  accent: AdminAccent;
  setAccent: (accent: AdminAccent) => void;
}

const SIDEBAR_COLLAPSED_KEY = "commerce-admin-sidebar-collapsed";
const ADMIN_ACCENT_KEY = "commerce-admin-navigation-accent";
const SidebarContext = createContext<SidebarContextValue | undefined>(undefined);

const readCollapsedPreference = (): boolean => {
  try {
    return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
  } catch {
    // Browsers may block access to localStorage. Navigation must still work.
    return false;
  }
};

const readAccentPreference = (): AdminAccent => {
  try {
    const value = window.localStorage.getItem(ADMIN_ACCENT_KEY);

    if (value && Object.prototype.hasOwnProperty.call(ADMIN_ACCENTS, value)) {
      return value as AdminAccent;
    }
  } catch {
    // Storage may be blocked; use the default admin accent.
  }

  return "blue";
};

export const SidebarProvider = ({ children }: { children: ReactNode }) => {
  const [breakpoint, setBreakpoint] = useState<SidebarBreakpoint>("default");
  const [collapsed, setCollapsed] = useState(readCollapsedPreference);
  const [expandedGroup, setExpandedGroup] = useState<string | null>(null);
  const [accent, setAccent] = useState<AdminAccent>(readAccentPreference);

  useEffect(() => {
    try {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(collapsed));
    } catch {
      // A private browser session still gets an in-memory toggle.
    }
  }, [collapsed]);

  useEffect(() => {
    // Only Dashboard imports this provider. Never write brand/Paper theme state.
    document.documentElement.style.setProperty(
      "--commerce-admin-preference-accent",
      ADMIN_ACCENTS[accent],
    );

    try {
      window.localStorage.setItem(ADMIN_ACCENT_KEY, accent);
    } catch {
      // Retain the in-memory choice for this session.
    }
  }, [accent]);

  const expandGroup = (id: string) => {
    setExpandedGroup(id);
    setCollapsed(false);
  };

  return (
    <SidebarContext.Provider
      value={{
        breakpoint,
        setBreakpoint,
        collapsed,
        setCollapsed,
        expandedGroup,
        expandGroup,
        accent,
        setAccent,
      }}
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
