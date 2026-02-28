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
import sqlite3
import asyncio
import logging
import requests
import zipfile
import io
from pathlib import Path
from contextlib import asynccontextmanager
from apscheduler.schedulers.asyncio import AsyncIOScheduler
from apscheduler.triggers.cron import CronTrigger

try:
    import statsmodels.api as sm
    _STATSMODELS_OK = True
except ImportError:
    sm = None  # type: ignore
    _STATSMODELS_OK = False

logger = logging.getLogger(__name__)

# ---------------------------------------------------------------------------
# Portfolio definitions
# ---------------------------------------------------------------------------
PORTFOLIOS = {
    "SPY": {"SPY": 1.0},
    "ChatGPT-5.2": {
        "SPY": 0.15, "QQQ": 0.10, "VIG": 0.05, "VEA": 0.10, "EEM": 0.10,
        "EWY": 0.05, "IJR": 0.10, "XLU": 0.05, "XLP": 0.05, "GLD": 0.06,
        "GSG": 0.04, "AGG": 0.10, "HYG": 0.05,
    },
    "ChatGPT-5.2 DeepResearch": {
        "SPY": 0.20, "QQQ": 0.15, "AVUV": 0.10, "MTUM": 0.10, "QUAL": 0.10,
        "VEA": 0.10, "VWO": 0.05, "GLD": 0.05, "DBC": 0.05, "DBMF": 0.05,
        "IEF": 0.05,
    },
    "Claude Sonnet 4.5": {
        "VBR": 0.22, "NVDA": 0.18, "MSFT": 0.16, "VTWG": 0.14,
        "AVGO": 0.08, "GOOGL": 0.07, "GLD": 0.10, "VGIT": 0.05,
    },
    "Gemini-3": {
        "VGT": 0.35, "KBWB": 0.20, "SLV": 0.15, "XLI": 0.15,
        "TLT": 0.10, "CASH": 0.05,
    },
    "Meta AI": {
        "MSFT": 0.10, "GOOGL": 0.10, "NVDA": 0.10, "JNJ": 0.10,
        "KO": 0.10, "VOO": 0.10, "CSJ": 0.20, "GLD": 0.10, "VGLT": 0.10,
    },
    "Grok": {
        "QQQ": 0.30, "AVUV": 0.15, "MTUM": 0.15, "VWO": 0.15,
        "VNQ": 0.10, "GLD": 0.10, "TLT": 0.05,
    },
    "DeepSeek-V3": {
        "AVUV": 0.15, "IMTM": 0.10, "USMV": 0.10, "QUAL": 0.10,
        "DBMF": 0.15, "KMLM": 0.10, "DBC": 0.10, "VNQI": 0.05,
        "VTIP": 0.05, "BIL": 0.05, "ARKQ": 0.05,
    },
    "Meta AI Thinking": {
        "NVDA": 0.15, "MSFT": 0.15, "CRWD": 0.10, "IWM": 0.10,
        "BRK.B": 0.10, "JPM": 0.10, "VNQ": 0.10,
        "GLD": 0.10, "CCJ": 0.05, "LNG": 0.05,
    },
    "Grok-Expert": {
        "VTI": 0.25, "AVUV": 0.15, "VXUS": 0.10, "VWO": 0.10,
        "QQQ": 0.10, "BND": 0.10, "VNQ": 0.10, "GLD": 0.10,
    },
    "DeepSeek-DeepThink": {
        "AVUV": 0.15, "SPGP": 0.10, "XLF": 0.08, "XLI": 0.07,
        "AVDV": 0.08, "INDA": 0.07, "VCIT": 0.10, "TFLO": 0.07,
        "HYG": 0.03, "VNQ": 0.05, "DBC": 0.03, "URA": 0.02,
        "KMLM": 0.05, "JEPI": 0.05, "SGOV": 0.05,
    },
    "Gemini-3 DeepResearch": {
        "MADE": 0.20, "DRLL": 0.15, "QQQ": 0.15, "VIG": 0.10,
        "VXUS": 0.10, "EWJ": 0.10, "GLD": 0.10, "BKLN": 0.10,
    },
}

