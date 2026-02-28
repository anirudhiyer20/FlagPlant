"use client";

import { useMemo, useState } from "react";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";

export type PlayerPriceHistoryPoint = {
  snap_date: string;
  close_price: number;
  day_change: number;
  day_change_pct: number;
};

type RangeKey = "7d" | "30d" | "all";

type PlayerPriceHistoryChartProps = {
  points: PlayerPriceHistoryPoint[];
};

function formatSigned(value: number): string {
  if (value > 0) return `+${formatFlagAmount(value)}`;
  if (value < 0) return `-${formatFlagAmount(Math.abs(value))}`;
  return formatFlagAmount(0);
}

function formatSignedPct(value: number): string {
  if (value > 0) return `+${formatTwoDecimals(value)}%`;
  if (value < 0) return `-${formatTwoDecimals(Math.abs(value))}%`;
  return "0.00%";
}

export default function PlayerPriceHistoryChart({ points }: PlayerPriceHistoryChartProps) {
  const [range, setRange] = useState<RangeKey>("30d");

  const filteredPoints = useMemo(() => {
    if (range === "all") return points;
    if (range === "7d") return points.slice(-7);
    return points.slice(-30);
  }, [points, range]);

  const [hoveredIndex, setHoveredIndex] = useState(
    Math.max(filteredPoints.length - 1, 0)
  );

  const chart = useMemo(() => {
    if (filteredPoints.length === 0) return null;

    const width = 760;
    const height = 240;
    const left = 44;
    const right = 18;
    const top = 16;
    const bottom = 30;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;

    const values = filteredPoints.map((p) => p.close_price);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min = Math.max(min - 1, 0.01);
      max = max + 1;
    }

    const xForIndex = (idx: number): number => {
      if (filteredPoints.length <= 1) return left + innerWidth / 2;
      return left + (idx / (filteredPoints.length - 1)) * innerWidth;
    };

    const yForValue = (value: number): number => {
      const ratio = (value - min) / (max - min);
      return top + innerHeight - ratio * innerHeight;
    };

    const path = filteredPoints
      .map(
        (point, idx) =>
          `${idx === 0 ? "M" : "L"} ${xForIndex(idx)} ${yForValue(point.close_price)}`
      )
      .join(" ");

    const dots = filteredPoints.map((point, idx) => ({
      idx,
      x: xForIndex(idx),
      y: yForValue(point.close_price)
    }));

    return { width, height, left, right, top, bottom, path, dots };
  }, [filteredPoints]);

  if (!chart || filteredPoints.length === 0) {
    return <p className="muted">No historical price points yet.</p>;
  }

  const safeIndex = Math.min(Math.max(hoveredIndex, 0), filteredPoints.length - 1);
  const hovered = filteredPoints[safeIndex];
  const hoveredDot = chart.dots[safeIndex];
  const first = filteredPoints[0];
  const latest = filteredPoints[filteredPoints.length - 1];
  const periodChange = latest.close_price - first.close_price;
  const periodChangePct =
    first.close_price > 0 ? (periodChange / first.close_price) * 100 : 0;
  const isUp = periodChange >= 0;
  const stroke = isUp ? "#1e6f3f" : "#a11b1b";

  return (
    <div className="grid">
      <div className="tab-row">
        <button
          type="button"
          onClick={() => setRange("7d")}
          className={range === "7d" ? "" : "secondary"}
        >
          Last 7 Days
        </button>
        <button
          type="button"
          onClick={() => setRange("30d")}
          className={range === "30d" ? "" : "secondary"}
        >
          Last 30 Days
        </button>
        <button
          type="button"
          onClick={() => setRange("all")}
          className={range === "all" ? "" : "secondary"}
        >
          All Time
        </button>
      </div>

      <p>
        Period movement: <strong style={{ color: stroke }}>{formatSigned(periodChange)}</strong>{" "}
        ({formatSignedPct(periodChangePct)})
      </p>

      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        width="100%"
        height="240"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const relativeX = event.clientX - rect.left;
          const ratio = rect.width > 0 ? relativeX / rect.width : 0;
          const idx = Math.round(ratio * (filteredPoints.length - 1));
          setHoveredIndex(Math.min(Math.max(idx, 0), filteredPoints.length - 1));
        }}
        onMouseLeave={() => setHoveredIndex(filteredPoints.length - 1)}
        role="img"
        aria-label="Historical player price movement chart"
      >
        <line
          x1={chart.left}
          y1={chart.height - chart.bottom}
          x2={chart.width - chart.right}
          y2={chart.height - chart.bottom}
          stroke="#cbd5e1"
        />
        <line
          x1={chart.left}
          y1={chart.top}
          x2={chart.left}
          y2={chart.height - chart.bottom}
          stroke="#cbd5e1"
        />

        <path
          d={chart.path}
          fill="none"
          stroke={stroke}
          strokeWidth="3"
          strokeLinejoin="round"
          strokeLinecap="round"
        />

        {chart.dots.map((dot) => (
          <circle
            key={dot.idx}
            cx={dot.x}
            cy={dot.y}
            r={dot.idx === safeIndex ? 4 : 2.5}
            fill={dot.idx === safeIndex ? stroke : "#94a3b8"}
          />
        ))}

        <line
          x1={hoveredDot.x}
          y1={chart.top}
          x2={hoveredDot.x}
          y2={chart.height - chart.bottom}
          stroke="#a3a3a3"
          strokeDasharray="4 4"
        />
      </svg>

      <div className="card">
        <p>
          Date: <strong>{hovered.snap_date}</strong>
        </p>
        <p>
          Close price: <strong>{formatFlagAmount(hovered.close_price)}</strong>
        </p>
        <p>
          Daily movement:{" "}
          <strong style={{ color: hovered.day_change >= 0 ? "#1e6f3f" : "#a11b1b" }}>
            {formatSigned(hovered.day_change)} ({formatSignedPct(hovered.day_change_pct)})
          </strong>
        </p>
      </div>
    </div>
  );
}
