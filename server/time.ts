export interface ZoneParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
}

export function zoneParts(zone: string, at = new Date()): ZoneParts {
  const format = new Intl.DateTimeFormat("en-GB", {
    timeZone: zone,
    hourCycle: "h23",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
  });
  const parts = Object.fromEntries(format.formatToParts(at).map((part) => [part.type, part.value]));
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
    hour: Number(parts.hour),
    minute: Number(parts.minute),
    second: Number(parts.second),
  };
}

export function startOfDay(zone: string, at = new Date()): number {
  const now = zoneParts(zone, at);
  const asUtc = Date.UTC(now.year, now.month - 1, now.day, now.hour, now.minute, now.second);
  const offset = asUtc - at.getTime();
  return Date.UTC(now.year, now.month - 1, now.day) - offset;
}

export function zonedClock(zone: string, at = new Date()): string {
  const now = zoneParts(zone, at);
  return `${String(now.hour).padStart(2, "0")}:${String(now.minute).padStart(2, "0")}`;
}
