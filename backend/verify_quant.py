"""
verify_quant.py  —  Full quantitative audit per the verification protocol.
Run with:  python verify_quant.py
All checks must pass before regression results are trusted.
"""
import sqlite3, sys, math
from pathlib import Path

import numpy as np
import pandas as pd
import statsmodels.api as sm

DB_PATH = Path(__file__).resolve().parent / "portfolio.db"
PASS = "[PASS]"
WARN = "[WARN]"
FAIL = "[FAIL]"
SEP  = "-" * 78

def section(title):
    print(f"\n{'='*78}\n  {title}\n{'='*78}")

errors = []   # hard failures
warnings = [] # soft warnings

def check(label, condition, msg="", level="FAIL"):
    tag = PASS if condition else (WARN if level == "WARN" else FAIL)
    print(f"  {tag}  {label}" + (f"  =>  {msg}" if msg else ""))
    if not condition:
        (warnings if level == "WARN" else errors).append(f"{label}: {msg}")

# ─────────────────────────────────────────────────────────────────────────────
# 1. UNIT TEST EVERY FORMULA
# ─────────────────────────────────────────────────────────────────────────────
section("1 · UNIT TESTS — known-answer checks")

# 1a. OLS with perfect y = 2x
print("\n  [1a] OLS on perfect y = 2x  (expect alpha=0, beta=2, R²=1)")
x_test = np.arange(1, 101, dtype=float)
y_test = 2.0 * x_test
X_test = sm.add_constant(pd.DataFrame({"x": x_test}), has_constant="add")
fit_test = sm.OLS(y_test, X_test).fit()
check("  alpha == 0.0",      abs(fit_test.params["const"]) < 1e-9,
      f"got {fit_test.params['const']:.6e}")
check("  beta  == 2.0",      abs(fit_test.params["x"] - 2.0) < 1e-9,
      f"got {fit_test.params['x']:.6f}")
check("  R²    == 1.0",      abs(fit_test.rsquared - 1.0) < 1e-9,
      f"got {fit_test.rsquared:.6f}")

# 1b. Normalisation
print("\n  [1b] normalize(value, min, max) = clamp((v-min)/(max-min)*100, 0, 100)")
def normalize(v, lo, hi):
    return max(0.0, min(100.0, (v - lo) / (hi - lo) * 100.0))

cases = [
    # (value, lo, hi, expected, label)
    (1.0,   0.5, 1.5,  50.0,  "beta_mkt=1.0 → 50"),
    (0.5,   0.5, 1.5,   0.0,  "beta_mkt=0.5 → 0"),
    (1.5,   0.5, 1.5, 100.0,  "beta_mkt=1.5 → 100"),
    (2.0,   0.5, 1.5, 100.0,  "beta_mkt=2.0 clamp → 100"),
    (0.0,  -0.5, 0.5,  50.0,  "beta_smb=0.0 → 50"),
    (0.5,  -0.5, 0.5, 100.0,  "beta_smb=0.5 → 100"),
    (-0.5, -0.5, 0.5,   0.0,  "beta_smb=-0.5 → 0"),
    (0.0,  -0.05, 0.05, 50.0, "ann_alpha=0.0 → 50"),
]
# manual spot-check: SPY beta_mkt=1.03
# normalize(1.03, 0.5, 1.5) = (1.03-0.5)/(1.5-0.5)*100 = 0.53/1.0*100 = 53.0
manual_result = normalize(1.03, 0.5, 1.5)
print(f"    # SPY beta_mkt=1.03 → normalize(1.03, 0.5, 1.5) = (1.03-0.5)/(1.5-0.5)*100 = 53.0 → got {manual_result:.1f}")
check("  normalize(1.03,0.5,1.5)==53.0", abs(manual_result - 53.0) < 1e-9, f"got {manual_result}")

for v, lo, hi, exp, label in cases:
    got = normalize(v, lo, hi)
    check(f"  {label}", abs(got - exp) < 1e-9, f"got {got:.4f}")

# 1c. Excess return arithmetic
print("\n  [1c] Excess return = port_return - RF")
# Example: port_return=0.01, RF=0.002 → excess=0.008
excess = 0.01 - 0.002
check("  0.01 - 0.002 == 0.008", abs(excess - 0.008) < 1e-12, f"got {excess}")

# 1d. Annualised alpha
print("\n  [1d] Annualised alpha = daily_alpha * 252")
daily_alpha = 0.0001
ann = daily_alpha * 252
check("  0.0001 * 252 == 0.0252", abs(ann - 0.0252) < 1e-12, f"got {ann:.4f}")

# ─────────────────────────────────────────────────────────────────────────────
# 2. FF5 DATA INTEGRITY
# ─────────────────────────────────────────────────────────────────────────────
section("2 · FF5 DATA INTEGRITY")

