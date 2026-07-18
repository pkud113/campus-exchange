"use client";

import { Monitor, Moon, Sun } from "lucide-react";
import { useEffect, useState } from "react";
import { resolveTheme, type Theme } from "@/lib/theme";

export function applyTheme(theme: Theme) {
  const resolved = resolveTheme(theme, matchMedia("(prefers-color-scheme: dark)").matches);
  document.documentElement.dataset.theme = resolved;
  localStorage.setItem("campus-theme", theme);
  document.cookie = `campus-theme=${theme}; Path=/; Max-Age=31536000; SameSite=Lax; Secure`;
}

const options = [
  { value: "light" as const, label: "Light", Icon: Sun },
  { value: "system" as const, label: "System", Icon: Monitor },
  { value: "dark" as const, label: "Dark", Icon: Moon },
];

export function ThemeToggle({ compact = false }: { compact?: boolean }) {
  const [theme, setTheme] = useState<Theme>("system");

  useEffect(() => {
    const saved = localStorage.getItem("campus-theme") as Theme | null;
    if (saved && options.some((option) => option.value === saved)) {
      setTheme(saved);
      applyTheme(saved);
    }
  }, []);

  return (
    <div className={`theme-control${compact ? " compact" : ""}`}>
      {!compact && <span className="theme-control-label">Appearance</span>}
      <div className="theme-segment" role="group" aria-label="Color theme">
        {options.map(({ value, label, Icon }) => (
          <button
            key={value}
            type="button"
            className={theme === value ? "active" : ""}
            aria-label={`${label} theme`}
            aria-pressed={theme === value}
            title={`${label} theme`}
            onClick={() => {
              setTheme(value);
              applyTheme(value);
            }}
          >
            <Icon aria-hidden="true" />
            {!compact && <span>{label}</span>}
          </button>
        ))}
      </div>
    </div>
  );
}
