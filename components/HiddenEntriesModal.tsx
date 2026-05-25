"use client";

import { useEffect } from "react";
import { Company } from "@/lib/types";
import {
  DATA_QUALITY_ISSUE_LABELS,
  type DataQualityIssueCode,
} from "@/lib/data-quality";
import { formatCountry } from "@/lib/countries";
import { formatMarketCap, formatPrice } from "@/lib/utils";

interface HiddenEntriesModalProps {
  entries: Company[];
  onClose: () => void;
}

// Show the figures that tripped a given check so the user can judge for
// themselves whether the entry is genuinely corrupt or a borderline outlier.
function issueDetail(code: DataQualityIssueCode, company: Company): string {
  switch (code) {
    case "ttm_annual_rev_divergence": {
      const latestAnnual = company.revenueAnnual?.[0]?.revenue ?? null;
      return `TTM revenue ${formatMarketCap(company.revenue)} vs latest annual ${formatMarketCap(latestAnnual)}`;
    }
    case "earnings_exceeds_mcap":
      return `TTM earnings ${formatMarketCap(company.earnings)} vs market cap ${formatMarketCap(company.marketCap)}`;
    case "ttm_eps_exceeds_price":
      return `TTM EPS ${formatPrice(company.ttmEPS)} vs share price ${formatPrice(company.price)}`;
    case "fcf_exceeds_mcap":
      return `Free cash flow ${formatMarketCap(company.freeCashFlow)} vs market cap ${formatMarketCap(company.marketCap)}`;
  }
}

export default function HiddenEntriesModal({ entries, onClose }: HiddenEntriesModalProps) {
  // Close on Escape
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-black/60 backdrop-blur-sm p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-2xl max-h-[85vh] flex flex-col bg-bg-secondary border border-border-subtle rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-4 border-b border-border-subtle">
          <h2 className="text-base font-semibold text-text-primary">
            {entries.length.toLocaleString()} {entries.length === 1 ? "entry" : "entries"} hidden from the leaderboard
          </h2>
          <p className="text-[12px] text-text-muted mt-1">
            These were flagged by automated statistical checks as likely corrupt or
            non-comparable. The thresholds are heuristics, so some entries may be
            legitimate outliers rather than errors.
          </p>
        </div>

        <div className="px-5 py-4 overflow-y-auto space-y-3">
          {entries.map((company) => (
            <div
              key={company.symbol}
              className="rounded-lg bg-bg-tertiary border border-border-subtle px-3.5 py-3"
            >
              <div className="flex items-baseline justify-between gap-3">
                <div className="min-w-0">
                  <span className="text-sm font-semibold text-text-primary">{company.symbol}</span>
                  <span className="text-sm text-text-secondary ml-2 truncate">{company.name}</span>
                </div>
                <span className="text-xs text-text-muted shrink-0 tabular-nums">
                  {formatMarketCap(company.marketCap)}
                  {company.country ? ` · ${formatCountry(company.country)}` : ""}
                </span>
              </div>
              <ul className="mt-2 space-y-1.5">
                {(company.dataQualityIssues as DataQualityIssueCode[]).map((code) => (
                  <li key={code} className="text-[12px] leading-snug">
                    <span className="text-negative">{DATA_QUALITY_ISSUE_LABELS[code] ?? code}</span>
                    <span className="text-text-muted block tabular-nums">{issueDetail(code, company)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-5 py-3 bg-bg-tertiary/40 border-t border-border-subtle flex justify-end">
          <button
            type="button"
            onClick={onClose}
            className="px-4 py-1.5 text-xs font-semibold rounded-md bg-accent text-white hover:bg-accent-hover transition-colors"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
