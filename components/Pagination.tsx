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
    <div className="flex items-center justify-between py-4">
      <div className="text-sm text-slate-600">
        Showing <span className="font-semibold text-slate-900">{startItem.toLocaleString()}-{endItem.toLocaleString()}</span> of{" "}
        <span className="font-semibold text-slate-900">{totalItems.toLocaleString()}</span>
      </div>
      <div className="flex items-center gap-2">
        <button
          onClick={() => navigateToPage(currentPage - 1)}
          disabled={!hasPrevious}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg border transition-colors",
            hasPrevious
              ? "border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
              : "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"
          )}
        >
          &lt; Previous {perPage}
        </button>
        <button
          onClick={() => navigateToPage(currentPage + 1)}
          disabled={!hasNext}
          className={cn(
            "px-4 py-2 text-sm font-medium rounded-lg border transition-colors",
            hasNext
              ? "border-slate-300 text-slate-700 bg-white hover:bg-slate-50"
              : "border-slate-200 text-slate-400 bg-slate-50 cursor-not-allowed"
          )}
        >
          Next {perPage} &gt;
        </button>
      </div>
    </div>
  );
}
