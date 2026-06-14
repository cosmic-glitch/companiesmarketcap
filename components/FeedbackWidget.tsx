"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_LEN = 2000;
const MAX_NAME_LEN = 80;

interface PublicSuggestion {
  message: string;
  name: string | null;
  submittedAt: string;
  response: string | null;
  respondedAt: string | null;
}

// Compact relative time, e.g. "just now", "3h ago", "2d ago".
function relativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffMs = Date.now() - then;
  const mins = Math.floor(diffMs / 60000);
  if (mins < 1) return "just now";
  if (mins < 60) return `${mins}m ago`;
  const hrs = Math.floor(mins / 60);
  if (hrs < 24) return `${hrs}h ago`;
  const days = Math.floor(hrs / 24);
  if (days < 30) return `${days}d ago`;
  const months = Math.floor(days / 30);
  if (months < 12) return `${months}mo ago`;
  return `${Math.floor(months / 12)}y ago`;
}

// Self-contained suggestion box: a floating pill that opens a modal. Submissions
// POST to /api/feedback (stored in Vercel Blob); the modal also lists recent
// public suggestions (message + name only) fetched from GET /api/feedback.
export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  // Honeypot: bound to a visually-hidden field; real users never touch it.
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const [suggestions, setSuggestions] = useState<PublicSuggestion[]>([]);
  const [loadingSuggestions, setLoadingSuggestions] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Reset all fields to empty on open — nothing is pre-populated — and load the
  // public suggestion list.
  useEffect(() => {
    if (!isOpen) return;
    setMessage("");
    setName("");
    setEmail("");
    setWebsite("");
    setError(null);
    setSubmitting(false);
    setDone(false);

    let cancelled = false;
    setLoadingSuggestions(true);
    fetch("/api/feedback")
      .then((res) => (res.ok ? res.json() : Promise.reject(res)))
      .then((data) => {
        if (!cancelled) setSuggestions(data.suggestions ?? []);
      })
      .catch(() => {
        if (!cancelled) setSuggestions([]);
      })
      .finally(() => {
        if (!cancelled) setLoadingSuggestions(false);
      });

    const t = setTimeout(() => messageRef.current?.focus(), 0);
    return () => {
      cancelled = true;
      clearTimeout(t);
    };
  }, [isOpen]);

  // Close on Escape.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape" && !submitting) setIsOpen(false);
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [isOpen, submitting]);

  const trimmedMessage = message.trim();
  const canSubmit = trimmedMessage.length > 0 && !submitting;

  const handleSubmit = async () => {
    if (!canSubmit) return;
    setSubmitting(true);
    setError(null);
    try {
      const res = await fetch("/api/feedback", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          message: trimmedMessage,
          name: name.trim(),
          email: email.trim(),
          website, // honeypot
          path: typeof window !== "undefined" ? window.location.pathname : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to send");
      }
      // Optimistically surface the new idea — the server list is cached ~60s, so
      // a refetch wouldn't show it immediately.
      setSuggestions((prev) => [
        {
          message: trimmedMessage,
          name: name.trim() || null,
          submittedAt: new Date().toISOString(),
          response: null,
          respondedAt: null,
        },
        ...prev,
      ]);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setSubmitting(false);
    }
  };

  return (
    <>
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        className="ml-auto flex items-center gap-1.5 px-3 py-1.5 text-[13px] rounded-lg border bg-bg-tertiary border-border-subtle text-text-secondary hover:border-accent/50 hover:text-text-primary transition-colors whitespace-nowrap"
        aria-label="Suggest an improvement"
      >
        💡 Suggest an improvement
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !submitting && setIsOpen(false)}
        >
          <div
            className="w-full max-w-2xl bg-bg-secondary border border-border-subtle rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-base font-semibold text-text-primary">
                {done ? "Thanks for the suggestion!" : "Suggest an improvement"}
              </h2>
              <p className="text-[12px] text-text-muted mt-1">
                {done
                  ? "It's been recorded. We read every one."
                  : "What would make this leaderboard more useful to you?"}
              </p>
            </div>

            {done ? (
              <div className="px-5 py-6 flex justify-end">
                <button
                  type="button"
                  onClick={() => setIsOpen(false)}
                  className="px-4 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
                >
                  Done
                </button>
              </div>
            ) : (
              <>
                <div className="px-5 py-4 space-y-4">
                  <div>
                    <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                      Your idea
                    </label>
                    <textarea
                      ref={messageRef}
                      value={message}
                      onChange={(e) => setMessage(e.target.value.slice(0, MAX_MESSAGE_LEN))}
                      onKeyDown={(e) => {
                        // Cmd/Ctrl+Enter submits.
                        if ((e.metaKey || e.ctrlKey) && e.key === "Enter" && canSubmit) {
                          handleSubmit();
                        }
                      }}
                      rows={4}
                      placeholder="e.g. Add a price-to-book column, or let me filter by sector…"
                      maxLength={MAX_MESSAGE_LEN}
                      className="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent resize-none"
                    />
                    <div className="text-[10px] text-text-muted mt-1 text-right tabular-nums">
                      {message.length}/{MAX_MESSAGE_LEN}
                    </div>
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div>
                      <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                        Name <span className="normal-case text-text-muted/70">(optional)</span>
                      </label>
                      <input
                        type="text"
                        value={name}
                        onChange={(e) => setName(e.target.value.slice(0, MAX_NAME_LEN))}
                        maxLength={MAX_NAME_LEN}
                        placeholder="Shown with your idea"
                        className="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                    <div>
                      <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                        Email <span className="normal-case text-text-muted/70">(optional)</span>
                      </label>
                      <input
                        type="email"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        placeholder="Private, for a reply"
                        className="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
                      />
                    </div>
                  </div>

                  {/* Honeypot — hidden from humans, tempting to bots. Not tab-reachable. */}
                  <div aria-hidden="true" className="absolute -left-[9999px] h-0 w-0 overflow-hidden">
                    <label>
                      Website
                      <input
                        type="text"
                        tabIndex={-1}
                        autoComplete="off"
                        value={website}
                        onChange={(e) => setWebsite(e.target.value)}
                      />
                    </label>
                  </div>

                  {error && (
                    <div className="text-[12px] text-negative bg-negative/10 border border-negative/30 rounded-md px-3 py-2">
                      {error}
                    </div>
                  )}
                </div>

                {/* Public table of what others have suggested, with the owner's
                    reply in its own column (written via scripts/respond-feedback.ts). */}
                <div className="px-5 pb-4 border-t border-border-subtle pt-4">
                  <h3 className="text-[11px] font-medium text-text-muted uppercase tracking-wider mb-2">
                    What others have suggested
                  </h3>
                  {loadingSuggestions ? (
                    <p className="text-[12px] text-text-muted py-2">Loading…</p>
                  ) : suggestions.length === 0 ? (
                    <p className="text-[12px] text-text-muted py-2">
                      No suggestions yet — be the first!
                    </p>
                  ) : (
                    <div className="max-h-64 overflow-y-auto border border-border-subtle rounded-md">
                      <table className="w-full text-sm border-collapse">
                        <thead className="sticky top-0 z-10 bg-bg-secondary">
                          <tr className="text-left text-[11px] font-medium text-text-muted uppercase tracking-wider">
                            <th className="w-1/2 px-3 py-2 font-medium border-b border-border-subtle">
                              Suggestion
                            </th>
                            <th className="w-1/2 px-3 py-2 font-medium border-b border-l border-border-subtle">
                              Response
                            </th>
                          </tr>
                        </thead>
                        <tbody>
                          {suggestions.map((s, i) => (
                            <tr
                              key={`${s.submittedAt}-${i}`}
                              className="align-top border-b border-border-subtle last:border-b-0"
                            >
                              <td className="px-3 py-2">
                                <p className="text-text-primary whitespace-pre-wrap break-words">
                                  {s.message}
                                </p>
                                <div className="text-[11px] text-text-muted mt-1">
                                  {s.name?.trim() || "Anonymous"} · {relativeTime(s.submittedAt)}
                                </div>
                              </td>
                              <td className="px-3 py-2 border-l border-border-subtle">
                                {s.response?.trim() ? (
                                  <p className="text-text-secondary whitespace-pre-wrap break-words">
                                    {s.response}
                                  </p>
                                ) : (
                                  <span className="text-text-muted">—</span>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )}
                </div>

                <div className="px-5 py-3 bg-bg-tertiary/40 border-t border-border-subtle flex gap-2 justify-end">
                  <button
                    type="button"
                    onClick={() => setIsOpen(false)}
                    disabled={submitting}
                    className="px-3 py-1.5 text-xs font-medium text-text-secondary bg-bg-tertiary border border-border-subtle rounded-md hover:bg-bg-hover hover:text-text-primary transition-colors disabled:opacity-50"
                  >
                    Cancel
                  </button>
                  <button
                    type="button"
                    onClick={handleSubmit}
                    disabled={!canSubmit}
                    className={cn(
                      "px-4 py-1.5 text-xs font-semibold rounded-md transition-colors",
                      canSubmit
                        ? "bg-accent text-white hover:bg-accent-hover"
                        : "bg-bg-tertiary text-text-muted cursor-not-allowed"
                    )}
                  >
                    {submitting ? "Sending…" : "Send suggestion"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </>
  );
}
