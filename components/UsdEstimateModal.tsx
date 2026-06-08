"use client";

import { useEffect } from "react";
import { Company } from "@/lib/types";
import { formatCountry } from "@/lib/countries";
import { formatMarketCap, formatPERatio, formatPrice } from "@/lib/utils";

interface UsdEstimateModalProps {
  entries: Company[];
  onClose: () => void;
}

// Lists companies whose forward P/E is computed from a USD-denominated FMP
// analyst estimate (no FX conversion applied). Parallels HiddenEntriesModal but
// is informational, not a hidden-from-leaderboard list.
export default function UsdEstimateModal({ entries, onClose }: UsdEstimateModalProps) {
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
            {entries.length.toLocaleString()} {entries.length === 1 ? "ticker" : "tickers"} with USD-denominated forward estimates
          </h2>
          <p className="text-[11px] leading-snug text-text-muted mt-0.5">
            These companies report financials in a non-USD currency, but their
            analyst estimates arrive from the data provider already in USD. We
            detect this and skip the currency conversion, so the forward P/E
            below reflects the estimate as-is rather than an over-converted value.
          </p>
        </div>

        <div className="px-4 py-2 overflow-y-auto divide-y divide-border-subtle">
          {entries.map((company) => (
            <div key={company.symbol} className="py-2">
              <div className="flex items-baseline gap-2">
                <span className="text-[13px] font-semibold text-text-primary shrink-0">{company.symbol}</span>
                <span className="text-[13px] text-text-secondary min-w-0 truncate">{company.name}</span>
                <span className="text-[11px] text-text-muted shrink-0 tabular-nums ml-auto whitespace-nowrap">
                  {formatMarketCap(company.marketCap)}
                  {company.country ? ` · ${formatCountry(company.country)}` : ""}
                </span>
              </div>
              <p className="mt-0.5 text-[11px] leading-snug text-text-muted tabular-nums">
                Fwd P/E {formatPERatio(company.forwardPE)} · Fwd EPS {formatPrice(company.forwardEPS)}
              </p>
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
