import type { IconName } from "../icons";
import { cn } from "./cn";
import { Icon } from "./Icon";

type Tone = "danger" | "ok" | "neutral";

export function Column({
  icon,
  label,
  count,
  tone = "neutral",
  hidden = 0,
  note,
  className,
  children,
}: {
  icon: IconName;
  label: string;
  count?: number;
  tone?: Tone;
  hidden?: number;
  note?: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className={cn(
        "flex min-h-0 min-w-0 flex-col overflow-hidden rounded-[1.1rem] bg-lane px-[0.7rem] pt-[0.8rem] pb-[0.7rem]",
        className,
      )}
    >
      <header className="flex shrink-0 items-center gap-2.5 px-[0.3rem] pb-[0.7rem]">
        <Icon
          name={icon}
          className={cn(
            "size-[1.05rem] shrink-0",
            tone === "danger" && "text-err",
            tone === "ok" && "text-ok",
            tone === "neutral" && "text-ink-3",
          )}
        />
        <h2 className="text-[1.15rem] font-semibold tracking-[-0.015em] text-ink">{label}</h2>
        {count !== undefined && count > 0 && (
          <span className="text-[1.15rem] font-semibold text-ink-3">{count}</span>
        )}
        <span className="ml-auto flex gap-3 text-[0.85rem] text-ink-3">
          {note && <span>{note}</span>}
          {hidden > 0 && <span>{hidden} more not shown</span>}
        </span>
      </header>
      {children}
    </section>
  );
}

export function SubHead({
  icon,
  label,
  tone,
  count,
  note,
}: {
  icon: IconName;
  label: string;
  tone: string;
  count?: number;
  note?: string;
}) {
  return (
    <div className="mt-[0.4rem] flex shrink-0 items-center gap-2 px-[0.3rem]">
      <Icon name={icon} className={cn("size-[0.85rem]", tone)} />
      <span className={cn("text-[0.85rem] font-semibold", tone)}>{label}</span>
      {count !== undefined && <span className="text-[0.85rem] text-ink-3">{count}</span>}
      {note && <span className="ml-auto text-[0.85rem] text-ink-3">{note}</span>}
    </div>
  );
}