START_DATE       = "2026-02-02"   # portfolio inception — NAV display starts here
FF5_LOOKBACK_DATE = "2024-01-01"  # historical window used only for FF5 regression
TRADING_DAYS = 252
INITIAL_CAPITAL = 100.0

FF5_URL = (
    "https://mba.tuck.dartmouth.edu/pages/faculty/ken.french/ftp/"
    "F-F_Research_Data_5_Factors_2x3_daily_CSV.zip"
)

# ---------------------------------------------------------------------------
# Paths
# ---------------------------------------------------------------------------
BACKEND_DIR = Path(__file__).resolve().parent
DB_PATH = BACKEND_DIR / "portfolio.db"
OUTLOOK_PATH = BACKEND_DIR / "outlook.json"

# ---------------------------------------------------------------------------
# Caches
# ---------------------------------------------------------------------------
_series_cache: dict = {"ts": 0.0, "payload": None}
SERIES_CACHE_SECONDS = 60

_outlook_cache: dict = {"ts": 0.0, "payload": None, "last_error": None}
OUTLOOK_CACHE_SECONDS = 300

_sync_status: dict = {"ok": None, "rows_upserted": 0, "latest_date": None, "error": None, "ts": 0.0}
_ff5_sync_status: dict = {"ok": None, "ff5_rows": 0, "reg_portfolios": 0, "error": None, "ts": 0.0}


# ---------------------------------------------------------------------------
# JSON sanitisation
# ---------------------------------------------------------------------------
def _is_bad_number(x) -> bool:
    try:
        return math.isnan(float(x)) or math.isinf(float(x))
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
        return sanitize_for_json(jsonable_encoder(obj))
    except Exception:
        return str(obj)


# ---------------------------------------------------------------------------
# Statistics helpers
# ---------------------------------------------------------------------------
def _max_drawdown(equity: pd.Series) -> float:
    peak = equity.cummax()
    return float((equity / peak - 1.0).min())


def _compute_stats(cum: pd.DataFrame) -> dict:
    daily_ret = cum.pct_change().replace([np.inf, -np.inf], np.nan).dropna(how="all")
    stats = {}
    for name in cum.columns:
        eq = cum[name].replace([np.inf, -np.inf], np.nan).dropna()
        if len(eq) < 2:
            continue
        dr = daily_ret[name].replace([np.inf, -np.inf], np.nan).dropna()
        total_return = float(eq.iloc[-1] / eq.iloc[0] - 1.0)
        days = (eq.index[-1] - eq.index[0]).days
        years = days / 365.25 if days > 0 else 0.0
        cagr = (
            float((eq.iloc[-1] / eq.iloc[0]) ** (1 / years) - 1.0)
            if years > 0 and eq.iloc[0] > 0 and eq.iloc[-1] > 0 else None
        )
        std = float(dr.std()) if len(dr) >= 2 else 0.0
        vol = float(std * np.sqrt(TRADING_DAYS)) if std > 0 else None
        sharpe = (
            float((dr.mean() * TRADING_DAYS) / (std * np.sqrt(TRADING_DAYS)))
            if std > 0 else None
        )
        stats[name] = {
            "total_return": total_return, "cagr": cagr, "vol": vol,
            "max_drawdown": _max_drawdown(eq), "sharpe": sharpe,
            "start_value": float(eq.iloc[0]), "end_value": float(eq.iloc[-1]),
        }
    return stats


# ---------------------------------------------------------------------------
# Ticker normalisation
# ---------------------------------------------------------------------------
def yahoo_ticker(t: str) -> str:
    t = t.strip()
    if t.upper() == "CASH":
        return t
    return t.replace(".", "-")


