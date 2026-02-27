"use client";

import { useMemo, useState } from "react";
import { formatFlagAmount, formatTwoDecimals } from "@/lib/format";

export type PortfolioHistoryHolding = {
  player_name: string;
  units: number;
  value: number;
};

export type PortfolioHistoryPoint = {
  snap_date: string;
  unplanted_close: number;
  planted_close: number;
  total_close: number;
  holdings: PortfolioHistoryHolding[];
};

type PortfolioHistoryChartProps = {
  points: PortfolioHistoryPoint[];
  title?: string;
};

export default function PortfolioHistoryChart({
  points,
  title = "FlagPlants Value Over Time"
}: PortfolioHistoryChartProps) {
  const [hoveredIndex, setHoveredIndex] = useState<number>(
    Math.max(points.length - 1, 0)
  );

  const chart = useMemo(() => {
    if (points.length === 0) return null;

    const width = 720;
    const height = 220;
    const left = 42;
    const right = 16;
    const top = 16;
    const bottom = 28;
    const innerWidth = width - left - right;
    const innerHeight = height - top - bottom;

    const values = points.map((p) => p.planted_close);
    let min = Math.min(...values);
    let max = Math.max(...values);
    if (min === max) {
      min = Math.max(min - 1, 0);
      max = max + 1;
    }

    const xForIndex = (idx: number): number => {
      if (points.length <= 1) return left + innerWidth / 2;
      return left + (idx / (points.length - 1)) * innerWidth;
    };

    const yForValue = (value: number): number => {
      const ratio = (value - min) / (max - min);
      return top + innerHeight - ratio * innerHeight;
    };

    const path = points
      .map((point, idx) => `${idx === 0 ? "M" : "L"} ${xForIndex(idx)} ${yForValue(point.planted_close)}`)
      .join(" ");

    const dots = points.map((point, idx) => ({
      x: xForIndex(idx),
      y: yForValue(point.planted_close),
      idx
    }));

    return { width, height, left, right, top, bottom, xForIndex, yForValue, path, dots };
  }, [points]);

  if (points.length === 0 || !chart) {
    return <p className="muted">No history points yet.</p>;
  }

  const safeIndex = Math.min(Math.max(hoveredIndex, 0), points.length - 1);
  const hovered = points[safeIndex];
  const hoveredDot = chart.dots[safeIndex];

  return (
    <div className="grid">
      <h3>{title}</h3>
      <svg
        viewBox={`0 0 ${chart.width} ${chart.height}`}
        width="100%"
        height="220"
        onMouseMove={(event) => {
          const rect = event.currentTarget.getBoundingClientRect();
          const relativeX = event.clientX - rect.left;
          const ratio = rect.width > 0 ? relativeX / rect.width : 0;
          const idx = Math.round(ratio * (points.length - 1));
          setHoveredIndex(Math.min(Math.max(idx, 0), points.length - 1));
        }}
        onMouseLeave={() => setHoveredIndex(points.length - 1)}
        role="img"
        aria-label="FlagPlants value over time"
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
          stroke="#0f766e"
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
            fill={dot.idx === safeIndex ? "#0f766e" : "#94a3b8"}
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
          Planted value at close: <strong>{formatFlagAmount(hovered.planted_close)}</strong>
        </p>
        <p>
          Unplanted flags at close:{" "}
          <strong>{formatFlagAmount(hovered.unplanted_close)}</strong>
        </p>
        <p>
          Total value at close: <strong>{formatFlagAmount(hovered.total_close)}</strong>
        </p>
        <p>FlagPlants at close:</p>
        {hovered.holdings.length === 0 ? (
          <p className="muted">No FlagPlants at close.</p>
        ) : (
          <table>
            <thead>
              <tr>
                <th>Player</th>
                <th>Units</th>
                <th>Value</th>
              </tr>
            </thead>
            <tbody>
              {hovered.holdings.map((holding) => (
                <tr key={`${hovered.snap_date}-${holding.player_name}`}>
                  <td>{holding.player_name}</td>
                  <td>{formatTwoDecimals(holding.units)}</td>
                  <td>{formatFlagAmount(holding.value)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
