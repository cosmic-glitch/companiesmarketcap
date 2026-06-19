"use client";

import { useEffect } from "react";
import { Company } from "@/lib/types";
import {
  DATA_QUALITY_ISSUE_LABELS,
  type DataQualityIssueCode,
} from "@/lib/data-quality";
import { formatCountry } from "@/lib/countries";
import { cleanCompanyName } from "@/lib/company-name";
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
        className="w-full max-w-3xl max-h-[85vh] flex flex-col bg-bg-secondary border border-border-subtle rounded-2xl shadow-[0_24px_64px_rgba(0,0,0,0.6)] overflow-hidden"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="px-5 py-3 border-b border-border-subtle">
          <h2 className="text-sm font-semibold text-text-primary">
            {entries.length.toLocaleString()} {entries.length === 1 ? "entry" : "entries"} hidden from the leaderboard
          </h2>
          <p className="text-[11px] leading-snug text-text-muted mt-0.5">
            Flagged by automated statistical checks as likely corrupt or
            non-comparable. Thresholds are heuristics, so some entries may be
            legitimate outliers rather than errors.
          </p>
        </div>

        <div className="px-4 py-2 overflow-y-auto divide-y divide-border-subtle">
          {entries.map((company) => (
            <div key={company.symbol} className="py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-text-primary shrink-0">{company.symbol}</span>
                <span className="text-[13px] text-text-secondary min-w-0 truncate" title={company.name}>{cleanCompanyName(company.name, company.symbol)}</span>
                <span className="text-[11px] text-text-muted shrink-0 tabular-nums ml-auto whitespace-nowrap">
                  {formatMarketCap(company.marketCap)}
                  {company.country ? ` · ${formatCountry(company.country)}` : ""}
                </span>
              </div>
              <ul className="mt-0.5 space-y-0.5">
                {(company.dataQualityIssues as DataQualityIssueCode[]).map((code) => (
                  <li key={code} className="text-[11px] leading-snug">
                    <span className="text-negative">{DATA_QUALITY_ISSUE_LABELS[code] ?? code}</span>
                    <span className="text-text-muted tabular-nums"> — {issueDetail(code, company)}</span>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </div>

        <div className="px-5 py-2.5 bg-bg-tertiary/40 border-t border-border-subtle flex justify-end">
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