# ---------------------------------------------------------------------------
# Database: portfolio_prices
# ---------------------------------------------------------------------------
def init_db() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS portfolio_prices (
                date            TEXT NOT NULL,
                portfolio_name  TEXT NOT NULL,
                nav             REAL NOT NULL,
                PRIMARY KEY (date, portfolio_name)
            )
        """)
        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_pp_date ON portfolio_prices(date)"
        )
        conn.commit()
    logger.info("portfolio_prices table ready")


def _db_upsert(rows: list) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO portfolio_prices (date, portfolio_name, nav) VALUES (?, ?, ?)",
            rows,
        )
        conn.commit()


def _db_read_pivot() -> pd.DataFrame:
    with sqlite3.connect(DB_PATH) as conn:
        df = pd.read_sql(
            "SELECT date, portfolio_name, nav FROM portfolio_prices "
            "WHERE date >= ? ORDER BY date",
            conn,
            params=(START_DATE,),
        )
    if df.empty:
        return pd.DataFrame()
    pivot = df.pivot(index="date", columns="portfolio_name", values="nav")
    pivot.columns.name = None
    pivot.index = pd.to_datetime(pivot.index)
    return pivot


def _db_latest_date() -> str | None:
    with sqlite3.connect(DB_PATH) as conn:
        row = conn.execute("SELECT MAX(date) FROM portfolio_prices").fetchone()
    return row[0] if row and row[0] else None


# ---------------------------------------------------------------------------
# Database: ff5_daily + ff5_regressions
# ---------------------------------------------------------------------------
def init_ff5_tables() -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ff5_daily (
                date   TEXT PRIMARY KEY,
                mkt_rf REAL,
                smb    REAL,
                hml    REAL,
                rmw    REAL,
                cma    REAL,
                rf     REAL
            )
        """)
        conn.execute("""
            CREATE TABLE IF NOT EXISTS ff5_regressions (
                portfolio_name TEXT PRIMARY KEY,
                alpha          REAL,
                beta_mkt       REAL,
                beta_smb       REAL,
                beta_hml       REAL,
                beta_rmw       REAL,
                beta_cma       REAL,
                r_squared      REAL,
                n_obs          INTEGER,
                computed_at    TEXT
            )
        """)
        conn.commit()
    logger.info("ff5_daily and ff5_regressions tables ready")


def _ff5_row_count() -> int:
    with sqlite3.connect(DB_PATH) as conn:
        return conn.execute("SELECT COUNT(*) FROM ff5_daily").fetchone()[0]


def _upsert_ff5(rows: list) -> None:
    with sqlite3.connect(DB_PATH) as conn:
        conn.executemany(
            "INSERT OR REPLACE INTO ff5_daily (date, mkt_rf, smb, hml, rmw, cma, rf) "
            "VALUES (?, ?, ?, ?, ?, ?, ?)",
            rows,
        )
        conn.commit()


# ---------------------------------------------------------------------------
# FF5 download & parse
# ---------------------------------------------------------------------------
def _download_and_parse_ff5() -> list:
    """
    Download Ken French's FF5 daily zip, extract the CSV, and return a list
    of (date_str, mkt_rf, smb, hml, rmw, cma, rf) tuples.
    Values are kept in percent (as published by French).
    """
    logger.info("Downloading FF5 zip from Ken French library …")
    resp = requests.get(FF5_URL, timeout=60)
    resp.raise_for_status()

    zf = zipfile.ZipFile(io.BytesIO(resp.content))
    csv_name = next(
        (n for n in zf.namelist() if n.upper().endswith(".CSV")),
        zf.namelist()[0],
    )
    csv_text = zf.read(csv_name).decode("latin-1")

    rows = []
    for line in csv_text.splitlines():
        parts = [p.strip() for p in line.split(",")]
        if len(parts) < 7:
            continue
        # Data rows start with an 8-digit date YYYYMMDD
        if not (len(parts[0]) == 8 and parts[0].isdigit()):
            continue
        try:
            d = parts[0]
            date_str = f"{d[:4]}-{d[4:6]}-{d[6:]}"
            mkt_rf, smb, hml, rmw, cma, rf = [float(p) for p in parts[1:7]]
            rows.append((date_str, mkt_rf, smb, hml, rmw, cma, rf))
        except (ValueError, IndexError):
            continue

    logger.info("Parsed %d FF5 daily rows (latest: %s)", len(rows), rows[-1][0] if rows else "—")
    return rows


