"use client";

import { useEffect, useState } from "react";
import dynamic from "next/dynamic";

type PortfolioStat = {
  total_return: number;
  max_drawdown: number;
  sharpe: number;
  cagr?: number;
  vol?: number;
  end_value?: number;
};

type Payload = {
  labels?: string[];
  series?: Record<string, number[]>;
  stats?: Record<string, PortfolioStat>;
};

const RealtimePortfolioChart = dynamic(
  () => import("@/components/RealtimePortfolioChart"),
  {
    ssr: false,
    loading: () => (
      <div className="muted" style={{ padding: 16 }}>
        Loading chart...
      </div>
    ),
  },
);

export default function Home() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch("/api/portfolio-series?include_holdings=0");
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const data = (await res.json()) as Payload;
        setPayload(data);
        setStatsErr(null);
      } catch (error: any) {
        setStatsErr(String(error?.message ?? error));
      }
    };

    fetchStats();
    const interval = setInterval(fetchStats, 15000);
    return () => clearInterval(interval);
  }, []);

  const fmtDollars = (value: number) =>
    value.toLocaleString(undefined, {
      style: "currency",
      currency: "USD",
      maximumFractionDigits: 2,
    });

  const totalPortfolioValue = payload?.stats
    ? Object.values(payload.stats).reduce(
        (total, stat) => total + (stat.end_value ?? 0),
        0,
      )
    : null;

  return (
    <div className="container">
      <header>
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>LLM Portfolio Lab</h1>
            <p>Hypothetical portfolios • research only • not investment advice</p>
          </div>
        </div>

        <nav>
          <a href="/prompt">Prompt</a>
          <a href="/holdings">Holdings</a>
          <a href="/outlook">Outlook</a>
        </nav>
      </header>

      <section className="hero">
        <h2>Objective</h2>
        <p>
          The objective of LLM Portfolio Lab is to analyze and compare
          LLM-generated investment portfolios using real market data,
          standardized metrics, and transparent assumptions—purely for research
          and educational purposes..
        </p>
      </section>

      <section className="layout">
        {/* Chart */}
        <div className="card" id="chart">
          <div className="card-head">
            <div>
              <p className="title">Combined Performance Chart</p>
              <p className="sub">Live from FastAPI • portfolio value (base $100)</p>
            </div>
            <div className="pill">Base: $100</div>
          </div>

          <div className="chart-wrap">
            <RealtimePortfolioChart
              data={payload}
              err={statsErr}
              disableFetch
            />
          </div>
        </div>

        {/* Stats */}
        <div className="card" id="stats">
          <div className="card-head">
            <div>
              <p className="title">Portfolio Stats</p>
              <p className="sub">
                Live performance metrics
                {totalPortfolioValue != null
                  ? ` • Total portfolio value ${fmtDollars(totalPortfolioValue)}`
                  : ""}
              </p>
            </div>
            <div className="pill">
              {statsErr ? `Last error: ${statsErr}` : "Live"}
            </div>
          </div>

          <div className="table-wrap">
            <div className="table-scroll">
              <table>
                <thead>
                  <tr>
                    <th>Portfolio</th>
                    <th className="right">Total Value</th>
                    <th className="right">Return</th>
                    <th className="right">Drawdown</th>
                    <th className="right">Sharpe</th>
                  </tr>
                </thead>
                <tbody>
                  {payload?.stats ? (
                    Object.entries(payload.stats)
                      .sort(([, a], [, b]) => (b.end_value ?? Number.NEGATIVE_INFINITY) - (a.end_value ?? Number.NEGATIVE_INFINITY))
                      .map(([name, s]) => (
                      <tr key={name}>
                        <td>
                          <strong>{name}</strong>
                        </td>
                        <td className="right">
                          {s.end_value != null ? fmtDollars(s.end_value) : "—"}
                        </td>
                        <td className="right">
                          {(s.total_return * 100).toFixed(2)}%
                        </td>
                        <td className="right">
                          {(s.max_drawdown * 100).toFixed(2)}%
                        </td>
                        <td className="right">
                          {Number.isFinite(s.sharpe) ? s.sharpe.toFixed(2) : "—"}
                        </td>
                      </tr>
                    ))
                  ) : (
                    <tr>
                      <td colSpan={5} className="muted">
                        Loading…
                      </td>
                    </tr>
                  )}
                </tbody>
              </table>
            </div>
          </div>
        </div>
      </section>

      <div className="footer">
        <div>© 2026 LLM Portfolio Lab</div>
        <div>Research only • No investment advice</div>
      </div>
    </div>
  );
}

