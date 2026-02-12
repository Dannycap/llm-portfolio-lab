"use client";

import React, { useEffect, useMemo, useState } from "react";

const API_BASE = process.env.NEXT_PUBLIC_API_BASE ?? "";

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
  title?: string;
  models?: OutlookModel[];
};

type RawOutlookModel = {
  regime_consistency?: { summary?: string | null };
  objective_drift?: { summary?: string | null; patterns_detected?: string[] };
  asset_role_stability?: { stable_assets?: string[] };
  confidence_analysis?: { trend?: string | null; observations?: string[] };
  cognitive_style?: { labels?: string[]; rationale?: string[] };
};

function normalizeOutlookPayload(input: unknown): OutlookPayload {
  // If already in normalized shape
  if (input && typeof input === "object" && Array.isArray((input as OutlookPayload).models)) {
    return input as OutlookPayload;
  }

  // Otherwise, assume raw object keyed by model name
  const raw = (input ?? {}) as Record<string, RawOutlookModel>;
  const entries = Object.entries(raw).filter(([, value]) => value && typeof value === "object");

  const models: OutlookModel[] = entries.map(([name, m]) => ({
    name,
    regime_summary: m.regime_consistency?.summary ?? null,
    objective_summary: m.objective_drift?.summary ?? null,
    objective_flags: m.objective_drift?.patterns_detected ?? [],
    stable_assets: m.asset_role_stability?.stable_assets ?? [],
    confidence: {
      trend: m.confidence_analysis?.trend ?? null,
      notes: m.confidence_analysis?.observations ?? [],
    },
    style: {
      labels: m.cognitive_style?.labels ?? [],
      notes: m.cognitive_style?.rationale ?? [],
    },
  }));

  return {
    title: "Outlook",
    models,
  };
}

export default function OutlookPage() {
  const [data, setData] = useState<OutlookPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdatedTs, setLastUpdatedTs] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchOutlook = async () => {
      const endpoints = [...new Set(["/api/outlook", `${API_BASE}/api/outlook`, "/outlook.json"])];
      const failures: string[] = [];

      try {
        for (const endpoint of endpoints) {
          try {
            const res = await fetch(endpoint, { cache: "no-store" });
            if (!res.ok) {
              failures.push(`${endpoint} -> HTTP ${res.status}`);
              continue;
            }

            const json = await res.json();
            const normalized = normalizeOutlookPayload(json);
            if ((normalized.models ?? []).length === 0) {
              failures.push(`${endpoint} -> empty payload`);
              continue;
            }

            if (!mounted) return;
            setData(normalized);
            setErr(null);
            setLastUpdatedTs(Date.now());
            return;
          } catch (endpointErr: any) {
            failures.push(`${endpoint} -> ${String(endpointErr?.message ?? endpointErr)}`);
          }
        }

        throw new Error(failures.length > 0 ? failures.join(" | ") : "No outlook source available");
      } catch (e: any) {
        if (!mounted) return;
        setErr(String(e?.message ?? e));
      }
    };

    fetchOutlook();
    const interval = setInterval(fetchOutlook, 60000); // refresh every 60s
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const models = useMemo(() => {
    const ms = data?.models ?? [];
    return [...ms].sort((a, b) => (a.name || "").localeCompare(b.name || ""));
  }, [data]);

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
          <a href="/">Dashboard</a>
          <a href="/holdings">Holdings</a>
          <a href="/prompt">Prompt</a>
        </nav>
      </header>

      <section className="hero">
        <h2>{data?.title ?? "Outlook"}</h2>
        <p className="muted">
          {data?.as_of ? `As of ${data.as_of}. ` : ""}
          Rule-based synthesis of LLM regime beliefs and decision priorities.
          {lastUpdatedTs ? ` Updated ${new Date(lastUpdatedTs).toLocaleTimeString()}.` : ""}
        </p>
        {err ? (
          <div className="pill" style={{ marginTop: 10 }}>
            Error: {err}
          </div>
        ) : null}
      </section>

      {/* Models only */}
      <section className="layout">
        <div className="card">
          <div className="card-head">
            <div>
              <p className="title">Model snapshots</p>
              <p className="sub">Per-model regime + objective notes</p>
            </div>
            <div className="pill">{models.length} models</div>
          </div>

          <div style={{ padding: 16 }}>
            {models.length === 0 ? (
              <div className="muted">—</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {models.map((m) => (
                  <div
                    key={m.name}
                    style={{
                      padding: 14,
                      border: "1px solid var(--border)",
                      borderRadius: 16,
                    }}
                  >
                    <div
                      style={{
                        display: "flex",
                        justifyContent: "space-between",
                        gap: 12,
                        alignItems: "baseline",
                      }}
                    >
                      <div style={{ fontSize: 16, fontWeight: 900 }}>{m.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {m.confidence?.trend ? `Confidence: ${m.confidence.trend}` : "—"}
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Regime
                      </div>
                      <div>{m.regime_summary ?? "—"}</div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 12 }}>
                        Objective
                      </div>
                      <div>{m.objective_summary ?? "—"}</div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(m.style?.labels ?? []).map((t) => (
                        <span key={`${m.name}-style-${t}`} className="badge badge-ok">
                          {t}
                        </span>
                      ))}
                      {(m.objective_flags ?? []).slice(0, 6).map((t) => (
                        <span key={`${m.name}-flag-${t}`} className="badge badge-dim">
                          {t}
                        </span>
                      ))}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>
                        Stable assets
                      </div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {(m.stable_assets ?? []).slice(0, 20).map((t) => (
                          <span key={`${m.name}-asset-${t}`} className="badge badge-dim">
                            {t}
                          </span>
                        ))}
                        {(m.stable_assets ?? []).length === 0 ? <span className="muted">—</span> : null}
                      </div>
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </section>

      <div className="footer">
        <div>© 2026 LLM Portfolio Lab</div>
        <div>Research & Education • Not Investment Advice</div>
      </div>
    </div>
  );
}