# ---------------------------------------------------------------------------
# OLS regressions
# ---------------------------------------------------------------------------
def _run_ff5_regressions() -> dict:
    """
    For each portfolio, regress daily excess returns on the FF5 factors.
    Results are stored in ff5_regressions and returned as a dict.
    """
    if not _STATSMODELS_OK:
        return {"ok": False, "error": "statsmodels not installed (pip install statsmodels)"}

    from datetime import datetime as _dt

    # --- Compute historical NAV over FF5 lookback period (independent of START_DATE) ---
    # We fetch directly from yfinance rather than reading the live DB so that
    # regressions always have FF5-era coverage even when START_DATE > FF5 last date.
    try:
        nav_df = _compute_nav_dataframe(FF5_LOOKBACK_DATE)
    except Exception as exc:
        return {"ok": False, "error": f"Could not compute historical NAV for regression: {exc}"}

    if nav_df.empty:
        return {"ok": False, "error": "Historical NAV empty – check yfinance connectivity"}

    # Daily returns (drop row 0 which is always 0 by construction)
    ret_df = nav_df.pct_change().iloc[1:]
    ret_df = ret_df.replace([np.inf, -np.inf], np.nan)

    # --- Load FF5 data from DB ---
    with sqlite3.connect(DB_PATH) as conn:
        ff5_raw = pd.read_sql(
            "SELECT date, mkt_rf, smb, hml, rmw, cma, rf FROM ff5_daily ORDER BY date",
            conn,
        )

    if ff5_raw.empty:
        return {"ok": False, "error": "No FF5 data in DB – run /api/ff5/sync first"}

    ff5 = ff5_raw.copy()
    ff5.index = pd.to_datetime(ff5["date"])
    ff5 = ff5.drop(columns=["date"])
    ff5 = ff5 / 100.0  # percent → decimal

    # --- Align on common trading days ---
    common_idx = ret_df.index.intersection(ff5.index)
    n_common = len(common_idx)

    if n_common < 20:
        msg = (
            f"Only {n_common} overlapping trading days between portfolio NAV data "
            f"({str(ret_df.index[0].date())} – {str(ret_df.index[-1].date())}) "
            f"and FF5 data ({str(ff5.index[0].date())} – {str(ff5.index[-1].date())}). "
            "Need at least 20. This is expected when START_DATE is more recent than the "
            "Ken French data release; regressions will run automatically once data aligns."
        )
        logger.warning(msg)
        return {"ok": False, "error": msg, "n_common": n_common}

    ret_aligned = ret_df.loc[common_idx]
    ff5_aligned = ff5.loc[common_idx]

    X = ff5_aligned[["mkt_rf", "smb", "hml", "rmw", "cma"]]
    X_const = sm.add_constant(X, has_constant="add")

    computed_at = _dt.utcnow().isoformat()
    results: dict = {}
    db_rows: list = []

    for pname in ret_aligned.columns:
        y_raw = ret_aligned[pname] - ff5_aligned["rf"]
        y = y_raw.dropna()
        if len(y) < 20:
            logger.warning("Skipping %s: only %d obs after dropna", pname, len(y))
            continue
        X_fit = X_const.loc[y.index]
        try:
            fit = sm.OLS(y, X_fit).fit()
            alpha = float(fit.params["const"])
            beta_mkt = float(fit.params["mkt_rf"])
            beta_smb = float(fit.params["smb"])
            beta_hml = float(fit.params["hml"])
            beta_rmw = float(fit.params["rmw"])
            beta_cma = float(fit.params["cma"])
            r2 = float(fit.rsquared)
            n_obs = int(fit.nobs)
            results[pname] = {
                "alpha": alpha, "beta_mkt": beta_mkt, "beta_smb": beta_smb,
                "beta_hml": beta_hml, "beta_rmw": beta_rmw, "beta_cma": beta_cma,
                "r_squared": r2,
            }
            db_rows.append((
                pname, alpha, beta_mkt, beta_smb, beta_hml, beta_rmw, beta_cma,
                r2, n_obs, computed_at,
            ))
        except Exception as exc:
            logger.warning("OLS failed for %s: %s", pname, exc)

    if db_rows:
        current_names = list(PORTFOLIOS.keys())
        placeholders = ",".join("?" * len(current_names))
        with sqlite3.connect(DB_PATH) as conn:
            conn.executemany(
                """INSERT OR REPLACE INTO ff5_regressions
                   (portfolio_name, alpha, beta_mkt, beta_smb, beta_hml,
                    beta_rmw, beta_cma, r_squared, n_obs, computed_at)
                   VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)""",
                db_rows,
            )
            # Remove stale rows from renamed/removed portfolios
            conn.execute(
                f"DELETE FROM ff5_regressions WHERE portfolio_name NOT IN ({placeholders})",
                current_names,
            )
            conn.commit()

    date_range = f"{str(common_idx[0].date())} to {str(common_idx[-1].date())}"
    logger.info(
        "Regressions done: %d portfolios, %d common obs (%s)",
        len(db_rows), n_common, date_range,
    )
    return {
        "ok": True,
        "portfolios_computed": len(db_rows),
        "n_obs": n_common,
        "date_range": date_range,
    }


