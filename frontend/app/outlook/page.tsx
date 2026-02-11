"use client";

import { useEffect, useMemo, useState } from "react";

type OutlookConsensus = {
  macro_regime?: {
    label?: string;
    agreement_level?: string;
    most_common_themes?: string[];
  };
  objective_tilt?: {
    label?: string;
    clusters?: Array<{ cluster: string; members: string[] }>;
  };
  role_stability?: {
    high_stability_assets?: string[];
    asset_frequency?: Array<{ ticker: string; count: number }>;
  };
};

type OutlookDisagreement = {
  topic: string;
  sides: Array<{ label: string; models: string[] }>;
};

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
  consensus?: OutlookConsensus;
  disagreements?: OutlookDisagreement[];
  models?: OutlookModel[];
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

export default function OutlookPage() {
  const [data, setData] = useState<OutlookPayload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [lastUpdatedTs, setLastUpdatedTs] = useState<number | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchOutlook = async () => {
      try {
        const res = await fetch("/api/outlook", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as OutlookPayload;

        if (!mounted) return;
        setData(json);
        setErr(null);
        setLastUpdatedTs(Date.now());
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

  const clusters = useMemo(() => {
    return data?.consensus?.objective_tilt?.clusters ?? [];
  }, [data]);

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
          <a href="/outlook">Outlook</a>
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

      {/* Consensus */}
      <section className="layout">
        <div className="card">
          <div className="card-head">
            <div>
              <p className="title">Consensus</p>
              <p className="sub">What the models broadly agree on</p>
            </div>
            <div className="pill">
              {data?.consensus?.macro_regime?.agreement_level
                ? `Agreement: ${data.consensus.macro_regime.agreement_level}`
                : "—"}
            </div>
          </div>

          <div style={{ padding: 16 }}>
            <p style={{ marginTop: 0 }}>
              {data?.consensus?.macro_regime?.label ?? "—"}
            </p>

            <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 12, marginTop: 14 }}>
              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>Common themes</div>
                <ul className="bullets">
                  {(data?.consensus?.macro_regime?.most_common_themes ?? []).map((t) => (
                    <li key={t}>{t}</li>
                  ))}
                  {(data?.consensus?.macro_regime?.most_common_themes ?? []).length === 0 ? (
                    <li>—</li>
                  ) : null}
                </ul>
              </div>

              <div>
                <div className="muted" style={{ fontSize: 12, marginBottom: 8 }}>High-stability assets</div>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                  {(data?.consensus?.role_stability?.high_stability_assets ?? []).slice(0, 24).map((t) => (
                    <span key={t} className="badge badge-dim">{t}</span>
                  ))}
                  {(data?.consensus?.role_stability?.high_stability_assets ?? []).length === 0 ? (
                    <span className="muted">—</span>
                  ) : null}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Objective clusters */}
        <div className="card">
          <div className="card-head">
            <div>
              <p className="title">Objective clusters</p>
              <p className="sub">How different models prioritize outcomes</p>
            </div>
            <div className="pill">Clustering (heuristic)</div>
          </div>

          <div style={{ padding: 16 }}>
            {clusters.length === 0 ? (
              <div className="muted">—</div>
            ) : (
              <div style={{ display: "grid", gap: 10 }}>
                {clusters.map((c) => (
                  <div key={c.cluster} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 14 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 10 }}>
                      <strong>{c.cluster}</strong>
                      <span className="muted">{isFiniteNumber(c.members?.length) ? c.members.length : (c.members?.length ?? 0)} models</span>
                    </div>
                    <div style={{ marginTop: 8, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(c.members ?? []).map((m) => (
                        <span key={m} className="badge badge-ok">{m}</span>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Disagreements */}
        <div className="card">
          <div className="card-head">
            <div>
              <p className="title">Disagreements</p>
              <p className="sub">Where the models diverge</p>
            </div>
            <div className="pill">Compare narratives</div>
          </div>

          <div style={{ padding: 16 }}>
            {(data?.disagreements ?? []).length === 0 ? (
              <div className="muted">—</div>
            ) : (
              <div style={{ display: "grid", gap: 12 }}>
                {(data?.disagreements ?? []).map((d) => (
                  <div key={d.topic} style={{ padding: 12, border: "1px solid var(--border)", borderRadius: 14 }}>
                    <div style={{ fontWeight: 800, marginBottom: 8 }}>{d.topic}</div>
                    <div style={{ display: "grid", gridTemplateColumns: "repeat(2, minmax(0, 1fr))", gap: 10 }}>
                      {d.sides.map((s) => (
                        <div key={s.label} style={{ background: "rgba(255,255,255,0.02)", border: "1px solid rgba(255,255,255,0.08)", borderRadius: 12, padding: 10 }}>
                          <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>{s.label}</div>
                          <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                            {(s.models ?? []).map((m) => (
                              <span key={m} className="badge badge-dim">{m}</span>
                            ))}
                            {(s.models ?? []).length === 0 ? <span className="muted">—</span> : null}
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>

        {/* Models */}
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
                  <div key={m.name} style={{ padding: 14, border: "1px solid var(--border)", borderRadius: 16 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "baseline" }}>
                      <div style={{ fontSize: 16, fontWeight: 900 }}>{m.name}</div>
                      <div className="muted" style={{ fontSize: 12 }}>
                        {m.confidence?.trend ? `Confidence: ${m.confidence.trend}` : "—"}
                      </div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 12 }}>Regime</div>
                      <div>{m.regime_summary ?? "—"}</div>
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 12 }}>Objective</div>
                      <div>{m.objective_summary ?? "—"}</div>
                    </div>

                    <div style={{ marginTop: 10, display: "flex", flexWrap: "wrap", gap: 8 }}>
                      {(m.style?.labels ?? []).map((t) => (
                        <span key={`${m.name}-style-${t}`} className="badge badge-ok">{t}</span>
                      ))}
                      {(m.objective_flags ?? []).slice(0, 6).map((t) => (
                        <span key={`${m.name}-flag-${t}`} className="badge badge-dim">{t}</span>
                      ))}
                    </div>

                    <div style={{ marginTop: 10 }}>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Stable assets</div>
                      <div style={{ display: "flex", flexWrap: "wrap", gap: 8 }}>
                        {(m.stable_assets ?? []).slice(0, 20).map((t) => (
                          <span key={`${m.name}-asset-${t}`} className="badge badge-dim">{t}</span>
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
