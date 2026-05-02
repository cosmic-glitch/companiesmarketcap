import { expect, test } from "@playwright/test";
import { mergeLiveQuotes } from "../lib/db";
import { Company } from "../lib/types";

function company(overrides: Partial<Company> & Pick<Company, "symbol" | "marketCap" | "rank">): Company {
  return {
    symbol: overrides.symbol,
    name: overrides.symbol,
    rank: overrides.rank,
    marketCap: overrides.marketCap,
    price: 100,
    week52High: null,
    pctTo52WeekHigh: null,
    dailyChangePercent: null,
    earnings: null,
    revenue: null,
    revenueAnnual: null,
    epsAnnual: null,
    peRatio: null,
    ttmEPS: null,
    forwardPE: null,
    forwardEPS: null,
    forwardEPSDate: null,
    forwardEPSGrowth: null,
    dividendPercent: null,
    operatingMargin: null,
    revenueGrowth5Y: null,
    revenueGrowth3Y: null,
    epsGrowth5Y: null,
    epsGrowth3Y: null,
    freeCashFlow: null,
    netDebt: null,
    country: "US",
    lastUpdated: "2026-04-21T06:22:20.342Z",
    ...overrides,
  };
}

function bySymbol(companies: Company[], symbol: string): Company {
  const match = companies.find((c) => c.symbol === symbol);
  if (!match) {
    throw new Error(`Missing company ${symbol}`);
  }
  return match;
}

test.describe("mergeLiveQuotes", () => {
  test("overrides stored market cap with live quote market cap", () => {
    const merged = mergeLiveQuotes(
      [company({ symbol: "NVDA", rank: 1, marketCap: 4_820_000_000_000 })],
      new Map([
        ["NVDA", { price: 209.69, changePercent: -1.58, marketCap: 5_096_000_000_000 }],
      ])
    );

    expect(bySymbol(merged, "NVDA")).toMatchObject({
      marketCap: 5_096_000_000_000,
      price: 209.69,
      dailyChangePercent: -1.58,
    });
  });

  test("falls back to stored market cap when live quote omits it", () => {
    const merged = mergeLiveQuotes(
      [company({ symbol: "NVDA", rank: 1, marketCap: 4_820_000_000_000 })],
      new Map([
        ["NVDA", { price: 209.69, changePercent: -1.58, marketCap: null }],
      ])
    );

    expect(bySymbol(merged, "NVDA").marketCap).toBe(4_820_000_000_000);
  });

  test("recomputes ranks from effective live market caps", () => {
    const merged = mergeLiveQuotes(
      [
        company({ symbol: "AAA", rank: 1, marketCap: 300 }),
        company({ symbol: "BBB", rank: 2, marketCap: 200 }),
        company({ symbol: "NVDA", rank: 3, marketCap: 100 }),
      ],
      new Map([
        ["NVDA", { price: 209.69, changePercent: -1.58, marketCap: 400 }],
      ]),
      { recomputeRanks: true }
    );

    expect(bySymbol(merged, "NVDA").rank).toBe(1);
    expect(bySymbol(merged, "AAA").rank).toBe(2);
    expect(bySymbol(merged, "BBB").rank).toBe(3);
  });
});
