from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.encoders import jsonable_encoder
import pandas as pd
import yfinance as yf
import time
import numpy as np
import math
import json
from pathlib import Path

app = FastAPI()

# Allow local dev; restrict in production
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

PORTFOLIOS = {
    "SPY": {"SPY": 1.0},
    "ChatGPT-5.2": {
        "SPY": 0.15, "QQQ": 0.10, "VIG": 0.05, "VEA": 0.10, "EEM": 0.10,
        "EWY": 0.05, "IJR": 0.10, "XLU": 0.05, "XLP": 0.05, "GLD": 0.06,
        "GSG": 0.04, "AGG": 0.10, "HYG": 0.05,
    },
    "ChatGPT-5.2 DeepResearch": {
        # Core Equity Beta (35%)
        "SPY": 0.20,  # US market core beta (benchmark anchor)
        "QQQ": 0.15,  # Structural tech / AI growth tilt
        # Factor Alpha Sleeve (30%)
        "AVUV": 0.10,  # US Small Cap Value (value + size premium)
        "MTUM": 0.10,  # Momentum factor (trend persistence)
        "QUAL": 0.10,  # Quality factor (ROE, balance sheet strength)
        # International & EM Diversification (15%)
        "VEA": 0.10,  # Developed ex-US (valuation + FX diversification)
        "VWO": 0.05,  # Emerging markets (long-cycle growth optionality)
        # Real Assets & Inflation Hedges (10%)
        "GLD": 0.05,  # Gold (crisis hedge, real rates sensitivity)
        "DBC": 0.05,  # Broad commodities (inflation + supply shocks)
        # Defensive / Crisis Alpha (10%)
        "DBMF": 0.05,  # Managed futures (trend-following, convexity)
        "IEF": 0.05,  # Intermediate Treasuries (risk-off ballast)
    },
    "Claude Sonnet 4.5": {
        "VBR": 0.22,
        "NVDA": 0.18,
        "MSFT": 0.16,
        "VTWG": 0.14,
        "AVGO": 0.08,
        "GOOGL": 0.07,
        "GLD": 0.10,
        "VGIT": 0.05,
    },
    "Gemini-3": {
        "VGT": 0.35,
        "KBWB": 0.20,
        "SLV": 0.15,
        "XLI": 0.15,
        "TLT": 0.10,
        "CASH": 0.05,  # NOTE: not a real ticker; treated as 0% return
    },
    "Meta AI": {
        "MSFT": 0.10,
        "GOOGL": 0.10,
        "NVDA": 0.10,
        "JNJ": 0.10,
        "KO": 0.10,
        "VOO": 0.10,
        "CSJ": 0.20,
        "GLD": 0.10,
        "VGLT": 0.10,
    },
    "Grok": {
        "QQQ": 0.30,
        "AVUV": 0.15,
        "MTUM": 0.15,
        "VWO": 0.15,
        "VNQ": 0.10,
        "GLD": 0.10,
        "TLT": 0.05,
    },
    "DeepSeek-V3": {
        "AVUV": 0.15,
        "IMTM": 0.10,
        "USMV": 0.10,
        "QUAL": 0.10,
        "DBMF": 0.15,
        "KMLM": 0.10,
        "DBC": 0.10,
        "VNQI": 0.05,
        "VTIP": 0.05,
        "BIL": 0.05,
        "ARKQ": 0.05,
    },
    "Meta Ai Thinking": {
        "NVDA": 0.15,
        "MSFT": 0.15,
        "CRWD": 0.10,
        "IWM": 0.10,
        "BRK.B": 0.10,
        "JPM": 0.10,
        "VNQ": 0.10,
        "GLD": 0.10,
        "CCJ": 0.05,
        "LNG": 0.05,
    },
    "Grok-Expert": {
        "VTI": 0.25,
        "AVUV": 0.15,
        "VXUS": 0.10,
        "VWO": 0.10,
        "QQQ": 0.10,
        "BND": 0.10,
        "VNQ": 0.10,
        "GLD": 0.10,
    },
    "DeepSeek-DeepThink": {
        # US Equity Factor Tilts (40%)
        "AVUV": 0.15,  # Small-cap value premium capture
        "SPGP": 0.10,  # GARP strategy: growth at reasonable price
        "XLF": 0.08,  # Financials sector rotation
        "XLI": 0.07,  # Industrials: infrastructure & reshoring

        # International Equity (15%)
        "AVDV": 0.08,  # Int'l small-cap value triple premium
        "INDA": 0.07,  # India structural growth story

        # Fixed Income & Credit (20%)
        "VCIT": 0.10,  # Intermediate corporate bonds (5.8% yield)
        "TFLO": 0.07,  # Floating rate Treasury protection
        "HYG": 0.03,  # Tactical high yield exposure

        # Real Assets & Commodities (10%)
        "VNQ": 0.05,  # REITs: commercial real estate recovery
        "DBC": 0.03,  # Broad commodities inflation hedge
        "URA": 0.02,  # Uranium: asymmetric energy transition play

        # Alternative Strategies (10%)
        "KMLM": 0.05,  # Managed futures for crisis alpha
        "JEPI": 0.05,  # Covered call strategy for income + protection

        # Cash & Liquidity (5%)
        "SGOV": 0.05,  # Ultra-short Treasuries (5.1% yield, liquidity)
    },
    "Gemini-3 DeepResearch ": {
        # Fiscal Stimulus & Reshoring Alpha (35%)
        "MADE": 0.20,  # US Manufacturing (OBBBA beneficiary)
        "DRLL": 0.15,  # US Energy Infrastructure
        # Growth & Tech Exposure (15%)
        "QQQ": 0.15,  # AI Capex & Productivity Cycle
        # Quality Beta & International Diversification (30%)
        "VIG": 0.10,  # Dividend Growers (Late-cycle protection)
        "VXUS": 0.10,  # International Stock Exposure
        "EWJ": 0.10,  # Japan (Corporate reform/Sanaenomics)
        # Real Assets & Defensive Income (20%)
        "GLD": 0.10,  # Gold (Deficit & Geopolitical hedge)
        "BKLN": 0.10,  # Senior Loans (Floating rate yield >8%)
    }
}

