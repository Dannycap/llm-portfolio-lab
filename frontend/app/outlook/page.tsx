"use client";

import React, { useMemo, useState } from "react";
import {
  RadarChart,
  Radar,
  PolarGrid,
  PolarAngleAxis,
  PolarRadiusAxis,
  ResponsiveContainer,
  Tooltip,
} from "recharts";

type RadarScores = Record<string, number>;

export type OutlookRadarModel = {
  id: string;          // stable key (name slug)
  label: string;       // display name
  provider?: string;   // optional
  scores: RadarScores; // axis -> 0..100
};

type Props = {
  title?: string;
  subtitle?: string;
  asOf?: string;
  models: OutlookRadarModel[];
  axes: string[]; // order matters
  min?: number;
  max?: number;
};

// deterministic distinct-ish colors
function hashColor(input: string) {
  let h = 0;
  for (let i = 0; i < input.length; i++) h = (h << 5) - h + input.charCodeAt(i);
  h = Math.abs(h);
  const hue = h % 360;
  return `hsl(${hue} 80% 60%)`;
}

function buildChartData(axes: string[], activeIds: string[], modelMap: Record<string, OutlookRadarModel>) {
  return axes.map((axis) => {
    const row: any = { axis };
    for (const id of activeIds) {
      row[id] = modelMap[id]?.scores?.[axis] ?? 0;
    }
    return row;
  });
}

function CustomTooltip({
  active,
  payload,
  label,
  modelMap,
}: any) {
  if (!active || !payload?.length) return null;

  return (
    <div
      style={{
        background: "#0f0f12",
        border: "1px solid #2a2a35",
        borderRadius: 8,
        padding: "10px 12px",
        fontSize: 12,
        color: "#e8e8f0",
        minWidth: 200,
        boxShadow: "0 12px 30px rgba(0,0,0,0.45)",
      }}
    >
      <div style={{ color: "#9aa0aa", fontSize: 10, letterSpacing: "0.12em", textTransform: "uppercase", marginBottom: 6 }}>
        {label}
      </div>
      {payload.map((p: any) => {
        const m = modelMap[p.dataKey];
        if (!m) return null;
        return (
          <div key={p.dataKey} style={{ display: "flex", justifyContent: "space-between", gap: 10, marginBottom: 6 }}>
            <span style={{ color: hashColor(m.id), fontWeight: 600 }}>{m.label}</span>
            <span>
              {Math.round(p.value)}
              <span style={{ color: "#6b7280", fontSize: 10 }}>/100</span>
            </span>
          </div>
        );
      })}
    </div>
  );
}

export default function OutlookRadar({
  title = "Model Worldview Radar",
  subtitle = "0 = low/defensive · 100 = high/aggressive",
  asOf,
  models,
  axes,
  min = 0,
  max = 100,
}: Props) {
  const modelMap = useMemo(() => {
    const m: Record<string, OutlookRadarModel> = {};
    for (const x of models) m[x.id] = x;
    return m;
  }, [models]);

  const [active, setActive] = useState<string[]>(() => models.slice(0, Math.min(3, models.length)).map((m) => m.id));
  const [hovered, setHovered] = useState<string | null>(null);
  const [animKey, setAnimKey] = useState(0);

  const chartData = useMemo(() => buildChartData(axes, active, modelMap), [axes, active, modelMap]);

  function toggleModel(id: string) {
    setActive((prev) => {
      if (prev.includes(id)) {
        if (prev.length === 1) return prev;
        return prev.filter((x) => x !== id);
      }
      return [...prev, id];
    });
    setAnimKey((k) => k + 1);
  }

  return (
    <div
      style={{
        background: "#0b0b10",
        border: "1px solid #171722",
        borderRadius: 12,
        padding: 16,
      }}
    >
      <div style={{ display: "flex", justifyContent: "space-between", gap: 12, flexWrap: "wrap", marginBottom: 10 }}>
        <div>
          <div style={{ fontSize: 14, fontWeight: 700, color: "#e5e7eb" }}>{title}</div>
          <div style={{ fontSize: 12, color: "#6b7280", marginTop: 4 }}>{subtitle}</div>
        </div>
        {asOf ? (
          <div style={{ fontSize: 12, color: "#6b7280" }}>
            as of <span style={{ color: "#9ca3af" }}>{asOf}</span>
          </div>
        ) : null}
      </div>

      {/* toggles */}
      <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center", marginBottom: 12 }}>
        {models.map((m) => {
          const on = active.includes(m.id);
          const c = hashColor(m.id);
          return (
            <button
              key={m.id}
              onClick={() => toggleModel(m.id)}
              onMouseEnter={() => setHovered(m.id)}
              onMouseLeave={() => setHovered(null)}
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "7px 10px",
                borderRadius: 10,
                border: `1px solid ${on ? c : "#222230"}`,
                background: on ? "rgba(255,255,255,0.04)" : "transparent",
                cursor: "pointer",
                opacity: on ? 1 : 0.55,
              }}
            >
              <span style={{ width: 10, height: 10, borderRadius: 4, background: on ? c : "#3f3f4a" }} />
              <span style={{ fontSize: 12, color: on ? "#e5e7eb" : "#9ca3af" }}>{m.label}</span>
              {m.provider ? <span style={{ fontSize: 10, color: "#6b7280" }}>{m.provider}</span> : null}
            </button>
          );
        })}
        <div style={{ marginLeft: "auto", fontSize: 11, color: "#6b7280" }}>
          click to toggle · hover highlights
        </div>
      </div>

      {/* radar */}
      <div style={{ position: "relative" }}>
        <ResponsiveContainer width="100%" height={420}>
          <RadarChart key={animKey} data={chartData} margin={{ top: 16, right: 36, bottom: 16, left: 36 }}>
            <PolarGrid gridType="polygon" stroke="#1f2430" />
            <PolarAngleAxis dataKey="axis" tick={{ fill: "#9ca3af", fontSize: 11 }} />
            <PolarRadiusAxis
              angle={90}
              domain={[min, max]}
              tickCount={6}
              tick={{ fill: "#6b7280", fontSize: 10 }}
              stroke="#1f2430"
              tickFormatter={(v) => (v === 0 ? "" : v)}
            />

            {active.map((id) => {
              const m = modelMap[id];
              const c = hashColor(id);
              const isHover = hovered === id;
              return (
                <Radar
                  key={id}
                  name={m.label}
                  dataKey={id}
                  stroke={c}
                  fill={c}
                  fillOpacity={isHover ? 0.22 : 0.10}
                  strokeWidth={isHover ? 2.6 : 1.8}
                  dot={{ r: 3.8, fill: c, strokeWidth: 0, opacity: 0.9 }}
                  activeDot={{ r: 6, fill: c, stroke: "#0b0b10", strokeWidth: 2 }}
                  animationDuration={550}
                />
              );
            })}

            <Tooltip content={<CustomTooltip modelMap={modelMap} />} />
          </RadarChart>
        </ResponsiveContainer>

        <div
          style={{
            position: "absolute",
            top: "50%",
            left: "50%",
            transform: "translate(-50%,-50%)",
            fontSize: 10,
            color: "#1f2430",
            letterSpacing: "0.14em",
            textTransform: "uppercase",
            pointerEvents: "none",
            textAlign: "center",
            lineHeight: 1.6,
          }}
        >
          LLM<br />Portfolio<br />Lab
        </div>
      </div>
    </div>
  );
}