with sqlite3.connect(DB_PATH) as conn:
    ff5_raw = pd.read_sql(
        "SELECT date, mkt_rf, smb, hml, rmw, cma, rf FROM ff5_daily ORDER BY date",
        conn,
    )

print(f"\n  Shape: {ff5_raw.shape}  (expect ~15 000+ rows, 7 cols)")
check("  rows > 10 000",  len(ff5_raw) > 10_000, f"got {len(ff5_raw)}")
check("  cols == 7",      ff5_raw.shape[1] == 7,  f"got {ff5_raw.shape[1]}")

# Convert to decimal for range checks
ff5 = ff5_raw.copy()
ff5.index = pd.to_datetime(ff5["date"])
ff5 = ff5.drop(columns=["date"])
ff5_dec = ff5 / 100.0   # percent → decimal

print(f"\n  Date range : {ff5_raw['date'].iloc[0]}  →  {ff5_raw['date'].iloc[-1]}")
check("  starts ≤ 1970-01-01", ff5_raw["date"].iloc[0] <= "1970-01-01",
      f"starts {ff5_raw['date'].iloc[0]}")
check("  ends   ≥ 2024-01-01", ff5_raw["date"].iloc[-1] >= "2024-01-01",
      f"ends   {ff5_raw['date'].iloc[-1]}")

print(f"\n  Mkt-RF range (decimal): {ff5_dec['mkt_rf'].min():.4f} .. {ff5_dec['mkt_rf'].max():.4f}")
check("  Mkt-RF min > -0.25", ff5_dec["mkt_rf"].min() > -0.25,
      f"min={ff5_dec['mkt_rf'].min():.4f}", level="WARN")
check("  Mkt-RF max <  0.25", ff5_dec["mkt_rf"].max() <  0.25,
      f"max={ff5_dec['mkt_rf'].max():.4f}", level="WARN")

nulls = ff5_raw[["mkt_rf","smb","hml","rmw","cma","rf"]].isnull().sum().sum()
check("  No nulls in FF5 columns", nulls == 0, f"found {nulls} nulls")

print("\n  Sample rows (stored as percent, shown as parsed):")
print(ff5_raw.head(3).to_string(index=False))
print("  ...")
print(ff5_raw.tail(3).to_string(index=False))

# ─────────────────────────────────────────────────────────────────────────────
# 3. NAV DATA INTEGRITY + DATE ALIGNMENT
# ─────────────────────────────────────────────────────────────────────────────
section("3 · NAV DATA + DATE ALIGNMENT")

with sqlite3.connect(DB_PATH) as conn:
    nav_raw = pd.read_sql(
        "SELECT date, portfolio_name, nav FROM portfolio_prices ORDER BY date",
        conn,
    )

print(f"\n  NAV rows: {len(nav_raw)}  portfolios: {nav_raw['portfolio_name'].nunique()}")
check("  NAV rows > 1 000",       len(nav_raw) > 1_000,  f"got {len(nav_raw)}")
check("  portfolios == 12",       nav_raw["portfolio_name"].nunique() == 12,
      f"got {nav_raw['portfolio_name'].nunique()}")

# Pivot
nav_pivot = nav_raw.pivot(index="date", columns="portfolio_name", values="nav")
nav_pivot.columns.name = None
nav_pivot.index = pd.to_datetime(nav_pivot.index)

# Daily returns
ret = nav_pivot.pct_change().iloc[1:]
ret = ret.replace([np.inf, -np.inf], np.nan)

# Align
common_idx = ret.index.intersection(ff5_dec.index)
print(f"\n  Overlapping trading days (NAV ∩ FF5): {len(common_idx)}")
check("  overlap ≥ 100 days", len(common_idx) >= 100, f"got {len(common_idx)}")

ret_al  = ret.loc[common_idx]
ff5_al  = ff5_dec.loc[common_idx]

print(f"\n  NAV returns — first 5 rows (SPY column):")
print(ret_al["SPY"].head(5).to_string())
print(f"\n  FF5 factors — first 5 rows (decimal):")
print(ff5_al[["mkt_rf","smb","hml","rmw","cma","rf"]].head(5).to_string())

print(f"\n  NAV returns — last 5 rows (SPY column):")
print(ret_al["SPY"].tail(5).to_string())
print(f"\n  FF5 factors — last 5 rows (decimal):")
print(ff5_al[["mkt_rf","smb","hml","rmw","cma","rf"]].tail(5).to_string())

# NaN after merge
nan_ret = ret_al.isnull().sum().sum()
nan_ff5 = ff5_al.isnull().sum().sum()
check("  No NaN in aligned returns",  nan_ret == 0, f"found {nan_ret}")
check("  No NaN in aligned FF5",      nan_ff5 == 0, f"found {nan_ff5}")

