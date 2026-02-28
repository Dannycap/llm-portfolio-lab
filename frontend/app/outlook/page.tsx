"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import OutlookRadar, { FF5Loading } from "../../components/OutlookRadar";
import type { OutlookModelForRadar } from "../../components/OutlookRadar";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

/** Alias map matching OutlookRadar so snapshots section also resolves correctly */
const OUTLOOK_TO_PORTFOLIO: Record<string, string> = {
  "DeepSeek":            "DeepSeek-V3",
  "DeepSeek DeepResearch": "DeepSeek-DeepThink",
};

function resolveLoading(name: string, loadings: Record<string, FF5Loading>): FF5Loading | null {
  if (loadings[name]) return loadings[name];
  const alias = OUTLOOK_TO_PORTFOLIO[name];
  if (alias && loadings[alias]) return loadings[alias];
  const norm = name.trim().toLowerCase();
  const key = Object.keys(loadings).find((k) => k.trim().toLowerCase() === norm);
  return key ? loadings[key] : null;
}

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------
type OutlookPayload = {
  as_of?: string;
  models?: any;
  outlook_models?: any;
  models_by_name?: Record<string, any>;
} & Record<string, any>;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------
function hashHue(s: string) {
  let h = 0;
  for (let i = 0; i < s.length; i++) { h = (h << 5) - h + s.charCodeAt(i); h |= 0; }
  return Math.abs(h) % 360;
}
function modelColor(name: string) { return `hsl(${hashHue(name)} 80% 60%)`; }

function guessTopLevelModelsObject(data: any) {
  if (!data || typeof data !== "object") return false;
  const metaKeys = new Set(["as_of","models","outlook_models","models_by_name","consensus","disagreements"]);
  const maybeModelKeys = Object.keys(data).filter((k) => !metaKeys.has(k));
  if (maybeModelKeys.length < 1) return false;
  const sample = data[maybeModelKeys[0]];
  return sample && typeof sample === "object";
}

function toArrayModels(data: OutlookPayload | null): OutlookModelForRadar[] {
  if (!data) return [];

  const arr =
    (Array.isArray(data.models) ? data.models : null) ??
    (Array.isArray(data.outlook_models) ? data.outlook_models : null);

  if (arr) {
    return arr
      .map((m: any) => ({
        name: String(m?.name ?? m?.label ?? m?.id ?? "Model"),
        regime_summary:   m?.regime_summary ?? m?.regime?.summary ?? null,
        objective_flags:  Array.isArray(m?.objective_flags) ? m.objective_flags : [],
        stable_assets:    Array.isArray(m?.stable_assets) ? m.stable_assets : [],
        confidence: m?.confidence ?? m?.confidence_analysis ?? undefined,
        style:      m?.style ?? m?.cognitive_style ?? undefined,
      }))
      .filter((m: OutlookModelForRadar) => !!m.name);
  }

  const obj =
    (data.models_by_name && typeof data.models_by_name === "object" ? data.models_by_name : null) ??
    (guessTopLevelModelsObject(data) ? (data as any) : null);

  if (obj) {
    return Object.entries(obj)
      .map(([name, raw]: any) => ({
        name: String(raw?.name ?? name),
        regime_summary:  raw?.regime_summary ?? raw?.regime_consistency?.summary ?? null,
        objective_flags: Array.isArray(raw?.objective_flags)
          ? raw.objective_flags
          : (Array.isArray(raw?.objective_drift?.patterns_detected) ? raw.objective_drift.patterns_detected : []),
        stable_assets: Array.isArray(raw?.stable_assets)
          ? raw.stable_assets
          : (Array.isArray(raw?.asset_role_stability?.stable_assets) ? raw.asset_role_stability.stable_assets : []),
        confidence: raw?.confidence ?? raw?.confidence_analysis ?? undefined,
        style:      raw?.style ?? raw?.cognitive_style ?? undefined,
      }))
      .filter((m: OutlookModelForRadar) => !!m.name);
  }

  return [];
}

