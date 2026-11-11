import type { IconName } from "../icons";
import { cn } from "./cn";
import { Icon } from "./Icon";
import { duration } from "./time";
import type { Deploy, DeployStep } from "./types";

const STEP: Record<DeployStep["state"], { tone: string; icon?: IconName; spin?: boolean }> = {
  done: { tone: "text-ok", icon: "i-tick" },
  run: { tone: "text-accent", icon: "i-spin", spin: true },
  wait: { tone: "text-ink-3" },
};

export function DeployCard({ deploy, typical }: { deploy: Deploy; typical: number | null }) {
  return (
    <article
      data-item
      className="rise flex shrink-0 flex-col gap-[0.4rem] rounded-[0.8rem] bg-card px-[0.9rem] py-[0.7rem] shadow-[inset_0_1px_0_rgba(255,255,255,0.03)]"
    >
      <div className="flex items-center gap-2 text-[0.85rem]">
        <Icon name="i-deploy" className="size-[0.85rem] text-accent" />
        <span className="font-semibold text-accent">Deploying to {deploy.environment}</span>
        <span className="ml-auto text-ink-3">
          {typical && `usually ${duration(typical)} · `}
          <b className="text-[1.05rem] font-semibold text-ink">{duration(deploy.minutes)}</b>
        </span>
      </div>

      <h3 className="line-clamp-2 text-[1.05rem] leading-[1.25] font-semibold tracking-[-0.012em]">
        {deploy.pr ? `${deploy.pr.title}` : "Deployment"}
      </h3>

      <div className="h-[0.3rem] overflow-hidden rounded-full bg-[#0b1018]">
        <div className="h-full rounded-full bg-accent" style={{ width: `${deploy.progress}%` }} />
      </div>

      {deploy.steps.length > 0 && (
        <div className="flex flex-wrap gap-x-[0.9rem] gap-y-1 text-[0.85rem]">
          {deploy.steps.map((step) => {
            const state = STEP[step.state];
            return (
              <span key={step.label} className={cn("flex items-center gap-1", state.tone)}>
                {state.icon ? (
                  <Icon name={state.icon} className={cn("size-[0.8rem]", state.spin && "spin")} />
                ) : (
                  <span className="size-[0.7rem] rounded-full border-[1.5px] border-current" />
                )}
                {step.label}
              </span>
            );
          })}
        </div>
      )}
    </article>
  );
}
