"use client";

import { useEffect, useState } from "react";
import RealtimePortfolioChart from "@/components/RealtimePortfolioChart";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

type PortfolioStat = {
  total_return: number;
  max_drawdown: number;
  sharpe: number;
  cagr?: number;
  vol?: number;
  end_value?: number;
};

type Payload = {
  stats?: Record<string, PortfolioStat>;
};

export default function Home() {
  const [payload, setPayload] = useState<Payload | null>(null);
  const [statsErr, setStatsErr] = useState<string | null>(null);

  useEffect(() => {
    const fetchStats = async () => {
      try {
        const res = await fetch(`${API_BASE}/api/portfolio-series`, {
          cache: "no-store",
        });
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

  // 🔥 SORTED STATS (Highest Total Value → Lowest)
  const sortedStats = payload?.stats
    ? Object.entries(payload.stats).sort((a, b) => {
        const aVal = a[1].end_value ?? 0;
        const bVal = b[1].end_value ?? 0;
        return bVal - aVal;
      })
    : [];

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
        <p className="lead">
          LLM Portfolio Lab is a research platform designed to systematically
          evaluate and compare LLM-generated investment portfolios under
          standardized, transparent, and reproducible conditions.
        </p>

        <p>
          Each large language model (LLM) is given{" "}
          <strong>$100 in initial capital</strong>, fully invested, and is
          tasked with constructing a portfolio intended to{" "}
          <strong>outperform the S&P 500 over a full market cycle</strong>.
          The S&P 500 (proxied by <strong>SPY</strong>) serves as the benchmark
          for relative performance evaluation.
        </p>
      </section>

      <section className="layout">
        {/* Chart */}
        <div className="card" id="chart">
          <div className="card-head">
            <div>
              <p className="title">Performance Chart</p>
              <p className="sub"> • portfolio value (base $100)</p>
            </div>
            <div className="pill">Base: $100</div>
          </div>

          <div className="chart-wrap">
            <RealtimePortfolioChart />
          </div>
        </div>

        {/* Stats */}
        <div className="card" id="stats">
          <div className="card-head">
            <div>
              <p className="title">Portfolio Stats</p>
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
                  {sortedStats.length > 0 ? (
                    sortedStats.map(([name, s]) => (
                      <tr key={name}>
                        <td>
                          <strong>{name}</strong>
                        </td>

                        <td className="right">
                          {s.end_value != null
                            ? fmtDollars(s.end_value)
                            : "—"}
                        </td>

                        <td className="right">
                          {Number.isFinite(s.total_return)
                            ? (s.total_return * 100).toFixed(2) + "%"
                            : "—"}
                        </td>

                        <td className="right">
                          {Number.isFinite(s.max_drawdown)
                            ? (s.max_drawdown * 100).toFixed(2) + "%"
                            : "—"}
                        </td>

                        <td className="right">
                          {Number.isFinite(s.sharpe)
                            ? s.sharpe.toFixed(2)
                            : "—"}
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
