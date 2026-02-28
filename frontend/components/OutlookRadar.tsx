"use client";

import React, { useEffect, useMemo, useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

// ---------------------------------------------------------------------------
// Exported types
// ---------------------------------------------------------------------------
export type FF5Loading = {
  alpha: number;    // daily alpha (decimal)
  beta_mkt: number;
  beta_smb: number;
  beta_hml: number;
  beta_rmw: number;
  beta_cma: number;
  r_squared: number;
};

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
  /** Keyed by portfolio name from the backend PORTFOLIOS dict */
  loadings?: Record<string, FF5Loading>;
  loadingsLoading?: boolean;
};

// ---------------------------------------------------------------------------
// Axis definitions
// ---------------------------------------------------------------------------
const FF5_AXES = [
  "Market Beta",
  "Size Tilt (SMB)",
  "Value Tilt (HML)",
  "Profitability (RMW)",
  "Investment (CMA)",
  "Alpha (ann.)",
] as const;

const HEURISTIC_AXES = [
  "Risk Tolerance",
  "Equity Bias",
  "Inflation Regime",
  "Growth Outlook",
  "Volatility Expect.",
  "Time Horizon",
] as const;

type FF5Axis = (typeof FF5_AXES)[number];
type HeuristicAxis = (typeof HEURISTIC_AXES)[number];

// ---------------------------------------------------------------------------
// FF5 scoring helpers
// ---------------------------------------------------------------------------
function normalize(value: number, min: number, max: number): number {
  return Math.max(0, Math.min(100, ((value - min) / (max - min)) * 100));
}

function scoreFromLoadings(loading: FF5Loading): Record<FF5Axis, number> {
  return {
    "Market Beta":          normalize(loading.beta_mkt,        0.5,   1.5),
    "Size Tilt (SMB)":      normalize(loading.beta_smb,       -0.5,   0.5),
    "Value Tilt (HML)":     normalize(loading.beta_hml,       -0.5,   0.5),
    "Profitability (RMW)":  normalize(loading.beta_rmw,       -0.5,   0.5),
    "Investment (CMA)":     normalize(loading.beta_cma,       -0.5,   0.5),
    "Alpha (ann.)":         normalize(loading.alpha * 252,    -0.05,  0.05),
  };
}

function rawLabel(axis: FF5Axis, loading: FF5Loading): string {
  switch (axis) {
    case "Market Beta":          return `β=${loading.beta_mkt.toFixed(2)}`;
    case "Size Tilt (SMB)":      return `β=${loading.beta_smb.toFixed(2)}`;
    case "Value Tilt (HML)":     return `β=${loading.beta_hml.toFixed(2)}`;
    case "Profitability (RMW)":  return `β=${loading.beta_rmw.toFixed(2)}`;
    case "Investment (CMA)":     return `β=${loading.beta_cma.toFixed(2)}`;
    case "Alpha (ann.)":         return `α=${(loading.alpha * 252 * 100).toFixed(2)}%/yr`;
  }
}

/**
 * Maps outlook.json model names that differ from their PORTFOLIOS dict key.
 * Add entries here whenever a new name mismatch is introduced.
 */
const OUTLOOK_TO_PORTFOLIO: Record<string, string> = {
  "DeepSeek":            "DeepSeek-V3",
  "DeepSeek DeepResearch": "DeepSeek-DeepThink",
};

/**
 * Try to find a loading for modelName using three passes:
 *   1. Exact match against loadings keys
 *   2. Explicit alias from OUTLOOK_TO_PORTFOLIO
 *   3. Trim + lowercase fuzzy match (handles trailing spaces, capitalisation)
 */
function findLoading(
  modelName: string,
  loadings: Record<string, FF5Loading>,
): FF5Loading | null {
  if (loadings[modelName]) return loadings[modelName];

  const alias = OUTLOOK_TO_PORTFOLIO[modelName];
  if (alias && loadings[alias]) return loadings[alias];

  const norm = modelName.trim().toLowerCase();
  const key = Object.keys(loadings).find(
    (k) => k.trim().toLowerCase() === norm,
  );
  return key ? loadings[key] : null;
}

// ---------------------------------------------------------------------------
// Heuristic scoring (unchanged logic — fallback when FF5 unavailable)
// ---------------------------------------------------------------------------
function clamp(n: number, a = 0, b = 100) {
  return Math.max(a, Math.min(b, n));
}
function hasAny(text: string, needles: string[]) {
  const t = text.toLowerCase();
  return needles.some((n) => t.includes(n));
}

