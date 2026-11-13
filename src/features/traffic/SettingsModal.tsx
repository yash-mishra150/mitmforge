import { useEffect, useState } from "react";
import type { AiSettings } from "../ai/settings";
import { loadAiSettings, saveAiSettings } from "../ai/settings";
import type { Theme } from "../../theme/theme";
import { applyTheme, loadTheme, saveTheme, DEFAULT_THEME, ThemeEditor } from "../../theme/theme";

const TABS = ["ai", "theme"] as const;
type Tab = (typeof TABS)[number];

/** Unified settings modal: AI endpoint config + theme tokens (live preview). */
export function SettingsModal({ open, onClose }: { open: boolean; onClose: () => void }) {
  const [tab, setTab] = useState<Tab>("ai");
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);
  const [theme, setTheme] = useState<Theme>(loadTheme);
  const themeAtOpen = loadTheme();

  useEffect(() => {
    if (open) {
      setSettings(loadAiSettings());
      setTheme(loadTheme());
      setTab("ai");
    }
  }, [open]);

  if (!open) return null;

  // Cancel: revert any live-preview theme changes made while the modal was open.
  const close = () => {
    applyTheme(themeAtOpen);
    onClose();
  };

  const save = () => {
    saveAiSettings(settings);
    saveTheme(theme);
    applyTheme(theme);
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/50"
      onClick={close}
    >
      <div
        className="w-96 rounded border border-neutral-800 bg-neutral-900 p-4"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-3 flex items-center gap-1">
          {TABS.map((t) => (
            <button
              key={t}
              type="button"
              onClick={() => setTab(t)}
              className={`rounded px-2 py-1 text-xs capitalize ${tab === t ? "bg-emerald-900/50 text-emerald-300" : "bg-neutral-800 text-neutral-400"} hover:brightness-125`}
            >
              {t}
            </button>
          ))}
          <button
            type="button"
            onClick={close}
            className="ml-auto text-xs text-neutral-400 hover:text-neutral-200"
          >
            ×
          </button>
        </div>

        {tab === "ai" && (
          <div className="space-y-3">
            <Field label="Base URL">
              <input
                type="text"
                value={settings.baseUrl}
                onChange={(e) => setSettings({ ...settings, baseUrl: e.target.value })}
                className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
              />
            </Field>
            <Field label="API key">
              <input
                type="password"
                value={settings.apiKey}
                onChange={(e) => setSettings({ ...settings, apiKey: e.target.value })}
                className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
              />
            </Field>
            <Field label="Model">
              <input
                type="text"
                value={settings.model}
                onChange={(e) => setSettings({ ...settings, model: e.target.value })}
                className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
              />
            </Field>
            <p className="text-xs text-neutral-600">
              Any OpenAI-compatible endpoint works (OpenRouter, LM Studio, Ollama…).
            </p>
          </div>
        )}

        {tab === "theme" && (
          <div className="space-y-3">
            <ThemeEditor value={theme} onChange={setTheme} />
            <button
              type="button"
              onClick={() => {
                setTheme(DEFAULT_THEME);
                applyTheme(DEFAULT_THEME);
              }}
              className="rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400 hover:brightness-125"
            >
              Reset to default
            </button>
          </div>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={save}
            className="flex-1 rounded bg-emerald-900/50 px-2 py-1 text-xs text-emerald-300"
          >
            Save
          </button>
          <button
            type="button"
            onClick={close}
            className="flex-1 rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-400"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}

/** Labeled form row. */
function Field({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="mb-1 block text-xs text-neutral-500">{label}</label>
      {children}
    </div>
  );
}
