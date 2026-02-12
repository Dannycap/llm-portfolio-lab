# app.py
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
        "SPY": 0.20,
        "QQQ": 0.15,
        "AVUV": 0.10,
        "MTUM": 0.10,
        "QUAL": 0.10,
        "VEA": 0.10,
        "VWO": 0.05,
        "GLD": 0.05,
        "DBC": 0.05,
        "DBMF": 0.05,
        "IEF": 0.05,
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
        "CASH": 0.05,  # treated as 0% return
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
        "BRK.B": 0.10,  # NOTE: will be mapped to BRK-B for Yahoo
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
        "AVUV": 0.15,
        "SPGP": 0.10,
        "XLF": 0.08,
        "XLI": 0.07,
        "AVDV": 0.08,
        "INDA": 0.07,
        "VCIT": 0.10,
        "TFLO": 0.07,
        "HYG": 0.03,
        "VNQ": 0.05,
        "DBC": 0.03,
        "URA": 0.02,
        "KMLM": 0.05,
        "JEPI": 0.05,
        "SGOV": 0.05,
    },
    "Gemini-3 DeepResearch ": {
        "MADE": 0.20,
        "DRLL": 0.15,
        "QQQ": 0.15,
        "VIG": 0.10,
        "VXUS": 0.10,
        "EWJ": 0.10,
        "GLD": 0.10,
        "BKLN": 0.10,
    }
}

START_DATE = "2026-02-02"

_cache = {"ts": 0.0, "payload": None, "last_error": None}
CACHE_SECONDS = 15

TRADING_DAYS = 252
INITIAL_CAPITAL = 100.0  # NAV starts at $100

# Outlook JSON (served at /api/outlook)
OUTLOOK_PATH = Path(__file__).resolve().parent / "outlook.json"
_outlook_cache = {"ts": 0.0, "payload": None, "last_error": None}
OUTLOOK_CACHE_SECONDS = 300


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
    if obj is None:
        return None

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
    daily_ret = cum.pct_change()
    daily_ret = daily_ret.replace([np.inf, -np.inf], np.nan).dropna(how="all")

    stats = {}
    for name in cum.columns:
        eq = cum[name].replace([np.inf, -np.inf], np.nan).dropna()
        if len(eq) < 2:
            continue

        dr = daily_ret[name].replace([np.inf, -np.inf], np.nan).dropna()

        total_return = float(eq.iloc[-1] / eq.iloc[0] - 1.0)

        # CAGR
        days = (eq.index[-1] - eq.index[0]).days
        years = days / 365.25 if days > 0 else 0.0
        if years > 0 and eq.iloc[0] > 0 and eq.iloc[-1] > 0:
            cagr = float((eq.iloc[-1] / eq.iloc[0]) ** (1 / years) - 1.0)
        else:
            cagr = None

        if len(dr) >= 2:
            std = float(dr.std())
            vol = float(std * np.sqrt(TRADING_DAYS)) if std > 0 else None
            sharpe = float((dr.mean() * TRADING_DAYS) / (std * np.sqrt(TRADING_DAYS))) if std > 0 else None
        else:
            vol = None
            sharpe = None

        stats[name] = {
            "total_return": total_return,
            "cagr": cagr,
            "vol": vol,
            "max_drawdown": _max_drawdown(eq),
            "sharpe": sharpe,
            "start_value": float(eq.iloc[0]),
            "end_value": float(eq.iloc[-1]),
        }

    return stats


# ----------------------------
# Ticker normalization for Yahoo
# ----------------------------
def yahoo_ticker(t: str) -> str:
    """
    Yahoo uses '-' for many share-class tickers (e.g., BRK.B -> BRK-B).
    """
    t = t.strip()
    if t.upper() == "CASH":
        return t
    return t.replace(".", "-")


def compute_payload():
    # Build mapping: original ticker -> yahoo ticker
    all_original = sorted({t for p in PORTFOLIOS.values() for t in p.keys() if t.upper() != "CASH"})
    orig_to_yahoo = {t: yahoo_ticker(t) for t in all_original}

    # unique yahoo tickers for download
    yahoo_tickers = sorted(set(orig_to_yahoo.values()))

    def _download(threads: bool):
        return yf.download(
            tickers=" ".join(yahoo_tickers),
            start=START_DATE,
            auto_adjust=True,
            progress=False,
            group_by="ticker",
            threads=threads,
        )

    raw = _download(threads=True)
    if raw is None or getattr(raw, "empty", True):
        raw = _download(threads=False)

    if raw is None or raw.empty:
        raise RuntimeError(f"yfinance returned no data. start={START_DATE} tickers={len(yahoo_tickers)}")

    # Build close prices (per yahoo ticker)
    close = pd.DataFrame(index=raw.index)

    if isinstance(raw.columns, pd.MultiIndex):
        available = set(raw.columns.get_level_values(0))
        for yt in yahoo_tickers:
            if yt in available and "Close" in raw[yt].columns:
                close[yt] = raw[yt]["Close"]
    else:
        # single ticker shape
        if "Close" in raw.columns and len(yahoo_tickers) == 1:
            close[yahoo_tickers[0]] = raw["Close"]
        else:
            raise RuntimeError(f"Unexpected yfinance columns: {list(raw.columns)[:20]}")

    close = close.dropna(axis=1, how="all")
    if close.empty:
        raise RuntimeError("Close prices empty after filtering (all tickers failed).")

    close = close.sort_index().ffill()

    # Daily returns; force first day to 0 so NAV starts exactly at 100
    returns = close.pct_change().replace([np.inf, -np.inf], np.nan)
    if len(returns.index) > 0:
        returns.iloc[0] = 0.0
    returns = returns.fillna(0.0)

    cum = pd.DataFrame(index=returns.index)

    # Compute NAV correctly: portfolio return = sum(w_i * r_i) + cash * 0
    # If a ticker is missing from returns, we treat that weight as "uninvested cash" (0% return)
    for pname, weights in PORTFOLIOS.items():
        w = pd.Series(weights, dtype=float)

        # cash weight explicitly in portfolio
        cash_weight = float(w.get("CASH", 0.0))

        # original tickers excluding CASH
        orig_holdings = [t for t in w.index if t.upper() != "CASH"]

        # map to yahoo tickers and split into available / missing
        contrib = pd.Series(0.0, index=returns.index)
        missing_weight = 0.0

        for ot in orig_holdings:
            wt = float(w.get(ot, 0.0))
            if wt == 0.0:
                continue

            yt = orig_to_yahoo.get(ot, yahoo_ticker(ot))
            if yt in returns.columns:
                contrib = contrib + (wt * returns[yt])
            else:
                # treat missing data as cash (0% return) instead of renormalizing
                missing_weight += wt

        # total effective "cash-like" weight (0% return)
        _ = cash_weight + missing_weight  # kept for clarity / debugging if needed

        daily = contrib  # cash contributes 0% so nothing to add
        cum[pname] = INITIAL_CAPITAL * (1.0 + daily).cumprod()

    if cum.empty:
        raise RuntimeError("No portfolios computed (missing tickers or data).")

    labels = [d.strftime("%Y-%m-%d") for d in cum.index]
    series = {col: [float(x) for x in cum[col].round(6).tolist()] for col in cum.columns}
    stats = _compute_stats(cum)

    # Holdings payload (original weights + dollars) — unchanged, just reporting the spec
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
        _cache["payload"] = payload
        _cache["ts"] = now
        _cache["last_error"] = None
        return payload
    except Exception as e:
        _cache["last_error"] = str(e)
        if _cache["payload"] is not None:
            return _cache["payload"]
        raise