# ---------------------------------------------------------------------------
# Sync functions
# ---------------------------------------------------------------------------
def sync_from_yfinance() -> dict:
    global _sync_status
    logger.info("sync_from_yfinance: fetching from %s", START_DATE)
    try:
        cum = _compute_nav_dataframe(START_DATE)
        rows = [
            (dt.strftime("%Y-%m-%d"), pname, round(float(nav), 6))
            for pname in cum.columns
            for dt, nav in cum[pname].items()
        ]
        _db_upsert(rows)
        _series_cache["ts"] = 0.0
        status = {
            "ok": True, "rows_upserted": len(rows),
            "latest_date": cum.index[-1].strftime("%Y-%m-%d"),
            "error": None, "ts": time.time(),
        }
        logger.info("sync_from_yfinance: done – %d rows", len(rows))
    except Exception as exc:
        logger.exception("sync_from_yfinance failed")
        status = {
            "ok": False, "rows_upserted": 0,
            "latest_date": _db_latest_date(),
            "error": str(exc), "ts": time.time(),
        }
    _sync_status = status
    return status


def sync_ff5() -> dict:
    """Download FF5 data, upsert, then re-run OLS regressions."""
    global _ff5_sync_status
    try:
        rows = _download_and_parse_ff5()
        _upsert_ff5(rows)
        reg = _run_ff5_regressions()
        status = {
            "ok": True,
            "ff5_rows": len(rows),
            "reg_portfolios": reg.get("portfolios_computed", 0),
            "reg_n_obs": reg.get("n_obs", 0),
            "reg_date_range": reg.get("date_range"),
            "reg_error": None if reg.get("ok") else reg.get("error"),
            "error": None, "ts": time.time(),
        }
        logger.info("sync_ff5: done – %d FF5 rows, %d regressions", len(rows), status["reg_portfolios"])
    except Exception as exc:
        logger.exception("sync_ff5 failed")
        status = {"ok": False, "ff5_rows": 0, "reg_portfolios": 0, "error": str(exc), "ts": time.time()}
    _ff5_sync_status = status
    return status


