import { AuthorAvatar } from "./AuthorAvatar";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { Lanes } from "./Lanes";
import { MachineChip } from "./MachineChip";
import { duration, timeAgo } from "./time";
import type { FailureReport, PullRequest } from "./types";

export function PrCard({
  pr,
  index,
  onFailure,
  ready = false,
}: {
  pr: PullRequest;
  index: number;
  onFailure: (report: FailureReport) => void;
  ready?: boolean;
}) {
  const failure = pr.failure;

  return (
    <article
      className={cn(
        "rise flex flex-col gap-[7px] rounded-xl px-[13px] pt-3 pb-3 transition-colors",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.032)]",
        failure && "cursor-pointer bg-[#191216] hover:bg-[#1e161a]",
        !failure && (ready ? "bg-[#0f1a15]" : "bg-card hover:bg-card-hi"),
      )}
      style={{ animationDelay: `${index * 30}ms` }}
      {...(failure
        ? {
            role: "button",
            tabIndex: 0,
            onClick: () => onFailure(failure),
            onKeyDown: (event: React.KeyboardEvent) => {
              if (event.key !== "Enter" && event.key !== " ") return;
              event.preventDefault();
              onFailure(failure);
            },
          }
        : {})}
    >
      <div className="flex items-start gap-1.5">
        <Icon name="i-pr" className="mt-px size-3.5 shrink-0 text-ink-3" />
        <h3 className="line-clamp-2 text-[13.5px] leading-[1.3] font-semibold tracking-[-0.012em]">
          {pr.title}
        </h3>
        <span className="mt-0.5 ml-auto shrink-0 text-[11px] text-ink-3">{pr.number}</span>
      </div>

      <p className="-mt-1 truncate text-[11px] text-ink-3">{pr.branch}</p>

      <Lanes lanes={pr.lanes} />

      <div className="mt-0.5 flex items-center gap-1.5">
        <MachineChip kind={pr.machine} />
        {failure && (
          <span className="inline-flex h-[21px] items-center gap-1 rounded-md bg-err/12 px-[7px] text-[11px] font-medium whitespace-nowrap text-err">
            <Icon name="i-alert" className="size-2.5" />
            {failure.errors} failed
          </span>
        )}
        <div className="ml-auto flex items-center gap-1.5 text-[11px] whitespace-nowrap text-ink-3">
          <AuthorAvatar name={pr.author} size={14} />
          <Icon name={failure ? "i-clock" : "i-timer"} className="size-2.5" />
          {failure ? timeAgo(pr.updatedAt) : duration(pr.minutes)}
        </div>
      </div>
    </article>
  );
}
