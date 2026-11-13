import React from "react";

export interface ThemeColors {
  bg: string;
  surface: string;
  border: string;
  text: string;
  textMuted: string;
  accent: string;
  success: string;
  warning: string;
  danger: string;
}

/**
 * Theme configuration combining colors, font, and size.
 */
export interface Theme {
  colors: ThemeColors;
  fontFamily: string;
  fontSize: number;
}

/**
 * Default dark theme matching app palette.
 * bg "#171717", surface "#0a0a0a", border "#262626", text "#e5e5e5",
 * textMuted "#a3a3a3", accent "#34d399", success "#34d399",
 * warning "#fbbf24", danger "#fb7185".
 * Font family: "Cascadia Mono", "Consolas", ui-monospace, monospace.
 * Font size: 12px.
 */
export const DEFAULT_THEME: Theme = {
  colors: {
    bg: "#171717",
    surface: "#0a0a0a",
    border: "#262626",
    text: "#e5e5e5",
    textMuted: "#a3a3a3",
    accent: "#34d399",
    success: "#34d399",
    warning: "#fbbf24",
    danger: "#fb7185",
  },
  fontFamily: '"Cascadia Mono", "Consolas", ui-monospace, monospace',
  fontSize: 12,
};

/**
 * Token metadata for each theme color field, mapping to CSS custom properties.
 */
export const COLOR_TOKENS: Array<{ key: keyof ThemeColors; label: string; cssVar: string }> = [
  { key: "bg", label: "Background", cssVar: "--mt-bg" },
  { key: "surface", label: "Surface", cssVar: "--mt-surface" },
  { key: "border", label: "Border", cssVar: "--mt-border" },
  { key: "text", label: "Text", cssVar: "--mt-text" },
  { key: "textMuted", label: "Text muted", cssVar: "--mt-text-muted" },
  { key: "accent", label: "Accent", cssVar: "--mt-accent" },
  { key: "success", label: "Success", cssVar: "--mt-success" },
  { key: "warning", label: "Warning", cssVar: "--mt-warning" },
  { key: "danger", label: "Danger", cssVar: "--mt-danger" },
];

/**
 * Load saved theme from localStorage with validation and shallow merge.
 * Key: "mitmforge.theme". Parse JSON; if invalid, fallback.
 * Validate color strings, fontSize positive number; keep defaults for invalid fields.
 */
export function loadTheme(): Theme {
  const raw = localStorage.getItem("mitmforge.theme");
  let parsed: Partial<Theme> = {};
  try {
    if (raw) parsed = JSON.parse(raw);
  } catch {
    parsed = {};
  }
  return {
    colors: {
      ...DEFAULT_THEME.colors,
      ...(parsed.colors ? {
        bg: typeof parsed.colors.bg === "string" ? parsed.colors.bg : DEFAULT_THEME.colors.bg,
        surface: typeof parsed.colors.surface === "string" ? parsed.colors.surface : DEFAULT_THEME.colors.surface,
        border: typeof parsed.colors.border === "string" ? parsed.colors.border : DEFAULT_THEME.colors.border,
        text: typeof parsed.colors.text === "string" ? parsed.colors.text : DEFAULT_THEME.colors.text,
        textMuted: typeof parsed.colors.textMuted === "string" ? parsed.colors.textMuted : DEFAULT_THEME.colors.textMuted,
        accent: typeof parsed.colors.accent === "string" ? parsed.colors.accent : DEFAULT_THEME.colors.accent,
        success: typeof parsed.colors.success === "string" ? parsed.colors.success : DEFAULT_THEME.colors.success,
        warning: typeof parsed.colors.warning === "string" ? parsed.colors.warning : DEFAULT_THEME.colors.warning,
        danger: typeof parsed.colors.danger === "string" ? parsed.colors.danger : DEFAULT_THEME.colors.danger,
      } : {}),
    },
    fontFamily: typeof parsed.fontFamily === "string" ? parsed.fontFamily : DEFAULT_THEME.fontFamily,
    fontSize: typeof parsed.fontSize === "number" && parsed.fontSize > 0 ? parsed.fontSize : DEFAULT_THEME.fontSize,
  };
}

/**
 * Save theme to localStorage.
 */
export function saveTheme(theme: Theme): void {
  localStorage.setItem("mitmforge.theme", JSON.stringify(theme));
}

/**
 * Apply theme to document CSS custom properties.
 */
export function applyTheme(theme: Theme): void {
  const root = document.documentElement;
  COLOR_TOKENS.forEach(({ key, cssVar }) => {
    root.style.setProperty(cssVar, theme.colors[key]);
  });
  root.style.setProperty("--mt-font", theme.fontFamily);
  root.style.setProperty("--mt-font-size", `${theme.fontSize}px`);
}

/**
 * React component for editing theme configuration with live preview.
 */
export function ThemeEditor({ value, onChange }: { value: Theme; onChange: (next: Theme) => void }) {
  const [internal, setInternal] = React.useState<Theme>({ ...value });

  React.useEffect(() => {
    setInternal({ ...value });
  }, [value]);

  const handleFontFamilyChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...internal, fontFamily: e.target.value };
    setInternal(next);
    onChange(next);
    applyTheme(next);
  };

  const handleFontSizeChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...internal, fontSize: Math.max(8, Math.min(24, Number(e.target.value))) };
    setInternal(next);
    onChange(next);
    applyTheme(next);
  };

  const handleColorChange = (key: keyof ThemeColors) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const next = { ...internal, colors: { ...internal.colors, [key]: e.target.value } };
    setInternal(next);
    onChange(next);
    applyTheme(next);
  };

  return (
    <div className="p-4 space-y-4">
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-neutral-500">Font family</label>
        <input type="text" value={internal.fontFamily} onChange={handleFontFamilyChange} className="bg-neutral-800 rounded px-2 py-1 text-xs text-neutral-200" />
      </div>
      <div className="flex items-center justify-between gap-2">
        <label className="text-xs text-neutral-500">Font size (px)</label>
        <input type="number" min="8" max="24" value={internal.fontSize} onChange={handleFontSizeChange} className="bg-neutral-800 rounded px-2 py-1 text-xs text-neutral-200" />
      </div>
      {COLOR_TOKENS.map(({ key, label }) => (
        <div key={key} className="flex items-center justify-between gap-2">
          <label className="text-xs text-neutral-500">{label}</label>
          <input type="color" value={internal.colors[key]} onChange={handleColorChange(key)} className="w-8 h-8 p-0 border-0 bg-transparent" />
        </div>
      ))}
    </div>
  );
}