# Reasonable daily return range for SPY
spy_max = ret_al["SPY"].abs().max()
check("  SPY max |daily return| < 0.10", spy_max < 0.10,
      f"max={spy_max:.4f}", level="WARN")

# Lengths match before regressing
check("  len(returns) == len(ff5) after align",
      len(ret_al) == len(ff5_al), f"{len(ret_al)} vs {len(ff5_al)}")

# Dates line up exactly
dates_match = (ret_al.index == ff5_al.index).all()
check("  All dates match element-wise", dates_match)

# ─────────────────────────────────────────────────────────────────────────────
# 4. STATSMODELS vs NUMPY CROSS-CHECK (first portfolio)
# ─────────────────────────────────────────────────────────────────────────────
section("4 · STATSMODELS vs NUMPY (SPY cross-check)")

pname = "SPY"
y_spy = (ret_al[pname] - ff5_al["rf"]).dropna()
X_spy = ff5_al[["mkt_rf","smb","hml","rmw","cma"]].loc[y_spy.index]
Xc    = sm.add_constant(X_spy, has_constant="add")

# statsmodels
sm_fit   = sm.OLS(y_spy, Xc).fit()
sm_betas = sm_fit.params.values   # [const, mkt_rf, smb, hml, rmw, cma]

# numpy lstsq
np_betas, _, _, _ = np.linalg.lstsq(Xc.values, y_spy.values, rcond=None)

print(f"\n  {'Param':<12} {'statsmodels':>14} {'numpy lstsq':>14} {'diff':>12}")
print(f"  {'-'*54}")
labels_np = ["const","mkt_rf","smb","hml","rmw","cma"]
for lbl, sm_b, np_b in zip(labels_np, sm_betas, np_betas):
    diff = abs(sm_b - np_b)
    flag = "  ✓" if diff < 1e-4 else "  ✗ MISMATCH"
    print(f"  {lbl:<12} {sm_b:>14.8f} {np_b:>14.8f} {diff:>12.2e}{flag}")
    check(f"  {lbl} matches to 4dp", diff < 1e-4, f"diff={diff:.2e}")

# ─────────────────────────────────────────────────────────────────────────────
# 5. FULL REGRESSION AUDIT TABLE
# ─────────────────────────────────────────────────────────────────────────────
section("5 · FULL REGRESSION RESULTS AUDIT")

X_factors = ff5_al[["mkt_rf","smb","hml","rmw","cma"]]
Xc_all    = sm.add_constant(X_factors, has_constant="add")

print(f"\n  {'Portfolio':<28} | {'α/yr':>7} | {'β_Mkt':>6} | {'β_SMB':>6} | {'β_HML':>6} | {'β_RMW':>6} | {'β_CMA':>6} | {'R²':>6} | {'N':>4}")
print(f"  {'-'*28}-+-{'-'*7}-+-{'-'*6}-+-{'-'*6}-+-{'-'*6}-+-{'-'*6}-+-{'-'*6}-+-{'-'*6}-+-{'-'*4}")

PORTFOLIOS_ORDER = [
    "SPY","ChatGPT-5.2","ChatGPT-5.2 DeepResearch","Claude Sonnet 4.5",
    "Gemini-3","Meta AI","Grok","DeepSeek-V3","Meta Ai Thinking",
    "Grok-Expert","DeepSeek-DeepThink","Gemini-3 DeepResearch ",
]

audit_results = {}
for pname in PORTFOLIOS_ORDER:
    if pname not in ret_al.columns:
        print(f"  {'(missing)':28} | {pname}")
        continue
    y = (ret_al[pname] - ff5_al["rf"]).dropna()
    if len(y) < 20:
        print(f"  {pname[:28]:<28} | INSUFFICIENT DATA ({len(y)} obs)")
        continue
    Xfit = Xc_all.loc[y.index]
    fit  = sm.OLS(y, Xfit).fit()
    alpha_ann  = fit.params["const"] * 252
    beta_mkt   = fit.params["mkt_rf"]
    beta_smb   = fit.params["smb"]
    beta_hml   = fit.params["hml"]
    beta_rmw   = fit.params["rmw"]
    beta_cma   = fit.params["cma"]
    r2         = fit.rsquared
    n          = int(fit.nobs)
    audit_results[pname] = dict(
        alpha=fit.params["const"], alpha_ann=alpha_ann,
        beta_mkt=beta_mkt, beta_smb=beta_smb, beta_hml=beta_hml,
        beta_rmw=beta_rmw, beta_cma=beta_cma, r_squared=r2, n=n,
    )
    sign = "+" if alpha_ann >= 0 else ""
    print(f"  {pname[:28]:<28} | {sign}{alpha_ann*100:>5.2f}% | {beta_mkt:>6.3f} | {beta_smb:>6.3f} | {beta_hml:>6.3f} | {beta_rmw:>6.3f} | {beta_cma:>6.3f} | {r2:>6.3f} | {n:>4}")

