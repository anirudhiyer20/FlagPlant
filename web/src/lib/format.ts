export function formatTwoDecimals(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(2);
}

export function formatFlagAmount(value: number | null | undefined): string {
  return formatTwoDecimals(value);
}
