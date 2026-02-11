import { NextRequest, NextResponse } from "next/server";
import yahooFinance from "yahoo-finance2";

export const runtime = "nodejs";

type PortfolioStat = {
  total_return: number;
  cagr: number | null;
  vol: number | null;
  max_drawdown: number;
  sharpe: number | null;
  start_value: number;
  end_value: number;
};

type Holding = {
  ticker: string;
  weight: number;
  weight_pct: number;
  dollars: number;
};

type Payload = {
  labels: string[];
  series: Record<string, number[]>;
  stats: Record<string, PortfolioStat>;
  holdings: Record<string, Holding[]>;
  start_date: string;
};

const INITIAL_CAPITAL = 100;
const START_DATE = "2026-02-02";
const TRADING_DAYS = 252;
const CACHE_TTL_MS = 120_000;

const cache: { ts: number; payload: Payload | null; last_error: string | null } = {
  ts: 0,
  payload: null,
  last_error: null,
};

const PORTFOLIOS: Record<string, Record<string, number>> = {
  SPY: { SPY: 1.0 },
  "ChatGPT-5.2": {
    SPY: 0.15, QQQ: 0.1, VIG: 0.05, VEA: 0.1, EEM: 0.1, EWY: 0.05, IJR: 0.1,
    XLU: 0.05, XLP: 0.05, GLD: 0.06, GSG: 0.04, AGG: 0.1, HYG: 0.05,
  },
  "ChatGPT-5.2 DeepResearch": {
    SPY: 0.2, QQQ: 0.15, AVUV: 0.1, MTUM: 0.1, QUAL: 0.1, VEA: 0.1, VWO: 0.05,
    GLD: 0.05, DBC: 0.05, DBMF: 0.05, IEF: 0.05,
  },
  "Claude Sonnet 4.5": {
    VBR: 0.22, NVDA: 0.18, MSFT: 0.16, VTWG: 0.14, AVGO: 0.08, GOOGL: 0.07, GLD: 0.1, VGIT: 0.05,
  },
  "Gemini-3": {
    VGT: 0.35, KBWB: 0.2, SLV: 0.15, XLI: 0.15, TLT: 0.1, CASH: 0.05,
  },
  "Meta AI": {
    MSFT: 0.1, GOOGL: 0.1, NVDA: 0.1, JNJ: 0.1, KO: 0.1, VOO: 0.1, CSJ: 0.2, GLD: 0.1, VGLT: 0.1,
  },
  Grok: {
    QQQ: 0.3, AVUV: 0.15, MTUM: 0.15, VWO: 0.15, VNQ: 0.1, GLD: 0.1, TLT: 0.05,
  },
  "DeepSeek-V3": {
    AVUV: 0.15, IMTM: 0.1, USMV: 0.1, QUAL: 0.1, DBMF: 0.15, KMLM: 0.1, DBC: 0.1, VNQI: 0.05, VTIP: 0.05, BIL: 0.05, ARKQ: 0.05,
  },
};

function tickerToYahooSymbol(ticker: string): string {
  if (ticker === "BRK.B") return "BRK-B";
  return ticker;
}

function formatDateUTC(d: Date): string {
  return d.toISOString().slice(0, 10);
}

function maxDrawdown(values: number[]): number {
  let peak = Number.NEGATIVE_INFINITY;
  let mdd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    if (peak > 0) mdd = Math.min(mdd, v / peak - 1);
  }
  return mdd;
}

function computeStats(values: number[], labels: string[]): PortfolioStat {
  const start = values[0] ?? INITIAL_CAPITAL;
  const end = values[values.length - 1] ?? start;
  const totalReturn = start > 0 ? end / start - 1 : 0;

  const returns: number[] = [];
  for (let i = 1; i < values.length; i++) {
    const prev = values[i - 1];
    const curr = values[i];
    returns.push(prev > 0 ? curr / prev - 1 : 0);
  }

  const mean = returns.length ? returns.reduce((a, b) => a + b, 0) / returns.length : 0;
  const variance = returns.length
    ? returns.reduce((a, b) => a + (b - mean) ** 2, 0) / returns.length
    : 0;
  const std = Math.sqrt(variance);
  const vol = std > 0 ? std * Math.sqrt(TRADING_DAYS) : null;
  const sharpe = std > 0 ? (mean * TRADING_DAYS) / (std * Math.sqrt(TRADING_DAYS)) : null;

  let cagr: number | null = null;
  if (labels.length >= 2 && start > 0 && end > 0) {
    const d0 = new Date(`${labels[0]}T00:00:00Z`);
    const d1 = new Date(`${labels[labels.length - 1]}T00:00:00Z`);
    const days = (d1.getTime() - d0.getTime()) / (1000 * 60 * 60 * 24);
    const years = days / 365.25;
    if (years > 0) cagr = (end / start) ** (1 / years) - 1;
  }

  return {
    total_return: totalReturn,
    cagr,
    vol,
    max_drawdown: maxDrawdown(values),
    sharpe,
    start_value: start,
    end_value: end,
  };
}

