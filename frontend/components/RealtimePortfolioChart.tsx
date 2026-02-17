"use client";

import { useEffect, useMemo, useRef, useState } from "react";

type Payload = {
  labels?: string[];
  series?: Record<string, number[]>; // could be NAV ($100 base) OR 1.0-index
  start_date?: string;
};

function clamp(x: number, a: number, b: number) {
  return Math.max(a, Math.min(b, x));
}

function isFiniteNumber(x: unknown): x is number {
  return typeof x === "number" && Number.isFinite(x);
}

function fmtMoney(x: number) {
  if (!isFiniteNumber(x)) return "—";
  return `$${x.toFixed(2)}`;
}

// ✅ Unique, deterministic colors: no duplicates across series
function buildColorMap(names: string[]) {
  // Sort to keep colors stable (don’t reshuffle when legend order changes)
  const ordered = [...names].sort((a, b) => a.localeCompare(b));
  const GOLDEN_ANGLE = 137.508;

  const map: Record<string, string> = {};
  for (let i = 0; i < ordered.length; i++) {
    const name = ordered[i];

    // Unique hue per index (no repeats for different i)
    const hue = (i * GOLDEN_ANGLE) % 360;

    // Small lightness banding so large lists stay visually distinct
    const band = Math.floor(i / 12);
    const light = 60 - (band % 3) * 6; // 60, 54, 48...

    // Keep decimals so string values don’t collide due to rounding
    map[name] = `hsl(${hue.toFixed(3)} 70% ${light}%)`;
  }
  return map;
}