function scoreModel(m: OutlookModelForRadar): Record<HeuristicAxis, number> {
  const regime = (m.regime_summary ?? "").toLowerCase();
  const flags  = (m.objective_flags ?? []).map((x) => x.toLowerCase());
  const styles = (m.style?.labels ?? []).map((x) => x.toLowerCase());
  const assets = (m.stable_assets ?? []).map((x) => x.toUpperCase());
  const conf   = (m.confidence?.trend ?? "").toLowerCase();

  let risk = 50;
  if (conf.includes("elevated") || conf.includes("high")) risk += 8;
  if (styles.some((s) => ["opportunistic", "aggressive", "risk-on"].includes(s))) risk += 10;
  if (flags.some((f) => f.includes("alpha") || f.includes("volatility") || f.includes("drawdown"))) risk += 8;
  if (assets.includes("QQQ") || assets.includes("TQQQ")) risk += 6;
  if (assets.includes("TLT") || assets.includes("SHY") || assets.includes("IEF")) risk -= 6;

  let equity = 60;
  const growthT = ["SPY","VOO","QQQ","VTI","AVUV","MTUM","IJR","IWM","VWO","VEA","EEM"];
  const defT    = ["TLT","IEF","SHY","BND","AGG","GLD","IAU"];
  equity += (assets.filter((a) => growthT.includes(a)).length - assets.filter((a) => defT.includes(a)).length) * 6;

  let infl = 50;
  if (assets.includes("GLD") || assets.includes("IAU") || assets.includes("SLV")) infl += 12;
  if (assets.includes("VNQ")) infl += 6;
  if (hasAny(regime, ["sticky inflation","inflation","reflation"])) infl += 8;
  if (hasAny(regime, ["deflation","disinflation"])) infl -= 8;

  let growth = 55;
  if (hasAny(regime, ["expansion","solid growth","growth strong","soft landing"])) growth += 10;
  if (hasAny(regime, ["recession","contraction","hard landing"])) growth -= 14;
  if (assets.includes("QQQ") || assets.includes("MTUM")) growth += 4;

  let vol = 55;
  if (flags.some((f) => f.includes("higher volatility"))) vol += 10;
  if (assets.includes("TLT") || assets.includes("GLD") || assets.includes("XLP") || assets.includes("XLU")) vol -= 8;
  if (styles.some((s) => ["defensive","low-vol","conservative"].includes(s))) vol -= 6;

  let horizon = 60;
  if (styles.some((s) => ["tactical","opportunistic"].includes(s))) horizon -= 8;
  if (assets.includes("SPY") || assets.includes("VOO") || assets.includes("VTI")) horizon += 6;
  if (assets.includes("TLT")) horizon += 4;

  return {
    "Risk Tolerance": clamp(risk),
    "Equity Bias":    clamp(equity),
    "Inflation Regime": clamp(infl),
    "Growth Outlook": clamp(growth),
    "Volatility Expect.": clamp(vol),
    "Time Horizon":   clamp(horizon),
  };
}

// ---------------------------------------------------------------------------
// Colour helpers
// ---------------------------------------------------------------------------
function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h) % 360;
}
function modelColor(name: string) { return `hsl(${hashHue(name)} 80% 60%)`; }

// ---------------------------------------------------------------------------
// Axis legend metadata
// ---------------------------------------------------------------------------
const FF5_LEGEND: Record<FF5Axis, string> = {
  "Market Beta":         "β>1 = more market exposure · β<1 = defensive",
  "Size Tilt (SMB)":     "Positive = small-cap tilt · Negative = large-cap",
  "Value Tilt (HML)":    "Positive = value tilt · Negative = growth",
  "Profitability (RMW)": "Positive = high-profit firms · Negative = unprofitable",
  "Investment (CMA)":    "Positive = conservative investment · Negative = aggressive",
  "Alpha (ann.)":        "Annualised excess return above FF5 factor model",
};

const HEURISTIC_LEGEND: Record<HeuristicAxis, string> = {
  "Risk Tolerance":     "0 = conservative · 100 = aggressive",
  "Equity Bias":        "0 = bonds/defensive · 100 = equity-heavy",
  "Inflation Regime":   "0 = deflation · 100 = high inflation",
  "Growth Outlook":     "0 = recession · 100 = strong expansion",
  "Volatility Expect.": "0 = calm · 100 = high vol expected",
  "Time Horizon":       "0 = short-term · 100 = long-term",
};

