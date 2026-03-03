import type { CSSProperties } from "react";

export const LEAGUE_OPTIONS = ["NFL", "NHL", "MLB", "WNBA"] as const;

const LEAGUE_COLORS: Record<
  string,
  { border: string; text: string; badgeBackground: string; selectedBackground: string }
> = {
  NFL: {
    border: "#4da3ff",
    text: "#9dceff",
    badgeBackground: "rgba(22, 66, 116, 0.58)",
    selectedBackground: "linear-gradient(145deg, #0f3761, #163f6d)"
  },
  NHL: {
    border: "#4ddf8a",
    text: "#a4f5c3",
    badgeBackground: "rgba(16, 83, 47, 0.58)",
    selectedBackground: "linear-gradient(145deg, #125b35, #0d4a2a)"
  },
  MLB: {
    border: "#ff6b6b",
    text: "#ffb0b0",
    badgeBackground: "rgba(111, 29, 29, 0.55)",
    selectedBackground: "linear-gradient(145deg, #6d2121, #572020)"
  },
  WNBA: {
    border: "#ffd34d",
    text: "#ffe89a",
    badgeBackground: "rgba(115, 89, 20, 0.55)",
    selectedBackground: "linear-gradient(145deg, #705617, #5b4516)"
  },
  NBA: {
    border: "#b689ff",
    text: "#dbc1ff",
    badgeBackground: "rgba(76, 46, 119, 0.55)",
    selectedBackground: "linear-gradient(145deg, #4f2e79, #402762)"
  }
};

export function normalizeLeagueLabel(value: string | null | undefined): string {
  const normalized = (value ?? "").trim().toUpperCase();
  if (normalized.length === 0) return "OTHER";
  return normalized;
}

function fallbackPalette(league: string) {
  let hash = 0;
  for (let idx = 0; idx < league.length; idx += 1) {
    hash = (hash * 31 + league.charCodeAt(idx)) >>> 0;
  }
  const hue = hash % 360;
  return {
    border: `hsl(${hue} 78% 60%)`,
    text: `hsl(${hue} 82% 78%)`,
    badgeBackground: `hsla(${hue} 75% 22% / 0.55)`,
    selectedBackground: `linear-gradient(145deg, hsl(${hue} 68% 25%), hsl(${hue} 62% 20%))`
  };
}

function paletteForLeague(league: string) {
  return LEAGUE_COLORS[league] ?? fallbackPalette(league);
}

export function getLeagueBadgeStyle(league: string): CSSProperties {
  const palette = paletteForLeague(league);
  return {
    borderColor: palette.border,
    color: palette.text,
    background: palette.badgeBackground
  };
}

export function getLeagueFilterStyle(
  league: string,
  selected: boolean
): CSSProperties {
  const palette = paletteForLeague(league);
  return {
    border: `1px solid ${palette.border}`,
    color: palette.text,
    background: selected ? palette.selectedBackground : "rgba(8, 15, 41, 0.62)"
  };
}
