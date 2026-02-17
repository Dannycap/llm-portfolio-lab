"use client";

import React, { useMemo, useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

export type OutlookModelForRadar = {
  name: string;
  regime_summary?: string | null;
  objective_flags?: string[];
  stable_assets?: string[];
  confidence?: { trend?: string | null; notes?: string[] };
  style?: { labels?: string[]; notes?: string[] };
};

type Props = {
  asOf?: string;
  models: OutlookModelForRadar[];
};

const AXES = [
  "Risk Tolerance",
  "Equity Bias",
  "Inflation Regime",
  "Growth Outlook",
  "Volatility Expect.",
  "Time Horizon",
] as const;

type Axis = (typeof AXES)[number];

function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}

function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) {
    h = (h << 5) - h + s.charCodeAt(i);
    h |= 0;
  }
  return Math.abs(h) % 360;
}

function modelColor(name: string) {
  const hue = hashHue(name);
  return `hsl(${hue} 80% 60%)`;
}

function hasAny(text: string, needles: string[]) {
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
}

function scoreModel(m: OutlookModelForRadar): Record<Axis, number> {
  const regime = (m.regime_summary ?? "").toLowerCase();
  const flags = (m.objective_flags ?? []).map((x) => x.toLowerCase());
  const styles = (m.style?.labels ?? []).map((x) => x.toLowerCase());
  const assets = (m.stable_assets ?? []).map((x) => x.toUpperCase());
  const conf = (m.confidence?.trend ?? "").toLowerCase();

  // crude but deterministic heuristic scoring from your existing fields
  let risk = 50;
  if (conf.includes("elevated") || conf.includes("high")) risk += 8;
  if (styles.some((s) => ["opportunistic", "aggressive", "risk-on"].includes(s))) risk += 10;
  if (flags.some((f) => f.includes("alpha") || f.includes("volatility") || f.includes("drawdown"))) risk += 8;
  if (assets.includes("QQQ") || assets.includes("TQQQ")) risk += 6;
  if (assets.includes("TLT") || assets.includes("SHY") || assets.includes("IEF")) risk -= 6;

  let equity = 60;
  // equity-ish signal from “stable assets” (works with your current JSON)
  const growthTickers = ["SPY", "VOO", "QQQ", "VTI", "AVUV", "MTUM", "IJR", "IWM", "VWO", "VEA", "EEM"];
  const defensiveTickers = ["TLT", "IEF", "SHY", "BND", "AGG", "GLD", "IAU"];
  const growthCount = assets.filter((a) => growthTickers.includes(a)).length;
  const defCount = assets.filter((a) => defensiveTickers.includes(a)).length;
  equity += (growthCount - defCount) * 6;

  let infl = 50;
  if (assets.includes("GLD") || assets.includes("IAU") || assets.includes("SLV")) infl += 12;
  if (assets.includes("VNQ")) infl += 6;
  if (hasAny(regime, ["sticky inflation", "inflation", "reflation"])) infl += 8;
  if (hasAny(regime, ["deflation", "disinflation"])) infl -= 8;

  let growth = 55;
  if (hasAny(regime, ["expansion", "solid growth", "growth strong", "soft landing"])) growth += 10;
  if (hasAny(regime, ["recession", "contraction", "hard landing"])) growth -= 14;
  if (assets.includes("QQQ") || assets.includes("MTUM")) growth += 4;

  let vol = 55;
  if (flags.some((f) => f.includes("higher volatility"))) vol += 10;
  if (assets.includes("TLT") || assets.includes("GLD") || assets.includes("XLP") || assets.includes("XLU")) vol -= 8;
  if (styles.some((s) => ["defensive", "low-vol", "conservative"].includes(s))) vol -= 6;

  let horizon = 60;
  if (styles.some((s) => ["tactical", "opportunistic"].includes(s))) horizon -= 8;
  if (assets.includes("SPY") || assets.includes("VOO") || assets.includes("VTI")) horizon += 6;
  if (assets.includes("TLT")) horizon += 4;

  return {
    "Risk Tolerance": clamp(risk),
    "Equity Bias": clamp(equity),
    "Inflation Regime": clamp(infl),
    "Growth Outlook": clamp(growth),
    "Volatility Expect.": clamp(vol),
    "Time Horizon": clamp(horizon),
  };
}

function buildChartData(activeNames: string[], scoresByName: Record<string, Record<Axis, number>>) {
  return AXES.map((axis) => {
    const row: any = { axis };
    for (const name of activeNames) {
      row[name] = scoresByName[name]?.[axis] ?? 0;
    }
    return row;
  });
}

