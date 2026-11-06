import { AuthorAvatar } from "./AuthorAvatar";
import { Icon } from "./Icon";
import { cn } from "./cn";
import type { Deploy, DeployStep } from "./types";

const STEP: Record<DeployStep["state"], { tone: string; icon?: string; spin?: boolean }> = {
  done: { tone: "text-ok", icon: "i-tick" },
  run: { tone: "text-warn", icon: "i-spin", spin: true },
  wait: { tone: "text-[#6b6b74]" },
};

export function DeployCard({ deploy }: { deploy: Deploy }) {
  return (
    <article className="rise flex flex-col gap-[7px] rounded-xl bg-card px-[13px] pt-3 pb-3 shadow-[inset_0_1px_0_rgba(255,255,255,0.032)]">
      <div className="flex items-center gap-1.5">
        <span className="inline-flex h-[18px] items-center gap-1 rounded-[5px] bg-accent/15 px-[6px] text-[10.5px] font-medium text-accent">
          <Icon name="i-deploy" className="size-2.5" />
          Deploying
        </span>
        <span className="inline-flex h-[18px] items-center rounded-[5px] bg-white/6 px-1.5 text-[10.5px] text-ink-2">
          {deploy.environment}
        </span>
        <span className="ml-auto inline-flex items-center gap-1 text-[11px] text-ink-3">
          <Icon name="i-clock" className="size-2.5" />
          {deploy.minutes} min
        </span>
      </div>

      <p className="line-clamp-2 text-[13px] leading-[1.35] font-medium tracking-[-0.008em]">
        {deploy.pr?.title ?? "Deployment"}
      </p>

      <div className="h-[3px] overflow-hidden rounded-sm bg-[#0b1018]">
        <div className="h-full rounded-sm bg-accent" style={{ width: `${deploy.progress}%` }} />
      </div>

      {deploy.pr && (
        <p className="flex items-center gap-1.5 text-[11px] text-ink-3">
          <AuthorAvatar name={deploy.pr.author} size={14} />
          {deploy.pr.number}
          <span className="text-ink-3">by {deploy.pr.author}</span>
        </p>
      )}

      {deploy.steps.length > 0 ? (
        <div className="mt-0.5 flex flex-col gap-2 border-t border-[#121a26] pt-2.5">
          {deploy.steps.map((step) => {
            const state = STEP[step.state];
            return (
              <div key={step.label} className="flex items-center gap-1.5 text-[11.5px]">
                {state.icon ? (
                  <Icon
                    name={state.icon as never}
                    className={cn("size-2.5 shrink-0", state.tone, state.spin && "spin")}
                  />
                ) : (
                  <span className={cn("h-px w-2.5 shrink-0 bg-current", state.tone)} />
                )}
                <span className={step.state === "wait" ? "text-ink-3" : "text-ink-2"}>
                  {step.label}
                </span>
                {step.note && <span className="ml-auto text-[11px] text-ink-3">{step.note}</span>}
              </div>
            );
          })}
        </div>
      ) : null}
    </article>
  );
}