async function fetchTickerHistory(ticker: string): Promise<Map<string, number>> {
  const symbol = tickerToYahooSymbol(ticker);
  const rows = (await yahooFinance.historical(symbol, {
    period1: START_DATE,
    interval: "1d",
  })) as Array<{ date?: Date | string; close?: number | null }>;

  const out = new Map<string, number>();
  for (const row of rows) {
    if (!row?.date || typeof row.close !== "number" || !Number.isFinite(row.close)) continue;
    out.set(formatDateUTC(new Date(row.date)), row.close);
  }
  return out;
}

function stripHoldings(payload: Payload): Omit<Payload, "holdings"> {
  const { holdings: _h, ...rest } = payload;
  return rest;
}

async function buildLivePayload(): Promise<Payload> {
  const tickerSet = new Set<string>();
  for (const weights of Object.values(PORTFOLIOS)) {
    for (const ticker of Object.keys(weights)) {
      if (ticker !== "CASH") tickerSet.add(ticker);
    }
  }
  const tickers = [...tickerSet].sort();

  const settled = await Promise.allSettled(
    tickers.map(async (ticker) => ({
      ticker,
      data: await fetchTickerHistory(ticker),
    })),
  );

  const rawByTicker = new Map<string, Map<string, number>>();
  for (const res of settled) {
    if (res.status !== "fulfilled") continue;
    if (res.value.data.size === 0) continue;
    rawByTicker.set(res.value.ticker, res.value.data);
  }

  if (rawByTicker.size === 0) {
    throw new Error("No market data returned from yahoo-finance2 for portfolio tickers.");
  }

  const dateSet = new Set<string>();
  for (const rows of rawByTicker.values()) {
    for (const date of rows.keys()) dateSet.add(date);
  }
  const labels = [...dateSet].sort((a, b) => a.localeCompare(b));
  if (labels.length < 2) {
    throw new Error("Insufficient historical points to build portfolio series.");
  }

  const aligned = new Map<string, (number | null)[]>();
  for (const [ticker, rows] of rawByTicker.entries()) {
    const values: (number | null)[] = [];
    let last: number | null = null;
    for (const date of labels) {
      const v = rows.get(date);
      if (typeof v === "number" && Number.isFinite(v)) last = v;
      values.push(last);
    }
    aligned.set(ticker, values);
  }

  const series: Record<string, number[]> = {};
  const stats: Record<string, PortfolioStat> = {};
  const holdings: Record<string, Holding[]> = {};

  for (const [pname, weights] of Object.entries(PORTFOLIOS)) {
    const cashWeight = Number(weights.CASH ?? 0);
    const investTickers = Object.keys(weights).filter((t) => t !== "CASH" && aligned.has(t));

    if (investTickers.length === 0 && cashWeight <= 0) continue;

    const investWeightSum = investTickers.reduce((sum, t) => sum + Number(weights[t] ?? 0), 0);
    const normalized = investWeightSum > 0
      ? new Map(investTickers.map((t) => [t, Number(weights[t]) / investWeightSum]))
      : new Map<string, number>();

    const values: number[] = [];
    let nav = INITIAL_CAPITAL;
    values.push(nav);

    for (let i = 1; i < labels.length; i++) {
      let investReturn = 0;
      for (const ticker of investTickers) {
        const arr = aligned.get(ticker);
        if (!arr) continue;
        const prev = arr[i - 1];
        const curr = arr[i];
        if (typeof prev !== "number" || typeof curr !== "number" || prev <= 0) continue;
        const daily = curr / prev - 1;
        investReturn += (normalized.get(ticker) ?? 0) * daily;
      }

      const dailyReturn = (1 - cashWeight) * investReturn;
      nav = nav * (1 + dailyReturn);
      values.push(Number(nav.toFixed(6)));
    }

    series[pname] = values;
    stats[pname] = computeStats(values, labels);

    const rows = Object.entries(weights).map(([ticker, weight]) => ({
      ticker,
      weight: Number(weight),
      weight_pct: Number(weight) * 100,
      dollars: Number(weight) * INITIAL_CAPITAL,
    }));
    rows.sort((a, b) => b.weight - a.weight);
    holdings[pname] = rows;
  }

  return {
    labels,
    series,
    stats,
    holdings,
    start_date: START_DATE,
  };
}

export async function GET(req: NextRequest) {
  const includeHoldings = req.nextUrl.searchParams.get("include_holdings") === "1";
  const now = Date.now();

  if (cache.payload && now - cache.ts < CACHE_TTL_MS) {
    return NextResponse.json(
      includeHoldings ? cache.payload : stripHoldings(cache.payload),
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=240" },
      },
    );
  }

  try {
    const payload = await buildLivePayload();
    cache.payload = payload;
    cache.ts = now;
    cache.last_error = null;

    return NextResponse.json(
      includeHoldings ? payload : stripHoldings(payload),
      {
        status: 200,
        headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=240" },
      },
    );
  } catch (error: any) {
    const message = String(error?.message ?? error);
    cache.last_error = message;

    if (cache.payload) {
      return NextResponse.json(
        includeHoldings ? cache.payload : stripHoldings(cache.payload),
        {
          status: 200,
          headers: { "Cache-Control": "public, max-age=30, stale-while-revalidate=240" },
        },
      );
    }

    return NextResponse.json(
      {
        error: `Failed to fetch live market data: ${message}`,
        labels: [],
        series: {},
        stats: {},
        start_date: START_DATE,
      },
      { status: 500 },
    );
  }
}