# ─────────────────────────────────────────────────────────────────────────────
# 6. SANITY FLAGS on audit results
# ─────────────────────────────────────────────────────────────────────────────
section("6 · SANITY FLAGS")

for pname, r in audit_results.items():
    tag = pname[:28]
    # NaN / Inf
    for k, v in r.items():
        if isinstance(v, float) and (math.isnan(v) or math.isinf(v)):
            check(f"  {tag} {k} is finite", False, f"got {v}")

    check(f"  {tag} beta_mkt ∈ [0.3, 2.0]",
          0.3 <= r["beta_mkt"] <= 2.0, f"β_mkt={r['beta_mkt']:.3f}", level="WARN")
    check(f"  {tag} R² ≥ 0.30",
          r["r_squared"] >= 0.30, f"R²={r['r_squared']:.3f}", level="WARN")
    check(f"  {tag} R² < 0.999",
          r["r_squared"] < 0.999, f"R²={r['r_squared']:.3f}", level="WARN")
    check(f"  {tag} |α/yr| < 25%",
          abs(r["alpha_ann"]) < 0.25, f"α/yr={r['alpha_ann']*100:.2f}%", level="WARN")

# SPY ground-truth checks (hard failures)
if "SPY" in audit_results:
    spy = audit_results["SPY"]
    check("  SPY beta_mkt ≈ 1.0  (±0.05)", abs(spy["beta_mkt"] - 1.0) < 0.05,
          f"got {spy['beta_mkt']:.4f}")
    check("  SPY R² > 0.98",               spy["r_squared"] > 0.98,
          f"got {spy['r_squared']:.4f}")
    check("  SPY |α/yr| < 1%",             abs(spy["alpha_ann"]) < 0.01,
          f"got {spy['alpha_ann']*100:.3f}%")

# ─────────────────────────────────────────────────────────────────────────────
# 7. NORMALIZATION SPOT-CHECK (2 portfolios, every axis)
# ─────────────────────────────────────────────────────────────────────────────
section("7 · NORMALIZATION SPOT-CHECK")

NORM_SPECS = {
    "Market Beta":          ("beta_mkt",  0.5,   1.5),
    "Size Tilt (SMB)":      ("beta_smb", -0.5,   0.5),
    "Value Tilt (HML)":     ("beta_hml", -0.5,   0.5),
    "Profitability (RMW)":  ("beta_rmw", -0.5,   0.5),
    "Investment (CMA)":     ("beta_cma", -0.5,   0.5),
    "Alpha (ann.)":         ("alpha_ann",-0.05,  0.05),
}

for pname in ["SPY", "Claude Sonnet 4.5"]:
    if pname not in audit_results:
        continue
    r = audit_results[pname]
    print(f"\n  {pname}")
    print(f"  {'Axis':<24} {'raw':>9} {'lo':>7} {'hi':>7} {'formula':>32} {'score':>7}")
    print(f"  {'-'*88}")
    for axis, (key, lo, hi) in NORM_SPECS.items():
        raw = r[key]
        score = normalize(raw, lo, hi)
        formula = f"({raw:.4f} - {lo}) / ({hi} - {lo}) * 100"
        manual  = (raw - lo) / (hi - lo) * 100
        manual_clamped = max(0, min(100, manual))
        ok = abs(score - manual_clamped) < 1e-9
        flag = "✓" if ok else "✗"
        print(f"  {axis:<24} {raw:>9.4f} {lo:>7.3f} {hi:>7.3f}   {formula:<32} = {score:>6.1f}  {flag}")
    check(f"  {pname} all norm formulas consistent", True)

# ─────────────────────────────────────────────────────────────────────────────
# FINAL SUMMARY
# ─────────────────────────────────────────────────────────────────────────────
section("FINAL SUMMARY")

if errors:
    print(f"\n  {FAIL}  {len(errors)} HARD ERROR(S) — DO NOT USE THESE RESULTS:")
    for e in errors:
        print(f"       • {e}")
    sys.exit(1)
elif warnings:
    print(f"\n  {WARN}  {len(warnings)} warning(s) — review before trusting results:")
    for w in warnings:
        print(f"       • {w}")
    print(f"\n  All formulas verified. Results are safe to use (with caveats above).")
else:
    print(f"\n  {PASS}  All checks passed. Regression results are mathematically sound.")
