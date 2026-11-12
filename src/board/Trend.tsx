import { duration } from "./time";

const W = 96;
const H = 22;
const PAD = 3;

/**
 * Typical green CI time per day for the last week, oldest left. One series, so no
 * legend: the label beside it names it.
 */
export function Trend({ days }: { days: (number | null)[] }) {
  const values = days.filter((value): value is number => value !== null);
  if (values.length < 2) return null;

  const today = days[days.length - 1];
  const min = Math.min(...values);
  const max = Math.max(...values);
  const span = Math.max(1, max - min);
  const x = (index: number) => PAD + (index * (W - PAD * 2)) / (days.length - 1);
  const y = (value: number) => H - PAD - ((value - min) * (H - PAD * 2)) / span;

  // A day with too few runs has no point; the line runs straight past it.
  const path = days
    .map((value, index) =>
      value === null ? null : `${x(index).toFixed(1)},${y(value).toFixed(1)}`,
    )
    .filter((point): point is string => point !== null)
    .map((point, index) => `${index === 0 ? "M" : "L"}${point}`)
    .join("");

  const label = days
    .map(
      (value, index) =>
        `${days.length - 1 - index}d ago: ${value === null ? "no data" : duration(value)}`,
    )
    .join(", ");

  return (
    <svg
      width={W}
      height={H}
      viewBox={`0 0 ${W} ${H}`}
      role="img"
      aria-label={`Typical CI time, last 7 days. ${label}`}
      className="h-[1.1rem] w-auto overflow-visible"
    >
      <path
        d={path}
        fill="none"
        stroke="var(--color-accent)"
        strokeWidth={2}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
      {days.map((value, index) =>
        value === null ? null : (
          <circle key={index} cx={x(index)} cy={y(value)} r={6} fill="transparent">
            <title>{`${index === days.length - 1 ? "Today" : `${days.length - 1 - index}d ago`}: ${duration(value)}`}</title>
          </circle>
        ),
      )}
      {today !== null && (
        <circle cx={x(days.length - 1)} cy={y(today)} r={2.5} fill="var(--color-accent)" />
      )}
    </svg>
  );
}
