import { AuthorAvatar } from "./AuthorAvatar";
import { Icon } from "./Icon";
import { duration, timeAgo } from "./time";
import { cn } from "./cn";
import type { Deployment } from "./types";

export function DeploymentCard({ deployment }: { deployment: Deployment }) {
  const failed = deployment.status === "failed";

  return (
    <article
      className={cn(
        "rise flex flex-col gap-[7px] rounded-xl px-[13px] pt-3 pb-3",
        "shadow-[inset_0_1px_0_rgba(255,255,255,0.032)]",
        failed ? "bg-[#191216]" : "bg-card",
      )}
    >
      <div className="flex items-center gap-1.5">
        {failed ? (
          <span className="inline-flex h-[18px] items-center gap-1 rounded-[5px] bg-err/12 px-[6px] text-[10.5px] font-medium text-err">
            <Icon name="i-alert" className="size-2.5" />
            Failed
          </span>
        ) : (
          <span className="inline-flex h-[18px] items-center gap-1 rounded-[5px] bg-ok/10 px-[6px] text-[10.5px] font-medium text-ok">
            <Icon name="i-tick" className="size-2.5" />
            Live
          </span>
        )}

        <span className="inline-flex h-[18px] items-center rounded-[5px] bg-white/6 px-1.5 text-[10.5px] text-ink-2">
          {deployment.environment}
        </span>

        <span className="ml-auto inline-flex items-center gap-1 text-[11px] whitespace-nowrap text-ink-3">
          <Icon name="i-clock" className="size-2.5" />
          {timeAgo(deployment.createdAt)}
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] leading-[1.35] font-medium tracking-[-0.008em]">
        {deployment.pr?.title ?? "Deployment"}
      </p>

      {deployment.pr && (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <AuthorAvatar name={deployment.pr.author} size={14} />
          {deployment.pr.number}
          <span className="text-ink-3">by {deployment.pr.author}</span>
          <span className="ml-auto whitespace-nowrap text-ink-3">
            took {duration(deployment.durationMinutes)}
          </span>
        </p>
      )}

      {failed && deployment.note && (
        <p className="text-[11px] leading-[1.45] text-err">{deployment.note}</p>
      )}
    </article>
  );
}
