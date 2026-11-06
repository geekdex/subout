import React, {
  createContext,
  useContext,
  useState,
  useEffect,
  useCallback,
  useMemo,
} from "react";

export type ThemeMode = "system" | "dark" | "light";
export type ResolvedTheme = "dark" | "light";

export const THEME_STORAGE_KEY = "subout_theme";

export function getStoredThemeMode(): ThemeMode {
  if (typeof window === "undefined") return "system";
  try {
    const raw = window.localStorage.getItem(THEME_STORAGE_KEY);
    if (raw === "dark" || raw === "light" || raw === "system") {
      return raw;
    }
  } catch {
    // ignore storage errors
  }
  return "system";
}

export function getSystemTheme(): ResolvedTheme {
  if (
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function"
  ) {
    try {
      if (window.matchMedia("(prefers-color-scheme: light)").matches) {
        return "light";
      }
      if (window.matchMedia("(prefers-color-scheme: dark)").matches) {
        return "dark";
      }
    } catch {
      // ignore matchMedia errors
    }
  }
  return "dark";
}

export function resolveTheme(mode: ThemeMode): ResolvedTheme {
  if (mode === "light") return "light";
  if (mode === "dark") return "dark";
  return getSystemTheme();
}

export function applyThemeToDocument(
  mode: ThemeMode,
  resolved: ResolvedTheme,
): void {
  if (typeof document === "undefined") return;
  const root = document.documentElement;
  root.classList.remove("dark", "light");
  root.classList.add(resolved);
  root.dataset.theme = resolved;
  root.dataset.themeMode = mode;
  root.style.colorScheme = resolved;
}

interface ThemeContextValue {
  theme: ThemeMode;
  resolvedTheme: ResolvedTheme;
  setTheme: (mode: ThemeMode) => void;
}

const ThemeContext = createContext<ThemeContextValue | null>(null);

export const ThemeProvider: React.FC<{ children: React.ReactNode }> = ({
  children,
}) => {
  const [theme, setThemeState] = useState<ThemeMode>(() =>
    getStoredThemeMode(),
  );
  const [systemTheme, setSystemTheme] = useState<ResolvedTheme>(() =>
    getSystemTheme(),
  );

  const resolvedTheme: ResolvedTheme = theme === "system" ? systemTheme : theme;

  const setTheme = useCallback((nextMode: ThemeMode) => {
    setThemeState(nextMode);
    if (typeof window !== "undefined") {
      try {
        window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
      } catch {
        // ignore storage errors
      }
    }
    const nextResolved = nextMode === "system" ? getSystemTheme() : nextMode;
    applyThemeToDocument(nextMode, nextResolved);
  }, []);

  // Apply theme class to <html> on mount & change
  useEffect(() => {
    applyThemeToDocument(theme, resolvedTheme);
  }, [theme, resolvedTheme]);

  // Listen to OS color scheme changes in real time
  useEffect(() => {
    if (
      typeof window === "undefined" ||
      typeof window.matchMedia !== "function"
    ) {
      return;
    }

    let darkMql: MediaQueryList | null = null;
    let lightMql: MediaQueryList | null = null;
    try {
      darkMql = window.matchMedia("(prefers-color-scheme: dark)");
      lightMql = window.matchMedia("(prefers-color-scheme: light)");
    } catch {
      return;
    }

    const handleChange = () => {
      const nextSys = getSystemTheme();
      setSystemTheme(nextSys);
    };

    if (typeof darkMql.addEventListener === "function") {
      darkMql.addEventListener("change", handleChange);
      lightMql?.addEventListener("change", handleChange);
      return () => {
        darkMql?.removeEventListener("change", handleChange);
        lightMql?.removeEventListener("change", handleChange);
      };
    } else if (typeof darkMql.addListener === "function") {
      darkMql.addListener(handleChange);
      lightMql?.addListener(handleChange);
      return () => {
        darkMql?.removeListener(handleChange);
        lightMql?.removeListener(handleChange);
      };
    }
  }, []);

  const value = useMemo(
    () => ({
      theme,
      resolvedTheme,
      setTheme,
    }),
    [theme, resolvedTheme, setTheme],
  );

  return (
    <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>
  );
};

export function useTheme(): ThemeContextValue {
  const ctx = useContext(ThemeContext);
  if (!ctx) {
    // Fallback when used outside ThemeProvider (e.g. isolated unit tests)
    const fallbackMode = getStoredThemeMode();
    const fallbackResolved = resolveTheme(fallbackMode);
    return {
      theme: fallbackMode,
      resolvedTheme: fallbackResolved,
      setTheme: (nextMode: ThemeMode) => {
        try {
          window.localStorage.setItem(THEME_STORAGE_KEY, nextMode);
        } catch {
          // ignore
        }
        applyThemeToDocument(nextMode, resolveTheme(nextMode));
      },
    };
  }
  return ctx;
}