export default function RealtimePortfolioChart() {
  const [data, setData] = useState<Payload | null>(null);
  const [err, setErr] = useState<string | null>(null);
  const [hoverX, setHoverX] = useState<number | null>(null);
  const wrapRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    let mounted = true;

    const fetchSeries = async () => {
      try {
        const res = await fetch("/api/portfolio-series", { cache: "no-store" });
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        const json = (await res.json()) as Payload;
        if (!mounted) return;
        setData(json);
        setErr(null);
      } catch (e: any) {
        if (!mounted) return;
        setErr(String(e?.message ?? e));
      }
    };

    fetchSeries();
    const interval = setInterval(fetchSeries, 15000);
    return () => {
      mounted = false;
      clearInterval(interval);
    };
  }, []);

  const { labels, series, names, minY, maxY, legendItems, colorMap } = useMemo(() => {
    const labels = data?.labels ?? [];
    const rawSeries = data?.series ?? {};
    const names = Object.keys(rawSeries);

    // Detect if data looks like 1.0-index (values around ~1.00 to ~1.05)
    // If so, convert to NAV ($100 base) by multiplying by 100.
    let looksIndexed = false;
    const sampleVals: number[] = [];
    for (const n of names) {
      const arr = rawSeries[n] ?? [];
      if (arr.length) {
        const v0 = arr[0];
        if (isFiniteNumber(v0)) sampleVals.push(v0);
      }
    }
    if (sampleVals.length) {
      const avg0 = sampleVals.reduce((a, b) => a + b, 0) / sampleVals.length;
      looksIndexed = avg0 > 0.2 && avg0 < 5;
    }

    const series: Record<string, number[]> = {};
    for (const n of names) {
      const arr = rawSeries[n] ?? [];
      series[n] = looksIndexed
        ? arr.map((v) => (isFiniteNumber(v) ? v * 100 : v))
        : arr;
    }

    let minY = Number.POSITIVE_INFINITY;
    let maxY = Number.NEGATIVE_INFINITY;

    for (const n of names) {
      const arr = series[n] ?? [];
      for (const v of arr) {
        if (!isFiniteNumber(v)) continue;
        minY = Math.min(minY, v);
        maxY = Math.max(maxY, v);
      }
    }

    if (!Number.isFinite(minY) || !Number.isFinite(maxY) || minY === maxY) {
      minY = 90;
      maxY = 110;
    }

    const pad = (maxY - minY) * 0.08;
    const minYPadded = minY - pad;
    const maxYPadded = maxY + pad;

    // Legend: sorted by last value descending
    const legendItems = names
      .map((n) => ({ name: n, last: (series[n] ?? [])[labels.length - 1] }))
      .filter((x) => isFiniteNumber(x.last))
      .sort((a, b) => (b.last as number) - (a.last as number));

    const colorMap = buildColorMap(names);

    return {
      labels,
      series,
      names,
      minY: minYPadded,
      maxY: maxYPadded,
      legendItems,
      colorMap,
    };
  }, [data]);

  const W = 1000;
  const H = 420;
  const padL = 70;
  const padR = 18;
  const padT = 18;
  const padB = 36;

  const plotW = W - padL - padR;
  const plotH = H - padT - padB;

  const nPts = labels.length;

  const xAt = (i: number) => (nPts <= 1 ? padL : padL + (i / (nPts - 1)) * plotW);
  const yAt = (v: number) => {
    const t = (v - minY) / (maxY - minY);
    return padT + (1 - t) * plotH;
  };

  const hoverIndex = useMemo(() => {
    if (hoverX == null || nPts <= 1) return null;
    const i = Math.round(((hoverX - padL) / plotW) * (nPts - 1));
    return clamp(i, 0, nPts - 1);
  }, [hoverX, nPts, plotW]);

  const hoverLabel = hoverIndex != null ? labels[hoverIndex] : null;

  return (
    <div>
      {err ? (
        <div className="pill" style={{ marginBottom: 12 }}>
          Chart error: {err}
        </div>
      ) : null}

      {/* Removed scale toggle ($100 / 1.0 buttons) — always NAV $100 base */}
      <div
        className="chart-canvas"
        ref={wrapRef}
        style={{ position: "relative" }}
        onMouseLeave={() => setHoverX(null)}
        onMouseMove={(e) => {
          const rect = (e.currentTarget as HTMLDivElement).getBoundingClientRect();
          const px = ((e.clientX - rect.left) / rect.width) * W;
          setHoverX(clamp(px, padL, W - padR));
        }}
      >
        <svg viewBox={`0 0 ${W} ${H}`} width="100%" height="auto" style={{ display: "block" }}>
          {/* Grid */}
          {Array.from({ length: 5 }).map((_, k) => {
            const y = padT + (k / 4) * plotH;
            return (
              <line
                key={k}
                x1={padL}
                x2={W - padR}
                y1={y}
                y2={y}
                stroke="rgba(255,255,255,0.08)"
                strokeWidth={1}
              />
            );
          })}

          {/* Y axis labels ($) */}
          {Array.from({ length: 5 }).map((_, k) => {
            const v = minY + ((4 - k) / 4) * (maxY - minY);
            const y = padT + (k / 4) * plotH;
            return (
              <text
                key={k}
                x={padL - 10}
                y={y + 4}
                textAnchor="end"
                fontSize={12}
                fill="rgba(255,255,255,0.55)"
              >
                {fmtMoney(v)}
              </text>
            );
          })}

          {/* Lines */}
          {names.map((name, idx) => {
            const arr = series[name] ?? [];
            if (arr.length < 2) return null;

            const stroke = colorMap[name] ?? "hsl(0 0% 80%)";

            let d = "";
            for (let i = 0; i < arr.length; i++) {
              const v = arr[i];
              if (!isFiniteNumber(v)) continue;
              const x = xAt(i);
              const y = yAt(v);
              d += (d ? " L " : "M ") + `${x} ${y}`;
            }

            return (
              <path
                key={name}
                d={d}
                fill="none"
                stroke={stroke}
                strokeWidth={2}
                opacity={idx < 10 ? 0.95 : 0.55}
              />
            );
          })}

          {/* Hover vertical line */}
          {hoverIndex != null ? (
            <line
              x1={xAt(hoverIndex)}
              x2={xAt(hoverIndex)}
              y1={padT}
              y2={padT + plotH}
              stroke="rgba(255,255,255,0.25)"
              strokeWidth={1}
            />
          ) : null}

          {/* X labels */}
          {nPts >= 2 ? (
            <>
              <text x={padL} y={H - 12} fontSize={12} fill="rgba(255,255,255,0.55)">
                {labels[0]}
              </text>
              <text
                x={padL + plotW / 2}
                y={H - 12}
                textAnchor="middle"
                fontSize={12}
                fill="rgba(255,255,255,0.55)"
              >
                {labels[Math.floor((nPts - 1) / 2)]}
              </text>
              <text
                x={W - padR}
                y={H - 12}
                textAnchor="end"
                fontSize={12}
                fill="rgba(255,255,255,0.55)"
              >
                {labels[nPts - 1]}
              </text>
            </>
          ) : null}
        </svg>

        {/* Hover tooltip */}
        {hoverIndex != null && hoverLabel ? (
          <div
            style={{
              position: "absolute",
              left: `${((xAt(hoverIndex) - padL) / plotW) * 100}%`,
              top: 10,
              transform: "translateX(-50%)",
              pointerEvents: "none",
              minWidth: 240,
              background: "rgba(10,12,16,0.92)",
              border: "1px solid rgba(255,255,255,0.18)",
              borderRadius: 14,
              padding: 10,
              boxShadow: "0 10px 30px rgba(0,0,0,0.35)",
            }}
          >
            <div style={{ fontWeight: 800, marginBottom: 6, fontSize: 12, color: "rgba(255,255,255,0.85)" }}>
              {hoverLabel}
            </div>

            <div style={{ display: "grid", gap: 6, maxHeight: 200, overflow: "auto" }}>
              {legendItems.slice(0, 16).map((it) => {
                const v = (series[it.name] ?? [])[hoverIndex];
                if (!isFiniteNumber(v)) return null;
                return (
                  <div key={it.name} style={{ display: "flex", justifyContent: "space-between", gap: 10, fontSize: 12 }}>
                    <span style={{ color: "rgba(255,255,255,0.75)" }}>{it.name}</span>
                    <span style={{ fontVariantNumeric: "tabular-nums", color: "rgba(255,255,255,0.9)" }}>
                      {fmtMoney(v)}
                    </span>
                  </div>
                );
              })}
            </div>
          </div>
        ) : null}
      </div>

      {/* ✅ Improved legend: color-dot + name chips, sorted by performance */}
      <div
        style={{
          marginTop: 14,
          display: "flex",
          flexWrap: "wrap",
          gap: 6,
        }}
      >
        {legendItems.map((it) => {
          const color = colorMap[it.name] ?? "hsl(0 0% 80%)";
          const pct = isFiniteNumber(it.last) ? ((it.last - 100) / 100) * 100 : null;
          const isPositive = pct != null && pct >= 0;

          return (
            <div
              key={it.name}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 6,
                padding: "4px 10px 4px 8px",
                borderRadius: 20,
                background: "rgba(255,255,255,0.055)",
                border: "1px solid rgba(255,255,255,0.09)",
                fontSize: 12,
                lineHeight: 1,
                color: "rgba(255,255,255,0.82)",
                whiteSpace: "nowrap",
              }}
            >
              {/* Color dot */}
              <span
                style={{
                  width: 8,
                  height: 8,
                  borderRadius: "50%",
                  background: color,
                  flexShrink: 0,
                  boxShadow: `0 0 6px ${color}88`,
                }}
              />
              {/* Name */}
              <span>{it.name}</span>
              {/* Return badge */}
              {pct != null && (
                <span
                  style={{
                    marginLeft: 2,
                    fontSize: 11,
                    fontVariantNumeric: "tabular-nums",
                    color: isPositive ? "#4ade80" : "#f87171",
                    fontWeight: 600,
                  }}
                >
                  {isPositive ? "+" : ""}
                  {pct.toFixed(2)}%
                </span>
              )}
            </div>
          );
        })}
      </div>

      <div className="muted" style={{ fontSize: 12, marginTop: 8 }}>
        Hover to inspect values • NAV shown in dollars (base $100) • sorted by return
      </div>
    </div>
  );
}
