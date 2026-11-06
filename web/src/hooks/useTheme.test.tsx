import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, act } from "@testing-library/react";
import React from "react";
import {
  ThemeProvider,
  useTheme,
  THEME_STORAGE_KEY,
  getStoredThemeMode,
} from "./useTheme";
import { ThemeSwitcher } from "../components/ui/ThemeSwitcher";

function mockMatchMedia(prefersLight: boolean) {
  const listeners: Record<string, Array<() => void>> = {
    "(prefers-color-scheme: light)": [],
    "(prefers-color-scheme: dark)": [],
  };

  let currentPrefersLight = prefersLight;

  const matchMediaMock = vi.fn().mockImplementation((query: string) => {
    const isLightQuery = query.includes("light");
    const isDarkQuery = query.includes("dark");
    return {
      get matches() {
        if (isLightQuery) return currentPrefersLight;
        if (isDarkQuery) return !currentPrefersLight;
        return false;
      },
      media: query,
      onchange: null,
      addEventListener: (_event: string, cb: () => void) => {
        if (listeners[query]) {
          listeners[query].push(cb);
        }
      },
      removeEventListener: (_event: string, cb: () => void) => {
        if (listeners[query]) {
          listeners[query] = listeners[query].filter((fn) => fn !== cb);
        }
      },
      addListener: (cb: () => void) => {
        if (listeners[query]) {
          listeners[query].push(cb);
        }
      },
      removeListener: (cb: () => void) => {
        if (listeners[query]) {
          listeners[query] = listeners[query].filter((fn) => fn !== cb);
        }
      },
      dispatchEvent: vi.fn(),
    };
  });

  Object.defineProperty(window, "matchMedia", {
    writable: true,
    configurable: true,
    value: matchMediaMock,
  });

  return {
    setSystemLight(nextPrefersLight: boolean) {
      currentPrefersLight = nextPrefersLight;
      Object.values(listeners).forEach((arr) => arr.forEach((cb) => cb()));
    },
  };
}

const ThemeInspector: React.FC = () => {
  const { theme, resolvedTheme } = useTheme();
  return (
    <div>
      <span data-testid="theme-mode">{theme}</span>
      <span data-testid="resolved-theme">{resolvedTheme}</span>
      <ThemeSwitcher variant="compact" />
    </div>
  );
};

describe("Theme System (Auto / Dark / Light)", () => {
  beforeEach(() => {
    window.localStorage.clear();
    document.documentElement.className = "";
    delete document.documentElement.dataset.theme;
    delete document.documentElement.dataset.themeMode;
  });

  it("defaults to system mode and follows OS light theme when prefers-color-scheme is light", () => {
    mockMatchMedia(true);

    render(
      <ThemeProvider>
        <ThemeInspector />
      </ThemeProvider>,
    );

    expect(getStoredThemeMode()).toBe("system");
    expect(screen.getByTestId("theme-mode").textContent).toBe("system");
    expect(screen.getByTestId("resolved-theme").textContent).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.documentElement.dataset.themeMode).toBe("system");
  });

  it("defaults to system mode and follows OS dark theme when prefers-color-scheme is dark", () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeInspector />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("theme-mode").textContent).toBe("system");
    expect(screen.getByTestId("resolved-theme").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(document.documentElement.dataset.themeMode).toBe("system");
  });

  it("reacts in real time when OS theme changes while in system mode", () => {
    const mediaCtrl = mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeInspector />
      </ThemeProvider>,
    );

    expect(screen.getByTestId("resolved-theme").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);

    act(() => {
      mediaCtrl.setSystemLight(true);
    });

    expect(screen.getByTestId("resolved-theme").textContent).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("allows manual switching between auto, dark, and light and persists in localStorage", () => {
    mockMatchMedia(false);

    render(
      <ThemeProvider>
        <ThemeInspector />
      </ThemeProvider>,
    );

    const lightBtn = screen.getByRole("radio", { name: "切换主题为亮色模式" });
    const darkBtn = screen.getByRole("radio", { name: "切换主题为暗色模式" });
    const autoBtn = screen.getByRole("radio", {
      name: "切换主题为自动跟随系统",
    });

    // Switch to Light
    fireEvent.click(lightBtn);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("light");
    expect(screen.getByTestId("theme-mode").textContent).toBe("light");
    expect(screen.getByTestId("resolved-theme").textContent).toBe("light");
    expect(document.documentElement.classList.contains("light")).toBe(true);
    expect(document.documentElement.dataset.themeMode).toBe("light");

    // Switch to Dark
    fireEvent.click(darkBtn);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("dark");
    expect(screen.getByTestId("theme-mode").textContent).toBe("dark");
    expect(screen.getByTestId("resolved-theme").textContent).toBe("dark");
    expect(document.documentElement.classList.contains("dark")).toBe(true);
    expect(document.documentElement.dataset.themeMode).toBe("dark");

    // Switch back to Auto
    fireEvent.click(autoBtn);
    expect(window.localStorage.getItem(THEME_STORAGE_KEY)).toBe("system");
    expect(screen.getByTestId("theme-mode").textContent).toBe("system");
  });

  it("renders cards and full variants properly", () => {
    mockMatchMedia(true);

    const { rerender } = render(
      <ThemeProvider>
        <ThemeSwitcher variant="cards" />
      </ThemeProvider>,
    );

    expect(screen.getByText("自动跟随系统")).toBeDefined();
    expect(screen.getByText("暗色模式")).toBeDefined();
    expect(screen.getByText("亮色模式")).toBeDefined();

    rerender(
      <ThemeProvider>
        <ThemeSwitcher variant="full" />
      </ThemeProvider>,
    );

    expect(screen.getByRole("radio", { name: "自动" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "暗色" })).toBeDefined();
    expect(screen.getByRole("radio", { name: "亮色" })).toBeDefined();
  });
});
