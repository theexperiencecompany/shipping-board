import type { IconName } from "../icons";
import { AuthorAvatar } from "./AuthorAvatar";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { lasted } from "./time";
import type { Attention, AttentionKind, FailureReport } from "./types";

const KIND: Record<AttentionKind, { label: string; icon: IconName; hot: boolean }> = {
  main: { label: "Main branch red", icon: "i-alert", hot: true },
  deploy: { label: "Deploy failed", icon: "i-ship", hot: true },
  backlog: { label: "CI stuck", icon: "i-clock", hot: true },
  systemic: { label: "Same failure on many PRs", icon: "i-batch", hot: true },
  failing: { label: "Failing", icon: "i-x", hot: true },
  conflict: { label: "Merge conflict", icon: "i-pr", hot: false },
  changes: { label: "Changes requested", icon: "i-user", hot: false },
};

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
  const tone = kind.hot ? "text-err" : "text-warn";
  const failure = item.pr?.failure;
  const pr = item.pr;

  return (
    <article
      data-item
      className={cn(
        "rise flex shrink-0 flex-col gap-[0.2rem] rounded-[0.8rem] px-[0.9rem] py-[0.6rem]",
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
        <h3 className="min-w-0 flex-1 truncate text-[1.1rem] leading-[1.3] font-semibold tracking-[-0.015em]">
          {item.title}
        </h3>
        <span className="shrink-0 text-[0.85rem] whitespace-nowrap text-ink-2">
          for <b className="text-[1.1rem] font-semibold text-ink">{lasted(item.since, now)}</b>
        </span>
      </div>

      <div className="flex items-center gap-2 text-[0.85rem]">
        <Icon name={kind.icon} className={cn("size-[0.85rem] shrink-0", tone)} />
        <span className={cn("shrink-0 font-semibold", tone)}>{kind.label}</span>
        <span className="min-w-0 truncate text-ink-2">{item.detail}</span>
        {pr && (
          <span className="ml-auto flex shrink-0 items-center gap-2 text-ink-3">
            {pr.openThreads > 0 && (
              <span className="text-ink-2">
                {pr.openThreads} open {pr.openThreads === 1 ? "thread" : "threads"}
              </span>
            )}
            {pr.author !== viewer && <AuthorAvatar name={pr.author} size={18} />}
            {pr.number}
          </span>
        )}
      </div>
    </article>
  );
}
