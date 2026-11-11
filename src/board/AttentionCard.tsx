import type { IconName } from "../icons";
import { AuthorAvatar } from "./AuthorAvatar";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { PrTitle } from "./PrTitle";
import { timeAgo } from "./time";
import type { Attention, AttentionKind, FailureReport } from "./types";

const KIND: Record<AttentionKind, { label?: string; icon: IconName; hot: boolean; verb: string }> =
  {
    main: { label: "Main is red", icon: "i-alert", hot: true, verb: "red" },
    deploy: { label: "Deploy failed", icon: "i-ship", hot: true, verb: "failed" },
    failing: { icon: "i-x", hot: true, verb: "failed" },
    stuck: { label: "CI not started", icon: "i-clock", hot: false, verb: "queued" },
    conflict: { label: "Merge conflict", icon: "i-pr", hot: false, verb: "" },
    changes: { label: "Changes requested", icon: "i-user", hot: false, verb: "asked" },
  };

function Chip({ icon, label, hot }: { icon: IconName; label: string; hot: boolean }) {
  return (
    <span
      className={cn(
        "inline-flex h-[1.45rem] shrink-0 items-center gap-1.5 rounded-[0.4rem] px-[0.5rem] text-[0.9rem] font-semibold",
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
  // Failed after the last push and nobody has pushed since: the agent stopped.
  const idle = item.kind === "failing" && item.note !== undefined;

  return (
    <article
      data-item
      className={cn(
        "rise flex shrink-0 flex-col gap-[0.3rem] rounded-[0.7rem] px-[0.9rem] py-[0.5rem]",
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
      <div className="flex min-w-0 items-baseline gap-3">
        <h3 className="min-w-0 flex-1 truncate text-[1.1rem] leading-[1.3] font-semibold tracking-[-0.015em]">
          <PrTitle title={item.title} />
        </h3>
        {author && <AuthorAvatar name={author} size={20} />}
        {kind.verb && (
          <span className="shrink-0 text-[0.9rem] whitespace-nowrap text-ink-2">
            {kind.verb} <b className="font-semibold text-ink">{timeAgo(item.since, now)}</b>
          </span>
        )}
      </div>

      <div className="flex min-w-0 items-center gap-1.5">
        {item.lanes?.map((lane) => (
          <Chip key={lane} icon="i-x" label={lane} hot />
        ))}
        {kind.label && <Chip icon={kind.icon} label={kind.label} hot={kind.hot} />}
        {item.note && !idle && (
          <span className="ml-1.5 min-w-0 truncate text-[0.85rem] text-ink-2">{item.note}</span>
        )}
        {item.pr?.lastCommitAt && (
          <span
            className={cn(
              "ml-auto shrink-0 text-[0.85rem] whitespace-nowrap",
              idle ? "font-semibold text-warn" : "text-ink-3",
            )}
          >
            {idle ? "no push since it failed · " : ""}pushed {timeAgo(item.pr.lastCommitAt, now)}
          </span>
        )}
      </div>
    </article>
  );
}
