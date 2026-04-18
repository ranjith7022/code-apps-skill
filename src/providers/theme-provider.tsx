import { useEffect, useState } from "react";

import { ThemeProviderContext, type Theme } from "@/providers/theme-context";

type ThemeProviderProps = {
  children: React.ReactNode;
  defaultTheme?: Theme;
  storageKey?: string;
};

function normalizeTheme(_: Theme | null | undefined): Theme {
  return "dark";
}

export function ThemeProvider({
  children,
  defaultTheme = "dark",
  storageKey = "app-theme",
  ...props
}: ThemeProviderProps) {
  const [theme, setTheme] = useState<Theme>(() =>
    normalizeTheme((localStorage.getItem(storageKey) as Theme | null) ?? defaultTheme),
  );

  useEffect(() => {
    const root = window.document.documentElement;

    root.classList.remove("light", "dark");
    root.classList.add("dark");
    localStorage.setItem(storageKey, "dark");
  }, [storageKey, theme]);

  const value = {
    theme,
    setTheme: (nextTheme: Theme) => {
      const resolvedTheme = normalizeTheme(nextTheme);
      localStorage.setItem(storageKey, resolvedTheme);
      setTheme(resolvedTheme);
    },
  };

  return (
    <ThemeProviderContext.Provider {...props} value={value}>
      {children}
    </ThemeProviderContext.Provider>
  );
}
