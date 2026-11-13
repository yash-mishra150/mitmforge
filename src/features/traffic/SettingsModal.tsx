/**
 * Settings modal for AI configuration.
 */
import { useState, useEffect } from "react";
import type { AiSettings } from "../ai/settings";
import { loadAiSettings, saveAiSettings } from "../ai/settings";

interface SettingsModalProps {
  open: boolean;
  onClose: () => void;
}

export function SettingsModal({ open, onClose }: SettingsModalProps) {
  const [settings, setSettings] = useState<AiSettings>(loadAiSettings);

  useEffect(() => {
    if (open) {
      setSettings(loadAiSettings());
    }
  }, [open]);

  if (!open) return null;

  return (
    <div
      className="fixed inset-0 bg-black/50 flex items-center justify-center z-50"
      onClick={onClose}
    >
      <div
        className="bg-neutral-900 border border-neutral-800 rounded p-4 w-96"
        onClick={e => e.stopPropagation()}
      >
        <div className="flex justify-between items-center mb-4">
          <h3 className="text-sm font-medium text-neutral-500">AI Settings</h3>
          <button
            type="button"
            onClick={onClose}
            className="text-xs text-neutral-400 hover:text-neutral-200"
          >
            ×
          </button>
        </div>
        <div className="space-y-3">
          <div>
            <label className="block text-xs text-neutral-500 mb-1">Base URL</label>
            <input
              type="text"
              value={settings.baseUrl}
              onChange={e => setSettings({ ...settings, baseUrl: e.target.value })}
              className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1">API key</label>
            <input
              type="password"
              value={settings.apiKey}
              onChange={e => setSettings({ ...settings, apiKey: e.target.value })}
              className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
            />
          </div>

          <div>
            <label className="block text-xs text-neutral-500 mb-1">Model</label>
            <input
              type="text"
              value={settings.model}
              onChange={e => setSettings({ ...settings, model: e.target.value })}
              className="w-full rounded bg-neutral-800 px-2 py-1 text-xs text-neutral-200"
            />
          </div>
        </div>

        <div className="flex gap-2 mt-4">
          <button
            type="button"
            onClick={() => {
              saveAiSettings(settings);
              onClose();
            }}
            className="flex-1 rounded px-2 py-1 bg-emerald-900/50 text-emerald-300 text-xs"
          >
            Save
          </button>
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded px-2 py-1 bg-neutral-800 text-neutral-400 text-xs"
          >
            Cancel
          </button>
        </div>
      </div>
    </div>
  );
}