// ---------------------------------------------------------------------------
// Component
// ---------------------------------------------------------------------------
export default function OutlookRadar({ asOf, models, loadings, loadingsLoading }: Props) {
  // Determine mode: FF5 if we have real loadings data
  const hasLoadings =
    !loadingsLoading &&
    loadings != null &&
    Object.keys(loadings).length > 0;

  // In FF5 mode, only show models we have loadings for
  const ff5Models = useMemo(() => {
    if (!hasLoadings || !loadings) return [];
    return models.filter((m) => findLoading(m.name, loadings) !== null);
  }, [models, loadings, hasLoadings]);

  const effectiveModels = hasLoadings ? ff5Models : models;
  const effectiveNames  = effectiveModels.map((m) => m.name);

  const AXES = (hasLoadings ? FF5_AXES : HEURISTIC_AXES) as readonly string[];

  const scoresByName = useMemo<Record<string, Record<string, number>>>(() => {
    const out: Record<string, Record<string, number>> = {};
    if (hasLoadings && loadings) {
      for (const m of ff5Models) {
        const loading = findLoading(m.name, loadings);
        if (loading) out[m.name] = scoreFromLoadings(loading);
      }
    } else {
      for (const m of models) out[m.name] = scoreModel(m);
    }
    return out;
  }, [models, ff5Models, loadings, hasLoadings]);

  const [active, setActive] = useState<string[]>([]);
  const [hovered, setHovered] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  // Reset selected models when mode or available names change
  useEffect(() => {
    setActive(effectiveNames.slice(0, Math.min(4, effectiveNames.length)));
    setAnimKey((k) => k + 1);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [effectiveNames.join("|"), hasLoadings]);

  const chartData = useMemo(
    () =>
      AXES.map((axis) => {
        const row: Record<string, unknown> = { axis };
        for (const n of active) row[n] = scoresByName[n]?.[axis] ?? 0;
        return row;
      }),
    [active, scoresByName, AXES],
  );

  // Tooltip: close over loadings so it can show raw factor values
  const TooltipContent = useMemo(() => {
    const loadingsSnap = loadings ?? {};
    const ff5Mode = hasLoadings;
    return function CustomTooltip({ active: a, payload, label }: any) {
      if (!a || !payload?.length) return null;
      return (
        <div
          style={{
            background: "var(--card, #0b0b10)",
            border: "1px solid var(--border, #171722)",
            borderRadius: 10,
            padding: "10px 14px",
            minWidth: 240,
            boxShadow: "0 14px 30px rgba(0,0,0,0.5)",
          }}
        >
          <div style={{ fontSize: 11, color: "var(--muted, #6b7280)", marginBottom: 8, letterSpacing: "0.08em", textTransform: "uppercase" }}>
            {label}
          </div>
          {payload.map((p: any) => {
            const loading = ff5Mode ? findLoading(p.dataKey, loadingsSnap) : null;
            const raw = loading ? rawLabel(label as FF5Axis, loading) : null;
            return (
              <div
                key={p.dataKey}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 14, marginBottom: 6 }}
              >
                <span style={{ color: modelColor(p.dataKey), fontWeight: 800 }}>{p.dataKey}</span>
                <span style={{ color: "var(--text, #e5e7eb)", textAlign: "right" }}>
                  <span style={{ fontWeight: 700 }}>{Math.round(p.value)}</span>
                  <span style={{ color: "var(--muted, #6b7280)", fontSize: 10 }}>/100</span>
                  {raw && (
                    <span style={{ color: "#9ca3af", fontSize: 11, marginLeft: 6 }}>({raw})</span>
                  )}
                </span>
              </div>
            );
          })}
          <div style={{ marginTop: 8, fontSize: 10, color: "var(--muted, #6b7280)", borderTop: "1px solid #1f2430", paddingTop: 6 }}>
            {ff5Mode ? "Fama-French 5-Factor OLS · normalized 0–100" : "Heuristic scores from outlook.json"}
          </div>
        </div>
      );
    };
  }, [loadings, hasLoadings]);

  if (effectiveModels.length === 0 && !loadingsLoading) return null;

  const modeLabel = loadingsLoading
    ? "Loading factor data …"
    : hasLoadings
    ? `FF5 Factor Loadings · R² shown · ${ff5Models.length} portfolios`
    : "Heuristic outlook scores";

  return (
    <div className="card" style={{ overflow: "hidden" }}>
      <div className="card-head">
        <div>
          <p className="title">How each model sees the market</p>
          <p className="sub">
            {hasLoadings
              ? "Fama-French 5-Factor OLS regression loadings · normalized to 0–100"
              : "Radar view of worldview signals extracted from each model's Outlook"}
          </p>
        </div>
        <div className="pill">{asOf ? `As of ${asOf}` : modeLabel}</div>
      </div>

      <div style={{ padding: 16 }}>
        {/* Loading overlay */}
        {loadingsLoading && (
          <div
            style={{
              display: "flex", alignItems: "center", gap: 10,
              padding: "10px 0", marginBottom: 10, color: "#9ca3af", fontSize: 13,
            }}
          >
            <span style={{ display: "inline-block", width: 14, height: 14, border: "2px solid #4b5563", borderTopColor: "#6366f1", borderRadius: "50%", animation: "spin 0.7s linear infinite" }} />
            Loading Fama-French factor loadings …
            <style>{`@keyframes spin { to { transform: rotate(360deg); } }`}</style>
          </div>
        )}

        {/* Mode badge */}
        {!loadingsLoading && (
          <div style={{ marginBottom: 10, display: "flex", alignItems: "center", gap: 8 }}>
            <span
              style={{
                fontSize: 11, padding: "3px 10px", borderRadius: 999,
                background: hasLoadings ? "rgba(99,102,241,0.15)" : "rgba(107,114,128,0.12)",
                color: hasLoadings ? "#818cf8" : "#9ca3af",
                border: `1px solid ${hasLoadings ? "rgba(99,102,241,0.3)" : "#374151"}`,
                fontWeight: 700,
              }}
            >
              {hasLoadings ? "FF5 Factor Mode" : "Heuristic Mode"}
            </span>
            {hasLoadings && (
              <span style={{ fontSize: 11, color: "#6b7280" }}>
                {ff5Models.length} of {models.length} portfolios have regression data
              </span>
            )}
          </div>
        )}

        {/* Model toggles */}
        {effectiveNames.length > 0 && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 12, alignItems: "center" }}>
            {effectiveNames.map((n) => {
              const on = active.includes(n);
              const c  = modelColor(n);
              const loading = hasLoadings && loadings ? findLoading(n, loadings) : null;
              return (
                <button
                  key={n}
                  onClick={() => {
                    setActive((prev) => {
                      if (prev.includes(n)) return prev.length === 1 ? prev : prev.filter((x) => x !== n);
                      return [...prev, n];
                    });
                    setAnimKey((k) => k + 1);
                  }}
                  onMouseEnter={() => setHovered(n)}
                  onMouseLeave={() => setHovered(null)}
                  style={{
                    padding: "8px 10px", borderRadius: 12,
                    border: `1px solid ${on ? c : "var(--border)"}`,
                    background: on ? "rgba(255,255,255,0.04)" : "transparent",
                    cursor: "pointer", display: "flex", alignItems: "center", gap: 8,
                    opacity: on ? 1 : 0.55,
                  }}
                >
                  <span style={{ width: 10, height: 10, borderRadius: 4, background: on ? c : "#3f3f4a" }} />
                  <span style={{ fontWeight: 800, color: on ? "#e5e7eb" : "#9ca3af" }}>{n}</span>
                  {loading && (
                    <span style={{ fontSize: 10, color: "#6b7280" }}>
                      R²={loading.r_squared.toFixed(2)}
                    </span>
                  )}
                </button>
              );
            })}
            <div className="muted" style={{ marginLeft: "auto", fontSize: 12 }}>
              click to toggle · hover highlights
            </div>
          </div>
        )}

        {/* Chart */}
        {effectiveNames.length === 0 && !loadingsLoading ? (
          <div style={{ padding: "20px 0", color: "#6b7280", textAlign: "center" }}>
            No models to display.
          </div>
        ) : (
          <div style={{ position: "relative" }}>
            <ResponsiveContainer width="100%" height={420}>
              <RadarChart key={animKey} data={chartData} margin={{ top: 16, right: 30, bottom: 16, left: 30 }}>
                <PolarGrid gridType="polygon" stroke="var(--border, #171722)" />
                <PolarAngleAxis dataKey="axis" tick={{ fill: "var(--muted, #9ca3af)", fontSize: 12 }} />
                <PolarRadiusAxis
                  angle={90}
                  domain={[0, 100]}
                  tickCount={6}
                  tick={{ fill: "var(--muted, #6b7280)", fontSize: 10 }}
                  stroke="var(--border, #171722)"
                  tickFormatter={(v) => (v === 0 ? "" : String(v))}
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
                <Tooltip content={<TooltipContent />} />
              </RadarChart>
            </ResponsiveContainer>

            {/* Watermark */}
            <div
              style={{
                position: "absolute", top: "50%", left: "50%",
                transform: "translate(-50%,-50%)",
                fontSize: 10, color: "rgba(255,255,255,0.06)",
                letterSpacing: "0.14em", textTransform: "uppercase",
                pointerEvents: "none", textAlign: "center",
                lineHeight: 1.6, fontWeight: 900,
              }}
            >
              LLM<br />Portfolio<br />Lab
            </div>
          </div>
        )}

        {/* Axis legend */}
        <div
          style={{
            marginTop: 10,
            display: "grid",
            gridTemplateColumns: "repeat(3, minmax(0, 1fr))",
            gap: 10,
            border: "1px solid var(--border, #171722)",
            borderRadius: 16,
            padding: 12,
          }}
        >
          {AXES.map((a) => {
            const desc = hasLoadings
              ? FF5_LEGEND[a as FF5Axis]
              : HEURISTIC_LEGEND[a as HeuristicAxis];
            return (
              <div key={a}>
                <div style={{ fontSize: 12, fontWeight: 900, color: "#e5e7eb" }}>{a}</div>
                <div className="muted" style={{ fontSize: 11, marginTop: 2 }}>{desc}</div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
