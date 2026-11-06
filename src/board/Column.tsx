import type { IconName } from "../icons";
import { cn } from "./cn";
import { Icon } from "./Icon";

type Tone = "danger" | "ok" | "neutral";

export function Column({
  icon,
  label,
  count,
  tone = "neutral",
  more = 0,
  children,
}: {
  icon: IconName;
  label: string;
  count: number;
  tone?: Tone;
  more?: number;
  children: React.ReactNode;
}) {
  return (
    <section className="flex min-h-0 min-w-0 flex-col overflow-hidden rounded-2xl bg-lane px-2.5 pt-2.5 pb-3">
      <header className="flex shrink-0 items-center gap-[7px] px-1 pb-2.5">
        <Icon
          name={icon}
          className={cn(
            "size-3 shrink-0",
            tone === "danger" && "text-err",
            tone === "ok" && "text-ok",
            tone === "neutral" && "text-ink-3",
          )}
        />
        <span className="text-[12.5px] font-medium tracking-[-0.005em] text-ink-2">{label}</span>
        <em className="ml-auto text-[11.5px] font-normal text-ink-3 not-italic">{count}</em>
      </header>
      <div className="flex min-h-0 flex-1 flex-col gap-2">{children}</div>
      {more > 0 && <p className="mt-2 px-1 text-[11px] text-ink-3">+{more} more</p>}
    </section>
  );
}