// ---------------------------------------------------------------------------
// Page
// ---------------------------------------------------------------------------
export default function OutlookPage() {
  const [data, setData] = useState<OutlookPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [loadings, setLoadings] = useState<Record<string, FF5Loading>>({});
  const [loadingsLoading, setLoadingsLoading] = useState(true);
  const [loadingsErr, setLoadingsErr] = useState<string | null>(null);

  const fetchLoadings = useCallback(() => {
    setLoadingsLoading(true);
    setLoadingsErr(null);
    fetch(`${API_BASE}/api/ff5/loadings`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: Record<string, FF5Loading>) => {
        const count = Object.keys(j ?? {}).length;
        console.log(`[OutlookPage] FF5 loadings received: ${count} portfolios`, Object.keys(j ?? {}));
        setLoadings(j ?? {});
      })
      .catch((e: any) => {
        console.warn("[OutlookPage] FF5 loadings fetch failed:", e);
        setLoadingsErr(String(e?.message ?? e));
        setLoadings({});
      })
      .finally(() => setLoadingsLoading(false));
  }, []);

  useEffect(() => {
    // Fetch outlook data
    fetch(`${API_BASE}/api/outlook`, { cache: "no-store" })
      .then((r) => {
        if (!r.ok) throw new Error(`HTTP ${r.status}`);
        return r.json();
      })
      .then((j: OutlookPayload) => { setData(j); setErr(null); })
      .catch((e: any) => setErr(String(e?.message ?? e)));

    // Fetch FF5 factor loadings
    fetchLoadings();
  }, [fetchLoadings]);

  const models = useMemo(() => toArrayModels(data), [data]);

  return (
    <main style={{ padding: 20, maxWidth: 1200, margin: "0 auto" }}>
      <header style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, gap: 14, flexWrap: "wrap" as const }}>
        <div className="brand">
          <div className="logo" />
          <div>
            <h1 style={{ margin: 0, fontSize: 18 }}>LLM Portfolio Lab</h1>
            <p style={{ margin: "2px 0 0", fontSize: 12, color: "var(--muted)" }}>Hypothetical portfolios • research only • not investment advice</p>
          </div>
        </div>
        <nav>
          <a href="/">Dashboard</a>
          <a href="/prompt">Prompt</a>
          <a href="/holdings">Holdings</a>
          <a href="/methods">Methods</a>
        </nav>
      </header>

      <h1 style={{ fontSize: 28, fontWeight: 900, marginBottom: 6 }}>Outlook</h1>
      <p style={{ color: "#6b7280", marginTop: 0, marginBottom: 18 }}>
        Model worldview summaries + Fama-French factor loading radar
      </p>

      {err ? (
        <div style={{ padding: 12, border: "1px solid #3f3f4a", borderRadius: 12, color: "#fca5a5", marginBottom: 16 }}>
          Error loading outlook: {err}
        </div>
      ) : null}

      {process.env.NODE_ENV !== "production" ? (
        <pre style={{ color: "#6b7280", fontSize: 12, marginBottom: 14 }}>
          models: {models.length} · as_of: {String((data as any)?.as_of ?? "")} · ff5_loadings: {Object.keys(loadings).length}
        </pre>
      ) : null}

      {/* FF5 fetch error + refresh */}
      {!loadingsLoading && (loadingsErr || Object.keys(loadings).length === 0) ? (
        <div style={{ display: "flex", alignItems: "center", gap: 12, padding: "10px 14px", border: "1px solid #3f3f4a", borderRadius: 12, marginBottom: 14, flexWrap: "wrap" as const }}>
          <span style={{ color: "#9ca3af", fontSize: 13 }}>
            {loadingsErr
              ? `FF5 data unavailable: ${loadingsErr}`
              : "FF5 factor data not yet loaded — the backend may still be initializing."}
          </span>
          <button
            onClick={fetchLoadings}
            style={{ padding: "5px 14px", borderRadius: 8, border: "1px solid #3f3f4a", background: "rgba(99,102,241,0.12)", color: "#818cf8", cursor: "pointer", fontSize: 13, fontWeight: 700 }}
          >
            Reload FF5 data
          </button>
        </div>
      ) : null}

      {/* Radar — uses FF5 factor loadings when available, heuristic fallback otherwise */}
      <div style={{ marginBottom: 16 }}>
        <OutlookRadar
          models={models}
          asOf={(data as any)?.as_of}
          loadings={loadings}
          loadingsLoading={loadingsLoading}
        />
      </div>

      {/* Model snapshots */}
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
            {models.map((m) => {
              const loading = resolveLoading(m.name, loadings);
              return (
                <div
                  key={m.name}
                  style={{ border: "1px solid #222230", borderRadius: 14, padding: 12, background: "rgba(255,255,255,0.02)" }}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                    <div style={{ width: 10, height: 10, borderRadius: 4, background: modelColor(m.name) }} />
                    <div style={{ fontWeight: 900, color: "#e5e7eb" }}>{m.name}</div>
                    {loading && (
                      <div style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>
                        R²={loading.r_squared.toFixed(2)}
                      </div>
                    )}
                  </div>

                  <div style={{ color: "#9ca3af", fontSize: 13, lineHeight: 1.55 }}>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 800 }}>Regime</div>
                      <div>{m.regime_summary ?? "—"}</div>
                    </div>
                    <div style={{ marginBottom: 8 }}>
                      <div style={{ color: "#6b7280", fontSize: 12, fontWeight: 800 }}>Stable assets</div>
                      <div>{(m.stable_assets ?? []).slice(0, 10).join(", ") || "—"}</div>
                    </div>

                    {/* FF5 loadings inline if available */}
                    {loading && (
                      <div
                        style={{
                          marginTop: 8,
                          padding: "8px 10px",
                          background: "rgba(99,102,241,0.07)",
                          borderRadius: 10,
                          border: "1px solid rgba(99,102,241,0.18)",
                          display: "grid",
                          gridTemplateColumns: "1fr 1fr 1fr",
                          gap: "4px 10px",
                          fontSize: 11,
                        }}
                      >
                        {[
                          ["α/yr", `${(loading.alpha * 252 * 100).toFixed(2)}%`],
                          ["β mkt",  loading.beta_mkt.toFixed(2)],
                          ["β smb",  loading.beta_smb.toFixed(2)],
                          ["β hml",  loading.beta_hml.toFixed(2)],
                          ["β rmw",  loading.beta_rmw.toFixed(2)],
                          ["β cma",  loading.beta_cma.toFixed(2)],
                        ].map(([label, val]) => (
                          <div key={label}>
                            <span style={{ color: "#6b7280" }}>{label} </span>
                            <span style={{ color: "#c7d2fe", fontWeight: 700 }}>{val}</span>
                          </div>
                        ))}
                      </div>
                    )}
                  </div>

                  {m.objective_flags?.length ? (
                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 6 }}>
                      {m.objective_flags.slice(0, 6).map((f, i) => (
                        <span
                          key={`${m.name}-flag-${i}`}
                          style={{ fontSize: 11, color: "#9ca3af", border: "1px solid #222230", borderRadius: 999, padding: "3px 8px" }}
                        >
                          {f}
                        </span>
                      ))}
                    </div>
                  ) : null}
                </div>
              );
            })}
          </div>
        )}
      </div>
    </main>
  );
}
