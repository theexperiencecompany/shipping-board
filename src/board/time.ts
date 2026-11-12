const MINUTE = 60_000;

export function timeAgo(iso: string | null, now = Date.now()): string {
  if (!iso) return "unknown";
  const diff = Math.max(0, now - new Date(iso).getTime());
  const minutes = Math.floor(diff / MINUTE);
  if (minutes < 1) return "just now";
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  const days = Math.floor(hours / 24);
  return days === 1 ? "1d ago" : `${days}d ago`;
}

export function duration(minutes: number): string {
  if (minutes < 1) return "<1m";
  if (minutes < 60) return `${minutes}m`;
  const hours = Math.floor(minutes / 60);
  if (hours >= 24) {
    const days = Math.floor(hours / 24);
    const left = hours % 24;
    return left === 0 ? `${days}d` : `${days}d ${left}h`;
  }
  const rest = minutes % 60;
  return rest === 0 ? `${hours}h` : `${hours}h ${rest}m`;
}

/** How long since an instant, as a duration: "1h 12m". */
export function lasted(iso: string | null, now = Date.now()): string {
  if (!iso) return "unknown";
  return duration(Math.max(0, Math.floor((now - new Date(iso).getTime()) / MINUTE)));
}

export function clockTime(iso: string): string {
  return new Date(iso).toLocaleTimeString([], {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  });
}
