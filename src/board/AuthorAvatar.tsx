import { useState } from "react";

const FALLBACK = [
  "bg-[#1b2130] text-ink-2",
  "bg-[#1a2333] text-[#9fb4c9]",
  "bg-[#231d2e] text-[#b4a6c9]",
  "bg-[#1d2620] text-[#a6c9b4]",
];

function fallbackColor(name: string) {
  let hash = 0;
  for (const char of name) hash = (hash * 31 + char.charCodeAt(0)) % 997;
  return FALLBACK[hash % FALLBACK.length];
}

export function AuthorAvatar({ name, size = 16 }: { name: string; size?: number }) {
  const [broken, setBroken] = useState(false);
  const style = { width: size, height: size };

  if (broken) {
    return (
      <span
        title={name}
        className={`inline-flex shrink-0 items-center justify-center rounded-full text-[9px] font-semibold ${fallbackColor(name)}`}
        style={style}
      >
        {name.slice(0, 1).toUpperCase()}
      </span>
    );
  }

  return (
    <img
      src={`https://github.com/${name}.png?size=${size * 2}`}
      alt={name}
      width={size}
      height={size}
      loading="lazy"
      onError={() => setBroken(true)}
      className="shrink-0 rounded-full bg-card-hi object-cover"
      style={style}
    />
  );
}
