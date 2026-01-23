"use client";

import { useRouter, useSearchParams } from "next/navigation";
import { cn } from "@/lib/utils";

interface PaginationProps {
  currentPage: number;
  totalItems: number;
  perPage: number;
}

export default function Pagination({ currentPage, totalItems, perPage }: PaginationProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

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
    <div className="flex items-center justify-between py-4 mt-4 border-t border-border-subtle">
      <div className="text-sm text-text-secondary">
        Showing{" "}
        <span className="font-semibold text-accent">
          {startItem.toLocaleString()}-{endItem.toLocaleString()}
        </span>{" "}
        of{" "}
        <span className="font-semibold text-text-primary">{totalItems.toLocaleString()}</span>
      </div>

      <div className="flex items-center gap-3">
        <button
          onClick={() => navigateToPage(currentPage - 1)}
          disabled={!hasPrevious}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-300",
            hasPrevious
              ? "border-border-subtle text-text-secondary bg-bg-secondary hover:bg-bg-tertiary hover:text-text-primary hover:shadow-glow-sm"
              : "border-border-subtle/50 text-text-muted bg-bg-tertiary/50 cursor-not-allowed"
          )}
        >
          <svg
            className="w-4 h-4"
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

        <div className="px-3 py-1.5 text-xs font-medium bg-bg-tertiary border border-border-subtle rounded-lg text-text-secondary">
          <span className="text-accent">{currentPage}</span>
          <span className="mx-1 text-text-muted">/</span>
          <span>{totalPages}</span>
        </div>

        <button
          onClick={() => navigateToPage(currentPage + 1)}
          disabled={!hasNext}
          className={cn(
            "flex items-center gap-2 px-4 py-2 text-sm font-medium rounded-lg border transition-all duration-300",
            hasNext
              ? "border-border-subtle text-text-secondary bg-bg-secondary hover:bg-bg-tertiary hover:text-text-primary hover:shadow-glow-sm"
              : "border-border-subtle/50 text-text-muted bg-bg-tertiary/50 cursor-not-allowed"
          )}
        >
          Next {perPage}
          <svg
            className="w-4 h-4"
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
  );
}
