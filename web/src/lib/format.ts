export function formatFlagAmount(value: number | null | undefined): string {
  if (typeof value !== "number" || Number.isNaN(value)) return "--";
  return value.toFixed(2);
}
