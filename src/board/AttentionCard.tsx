import type { IconName } from "../icons";
import { AuthorAvatar } from "./AuthorAvatar";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { lasted } from "./time";
import type { Attention, AttentionKind, FailureReport } from "./types";

const KIND: Record<AttentionKind, { label?: string; icon: IconName; hot: boolean }> = {
  main: { label: "Main is red", icon: "i-alert", hot: true },
  deploy: { label: "Deploy failed", icon: "i-ship", hot: true },
  failing: { icon: "i-x", hot: true },
  stuck: { label: "CI not started", icon: "i-clock", hot: false },
  conflict: { label: "Merge conflict", icon: "i-pr", hot: false },
  changes: { label: "Changes requested", icon: "i-user", hot: false },
};

function Chip({ icon, label, hot }: { icon: IconName; label: string; hot: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.6rem] shrink-0 items-center gap-1.5 rounded-[0.45rem] px-[0.55rem] text-[0.95rem] font-semibold",
        hot ? "bg-err/15 text-err" : "bg-warn/12 text-warn",
      )}
    >
      <Icon name={icon} className="size-[0.8rem]" />
      {label}
    </span>
  );
}

/** One thing that needs you: which PR, what is wrong with it, for how long. */
export function AttentionCard({
  item,
  viewer,
  now,
  index,
  onFailure,
}: {
  item: Attention;
  viewer: string;
  now: number;
  index: number;
  onFailure: (report: FailureReport) => void;
}) {
  const kind = KIND[item.kind];
  const failure = item.pr?.failure;
  const author = item.pr && item.pr.author !== viewer ? item.pr.author : null;

  return (
    <article
      data-item
      className={cn(
        "rise flex shrink-0 flex-col gap-[0.4rem] rounded-[0.8rem] px-[0.9rem] py-[0.65rem]",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]",
        kind.hot ? "bg-err-card" : "bg-card",
        failure && "cursor-pointer hover:brightness-125",
      )}
      style={{ animationDelay: `${index * 30}ms` }}
      {...(failure
        ? {
            role: "button",
            tabIndex: 0,
            "aria-label": `${item.title}, show failure logs`,
            onClick: () => onFailure(failure),
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onFailure(failure);
            },
          }
        : {})}
    >
      <div className="flex items-baseline gap-3">
        <h3 className="min-w-0 flex-1 truncate text-[1.15rem] leading-[1.3] font-semibold tracking-[-0.015em]">
          {item.title}
        </h3>
        {author && <AuthorAvatar name={author} size={20} />}
        <span className="shrink-0 text-[0.85rem] whitespace-nowrap text-ink-2">
          for <b className="text-[1.1rem] font-semibold text-ink">{lasted(item.since, now)}</b>
        </span>
      </div>

      <div className="flex min-w-0 items-center gap-2">
        {item.lanes?.map((lane) => (
          <Chip key={lane} icon="i-x" label={lane} hot />
        ))}
        {kind.label && <Chip icon={kind.icon} label={kind.label} hot={kind.hot} />}
        {item.note && (
          <span className="ml-1 min-w-0 truncate text-[0.9rem] text-ink-2">{item.note}</span>
        )}
      </div>
    </article>
  );
}
