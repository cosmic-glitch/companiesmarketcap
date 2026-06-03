"use client";

import { useEffect, useRef, useState } from "react";
import { cn } from "@/lib/utils";

const MAX_MESSAGE_LEN = 2000;

// Self-contained suggestion box: a floating pill that opens a modal. Submissions
// POST to /api/feedback, which stores them in Vercel Blob for offline review.
// There is no reader UI by design.
export default function FeedbackWidget() {
  const [isOpen, setIsOpen] = useState(false);
  const [message, setMessage] = useState("");
  const [email, setEmail] = useState("");
  // Honeypot: bound to a visually-hidden field; real users never touch it.
  const [website, setWebsite] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const messageRef = useRef<HTMLTextAreaElement>(null);

  // Reset all fields to empty on open — nothing is pre-populated.
  useEffect(() => {
    if (!isOpen) return;
    setMessage("");
    setEmail("");
    setWebsite("");
    setError(null);
    setSubmitting(false);
    setDone(false);
    const t = setTimeout(() => messageRef.current?.focus(), 0);
    return () => clearTimeout(t);
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
          email: email.trim(),
          website, // honeypot
          path: typeof window !== "undefined" ? window.location.pathname : null,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        throw new Error(data?.error || "Failed to send");
      }
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
        aria-label="Suggest a feature"
      >
        💡 Suggest a feature
      </button>

      {isOpen && (
        <div
          className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
          onClick={() => !submitting && setIsOpen(false)}
        >
          <div
            className="w-full max-w-md bg-bg-secondary border border-border-subtle rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="px-5 py-4 border-b border-border-subtle">
              <h2 className="text-base font-semibold text-text-primary">
                {done ? "Thanks for the suggestion!" : "Suggest a feature"}
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

                  <div>
                    <label className="block text-[11px] font-medium text-text-muted uppercase tracking-wider mb-1.5">
                      Email <span className="normal-case text-text-muted/70">(optional, if you want a reply)</span>
                    </label>
                    <input
                      type="email"
                      value={email}
                      onChange={(e) => setEmail(e.target.value)}
                      placeholder="you@example.com"
                      className="w-full px-3 py-2 text-sm bg-bg-tertiary border border-border-subtle rounded-md text-text-primary placeholder:text-text-muted focus:outline-none focus:ring-1 focus:ring-accent focus:border-transparent"
                    />
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
