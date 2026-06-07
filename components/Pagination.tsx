"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";
import { Company } from "@/lib/types";
import HiddenEntriesModal from "./HiddenEntriesModal";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  perPage: number;
  lastUpdated?: string | null;
  hiddenForQuality?: number;
  hiddenEntries?: Company[];
}

export default function Pagination({ currentPage, totalItems, perPage, lastUpdated, hiddenForQuality, hiddenEntries }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  // Format on the client so the timestamp reflects the visitor's local timezone.
  // The stored value is UTC; rendering it during SSR would use the server's
  // (UTC) timezone, so we defer formatting until after mount.
  const [localLastUpdated, setLocalLastUpdated] = useState<string | null>(null);
  const [showHiddenModal, setShowHiddenModal] = useState(false);

  useEffect(() => {
    if (lastUpdated) {
      setLocalLastUpdated(
        new Date(lastUpdated).toLocaleString(undefined, { timeZoneName: "short" })
      );
    }
  }, [lastUpdated]);

  const totalPages = Math.ceil(totalItems / perPage);
  const startItem = (currentPage - 1) * perPage + 1;
  const endItem = Math.min(currentPage * perPage, totalItems);

  const navigateToPage = (page: number) => {
    const params = new URLSearchParams(searchParams.toString());
    if (page === 1) {
      params.delete("page");
    } else {
      params.set("page", String(page));
    }
    const queryString = params.toString();
    router.push(queryString ? `/?${queryString}` : "/");
  };

  const hasPrevious = currentPage > 1;
  const hasNext = currentPage < totalPages;

  if (totalItems === 0) {
    return null;
  }

  return (
    <>
    <div className="flex items-center justify-between py-5 mt-4 border-t border-border-subtle">
      <div className="text-base text-text-secondary">
        Showing{" "}
        <span className="font-semibold text-accent">
          {startItem.toLocaleString()}-{endItem.toLocaleString()}
        </span>{" "}
        of{" "}
        <span className="font-semibold text-text-primary">{totalItems.toLocaleString()}</span>
      </div>

      <div className="flex flex-col items-center text-xs text-text-muted leading-tight">
        <span>Tracking $1B+ US-listed companies (including ADRs of foreign companies)</span>
        {localLastUpdated && (
          <span>Data last refreshed: {localLastUpdated} (your local time)</span>
        )}
        {hiddenForQuality && hiddenForQuality > 0 ? (
          <span>
            {hiddenForQuality.toLocaleString()}{" "}
            {hiddenEntries && hiddenEntries.length > 0 ? (
              <button
                type="button"
                onClick={() => setShowHiddenModal(true)}
                className="underline decoration-dotted underline-offset-2 text-text-secondary hover:text-accent transition-colors"
              >
                {hiddenForQuality === 1 ? "entry" : "entries"}
              </button>
            ) : (
              <span>{hiddenForQuality === 1 ? "entry" : "entries"}</span>
            )}{" "}
            hidden after failing statistical quality checks
          </span>
        ) : null}
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateToPage(currentPage - 1)}
          disabled={!hasPrevious}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 text-base font-medium rounded-lg border transition-all duration-300",
            hasPrevious
              ? "border-border-subtle text-text-secondary bg-bg-secondary hover:bg-bg-tertiary hover:text-text-primary hover:shadow-glow-sm"
              : "border-border-subtle/50 text-text-muted bg-bg-tertiary/50 cursor-not-allowed"
          )}
        >
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M15 19l-7-7 7-7"
            />
          </svg>
          Previous {perPage}
        </button>

        <div className="px-4 py-2 text-sm font-medium bg-bg-tertiary border border-border-subtle rounded-lg text-text-secondary">
          <span className="text-accent">{currentPage}</span>
          <span className="mx-1 text-text-muted">/</span>
          <span>{totalPages}</span>
        </div>

        <button
          onClick={() => navigateToPage(currentPage + 1)}
          disabled={!hasNext}
          className={cn(
            "flex items-center gap-2 px-5 py-2.5 text-base font-medium rounded-lg border transition-all duration-300",
            hasNext
              ? "border-border-subtle text-text-secondary bg-bg-secondary hover:bg-bg-tertiary hover:text-text-primary hover:shadow-glow-sm"
              : "border-border-subtle/50 text-text-muted bg-bg-tertiary/50 cursor-not-allowed"
          )}
        >
          Next {perPage}
          <svg
            className="w-5 h-5"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
    {showHiddenModal && hiddenEntries && hiddenEntries.length > 0 && (
      <HiddenEntriesModal entries={hiddenEntries} onClose={() => setShowHiddenModal(false)} />
    )}
    </>
  );
}