START_DATE = "2026-02-02"

_cache = {"ts": 0.0, "payload": None, "last_error": None}
CACHE_SECONDS = 15  # refresh rate; avoid hammering yfinance

TRADING_DAYS = 252
INITIAL_CAPITAL = 100.0  # ✅ NAV starts at $100 (and holdings dollars use this)

# Outlook JSON (served at /api/outlook)
OUTLOOK_PATH = Path(__file__).resolve().parent / "outlook.json"
_outlook_cache = {"ts": 0.0, "payload": None, "last_error": None}
OUTLOOK_CACHE_SECONDS = 300  # 5 minutes


# ----------------------------
# JSON sanitization (NaN/Inf -> None)
# ----------------------------
def _is_bad_number(x) -> bool:
    try:
        xf = float(x)
        return math.isnan(xf) or math.isinf(xf)
    except Exception:
        return False


def sanitize_for_json(obj):
    """
    Recursively convert NaN/Inf to None so FastAPI/Starlette JSON is compliant.
    """
    if obj is None:
        return None

    # numpy scalars
    if isinstance(obj, (np.floating, np.integer)):
        obj = obj.item()

    if isinstance(obj, float):
        return None if _is_bad_number(obj) else float(obj)

    if isinstance(obj, (int, str, bool)):
        return obj

    if isinstance(obj, dict):
        return {k: sanitize_for_json(v) for k, v in obj.items()}

    if isinstance(obj, (list, tuple)):
        return [sanitize_for_json(v) for v in obj]

    # fallback: let FastAPI encode (then sanitize again)
    try:
        encoded = jsonable_encoder(obj)
        return sanitize_for_json(encoded)
    except Exception:
        return str(obj)


