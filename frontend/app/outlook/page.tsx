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

type RawOutlookModel = {
  regime_consistency?: { summary?: string | null };
  objective_drift?: { summary?: string | null; patterns_detected?: string[] };
  asset_role_stability?: { stable_assets?: string[] };
  confidence_analysis?: { trend?: string | null; observations?: string[] };
  cognitive_style?: { labels?: string[]; rationale?: string[] };
};

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function topKeys(counts: Map<string, number>, limit: number): string[] {
  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))
    .slice(0, limit)
    .map(([k]) => k);
}

function normalizeOutlookPayload(input: unknown): OutlookPayload {
  if (input && typeof input === "object" && Array.isArray((input as OutlookPayload).models)) {
    return input as OutlookPayload;
  }

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

  const regimeCounts = new Map<string, number>();
  const objectiveCounts = new Map<string, number>();
  const stableAssetCounts = new Map<string, number>();
  const themeCounts = new Map<string, number>();
  const clusterMembers = new Map<string, string[]>();

  for (const m of models) {
    if (m.regime_summary) regimeCounts.set(m.regime_summary, (regimeCounts.get(m.regime_summary) ?? 0) + 1);
    if (m.objective_summary) objectiveCounts.set(m.objective_summary, (objectiveCounts.get(m.objective_summary) ?? 0) + 1);
    for (const t of m.stable_assets ?? []) stableAssetCounts.set(t, (stableAssetCounts.get(t) ?? 0) + 1);
    for (const t of m.objective_flags ?? []) themeCounts.set(t, (themeCounts.get(t) ?? 0) + 1);

    const labels = m.style?.labels ?? [];
    const cluster = labels.length > 0 ? labels.join(" + ") : "Unlabeled";
    const members = clusterMembers.get(cluster) ?? [];
    members.push(m.name);
    clusterMembers.set(cluster, members);
  }

  const regimeTop = topKeys(regimeCounts, 1)[0];
  const objectiveTop = topKeys(objectiveCounts, 1)[0];
  const agreementRatio = models.length > 0 && regimeTop ? (regimeCounts.get(regimeTop) ?? 0) / models.length : 0;
  const agreementLevel =
    agreementRatio >= 0.8 ? "High" : agreementRatio >= 0.5 ? "Moderate" : models.length > 0 ? "Low" : undefined;

  const disagreementBuckets = (source: (m: OutlookModel) => string | undefined, topic: string): OutlookDisagreement | null => {
    const groups = new Map<string, string[]>();
    for (const m of models) {
      const label = source(m);
      if (!label) continue;
      const bucket = groups.get(label) ?? [];
      bucket.push(m.name);
      groups.set(label, bucket);
    }
    if (groups.size <= 1) return null;
    return {
      topic,
      sides: [...groups.entries()]
        .map(([label, names]) => ({ label, models: names.sort((a, b) => a.localeCompare(b)) }))
        .sort((a, b) => b.models.length - a.models.length || a.label.localeCompare(b.label)),
    };
  };

  const disagreements = [
    disagreementBuckets((m) => m.regime_summary ?? undefined, "Macro regime"),
    disagreementBuckets((m) => m.objective_summary ?? undefined, "Objective focus"),
    disagreementBuckets((m) => m.confidence?.trend ?? undefined, "Confidence"),
  ].filter((d): d is OutlookDisagreement => d != null);

  return {
    title: "Outlook",
    consensus: {
      macro_regime: {
        label: regimeTop,
        agreement_level: agreementLevel,
        most_common_themes: topKeys(themeCounts, 6),
      },
      objective_tilt: {
        label: objectiveTop,
        clusters: [...clusterMembers.entries()]
          .map(([cluster, members]) => ({
            cluster,
            members: [...members].sort((a, b) => a.localeCompare(b)),
          }))
          .sort((a, b) => b.members.length - a.members.length || a.cluster.localeCompare(b.cluster)),
      },
      role_stability: {
        high_stability_assets: topKeys(stableAssetCounts, 24),
        asset_frequency: [...stableAssetCounts.entries()]
          .map(([ticker, count]) => ({ ticker, count }))
          .sort((a, b) => b.count - a.count || a.ticker.localeCompare(b.ticker)),
      },
    },
    disagreements,
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
      const endpoints = [...new Set(["/api/outlook", "/outlook.json"])];
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