function CustomTooltip({
  active,
  payload,
  label,
}: any) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "var(--card, #0b0b10)",
        border: "1px solid var(--border, #171722)",
        borderRadius: 10,
        padding: "10px 12px",
        minWidth: 220,
        boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontSize: 11, color: "var(--muted, #6b7280)", marginBottom: 8 }}>
        {label}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <span style={{ color: modelColor(p.dataKey), fontWeight: 800 }}>{p.dataKey}</span>
          <span style={{ color: "var(--text, #e5e7eb)" }}>
            {Math.round(p.value)}
            <span style={{ color: "var(--muted, #6b7280)", fontSize: 10 }}>/100</span>
          </span>
        </div>
      ))}
      <div style={{ marginTop: 6, fontSize: 10, color: "var(--muted, #6b7280)" }}>
        heuristic scores from outlook.json fields
      </div>
    </div>
  );
}

export default function OutlookRadar({ asOf, models }: Props) {
  const names = useMemo(() => models.map((m) => m.name), [models]);

  const scoresByName = useMemo(() => {
    const out: Record<string, Record<Axis, number>> = {};
    for (const m of models) out[m.name] = scoreModel(m);
    return out;
  }, [models]);

  const [active, setActive] = useState<string[]>(() => names.slice(0, Math.min(4, names.length)));
  const [hovered, setHovered] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const chartData = useMemo(() => buildChartData(active, scoresByName), [active, scoresByName]);

  function toggle(name: string) {
    setActive((prev) => {
      if (prev.includes(name)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== name);
      }
      return [...prev, name];
    });
    setAnimKey((k) => k + 1);
  }

  if (models.length === 0) return null;

  return (
    <div
      className="card"
      style={{
        overflow: "hidden",
      }}
    >
      <div className="card-head">
        <div>
          <p className="title">How each model sees the market</p>
          <p className="sub">Radar view of worldview signals extracted from each model’s Outlook</p>
        </div>
        <div className="pill">{asOf ? `As of ${asOf}` : "Radar"}</div>
      </div>

      <div style={{ padding: 16 }}>
        {/* toggles */}
        <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
          {names.map((n) => {
            const on = active.includes(n);
            const c = modelColor(n);
            return (
              <button
                key={n}
                onClick={() => toggle(n)}
                onMouseEnter={() => setHovered(n)}
                onMouseLeave={() => setHovered(null)}
                style={{
                  padding: "8px 10px",
                  borderRadius: 12,
                  border: `1px solid ${on ? c : "var(--border)"}`,
                  background: on ? "rgba(255,255,255,0.04)" : "transparent",
                  cursor: "pointer",
                  display: "flex",
                  alignItems: "center",
                  gap: 8,
                  opacity: on ? 1 : 0.55,
                }}
              >
                <span style={{ width: 10, height: 10, borderRadius: 4, background: on ? c : "#3f3f4a" }} />
                <span style={{ fontWeight: 800 }}>{n}</span>
              </button>
            );
          })}
          <div className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>
            click to toggle · hover highlights
          </div>
        </div>

        {/* chart */}
        <div style={{ position: "relative" }}>
          <ResponsiveContainer width="100%" height={420}>
            <RadarChart key={animKey} data={chartData} margin={{ top: 16, right: 30, bottom: 16, left: 30 }}>
              <PolarGrid gridType="polygon" stroke="var(--border)" />
              <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted)", fontSize: 12 }} />
              <PolarRadiusAxis
                angle={90}
                domain={[0, 100]}
                tickCount={6}
                tick={{ fill: "var(--muted)", fontSize: 10 }}
                stroke="var(--border)"
                tickFormatter={(v) => (v === 0 ? "" : v)}
              />

              {active.map((name) => {
                const c = modelColor(name);
                const isHover = hovered === name;
                return (
                  <Radar
                    key={name}
                    name={name}
                    dataKey={name}
                    stroke={c}
                    fill={c}
                    fillOpacity={isHover ? 0.22 : 0.10}
                    strokeWidth={isHover ? 2.6 : 1.8}
                    dot={{ r: 3.8, fill: c, strokeWidth: 0, opacity: 0.9 }}
                    activeDot={{ r: 6, fill: c, stroke: "var(--bg, #0b0b10)", strokeWidth: 2 }}
                    animationDuration={550}
                  />
                );
              })}

              <Tooltip content={<CustomTooltip />} />
            </RadarChart>
          </ResponsiveContainer>

          {/* watermark */}
          <div
            style={{
              position: "absolute",
              top: "50%",
              left: "50%",
              transform: "translate(-50%,-50%)",
              fontSize: 10,
              color: "rgba(255,255,255,0.06)",
              letterSpacing: "0.14em",
              textTransform: "uppercase",
              pointerEvents: "none",
              textAlign: "center",
              lineHeight: 1.6,
              fontWeight: 900,
            }}
          >
            LLM<br />Portfolio<br />Lab
          </div>
        </div>

        {/* axis legend */}
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
            border: "1px solid var(--border)",
            borderRadius: 16,
            padding: 12,
          }}
        >
          {AXES.map((a) => (
            <div key={a}>
              <div style={{ fontSize: 12, fontWeight: 900 }}>{a}</div>
              <div className="muted" style={{ fontSize: 11 }}>
                0 = low/defensive · 100 = high/aggressive
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