# ---------------------------------------------------------------------------
# yfinance NAV computation (unchanged logic)
# ---------------------------------------------------------------------------
def _compute_nav_dataframe(start: str) -> pd.DataFrame:
    all_original = sorted(
        {t for p in PORTFOLIOS.values() for t in p.keys() if t.upper() != "CASH"}
    )
    orig_to_yahoo = {t: yahoo_ticker(t) for t in all_original}
    yahoo_tickers = sorted(set(orig_to_yahoo.values()))

    def _download(threads: bool):
        return yf.download(
            tickers=" ".join(yahoo_tickers),
            start=start, auto_adjust=True,
            progress=False, group_by="ticker", threads=threads,
        )

    raw = _download(threads=True)
    if raw is None or getattr(raw, "empty", True):
        raw = _download(threads=False)
    if raw is None or raw.empty:
        raise RuntimeError(f"yfinance returned no data. start={start} tickers={len(yahoo_tickers)}")

    close = pd.DataFrame(index=raw.index)
    if isinstance(raw.columns, pd.MultiIndex):
        available = set(raw.columns.get_level_values(0))
        for yt in yahoo_tickers:
            if yt in available and "Close" in raw[yt].columns:
                close[yt] = raw[yt]["Close"]
    else:
        if "Close" in raw.columns and len(yahoo_tickers) == 1:
            close[yahoo_tickers[0]] = raw["Close"]
        else:
            raise RuntimeError(f"Unexpected yfinance columns: {list(raw.columns)[:20]}")

    close = close.dropna(axis=1, how="all").sort_index().ffill()
    if close.empty:
        raise RuntimeError("Close prices empty after filtering.")

    returns = close.pct_change().replace([np.inf, -np.inf], np.nan)
    if len(returns.index) > 0:
        returns.iloc[0] = 0.0
    returns = returns.fillna(0.0)

    cum = pd.DataFrame(index=returns.index)
    for pname, weights in PORTFOLIOS.items():
        w = pd.Series(weights, dtype=float)
        orig_holdings = [t for t in w.index if t.upper() != "CASH"]
        contrib = pd.Series(0.0, index=returns.index)
        for ot in orig_holdings:
            wt = float(w.get(ot, 0.0))
            if wt == 0.0:
                continue
            yt = orig_to_yahoo.get(ot, yahoo_ticker(ot))
            if yt in returns.columns:
                contrib = contrib + (wt * returns[yt])
        cum[pname] = INITIAL_CAPITAL * (1.0 + contrib).cumprod()

    if cum.empty:
        raise RuntimeError("No portfolios computed.")
    return cum


# ---------------------------------------------------------------------------
# Payload builder (reads from DB)
# ---------------------------------------------------------------------------
def _build_payload_from_db() -> dict:
    cum = _db_read_pivot()
    if cum.empty:
        raise RuntimeError("Database is empty — call GET /api/sync to populate it.")

    labels = [d.strftime("%Y-%m-%d") for d in cum.index]
    series = {
        col: [sanitize_for_json(x) for x in cum[col].round(6).tolist()]
        for col in cum.columns
    }
    stats = _compute_stats(cum)
    holdings = {}
    for pname, weights in PORTFOLIOS.items():
        items = sorted(
            [{"ticker": t, "weight": float(w), "weight_pct": float(w) * 100.0,
              "dollars": float(w) * INITIAL_CAPITAL} for t, w in weights.items()],
            key=lambda x: x["weight"], reverse=True,
        )
        holdings[pname] = items

    return sanitize_for_json({
        "labels": labels, "series": series, "stats": stats,
        "holdings": holdings, "start_date": START_DATE,
    })


# ---------------------------------------------------------------------------
# Outlook loader
# ---------------------------------------------------------------------------
def load_outlook():
    if not OUTLOOK_PATH.exists():
        raise RuntimeError(f"outlook.json not found at {OUTLOOK_PATH}")
    with open(OUTLOOK_PATH, "r", encoding="utf-8") as f:
        return sanitize_for_json(json.load(f))


# ---------------------------------------------------------------------------
# Lifespan
# ---------------------------------------------------------------------------
scheduler = AsyncIOScheduler(timezone="UTC")


@asynccontextmanager
async def lifespan(app: FastAPI):
    # 1. Schema
    init_db()
    init_ff5_tables()

    # 2. Backfill portfolio NAV
    logger.info("Startup: running portfolio sync …")
    await asyncio.to_thread(sync_from_yfinance)

    # 3. FF5: download on first run, otherwise just re-run regressions
    if _ff5_row_count() == 0:
        logger.info("Startup: FF5 table empty, downloading …")
        try:
            await asyncio.to_thread(sync_ff5)
        except Exception as exc:
            logger.error("Startup FF5 download failed: %s", exc)
    else:
        logger.info("Startup: FF5 data present, running regressions …")
        await asyncio.to_thread(_run_ff5_regressions)

    # 4. Daily jobs
    scheduler.add_job(
        sync_from_yfinance,
        CronTrigger(hour=22, minute=0, day_of_week="mon-fri"),
        id="daily_nav_sync", replace_existing=True, misfire_grace_time=3600,
    )
    scheduler.add_job(
        sync_ff5,
        CronTrigger(hour=22, minute=30, day_of_week="mon-fri"),
        id="daily_ff5_sync", replace_existing=True, misfire_grace_time=3600,
    )
    scheduler.start()
    logger.info("APScheduler started (nav@22:00 UTC, ff5@22:30 UTC, weekdays)")

    yield

    scheduler.shutdown(wait=False)
    logger.info("APScheduler stopped")