def _max_drawdown(equity: pd.Series) -> float:
    peak = equity.cummax()
    dd = equity / peak - 1.0
    return float(dd.min())


def _compute_stats(cum: pd.DataFrame) -> dict:
    """
    cum: equity curves (NAV), columns = portfolio names
    returns: stats dict keyed by portfolio name
    """
    daily_ret = cum.pct_change()
    daily_ret = daily_ret.replace([np.inf, -np.inf], np.nan).dropna(how="all")

    stats = {}

    for name in cum.columns:
        eq = cum[name].replace([np.inf, -np.inf], np.nan).dropna()
        if len(eq) < 2:
            continue

        dr = daily_ret[name].replace([np.inf, -np.inf], np.nan).dropna()
        if len(dr) < 2:
            total_return = float(eq.iloc[-1] / eq.iloc[0] - 1.0)
            stats[name] = {
                "total_return": total_return,
                "cagr": None,
                "vol": None,
                "max_drawdown": _max_drawdown(eq),
                "sharpe": None,
                "start_value": float(eq.iloc[0]),
                "end_value": float(eq.iloc[-1]),
            }
            continue

        total_return = float(eq.iloc[-1] / eq.iloc[0] - 1.0)

        # CAGR
        days = (eq.index[-1] - eq.index[0]).days
        years = days / 365.25 if days > 0 else 0.0
        if years > 0 and eq.iloc[0] > 0 and eq.iloc[-1] > 0:
            cagr = float((eq.iloc[-1] / eq.iloc[0]) ** (1 / years) - 1.0)
        else:
            cagr = None

        # Annualized vol
        std = float(dr.std())
        vol = float(std * np.sqrt(TRADING_DAYS)) if std and std > 0 else None

        # Sharpe (rf = 0)
        if std and std > 0:
            sharpe = float((dr.mean() * TRADING_DAYS) / (std * np.sqrt(TRADING_DAYS)))
        else:
            sharpe = None

        mdd = _max_drawdown(eq)

        stats[name] = {
            "total_return": total_return,
            "cagr": cagr,
            "vol": vol,
            "max_drawdown": mdd,
            "sharpe": sharpe,
            "start_value": float(eq.iloc[0]),
            "end_value": float(eq.iloc[-1]),
        }

    return stats


