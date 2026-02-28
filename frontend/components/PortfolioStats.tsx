"use client";

import { useEffect, useState } from "react";

type Stat = {
  total_return: number;
  cagr: number;
  vol: number;
  max_drawdown: number;
  sharpe: number;
  start_value: number;
  end_value: number;
};

export default function PortfolioStats() {
  const [stats, setStats] = useState<Record<string, Stat> | null>(null);
  const [err, setErr] = useState<string | null>(null);

  async function load() {
    try {
      const r = await fetch("/api/portfolio-series", { cache: "no-store" });
      if (!r.ok) throw new Error(`HTTP ${r.status}`);
      const j = await r.json();
      setStats(j.stats ?? null);
      setErr(null);
    } catch (e: any) {
      setErr(String(e?.message ?? e));
    }
  }

  useEffect(() => {
    load();
    const t = setInterval(load, 15000); // match your backend cache/poll
    return () => clearInterval(t);
  }, []);

  if (err) {
    return <div className="muted" style={{ padding: 16, color: "crimson" }}>Error: {err}</div>;
  }

  if (!stats) {
    return <div className="muted" style={{ padding: 16 }}>Loading…</div>;
  }

  const rows = Object.entries(stats);

  return (
    <div className="table-wrap">
      <div className="table-scroll">
        <table>
          <thead>
            <tr>
              <th>Portfolio</th>
              <th>Model</th>
              <th className="right">Return</th>
              <th className="right">Drawdown</th>
              <th className="right">Sharpe</th>
            </tr>
          </thead>
          <tbody>
            {rows.map(([name, s]) => (
              <tr key={name}>
                <td><strong>{name}</strong></td>
                <td className="mono muted">llm</td>
                <td className="right">{(s.total_return * 100).toFixed(2)}%</td>
                <td className="right">{(s.max_drawdown * 100).toFixed(2)}%</td>
                <td className="right">{Number.isFinite(s.sharpe) ? s.sharpe.toFixed(2) : "—"}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}