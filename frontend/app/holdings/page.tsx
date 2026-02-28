"use client";

import { useEffect, useMemo, useState } from "react";


const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

type Holding = {
  ticker: string;
  weight: number;
  weight_pct: number; // already percent (0-100) from backend
  dollars: number;
};

type PortfolioStat = {
  total_return: number;
  max_drawdown: number;
  sharpe: number;
  cagr?: number;
  vol?: number;
  start_value?: number;
  end_value?: number;
};

type Payload = {
  start_date?: string;
  stats?: Record<string, PortfolioStat>;
  holdings?: Record<string, Holding[]>;
};

type Health = { ok: boolean; cached: boolean; last_error: string | null };

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtPct(x: unknown, digits = 2) {
  if (!isFiniteNumber(x)) return "—";
  return `${(x * 100).toFixed(digits)}%`;
}

function fmtDollars(x: unknown, digits = 2) {
  if (!isFiniteNumber(x)) return "—";
  return `$${x.toFixed(digits)}`;
}

function fmtTime(ts: number | null) {
  if (!ts) return "—";
  return new Date(ts).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
}

/**
 * Optional: ETF allowlist (good enough for your current universe).
 * If a ticker isn't here, we treat it as Stock (except CASH).
 */
const ETF_ALLOWLIST = new Set([
  "SPY","QQQ","VIG","VEA","EEM","EWY","IJR","XLU","XLP","GLD","GSG","AGG","HYG",
  "VBR","VTWG","VGIT","VGT","KBWB","SLV","XLI","TLT","VOO","CSJ","VGLT","AVUV",
  "MTUM","VWO","VNQ","IMTM","USMV","QUAL","DBMF","KMLM","DBC","VNQI","VTIP","BIL","ARKQ",
]);

function assetType(ticker: string): "ETF" | "Stock" | "Cash" {
  const t = ticker.toUpperCase();
  if (t === "CASH") return "Cash";
  if (ETF_ALLOWLIST.has(t)) return "ETF";
  return "Stock";
}

