"use client";

import { useEffect, useState } from "react";

// ─── Sidebar sections ───────────────────────────────────────────────────────
const SECTIONS = [
  { id: "overview",          label: "Overview" },
  { id: "construction",      label: "Portfolio Construction" },
  { id: "data-sources",      label: "Data Sources" },
  { id: "ff5-regression",    label: "FF5 Regression" },
  { id: "radar-methodology", label: "Radar Score Methodology" },
] as const;

// ─── FF5 factor definitions ─────────────────────────────────────────────────
const FF5_TERMS = [
  ["R_p(t)",  "Portfolio daily return"],
  ["RF(t)",   "Risk-free rate (1-month T-bill, from Ken French data)"],
  ["MKT",     "Market excess return (Mkt-RF)"],
  ["SMB",     "Small Minus Big — size factor"],
  ["HML",     "High Minus Low — value factor"],
  ["RMW",     "Robust Minus Weak — profitability factor"],
  ["CMA",     "Conservative Minus Aggressive — investment factor"],
  ["α",       "Excess return not explained by factors (Jensen's alpha)"],
] as const;

// ─── Radar normalization table ───────────────────────────────────────────────
const RADAR_ROWS = [
  ["Market Beta",          "β_mkt",   "0.5 – 1.5",    "(β − 0.5) / 1.0 × 100"],
  ["Size Tilt (SMB)",      "β_smb",   "−0.5 – 0.5",   "(β + 0.5) / 1.0 × 100"],
  ["Value Tilt (HML)",     "β_hml",   "−0.5 – 0.5",   "(β + 0.5) / 1.0 × 100"],
  ["Profitability (RMW)",  "β_rmw",   "−0.5 – 0.5",   "(β + 0.5) / 1.0 × 100"],
  ["Investment (CMA)",     "β_cma",   "−0.5 – 0.5",   "(β + 0.5) / 1.0 × 100"],
  ["Alpha (annualized)",   "α × 252", "−5% – +5%",    "(α_ann + 0.05) / 0.10 × 100"],
] as const;