def compute_payload():
    # IMPORTANT: remove placeholders like CASH so yfinance doesn't fail everything
    tickers = sorted({t for p in PORTFOLIOS.values() for t in p if t != "CASH"})

    def _download(threads: bool):
        return yf.download(
            tickers=" ".join(tickers),
            start=START_DATE,
            auto_adjust=True,
            progress=False,
            group_by="ticker",
            threads=threads,
        )

    raw = _download(threads=True)

    # yfinance sometimes returns empty; retry once
    if raw is None or getattr(raw, "empty", True):
        raw = _download(threads=False)

    if raw is None or raw.empty:
        raise RuntimeError(f"yfinance returned no data. start={START_DATE} tickers={len(tickers)}")

    # ✅ Build Close prices safely (even if some tickers fail)
    close = pd.DataFrame(index=raw.index)

    if isinstance(raw.columns, pd.MultiIndex):
        # columns: (TICKER, field)
        available = set(raw.columns.get_level_values(0))
        for t in tickers:
            if t in available and "Close" in raw[t].columns:
                close[t] = raw[t]["Close"]
    else:
        # single ticker shape
        if "Close" in raw.columns:
            close[tickers[0]] = raw["Close"]
        else:
            raise RuntimeError(f"Unexpected yfinance columns: {list(raw.columns)[:20]}")

    close = close.dropna(axis=1, how="all")
    if close.empty:
        raise RuntimeError("Close prices empty after filtering (all tickers failed).")

    close = close.sort_index().ffill()

    # ✅ KEY CHANGE: keep first date so NAV starts exactly at $100
    returns_full = close.pct_change().replace([np.inf, -np.inf], np.nan).fillna(0.0)

    cum = pd.DataFrame(index=returns_full.index)

    for name, weights in PORTFOLIOS.items():
        w = pd.Series(weights, dtype=float)

        cols = [c for c in w.index if c in returns_full.columns]
        cash_weight = float(w.get("CASH", 0.0))

        if not cols and cash_weight <= 0:
            continue

        if cols:
            w_invest = w.loc[cols]
            invest_sum = float(w_invest.sum())
            if invest_sum > 0:
                w_invest = w_invest / invest_sum
                daily_invest = returns_full[cols] @ w_invest
            else:
                daily_invest = 0.0
        else:
            daily_invest = 0.0

        # CASH earns 0% daily return
        daily = (1.0 - cash_weight) * daily_invest

        # ✅ NAV series starts at INITIAL_CAPITAL (100)
        cum[name] = INITIAL_CAPITAL * (1.0 + daily).cumprod()

    if cum.empty:
        raise RuntimeError("No portfolios computed (missing tickers or data).")

    labels = [d.strftime("%Y-%m-%d") for d in cum.index]
    series = {col: [float(x) for x in cum[col].round(6).tolist()] for col in cum.columns}
    stats = _compute_stats(cum)

    # ✅ Holdings payload (weights + percent + dollars)
    holdings = {}
    for pname, weights in PORTFOLIOS.items():
        items = []
        for ticker, wgt in weights.items():
            items.append({
                "ticker": ticker,
                "weight": float(wgt),
                "weight_pct": float(wgt) * 100.0,
                "dollars": float(wgt) * INITIAL_CAPITAL,
            })
        items.sort(key=lambda x: x["weight"], reverse=True)
        holdings[pname] = items

    payload = {
        "labels": labels,
        "series": series,
        "stats": stats,
        "holdings": holdings,
        "start_date": START_DATE,
    }

    return sanitize_for_json(payload)


def load_outlook():
    if not OUTLOOK_PATH.exists():
        raise RuntimeError(f"outlook.json not found at {OUTLOOK_PATH}")
    with open(OUTLOOK_PATH, "r", encoding="utf-8") as f:
        data = json.load(f)
    return sanitize_for_json(data)


@app.get("/api/health")
def health():
    return {
        "ok": True,
        "cached": _cache["payload"] is not None,
        "last_error": _cache["last_error"],
        "outlook_cached": _outlook_cache["payload"] is not None,
        "outlook_last_error": _outlook_cache["last_error"],
    }


@app.get("/api/outlook")
def outlook():
    now = time.time()
    if _outlook_cache["payload"] is not None and (now - _outlook_cache["ts"] < OUTLOOK_CACHE_SECONDS):
        return _outlook_cache["payload"]

    try:
        payload = load_outlook()
        _outlook_cache["payload"] = payload
        _outlook_cache["ts"] = now
        _outlook_cache["last_error"] = None
        return payload
    except Exception as e:
        _outlook_cache["last_error"] = str(e)
        if _outlook_cache["payload"] is not None:
            return _outlook_cache["payload"]
        raise


@app.get("/api/portfolio-series")
def portfolio_series():
    now = time.time()
    if _cache["payload"] is not None and (now - _cache["ts"] < CACHE_SECONDS):
        return _cache["payload"]
    try:
        payload = compute_payload()
        payload = sanitize_for_json(payload)

        _cache["payload"] = payload
        _cache["ts"] = now
        _cache["last_error"] = None
        return payload
    except Exception as e:
        _cache["last_error"] = str(e)
        # If we have a cached payload, return it instead of hard failing the website
        if _cache["payload"] is not None:
            return _cache["payload"]
        raise
