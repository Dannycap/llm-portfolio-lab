import { NextRequest, NextResponse } from "next/server";

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

const INITIAL_CAPITAL = 100;
const START_DATE = "2026-02-02";

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

function hashCode(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h);
}

function seededRand(seed: number): () => number {
  let state = seed || 1;
  return () => {
    state = (state * 48271) % 0x7fffffff;
    return state / 0x7fffffff;
  };
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

function computeStats(values: number[]): PortfolioStat {
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
  const vol = std > 0 ? std * Math.sqrt(252) : null;
  const sharpe = std > 0 ? (mean * 252) / (std * Math.sqrt(252)) : null;
  return {
    total_return: totalReturn,
    cagr: null,
    vol,
    max_drawdown: maxDrawdown(values),
    sharpe,
    start_value: start,
    end_value: end,
  };
}

function buildPayload() {
  const names = Object.keys(PORTFOLIOS);
  const dayCount = 40;
  const labels: string[] = [];
  const start = new Date(`${START_DATE}T00:00:00Z`);
  for (let i = 0; i < dayCount; i++) {
    const d = new Date(start);
    d.setUTCDate(start.getUTCDate() + i);
    labels.push(d.toISOString().slice(0, 10));
  }

  const series: Record<string, number[]> = {};
  const stats: Record<string, PortfolioStat> = {};
  const holdings: Record<string, Holding[]> = {};

  for (const name of names) {
    const seed = hashCode(name);
    const rand = seededRand(seed);
    const drift = ((seed % 7) - 3) * 0.0005 + 0.0006;
    const vol = 0.006 + (seed % 5) * 0.001;

    const values: number[] = [];
    let nav = INITIAL_CAPITAL;
    for (let i = 0; i < dayCount; i++) {
      const noise = (rand() - 0.5) * vol * 2;
      const r = drift + noise;
      nav = Math.max(40, nav * (1 + r));
      values.push(Number(nav.toFixed(6)));
    }

    series[name] = values;
    stats[name] = computeStats(values);

    const rawHoldings = Object.entries(PORTFOLIOS[name]).map(([ticker, weight]) => ({
      ticker,
      weight,
      weight_pct: weight * 100,
      dollars: weight * INITIAL_CAPITAL,
    }));
    rawHoldings.sort((a, b) => b.weight - a.weight);
    holdings[name] = rawHoldings;
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
  try {
    const includeHoldings = req.nextUrl.searchParams.get("include_holdings") === "1";
    const payload = buildPayload();
    if (!includeHoldings) {
      const { holdings: _h, ...rest } = payload;
      return NextResponse.json(rest, { status: 200 });
    }
    return NextResponse.json(payload, { status: 200 });
  } catch (error: any) {
    return NextResponse.json(
      { error: String(error?.message ?? error), stats: {}, series: {}, labels: [] },
      { status: 500 },
    );
  }
}
