"use client";

export default function PromptPage() {
  const PROMPT = `ROLE
You are an institutional-grade portfolio manager with deep expertise in:
- Modern Portfolio Theory (MPT)
- Quantitative analysis
- Risk management
- Multi-asset allocation

OBJECTIVE
Design a comprehensive investment portfolio using publicly traded assets
(stocks, ETFs, bonds, REITs, commodities, etc.) with the goal of
outperforming the S&P 500 over a full market cycle.

PORTFOLIO PARAMETERS
- Initial Capital: $100 (must be fully invested today)
- Rebalancing Frequency: Monthly
- Asset Universe: Any publicly traded securities
- Position Constraints: No minimum or maximum number of holdings

CRITICAL CONTEXT
Since this portfolio will be reviewed and potentially rebalanced monthly in
separate conversations, include detailed notes on each investment decision to
ensure continuity and strategic coherence across sessions.

REQUIRED DELIVERABLES
1) Asset Allocation Strategy
2) Specific securities with ticker symbols
3) Dollar allocation per position
4) Rationale for each holding

RISK MANAGEMENT FRAMEWORK
- Portfolio-level risk metrics (expected volatility, beta, max drawdown scenarios)
- Diversification approach
- Downside protection mechanisms

PERFORMANCE PROJECTIONS
- Expected return ranges
- Risk-adjusted return expectations (Sharpe ratio, alpha targets)
- Benchmark comparison methodology

DYNAMIC ADJUSTMENT RULES
- Conditions that would trigger rebalancing
- Thresholds for position sizing changes
- Criteria for adding/removing positions

ECONOMIC ANALYSIS
- Current macroeconomic trends informing the strategy
- Sector/asset class outlook
- Key risks and catalysts

OUTPUT STANDARDS
- Data-driven with cited sources
- Quantitatively rigorous with specific metrics
- Actionable recommendations with clear reasoning
- Investment thesis for each position

RESOURCES
You may search the internet for current market data, economic indicators,
and asset performance metrics.`;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(PROMPT);
      alert("Copied prompt to clipboard.");
    } catch {
      alert("Copy failed — select the text and copy manually.");
    }
  };

  return (
    <div className="container">
      <header>
        <div className="brand">
          <div className="logo" />
          <div>
            <h1>LLM Portfolio Lab</h1>
            <p>Prompt transparency • research only</p>
          </div>
        </div>

        <nav>
          <a href="/">← Back to Dashboard</a>
        </nav>
      </header>

      <section className="hero">
        <h2>LLM Portfolio Prompt</h2>
        <p>This is the exact prompt used to generate the hypothetical portfolios.</p>
      </section>

      <div className="card">
        <div className="card-head">
          <div>
            <p className="title">Prompt</p>
            <p className="sub">Used across models • copy/paste ready</p>
          </div>
          <div style={{ display: "flex", gap: 10, alignItems: "center" }}>
            <div className="pill">Read-only</div>
            <button
              onClick={copy}
              style={{
                cursor: "pointer",
                fontSize: 11,
                padding: "6px 10px",
                borderRadius: 999,
                border: "1px solid var(--border)",
                background: "rgba(255,255,255,0.03)",
                color: "var(--text)",
              }}
            >
              Copy
            </button>
          </div>
        </div>

        <div style={{ padding: 16 }}>
          <pre
            style={{
              margin: 0,
              whiteSpace: "pre-wrap",
              fontSize: 13,
              lineHeight: 1.45,
              fontFamily:
                "ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, monospace",
              background: "rgba(255,255,255,0.03)",
              border: "1px solid var(--border)",
              borderRadius: 12,
              padding: 14,
            }}
          >
            {PROMPT}
          </pre>
        </div>
      </div>

      <div className="footer">
        <div>© 2026 LLM Portfolio Lab</div>
        <div>Research only • No investment advice</div>
      </div>
    </div>
  );
}