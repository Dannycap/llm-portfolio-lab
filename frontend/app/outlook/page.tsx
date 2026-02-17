"use client";

import { useEffect, useMemo, useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** -----------------------------
 * Types (match your existing style)
 * ----------------------------- */
type OutlookModel = {
  name: string;
  regime_summary?: string | null;
  objective_summary?: string | null;
  objective_flags?: string[];
  stable_assets?: string[];
  confidence?: { trend?: string | null; notes?: string[] };
  style?: { labels?: string[]; notes?: string[] };
};

type OutlookPayload = {
  as_of?: string;
  models?: any; // can be array or object depending on your backend
  outlook_models?: any;
  models_by_name?: Record<string, any>;
} & Record<string, any>;

/** -----------------------------
 * Helpers
 * ----------------------------- */
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

function toArrayModels(data: OutlookPayload | null): OutlookModel[] {
  if (!data) return [];

  // 1) explicit array fields
  const arr =
    (Array.isArray(data.models) ? data.models : null) ??
    (Array.isArray(data.outlook_models) ? data.outlook_models : null);

  if (arr) {
    return arr
      .map((m: any) => ({
        name: String(m?.name ?? m?.label ?? m?.id ?? "Model"),
        regime_summary: m?.regime_summary ?? m?.regime?.summary ?? null,
        objective_summary: m?.objective_summary ?? m?.objective?.summary ?? null,
        objective_flags: Array.isArray(m?.objective_flags) ? m.objective_flags : [],
        stable_assets: Array.isArray(m?.stable_assets) ? m.stable_assets : [],
        confidence: m?.confidence ?? m?.confidence_analysis ?? undefined,
        style: m?.style ?? m?.cognitive_style ?? undefined,
      }))
      .filter((m: OutlookModel) => !!m.name);
  }

  // 2) object fields keyed by model name
  const obj =
    (data.models_by_name && typeof data.models_by_name === "object" ? data.models_by_name : null) ??
    // 3) sometimes the whole payload itself is keyed by model name
    (guessTopLevelModelsObject(data) ? (data as any) : null);

  if (obj) {
    return Object.entries(obj)
      .map(([name, raw]: any) => ({
        name: String(raw?.name ?? name),
        regime_summary: raw?.regime_summary ?? raw?.regime_consistency?.summary ?? null,
        objective_summary: raw?.objective_summary ?? raw?.objective_drift?.summary ?? null,
        objective_flags: Array.isArray(raw?.objective_flags) ? raw.objective_flags : (Array.isArray(raw?.objective_drift?.patterns_detected) ? raw.objective_drift.patterns_detected : []),
        stable_assets: Array.isArray(raw?.stable_assets) ? raw.stable_assets : (Array.isArray(raw?.asset_role_stability?.stable_assets) ? raw.asset_role_stability.stable_assets : []),
        confidence: raw?.confidence ?? raw?.confidence_analysis ?? undefined,
        style: raw?.style ?? raw?.cognitive_style ?? undefined,
      }))
      .filter((m: OutlookModel) => !!m.name);
  }

  return [];
}

function guessTopLevelModelsObject(data: any) {
  // heuristic: top-level has keys like "Grok", "Claude", etc., and value objects
  if (!data || typeof data !== "object") return false;
  const keys = Object.keys(data);
  if (keys.length === 0) return false;
  // if it has known meta keys, it's probably not the model map
  const metaKeys = new Set(["as_of", "models", "outlook_models", "models_by_name", "consensus", "disagreements"]);
  const maybeModelKeys = keys.filter((k) => !metaKeys.has(k));
  if (maybeModelKeys.length < 1) return false;
  const sample = (data as any)[maybeModelKeys[0]];
  return sample && typeof sample === "object";
}

/** -----------------------------
 * Radar scoring (deterministic heuristic)
 * ----------------------------- */
const AXES = [
  "Risk Tolerance",
  "Equity Bias",
  "Inflation Regime",
  "Growth Outlook",
  "Volatility Expect.",
  "Time Horizon",
] as const;

type Axis = (typeof AXES)[number];

function hasAny(text: string, needles: string[]) {
  const t = (text || "").toLowerCase();
  return needles.some((n) => t.includes(n));
}

function scoreModel(m: OutlookModel): Record<Axis, number> {
  const regime = (m.regime_summary ?? "").toLowerCase();
  const flags = (m.objective_flags ?? []).map((x) => String(x).toLowerCase());
  const styles = (m.style?.labels ?? []).map((x) => String(x).toLowerCase());
  const assets = (m.stable_assets ?? []).map((x) => String(x).toUpperCase());
  const conf = String(m.confidence?.trend ?? "").toLowerCase();

  let risk = 50;
  if (conf.includes("elevated") || conf.includes("high")) risk += 8;
  if (styles.some((s) => ["opportunistic", "aggressive", "risk-on"].includes(s))) risk += 10;
  if (flags.some((f) => f.includes("alpha") || f.includes("higher volatility") || f.includes("drawdown"))) risk += 8;
  if (assets.includes("QQQ") || assets.includes("TQQQ")) risk += 6;
  if (assets.includes("TLT") || assets.includes("SHY") || assets.includes("IEF")) risk -= 6;

  let equity = 60;
  const growthTickers = ["SPY", "VOO", "QQQ", "VTI", "AVUV", "MTUM", "IJR", "IWM", "VWO", "VEA", "EEM", "VNQ"];
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

function buildRadarData(activeNames: string[], scoresByName: Record<string, Record<Axis, number>>) {
  return AXES.map((axis) => {
    const row: any = { axis };
    for (const n of activeNames) row[n] = scoresByName[n]?.[axis] ?? 0;
    return row;
  });
}

function RadarTooltip({ active, payload, label }: any) {
  if (!active || !payload?.length) return null;
  return (
    <div
      style={{
        background: "#0f0f12",
        border: "1px solid #2a2a35",
        borderRadius: 10,
        padding: "10px 12px",
        minWidth: 220,
        boxShadow: "0 14px 30px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ fontSize: 10, color: "#9aa0aa", letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 8 }}>
        {label}
      </div>
      {payload.map((p: any) => (
        <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 12, marginBottom: 6 }}>
          <span style={{ color: modelColor(p.dataKey), fontWeight: 800 }}>{p.dataKey}</span>
          <span style={{ color: "#e5e7eb" }}>
            {Math.round(p.value)}
            <span style={{ color: "#6b7280", fontSize: 10 }}>/100</span>
          </span>
        </div>
      ))}
      <div style={{ marginTop: 6, fontSize: 10, color: "#6b7280" }}>
        deterministic heuristic scores (no backend changes)
      </div>
    </div>
  );
}

/** -----------------------------
 * Page
 * ----------------------------- */
export default function OutlookPage() {
  const [data, setData] = useState<OutlookPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);

  useEffect(() => {
    const run = async () => {
      try {
        // adjust endpoint if yours differs
        const res = await fetch(`${API_BASE}/api/outlook`, { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const j = (await res.json()) as OutlookPayload;
        setData(j);
        setErr(null);
      } catch (e: any) {
        setErr(String(e?.message ?? e));
      }
    };
    run();
  }, []);

  const models = useMemo(() => toArrayModels(data), [data]);

  const scoresByName = useMemo(() => {
    const out: Record<string, Record<Axis, number>> = {};
    for (const m of models) out[m.name] = scoreModel(m);
    return out;
  }, [models]);

  const modelNames = useMemo(() => models.map((m) => m.name), [models]);
  const [active, setActive] = useState<string[]>(() => modelNames.slice(0, 4));
  const [hovered, setHovered] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  useEffect(() => {
    // keep active list valid after data loads
    if (modelNames.length && active.length === 0) setActive(modelNames.slice(0, 4));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [modelNames.join("|")]);

  const radarData = useMemo(() => buildRadarData(active, scoresByName), [active, scoresByName]);

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

  return (
    <main style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>Outlook</h1>
      <p style={{ color: "#6b7280", marginTop: 0, marginBottom: 18 }}>
        Model worldview summaries + radar comparison
      </p>

      {err ? (
        <div style={{ padding: 12, border: "1px solid #3f3f4a", borderRadius: 12, color: "#fca5a5" }}>
          Error loading outlook: {err}
        </div>
      ) : null}

      {/* Debug line (remove later) */}
      {process.env.NODE_ENV !== "production" ? (
        <pre style={{ color: "#6b7280", fontSize: 12, marginBottom: 14 }}>
          models: {models.length} · as_of: {String((data as any)?.as_of ?? "")}
        </pre>
      ) : null}

      {/* Radar card */}
      <div
        style={{
          background: "#0b0b10",
          border: "1px solid #171722",
          borderRadius: 16,
          padding: 16,
          marginBottom: 16,
        }}
      >
        <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 900, color: "#e5e7eb" }}>How each model sees the market</div>
            <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>
              0 = low/defensive · 100 = high/aggressive
            </div>
          </div>
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            {(data as any)?.as_of ? `As of ${(data as any).as_of}` : "—"}
          </div>
        </div>

        {models.length === 0 ? (
          <div style={{ padding: 12, color: "#6b7280" }}>
            No models found in outlook payload. (Your endpoint might not be <code>/api/outlook</code>.)
          </div>
        ) : (
          <>
            {/* toggles */}
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 10, alignItems: "center" }}>
              {models.map((m) => {
                const on = active.includes(m.name);
                const c = modelColor(m.name);
                return (
                  <button
                    key={m.name}
                    onClick={() => toggle(m.name)}
                    onMouseEnter={() => setHovered(m.name)}
                    onMouseLeave={() => setHovered(null)}
                    style={{
                      padding: "8px 10px",
                      borderRadius: 12,
                      border: `1px solid ${on ? c : "#222230"}`,
                      background: on ? "rgba(255,255,255,0.04)" : "transparent",
                      cursor: "pointer",
                      display: "flex",
                      alignItems: "center",
                      gap: 8,
                      opacity: on ? 1 : 0.55,
                      color: on ? "#e5e7eb" : "#9ca3af",
                      fontWeight: 800,
                    }}
                  >
                    <span style={{ width: 10, height: 10, borderRadius: 4, background: on ? c : "#3f3f4a" }} />
                    {m.name}
                  </button>
                );
              })}
              <div style={{ marginLeft: "auto", fontSize: 12, color: "#6b7280" }}>click to toggle · hover highlights</div>
            </div>

            <div style={{ position: "relative" }}>
              <ResponsiveContainer width="100%" height={420}>
                <RadarChart key={animKey} data={radarData} margin={{ top: 16, right: 30, bottom: 16, left: 30 }}>
                  <PolarGrid gridType="polygon" stroke="#1f2430" />
                  <PolarAngleAxis dataKey="axis" tick={{ fill: "#9ca3af", fontSize: 12 }} />
                  <PolarRadiusAxis
                    angle={90}
                    domain={[0, 100]}
                    tickCount={6}
                    tick={{ fill: "#6b7280", fontSize: 10 }}
                    stroke="#1f2430"
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
                        activeDot={{ r: 6, fill: c, stroke: "#0b0b10", strokeWidth: 2 }}
                        animationDuration={550}
                      />
                    );
                  })}
                  <Tooltip content={<RadarTooltip />} />
                </RadarChart>
              </ResponsiveContainer>

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
          </>
        )}
      </div>

      {/* Existing snapshots (simple version) */}
      <div
        style={{
          background: "#0b0b10",
          border: "1px solid #171722",
          borderRadius: 16,
          padding: 16,
        }}
      >
        <div style={{ fontSize: 16, fontWeight: 900, color: "#e5e7eb", marginBottom: 12 }}>
          Model snapshots
        </div>

        {models.length === 0 ? (
          <div style={{ color: "#6b7280" }}>No models to display.</div>
        ) : (
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(260px, 1fr))", gap: 12 }}>
            {models.map((m) => (
              <div
                key={m.name}
                style={{
                  border: "1px solid #222230",
                  borderRadius: 14,
                  padding: 12,
                  background: "rgba(255,255,255,0.02)",
                }}
              >
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <div style={{ width: 10, height: 10, borderRadius: 4, background: modelColor(m.name) }} />
                  <div style={{ fontWeight: 900, color: "#e5e7eb" }}>{m.name}</div>
                </div>

                <div style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.55 }}>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 800 }}>Regime</div>
                    <div>{m.regime_summary ?? "—"}</div>
                  </div>
                  <div style={{ marginBottom: 8 }}>
                    <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 800 }}>Objective</div>
                    <div>{m.objective_summary ?? "—"}</div>
                  </div>
                  <div>
                    <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 800 }}>Stable assets</div>
                    <div style={{ color: "#9ca3af" }}>
                      {(m.stable_assets ?? []).slice(0, 10).join(", ") || "—"}
                    </div>
                  </div>
                </div>

                {m.objective_flags?.length ? (
                  <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                    {m.objective_flags.slice(0, 6).map((f, i) => (
                      <span
                        key={`${m.name}-flag-${i}`}
                        style={{
                          fontSize: 11,
                          color: "#9ca3af",
                          border: "1px solid #222230",
                          borderRadius: 999,
                          padding: "3px 8px",
                        }}
                      >
                        {f}
                      </span>
                    ))}
                  </div>
                ) : null}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