# ---------------------------------------------------------------------------
# App
# ---------------------------------------------------------------------------
app = FastAPI(lifespan=lifespan)

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# ---------------------------------------------------------------------------
# Endpoints
# ---------------------------------------------------------------------------
@app.get("/api/health")
def health():
    return {
        "ok": True,
        "db_path": str(DB_PATH),
        "db_latest_date": _db_latest_date(),
        "last_nav_sync": {
            "ok": _sync_status.get("ok"),
            "rows_upserted": _sync_status.get("rows_upserted"),
            "latest_date": _sync_status.get("latest_date"),
            "error": _sync_status.get("error"),
        },
        "last_ff5_sync": {
            "ok": _ff5_sync_status.get("ok"),
            "ff5_rows": _ff5_sync_status.get("ff5_rows"),
            "reg_portfolios": _ff5_sync_status.get("reg_portfolios"),
            "error": _ff5_sync_status.get("error"),
        },
        "statsmodels_available": _STATSMODELS_OK,
        "series_cache_age_s": round(time.time() - _series_cache["ts"], 1) if _series_cache["payload"] else None,
        "outlook_cached": _outlook_cache["payload"] is not None,
    }


@app.get("/api/outlook")
def outlook():
    now = time.time()
    if _outlook_cache["payload"] is not None and (
        now - _outlook_cache["ts"] < OUTLOOK_CACHE_SECONDS
    ):
        return _outlook_cache["payload"]
    try:
        payload = load_outlook()
        _outlook_cache.update({"payload": payload, "ts": now, "last_error": None})
        return payload
    except Exception as e:
        _outlook_cache["last_error"] = str(e)
        if _outlook_cache["payload"] is not None:
            return _outlook_cache["payload"]
        raise


@app.get("/api/portfolio-series")
def portfolio_series():
    now = time.time()
    if _series_cache["payload"] is not None and (
        now - _series_cache["ts"] < SERIES_CACHE_SECONDS
    ):
        return _series_cache["payload"]
    payload = _build_payload_from_db()
    _series_cache.update({"payload": payload, "ts": now})
    return payload


@app.get("/api/sync")
def manual_sync():
    """Manually trigger a full yfinance → DB sync then re-run FF5 regressions."""
    status = sync_from_yfinance()
    # Re-run regressions since NAV data changed
    reg = _run_ff5_regressions()
    return {"nav_sync": status, "regression": reg}


@app.get("/api/ff5/sync")
def ff5_sync():
    """Re-download Ken French FF5 data, upsert, and re-run OLS regressions."""
    return sync_ff5()


@app.get("/api/ff5/loadings")
def ff5_loadings():
    """
    Return Fama-French 5-factor OLS loadings for every portfolio.
    Returns {} if regressions haven't been run yet (insufficient overlapping data).
    """
    with sqlite3.connect(DB_PATH) as conn:
        df = pd.read_sql(
            "SELECT portfolio_name, alpha, beta_mkt, beta_smb, beta_hml, "
            "beta_rmw, beta_cma, r_squared FROM ff5_regressions",
            conn,
        )
    if df.empty:
        return {}
    result = {
        row["portfolio_name"]: {
            "alpha": float(row["alpha"]),
            "beta_mkt": float(row["beta_mkt"]),
            "beta_smb": float(row["beta_smb"]),
            "beta_hml": float(row["beta_hml"]),
            "beta_rmw": float(row["beta_rmw"]),
            "beta_cma": float(row["beta_cma"]),
            "r_squared": float(row["r_squared"]),
        }
        for _, row in df.iterrows()
    }
    return sanitize_for_json(result)
