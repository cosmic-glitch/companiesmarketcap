import { type ClassValue, clsx } from "clsx";

export function cn(...inputs: ClassValue[]) {
  return clsx(inputs);
}

// Format large numbers with T, B, M suffixes
export function formatMarketCap(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  const isNegative = value < 0;
  const absValue = Math.abs(value);
  const sign = isNegative ? "-" : "";

  const trillion = 1_000_000_000_000;
  const billion = 1_000_000_000;
  const million = 1_000_000;

  if (absValue >= trillion) {
    return `${sign}$${(absValue / trillion).toFixed(2)}T`;
  } else if (absValue >= billion) {
    return `${sign}$${(absValue / billion).toFixed(2)}B`;
  } else if (absValue >= million) {
    return `${sign}$${(absValue / million).toFixed(2)}M`;
  } else if (absValue >= 1000) {
    return `${sign}$${(absValue / 1000).toFixed(2)}K`;
  } else {
    return `${sign}$${absValue.toFixed(2)}`;
  }
}

// Format price with currency
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  return `$${value.toFixed(2)}`;
}

// Format percentage
export function formatPercent(value: number | null | undefined, showSign: boolean = false): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  // Handle extremely large percentages (likely data errors)
  const absValue = Math.abs(value);
  if (absValue >= 1000) {
    const isNegative = value < 0;
    const sign = isNegative ? "-" : "";
    return `${sign}${absValue.toFixed(2)}%`;
  }

  const formatted = `${value.toFixed(2)}%`;

  if (showSign && value > 0) {
    return `+${formatted}`;
  }

  return formatted;
}

// Format P/E ratio
export function formatPERatio(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "N/A";
  }

  // Display negative P/E ratios as 0 (when earnings are negative)
  if (value < 0) {
    return "0.00";
  }

  return value.toFixed(2);
}

// Get color class for change percentage
export function getChangeColor(value: number | null | undefined): string {
  if (value === null || value === undefined) {
    return "text-gray-500";
  }

  if (value > 0) {
    return "text-green-600";
  } else if (value < 0) {
    return "text-red-600";
  } else {
    return "text-gray-500";
  }
}

// Format date
export function formatDate(date: string | Date): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return new Intl.DateTimeFormat("en-US", {
    year: "numeric",
    month: "short",
    day: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(d);
}