// ─── Component ──────────────────────────────────────────────────────────────
export default function MethodsPage() {
  const [active, setActive] = useState<string>("overview");

  // IntersectionObserver — highlights sidebar link for visible section
  useEffect(() => {
    const observers: IntersectionObserver[] = [];
    SECTIONS.forEach(({ id }) => {
      const el = document.getElementById(id);
      if (!el) return;
      const obs = new IntersectionObserver(
        ([entry]) => { if (entry.isIntersecting) setActive(id); },
        { rootMargin: "-15% 0px -70% 0px" }
      );
      obs.observe(el);
      observers.push(obs);
    });
    return () => observers.forEach((o) => o.disconnect());
  }, []);

  function scrollTo(id: string) {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  }

  return (
    <>
      {/* ── Page-scoped styles ────────────────────────────────────────────── */}
      <style>{`
        /* Layout */
        .m-layout {
          display: flex;
          min-height: 100vh;
        }

        /* ── Sidebar ── */
        .m-sidebar {
          width: 224px;
          flex-shrink: 0;
          position: sticky;
          top: 0;
          height: 100vh;
          overflow-y: auto;
          padding: 28px 16px 28px 20px;
          border-right: 1px solid var(--border);
          background: rgba(11,12,16,0.6);
          display: flex;
          flex-direction: column;
        }
        .m-sidebar-brand {
          display: flex;
          align-items: center;
          gap: 10px;
          margin-bottom: 32px;
          text-decoration: none;
          color: var(--text);
        }
        .m-sidebar-logo {
          width: 26px;
          height: 26px;
          border-radius: 7px;
          background: linear-gradient(135deg, var(--accent), var(--accent2));
          flex-shrink: 0;
        }
        .m-sidebar-logo-name {
          font-size: 12.5px;
          font-weight: 600;
          line-height: 1.2;
        }
        .m-sidebar-logo-sub {
          font-size: 11px;
          color: var(--muted);
        }
        .m-sidebar-section-label {
          font-size: 10.5px;
          font-weight: 700;
          color: var(--muted);
          letter-spacing: 0.09em;
          text-transform: uppercase;
          margin: 0 0 8px 8px;
        }
        .m-sidebar-nav {
          display: flex;
          flex-direction: column;
          gap: 1px;
        }
        .m-sidebar-link {
          display: block;
          width: 100%;
          padding: 7px 10px;
          border-radius: 7px;
          font-size: 13px;
          color: var(--muted);
          cursor: pointer;
          transition: color 0.12s, background 0.12s;
          border: none;
          background: none;
          text-align: left;
          line-height: 1.4;
        }
        .m-sidebar-link:hover {
          color: var(--text);
          background: rgba(255,255,255,0.04);
        }
        .m-sidebar-link.is-active {
          color: var(--text);
          background: rgba(124,92,255,0.11);
          font-weight: 600;
        }
        .m-sidebar-dot {
          display: inline-block;
          width: 5px;
          height: 5px;
          border-radius: 50%;
          background: var(--accent);
          margin-right: 8px;
          vertical-align: middle;
          margin-bottom: 1px;
        }
        .m-sidebar-divider {
          height: 1px;
          background: var(--border);
          margin: 20px 0;
        }
        .m-sidebar-footer-links {
          display: flex;
          flex-direction: column;
          gap: 2px;
          margin-top: auto;
        }
        .m-sidebar-back {
          font-size: 12px;
          color: var(--muted);
          text-decoration: none;
          padding: 6px 10px;
          border-radius: 6px;
          transition: color 0.12s, background 0.12s;
          display: block;
        }
        .m-sidebar-back:hover {
          color: var(--text);
          background: rgba(255,255,255,0.04);
        }

        /* ── Mobile tab bar ── */
        .m-mobile-tabs {
          display: none;
        }

        /* ── Main content ── */
        .m-main {
          flex: 1;
          min-width: 0;
          padding: 52px 56px 96px;
          max-width: 820px;
        }
        .m-page-title {
          font-size: 26px;
          font-weight: 700;
          letter-spacing: -0.02em;
          color: var(--text);
          margin: 0 0 4px;
        }
        .m-page-tagline {
          font-size: 14px;
          color: var(--muted);
          margin: 0 0 44px;
        }

        /* Section */
        .m-section {
          scroll-margin-top: 36px;
        }
        .m-section-h2 {
          font-size: 17px;
          font-weight: 700;
          color: var(--text);
          margin: 0 0 14px;
          letter-spacing: -0.01em;
        }
        .m-divider {
          height: 1px;
          background: var(--border);
          margin: 48px 0;
        }

        /* Prose */
        .m-p {
          font-size: 14px;
          line-height: 1.75;
          color: var(--muted);
          margin: 0 0 14px;
          max-width: 620px;
        }
        .m-p strong, .m-p b { color: var(--text); font-weight: 600; }

        /* Bullet list */
        .m-ul {
          list-style: none;
          padding: 0;
          margin: 10px 0 16px;
          display: flex;
          flex-direction: column;
          gap: 7px;
          max-width: 620px;
        }
        .m-ul li {
          font-size: 14px;
          color: var(--muted);
          padding-left: 18px;
          position: relative;
          line-height: 1.65;
        }
        .m-ul li::before {
          content: "–";
          position: absolute;
          left: 0;
          color: var(--accent);
          font-weight: 700;
        }
        .m-ul li strong { color: var(--text); font-weight: 600; }

        /* Math / equation blocks */
        .m-math {
          font-family: Georgia, "Times New Roman", serif;
          font-size: 15px;
          color: var(--text);
          background: rgba(255,255,255,0.025);
          border: 1px solid var(--border);
          border-radius: 10px;
          padding: 16px 22px;
          margin: 18px 0;
          overflow-x: auto;
          white-space: nowrap;
          line-height: 1.9;
        }
        .m-math sub {
          font-size: 11px;
          color: var(--muted);
        }

        /* Definition list */
        .m-def-list {
          margin: 14px 0 20px;
          max-width: 620px;
        }
        .m-def-row {
          display: flex;
          gap: 14px;
          align-items: baseline;
          padding: 9px 0;
          border-bottom: 1px solid rgba(255,255,255,0.05);
          font-size: 13.5px;
        }
        .m-def-row:last-child { border-bottom: none; }
        .m-def-term {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12.5px;
          color: var(--accent2);
          min-width: 84px;
          flex-shrink: 0;
        }
        .m-def-dash { color: rgba(255,255,255,0.25); flex-shrink: 0; }
        .m-def-desc { color: var(--muted); line-height: 1.5; }

        /* Data table */
        .m-table-wrap {
          overflow-x: auto;
          margin: 18px 0;
        }
        .m-table {
          width: 100%;
          border-collapse: collapse;
          font-size: 13px;
          min-width: 380px;
        }
        .m-table th {
          text-align: left;
          font-size: 11px;
          font-weight: 600;
          color: var(--muted);
          letter-spacing: 0.06em;
          text-transform: uppercase;
          padding: 9px 14px;
          border-bottom: 1px solid var(--border);
        }
        .m-table td {
          padding: 11px 14px;
          color: var(--muted);
          border-bottom: 1px solid rgba(255,255,255,0.05);
          vertical-align: top;
          line-height: 1.5;
        }
        .m-table tr:last-child td { border-bottom: none; }
        .m-table td:first-child { color: var(--text); font-weight: 500; }
        .m-mono {
          font-family: ui-monospace, SFMono-Regular, Menlo, Consolas, monospace;
          font-size: 12px;
          color: var(--accent2);
        }

        /* Note / callout */
        .m-note {
          background: rgba(45,212,191,0.05);
          border: 1px solid rgba(45,212,191,0.18);
          border-radius: 9px;
          padding: 12px 16px;
          font-size: 13px;
          color: var(--muted);
          margin: 16px 0;
          line-height: 1.65;
          max-width: 620px;
        }
        .m-note strong { color: rgba(45,212,191,0.85); font-weight: 600; }

        /* Page footer */
        .m-footer {
          margin-top: 52px;
          padding-top: 22px;
          border-top: 1px solid var(--border);
          font-size: 12px;
          color: var(--muted);
        }

        /* ── Mobile ── */
        @media (max-width: 768px) {
          .m-layout { flex-direction: column; }
          .m-sidebar { display: none; }
          .m-mobile-tabs {
            display: flex;
            overflow-x: auto;
            gap: 7px;
            padding: 12px 16px;
            border-bottom: 1px solid var(--border);
            background: var(--card);
            position: sticky;
            top: 0;
            z-index: 20;
            scrollbar-width: none;
          }
          .m-mobile-tabs::-webkit-scrollbar { display: none; }
          .m-mobile-tab {
            flex-shrink: 0;
            padding: 6px 12px;
            border-radius: 999px;
            font-size: 12px;
            border: 1px solid var(--border);
            color: var(--muted);
            background: none;
            cursor: pointer;
            white-space: nowrap;
          }
          .m-mobile-tab.is-active {
            border-color: rgba(124,92,255,0.5);
            background: rgba(124,92,255,0.12);
            color: var(--text);
          }
          .m-main {
            padding: 28px 18px 64px;
            max-width: 100%;
          }
        }
      `}</style>

      <div className="m-layout">

        {/* ══ Desktop Sidebar ══════════════════════════════════════════════ */}
        <aside className="m-sidebar">
          <a href="/" className="m-sidebar-brand">
            <div className="m-sidebar-logo" />
            <div>
              <div className="m-sidebar-logo-name">LLM Portfolio Lab</div>
              <div className="m-sidebar-logo-sub">Documentation</div>
            </div>
          </a>

          <div className="m-sidebar-section-label">On this page</div>
          <nav className="m-sidebar-nav">
            {SECTIONS.map(({ id, label }) => (
              <button
                key={id}
                className={`m-sidebar-link${active === id ? " is-active" : ""}`}
                onClick={() => scrollTo(id)}
              >
                {active === id && <span className="m-sidebar-dot" />}
                {label}
              </button>
            ))}
          </nav>

          <div className="m-sidebar-divider" />

          <div className="m-sidebar-footer-links">
            <a href="/" className="m-sidebar-back">← Dashboard</a>
            <a href="/holdings" className="m-sidebar-back">→ Holdings</a>
            <a href="/outlook" className="m-sidebar-back">→ Outlook</a>
          </div>
        </aside>

        {/* ══ Mobile Tab Bar ═══════════════════════════════════════════════ */}
        <div className="m-mobile-tabs">
          {SECTIONS.map(({ id, label }) => (
            <button
              key={id}
              className={`m-mobile-tab${active === id ? " is-active" : ""}`}
              onClick={() => scrollTo(id)}
            >
              {label}
            </button>
          ))}
        </div>

        {/* ══ Main Content ═════════════════════════════════════════════════ */}
        <main className="m-main">
          <h1 className="m-page-title">Methodology</h1>
          <p className="m-page-tagline">How portfolios are built, tracked, and evaluated</p>

          {/* ── 1. Overview ─────────────────────────────────────────────── */}
          <section id="overview" className="m-section">
            <h2 className="m-section-h2">Overview</h2>
            <p className="m-p">
              LLM Portfolio Lab tracks hypothetical equity portfolios constructed from the publicly
              disclosed stock picks of major large language models. Each portfolio is evaluated
              using standard quantitative finance methods including daily NAV tracking and
              Fama-French factor regression.
            </p>
          </section>

          <div className="m-divider" />

          {/* ── 2. Portfolio Construction ────────────────────────────────── */}
          <section id="construction" className="m-section">
            <h2 className="m-section-h2">Portfolio Construction</h2>
            <ul className="m-ul">
              <li>
                Each portfolio represents a set of ETF and stock allocations attributed to a
                specific LLM (e.g. ChatGPT, Claude, Gemini).
              </li>
              <li>
                Allocations are equal-weighted or as specified, and held <strong>static</strong>{" "}
                from the portfolio inception date.
              </li>
              <li>
                Price data is sourced from <strong>yfinance</strong> and stored in{" "}
                <strong>SQLite</strong> to avoid redundant API calls.
              </li>
            </ul>

            <p className="m-p" style={{ marginTop: 22 }}>Daily NAV is computed as:</p>

            <div className="m-math">
              NAV(t){"  "}={" "}
              {"  "}Σ{"  "}
              [{"  "}w<sub>i</sub>{"  "}×{"  "}
              ({"  "}P<sub>i</sub>(t){"  "}/{" "}
              P<sub>i</sub>(t<sub>0</sub>){"  "}){"  "}]
            </div>

            <div className="m-def-list">
              {[
                ["w_i",      "Portfolio weight of asset i (weights sum to 1)"],
                ["P_i(t)",   "Adjusted closing price of asset i on day t"],
                ["P_i(t₀)",  "Adjusted closing price of asset i on the inception date t₀"],
              ].map(([term, desc]) => (
                <div key={term} className="m-def-row">
                  <span className="m-def-term">{term}</span>
                  <span className="m-def-dash">—</span>
                  <span className="m-def-desc">{desc}</span>
                </div>
              ))}
            </div>

            <p className="m-p">
              All portfolios start at a base value of <strong>$100</strong>. The first day return
              is set to zero so the NAV begins exactly at the base, and each subsequent day
              reflects the proportional price change of each holding from inception.
            </p>
          </section>

          <div className="m-divider" />

          {/* ── 3. Data Sources ──────────────────────────────────────────── */}
          <section id="data-sources" className="m-section">
            <h2 className="m-section-h2">Data Sources & Update Frequency</h2>

            <div className="m-table-wrap">
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Source</th>
                    <th>Data</th>
                    <th>Refresh</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td>
                      Yahoo Finance{" "}
                      <span className="m-mono">(yfinance)</span>
                    </td>
                    <td>Daily OHLCV price data</td>
                    <td>Daily on request</td>
                  </tr>
                  <tr>
                    <td>Ken French Data Library</td>
                    <td>FF5 daily factor returns</td>
                    <td>
                      On <span className="m-mono">/api/ff5/sync</span>
                    </td>
                  </tr>
                  <tr>
                    <td>
                      SQLite <span className="m-mono">(local)</span>
                    </td>
                    <td>NAV series, FF5 factors, regression results</td>
                    <td>Persistent cache</td>
                  </tr>
                </tbody>
              </table>
            </div>

            <div className="m-note">
              <strong>Note:</strong> The Ken French Data Library updates monthly. Factor data is
              downloaded from the official zip file at{" "}
              <span className="m-mono" style={{ color: "var(--text)" }}>
                mba.tuck.dartmouth.edu/pages/faculty/ken.french/Data_Library
              </span>
            </div>
          </section>

          <div className="m-divider" />

          {/* ── 4. FF5 Regression ────────────────────────────────────────── */}
          <section id="ff5-regression" className="m-section">
            <h2 className="m-section-h2">Fama-French 5-Factor Regression</h2>
            <p className="m-p">
              Each portfolio's excess return is regressed against the five Fama-French factors to
              decompose performance into systematic risk exposures and idiosyncratic alpha.
            </p>

            <div className="m-math">
              R<sub>p</sub>(t) − RF(t) = α + β₁·MKT(t) + β₂·SMB(t) + β₃·HML(t)
              <br />
              {"                              "}+ β₄·RMW(t) + β₅·CMA(t) + ε(t)
            </div>

            <div className="m-def-list">
              {FF5_TERMS.map(([term, desc]) => (
                <div key={term} className="m-def-row">
                  <span className="m-def-term">{term}</span>
                  <span className="m-def-dash">—</span>
                  <span className="m-def-desc">{desc}</span>
                </div>
              ))}
            </div>

            <p className="m-p" style={{ marginTop: 22 }}>Implementation notes:</p>
            <ul className="m-ul">
              <li>
                Regression is run using <strong>statsmodels OLS</strong> with a constant term
              </li>
              <li>
                Minimum <strong>30 trading days</strong> of overlapping data required
              </li>
              <li>
                Results stored in the <strong>ff5_regressions</strong> table in SQLite
              </li>
              <li>
                Cross-validated against <strong>numpy.linalg.lstsq</strong>; max coefficient
                difference {"<"} 1×10⁻¹⁰
              </li>
            </ul>
          </section>

          <div className="m-divider" />

          {/* ── 5. Radar Score Methodology ───────────────────────────────── */}
          <section id="radar-methodology" className="m-section">
            <h2 className="m-section-h2">Radar Chart Score Methodology</h2>
            <p className="m-p">
              Raw factor loadings are normalized to a 0–100 scale for visualization in the radar
              chart on the Outlook page. Each factor's expected range is mapped linearly to
              [0, 100] then clamped.
            </p>

            <div className="m-table-wrap">
              <table className="m-table">
                <thead>
                  <tr>
                    <th>Axis</th>
                    <th>Source</th>
                    <th>Raw Range</th>
                    <th>Formula</th>
                  </tr>
                </thead>
                <tbody>
                  {RADAR_ROWS.map(([axis, src, range, formula]) => (
                    <tr key={axis}>
                      <td>{axis}</td>
                      <td>
                        <span className="m-mono">{src}</span>
                      </td>
                      <td style={{ whiteSpace: "nowrap" }}>{range}</td>
                      <td>
                        <span className="m-mono">{formula}</span>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>

            <div className="m-note">
              <strong>Note:</strong> All scores are clamped to [0, 100]. A score of 50 represents
              a neutral loading. Scores above 50 indicate positive factor exposure.
            </div>
          </section>

          {/* ── Footer ───────────────────────────────────────────────────── */}
          <div className="m-footer">
            Research only · Not investment advice · © 2026 LLM Portfolio Lab
          </div>
        </main>
      </div>
    </>
  );
}