export default function HoldingsPage() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [health, setHealth] = useState<Health | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdatedTs, setLastUpdatedTs] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchAll = async () => {
      try {
        const [healthRes, dataRes] = await Promise.all([
          fetch("/api/health", { cache: "no-store" }),
          fetch(`${API_BASE}/api/portfolio-series`, { cache: "no-store" }),
        ]);

        const nextHealth = (await healthRes.json()) as Health;
        if (!dataRes.ok) throw new Error(`HTTP ${dataRes.status}`);
        const nextPayload = (await dataRes.json()) as Payload;

        if (!mounted) return;
        setHealth(nextHealth);
        setPayload(nextPayload);
        setErr(null);
        setLastUpdatedTs(Date.now());
      } catch (e: any) {
        if (!mounted) return;
        setErr(String(e?.message ?? e));
      }
    };

    fetchAll();
    const interval = setInterval(fetchAll, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  // Sort portfolios: show LLMs first, SPY benchmark last
  const portfolios = useMemo(() => {
    const h = payload?.holdings ?? {};
    const names = Object.keys(h);
    const llms = names.filter((n) => n !== "SPY").sort();
    const out = [...llms];
    if (names.includes("SPY")) out.push("SPY");
    return out;
  }, [payload?.holdings]);

  const overlaps = useMemo(() => {
    const h = payload?.holdings ?? {};
    const ownersByTicker = new Map<string, Set<string>>();

    for (const [pname, rows] of Object.entries(h)) {
      for (const r of rows) {
        const t = r.ticker.toUpperCase();
        if (t === "CASH") continue;
        if (!ownersByTicker.has(t)) ownersByTicker.set(t, new Set());
        ownersByTicker.get(t)!.add(pname);
      }
    }

    const shared = Array.from(ownersByTicker.entries())
      .map(([ticker, owners]) => ({ ticker, owners: Array.from(owners).sort(), ownerCount: owners.size }))
      .filter((x) => x.ownerCount >= 2)
      .sort((a, b) => b.ownerCount - a.ownerCount || a.ticker.localeCompare(b.ticker));

    return {
      uniqueAssets: ownersByTicker.size,
      sharedCount: shared.length,
      topShared: shared.slice(0, 12),
    };
  }, [payload?.holdings]);

  return (
    <div className="container">
      <header>
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>Holdings</h1>
            <p>Allocation by portfolio • overlap insights</p>
          </div>
        </div>

        <nav>
          <a href="/">Dashboard</a>
          <a href="/prompt">Prompt</a>
          <a href="/outlook">Outlook</a>
          <a href="/methods">Methods</a>
        </nav>
      </header>

      <section className="hero">
        <h2>Portfolio Holdings</h2>
        <p>
          Weights, dollars, and overlap across all LLM portfolios
          {payload?.start_date ? ` • since ${payload.start_date}` : ""}.
        </p>
      </section>

      {/* Quick KPIs */}
      <section className="kpi-grid">
        <div className="kpi kpi-highlight">
          <div className="kpi-label">Portfolios</div>
          <div className="kpi-value">{portfolios.length}</div>
          <div className="kpi-sub">Including benchmark</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Unique assets held</div>
          <div className="kpi-value">{overlaps.uniqueAssets}</div>
          <div className="kpi-sub">Excludes CASH</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Shared assets</div>
          <div className="kpi-value">{overlaps.sharedCount}</div>
          <div className="kpi-sub">Owned by 2+ portfolios</div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Data status</div>
          <div className="kpi-value">
            <span className={health?.cached ? "badge badge-warn" : "badge badge-ok"}>
              {health?.cached ? "CACHED" : "LIVE"}
            </span>
          </div>
          <div className="kpi-sub">
            {err ? `Error: ${err}` : health?.last_error ? `Backend: ${health.last_error}` : `Updated ${fmtTime(lastUpdatedTs)}`}
          </div>
        </div>

        <div className="kpi">
          <div className="kpi-label">Top overlap</div>
          <div className="kpi-value">{overlaps.topShared[0]?.ticker ?? "—"}</div>
          <div className="kpi-sub">
            {overlaps.topShared[0] ? `${overlaps.topShared[0].ownerCount} owners` : "—"}
          </div>
        </div>
      </section>

      {/* Top shared tickers chips */}
      <section className="card">
        <div className="card-head">
          <div>
            <p className="title">Most Shared Assets</p>
            <p className="sub">Tickers held by the most portfolios</p>
          </div>
          <div className="pill">Top 12</div>
        </div>

        <div style={{ padding: 16 }}>
          {!payload?.holdings ? (
            <div className="skeleton" style={{ height: 90 }} />
          ) : (
            <div className="chip-row">
              {overlaps.topShared.map((x) => (
                <div key={x.ticker} className="chip">
                  <div className="chip-top">
                    <span className="chip-ticker">{x.ticker}</span>
                    <span className="badge badge-dim">{x.ownerCount} owners</span>
                  </div>
                  <div className="chip-sub">{x.owners.join(", ")}</div>
                </div>
              ))}
            </div>
          )}
        </div>
      </section>

      {/* Per-portfolio holdings blocks */}
      <section className="layout">
        {portfolios.map((portfolioName) => {
          const rows = (payload?.holdings?.[portfolioName] ?? []).slice().sort((a, b) => (b.weight ?? 0) - (a.weight ?? 0));
          const stockCount = rows.filter((r) => assetType(r.ticker) === "Stock").length;
          const etfCount = rows.filter((r) => assetType(r.ticker) === "ETF").length;
          const cashCount = rows.filter((r) => assetType(r.ticker) === "Cash").length;

          const stockW = rows.reduce((acc, r) => acc + (assetType(r.ticker) === "Stock" ? (r.weight ?? 0) : 0), 0);
          const etfW = rows.reduce((acc, r) => acc + (assetType(r.ticker) === "ETF" ? (r.weight ?? 0) : 0), 0);
          const cashW = rows.reduce((acc, r) => acc + (assetType(r.ticker) === "Cash" ? (r.weight ?? 0) : 0), 0);

          const pillText = `${rows.length} positions • Stocks ${stockCount} • ETFs ${etfCount}${cashCount ? ` • Cash ${cashCount}` : ""}`;

          return (
            <div key={portfolioName} className={`card holdings-card ${portfolioName === "SPY" ? "benchmark-card" : ""}`}>
              <div className="card-head">
                <div>
                  <p className="title">{portfolioName}</p>
                  <p className="sub">
                    Weights • $100 base
                    {payload?.stats?.[portfolioName]?.end_value != null
                      ? ` • NAV ${fmtDollars(payload.stats[portfolioName].end_value)}`
                      : ""}
                  </p>
                </div>
                <div className="pill">{pillText}</div>
              </div>

              <div className="mini-kpis">
                <div className="mini">
                  <div className="mini-label">Stock weight</div>
                  <div className="mini-value">{fmtPct(stockW)}</div>
                </div>
                <div className="mini">
                  <div className="mini-label">ETF weight</div>
                  <div className="mini-value">{fmtPct(etfW)}</div>
                </div>
                <div className="mini">
                  <div className="mini-label">Cash weight</div>
                  <div className="mini-value">{fmtPct(cashW)}</div>
                </div>
              </div>

              <div style={{ padding: 20 }}>
                {!rows.length ? (
                  <div className="muted">No holdings available.</div>
                ) : (
                  <div className="holdings-list">
                    {rows.map((h) => (
                      <div key={`${portfolioName}-${h.ticker}`} className="holding-row">
                        <div className="ticker-badge">{h.ticker}</div>

                        <div className="bar-container">
                          <div className="bar">
                            <div
                              className="bar-fill"
                              style={{ width: `${Math.max(0, Math.min(100, h.weight_pct))}%` }}
                            />
                          </div>
                          <div className="bar-label">{isFiniteNumber(h.weight_pct) ? h.weight_pct.toFixed(1) : "—"}%</div>
                        </div>

                        <div className="holding-value">{fmtDollars(h.dollars)}</div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </section>

      <div className="footer">
        <div>© 2026 LLM Portfolio Lab</div>
        <div>Research & Education • Not Investment Advice</div>
      </div>

      <style jsx>{`
        /* KPI strip */
        .kpi-grid {
          display: grid;
          grid-template-columns: repeat(5, minmax(0, 1fr));
          gap: 12px;
          margin: 12px 0 16px;
        }
        @media (max-width: 980px) {
          .kpi-grid {
            grid-template-columns: repeat(2, minmax(0, 1fr));
          }
        }
        .kpi {
          background: var(--card);
          border: 1px solid var(--border);
          border-radius: var(--radius);
          padding: 14px;
          min-height: 74px;
        }
        .kpi-highlight {
          background: linear-gradient(
              135deg,
              rgba(124, 92, 255, 0.12) 0%,
              rgba(45, 212, 191, 0.08) 55%,
              rgba(255, 255, 255, 0.02) 100%
            ),
            var(--card);
          border-color: rgba(255, 255, 255, 0.16);
        }
        .kpi-label {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .kpi-value {
          margin-top: 6px;
          font-size: 18px;
          font-weight: 900;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }
        .kpi-sub {
          margin-top: 4px;
          font-size: 12px;
          color: var(--muted);
          font-variant-numeric: tabular-nums;
        }

        /* Chips */
        .chip-row {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 12px;
        }
        @media (max-width: 980px) {
          .chip-row {
            grid-template-columns: 1fr;
          }
        }
        .chip {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          padding: 12px;
        }
        .chip-top {
          display: flex;
          align-items: center;
          justify-content: space-between;
          gap: 10px;
        }
        .chip-ticker {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-weight: 900;
          font-size: 14px;
          color: var(--text);
        }
        .chip-sub {
          margin-top: 8px;
          color: var(--muted);
          font-size: 12px;
          line-height: 1.35;
        }

        /* Portfolio cards */
        .benchmark-card {
          border-color: rgba(255, 255, 255, 0.18);
          background: rgba(255, 255, 255, 0.02);
        }

        .mini-kpis {
          display: grid;
          grid-template-columns: repeat(3, minmax(0, 1fr));
          gap: 10px;
          padding: 0 20px 8px 20px;
        }
        @media (max-width: 980px) {
          .mini-kpis {
            grid-template-columns: 1fr;
          }
        }
        .mini {
          background: rgba(255, 255, 255, 0.03);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 14px;
          padding: 10px 12px;
        }
        .mini-label {
          font-size: 11px;
          color: var(--muted);
          letter-spacing: 0.02em;
          text-transform: uppercase;
        }
        .mini-value {
          margin-top: 6px;
          font-size: 14px;
          font-weight: 900;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }

        /* Holdings rows (same look you had) */
        .ticker-badge {
          font-weight: 800;
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          background: rgba(124, 92, 255, 0.12);
          border: 1px solid rgba(255, 255, 255, 0.14);
          padding: 6px 10px;
          border-radius: 10px;
          font-size: 12px;
          min-width: 60px;
          text-align: center;
          color: var(--text);
        }

        .bar-container {
          flex: 1;
          display: flex;
          align-items: center;
          gap: 10px;
        }
        .bar {
          flex: 1;
          height: 22px;
          background: rgba(255, 255, 255, 0.06);
          border: 1px solid rgba(255, 255, 255, 0.1);
          border-radius: 999px;
          overflow: hidden;
        }
        .bar-fill {
          height: 100%;
          background: linear-gradient(90deg, var(--accent) 0%, var(--accent2) 100%);
          transition: width 0.25s ease;
        }
        .bar-label {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-size: 12px;
          font-weight: 700;
          min-width: 52px;
          text-align: right;
          color: var(--muted);
        }
        .holding-value {
          font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace;
          font-weight: 700;
          min-width: 84px;
          text-align: right;
          color: var(--text);
          font-variant-numeric: tabular-nums;
        }
        .holding-row {
          display: flex;
          align-items: center;
          gap: 14px;
          padding: 10px 0;
          border-bottom: 1px solid rgba(255, 255, 255, 0.06);
        }
        .holding-row:last-child {
          border-bottom: none;
        }

        .holdings-card {
          transition: transform 0.15s ease, box-shadow 0.15s ease;
        }
        .holdings-card:hover {
          transform: translateY(-2px);
          box-shadow: 0 10px 18px rgba(0, 0, 0, 0.3);
        }
      `}</style>
    </div>
  );
}