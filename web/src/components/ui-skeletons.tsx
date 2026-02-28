"use client";

type SkeletonBlockProps = {
  width?: string;
  height?: string;
  className?: string;
};

type SkeletonLinesProps = {
  lines?: number;
  lastLineWidth?: string;
};

type TableSkeletonProps = {
  columns?: number;
  rows?: number;
};

export function SkeletonBlock({
  width = "100%",
  height = "0.9rem",
  className = ""
}: SkeletonBlockProps) {
  return (
    <span
      className={`skeleton-block ${className}`.trim()}
      style={{ width, height }}
      aria-hidden="true"
    />
  );
}

export function SkeletonLines({
  lines = 3,
  lastLineWidth = "60%"
}: SkeletonLinesProps) {
  if (lines <= 0) return null;

  return (
    <div className="skeleton-lines" aria-hidden="true">
      {Array.from({ length: lines }).map((_, index) => (
        <SkeletonBlock
          key={`line-${index}`}
          width={index === lines - 1 ? lastLineWidth : "100%"}
        />
      ))}
    </div>
  );
}

export function CardSkeleton() {
  return (
    <div className="card skeleton-card" aria-hidden="true">
      <SkeletonBlock width="38%" height="1.1rem" />
      <SkeletonLines lines={3} lastLineWidth="72%" />
    </div>
  );
}

export function TableSkeleton({ columns = 5, rows = 4 }: TableSkeletonProps) {
  const safeColumns = Math.max(1, columns);
  const safeRows = Math.max(1, rows);

  return (
    <div className="skeleton-table" aria-hidden="true">
      <div
        className="skeleton-table-grid skeleton-table-head"
        style={{ gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))` }}
      >
        {Array.from({ length: safeColumns }).map((_, index) => (
          <SkeletonBlock key={`head-${index}`} width="80%" />
        ))}
      </div>
      {Array.from({ length: safeRows }).map((_, rowIndex) => (
        <div
          key={`row-${rowIndex}`}
          className="skeleton-table-grid"
          style={{ gridTemplateColumns: `repeat(${safeColumns}, minmax(0, 1fr))` }}
        >
          {Array.from({ length: safeColumns }).map((_, colIndex) => (
            <SkeletonBlock
              key={`cell-${rowIndex}-${colIndex}`}
              width={colIndex === 0 ? "92%" : "74%"}
            />
          ))}
        </div>
      ))}
    </div>
  );
}
