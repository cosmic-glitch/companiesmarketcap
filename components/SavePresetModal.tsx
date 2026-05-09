"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";
import { PresetConfig } from "@/lib/types";

const ICON_CHOICES = [
  "📈", "📉", "💰", "💎", "🏦", "🚀", "⭐", "🎯",
  "🛡️", "🌍", "🔥", "⚡", "🪙", "🧮", "📊", "🏆",
  "🌱", "🐂", "🐻", "🧠", "💡", "🔬", "🏗️", "✨",
];

const MAX_LABEL_LEN = 60;
const MAX_ICON_LEN = 8;

interface SavePresetModalProps {
  isOpen: boolean;
  onClose: () => void;
  currentFilters: Record<string, string>;
  currentSort: { sortBy?: string; sortOrder?: "asc" | "desc" };
  onSaved: (preset: PresetConfig) => void;
}

export default function SavePresetModal({
  isOpen,
  onClose,
  currentFilters,
  currentSort,
  onSaved,
}: SavePresetModalProps) {
  const [label, setLabel] = useState("");
  const [icon, setIcon] = useState(ICON_CHOICES[0]);
  const [customIcon, setCustomIcon] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const labelInputRef = useRef<HTMLInputElement>(null);

  // Reset on open and focus the label
  useEffect(() => {
    if (!isOpen) return;
    setLabel("");
    setIcon(ICON_CHOICES[0]);
    setCustomIcon("");
    setError(null);
    setSubmitting(false);
    // Focus the label input after the modal mounts
    const t = setTimeout(() => labelInputRef.current?.focus(), 0);
    return () => clearTimeout(t);
  }, [isOpen]);

  // Close on Escape
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, submitting, onClose]);

  if (!isOpen) return null;

  const finalIcon = customIcon.trim() || icon;
  const trimmedLabel = label.trim();
  const canSave = trimmedLabel.length > 0 && finalIcon.length > 0 && !submitting;

  const handleSave = async () => {
    if (!canSave) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/presets", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          label: trimmedLabel,
          icon: finalIcon,
          filters: currentFilters,
          sort: currentSort.sortBy ? currentSort : {},
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to save preset");
      }
      onSaved(data.preset as PresetConfig);
      onClose();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  const filterCount = Object.keys(currentFilters).length;
  const summary =
    [
      filterCount > 0 ? `${filterCount} filter${filterCount === 1 ? "" : "s"}` : null,
      currentSort.sortBy ? `sorted by ${currentSort.sortBy} ${currentSort.sortOrder ?? "asc"}` : null,
    ]
      .filter(Boolean)
      .join(" · ") || "No filters or sort selected";

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={() => !submitting && onClose()}
    >
      <div
        className="w-full max-w-md bg-bg-secondary border border-border-subtle rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-base font-semibold text-text-primary">Save current view as preset</h2>
          <p className="text-[12px] text-text-muted mt-1">
            Visible to everyone who opens the leaderboard.
          </p>
        </div>

        <div className="px-5 py-4 space-y-4">
          {/* Preview */}
          <div>
            <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              Preview
            </label>
            <div className="flex items-center gap-2.5 px-2.5 py-2 rounded-lg bg-bg-tertiary border border-border-subtle">
              <span className="text-base">{finalIcon || "·"}</span>
              <div className="min-w-0 flex-1">
                <div className="text-[13px] font-medium text-text-primary truncate">
                  {trimmedLabel || <span className="text-text-muted">(name your preset)</span>}
                </div>
                <div className="text-[11px] text-text-muted truncate">{summary}</div>
              </div>
            </div>
          </div>

          {/* Label */}
          <div>
            <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              Name
            </label>
            <input
              ref={labelInputRef}
              type="text"
              value={label}
              onChange={(e) => setLabel(e.target.value.slice(0, MAX_LABEL_LEN))}
              onKeyDown={(e) => {
                if (e.key === "Enter" && canSave) handleSave();
              }}
              placeholder="e.g. Cheap quality compounders"
              maxLength={MAX_LABEL_LEN}
              className="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
            />
            <div className="text-[10px] text-text-muted mt-1 text-right tabular-nums">
              {label.length}/{MAX_LABEL_LEN}
            </div>
          </div>

          {/* Icon picker */}
          <div>
            <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
              Icon
            </label>
            <div className="grid grid-cols-8 gap-1.5">
              {ICON_CHOICES.map((opt) => {
                const selected = !customIcon.trim() && icon === opt;
                return (
                  <button
                    key={opt}
                    type="button"
                    onClick={() => {
                      setIcon(opt);
                      setCustomIcon("");
                    }}
                    className={cn(
                      "h-8 rounded-md text-base flex items-center justify-center transition-colors",
                      selected
                        ? "bg-accent/15 ring-1 ring-accent"
                        : "bg-bg-tertiary hover:bg-bg-hover"
                    )}
                    aria-label={`Pick icon ${opt}`}
                  >
                    {opt}
                  </button>
                );
              })}
            </div>
            <input
              type="text"
              value={customIcon}
              onChange={(e) => setCustomIcon(e.target.value.slice(0, MAX_ICON_LEN))}
              placeholder="Or paste your own (emoji, 1-8 chars)"
              maxLength={MAX_ICON_LEN}
              className="mt-2 w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
            />
          </div>

          {error && (
            <div className="text-[12px] text-negative bg-negative/10 border border-negative/30 rounded-md px-3 py-2">
              {error}
            </div>
          )}
        </div>

        <div className="px-5 py-3 bg-bg-tertiary/40 border-t border-border-subtle flex gap-2 justify-end">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-bg-tertiary border border-border-subtle rounded-md hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!canSave}
            className={cn(
              "px-4 py-1.5 text-xs font-semibold rounded-md transition-colors",
              canSave
                ? "bg-accent text-white hover:bg-accent-hover"
                : "bg-bg-tertiary text-text-muted cursor-not-allowed"
            )}
          >
            {submitting ? "Saving…" : "Save preset"}
          </button>
        </div>
      </div>
    </div>
  );
}
