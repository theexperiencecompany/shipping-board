import { useState } from "react";
import { AttentionCard } from "./AttentionCard";
import { Column, SubHead } from "./Column";
import { DeployCard } from "./DeployCard";
import { FailureDialog } from "./FailureDialog";
import { FitList } from "./FitList";
import { Icon } from "./Icon";
import { QueueList } from "./QueueList";
import { RunningCard } from "./RunningCard";
import { duration, lasted, timeAgo } from "./time";
import type { BoardData, FailureReport } from "./types";

export function Board({ data, now }: { data: BoardData; now: number }) {
  const [failure, setFailure] = useState<FailureReport | null>(null);
  const [hiddenLeft, setHiddenLeft] = useState(0);
  const [hiddenRight, setHiddenRight] = useState(0);

  const moving = data.running.length + data.queue.length + (data.deploy ? 1 : 0);
  const clear = data.attention.length === 0 && data.ready.length === 0;

  return (
    <>
      <div className="grid h-full grid-cols-[1.1fr_1fr] gap-[0.7rem] px-[1.2rem]">
        <Column
          icon={clear ? "i-tick" : "i-alert"}
          label="Needs you"
          count={data.attention.length + data.ready.length}
          tone={data.attention.length > 0 ? "danger" : "ok"}
          hidden={clear ? 0 : hiddenLeft}
        >
          {clear ? (
            <div className="flex flex-1 flex-col items-center justify-center gap-2">
              <Icon name="i-tick" className="size-[2.2rem] text-ok" />
              <p className="text-[1.3rem] font-semibold text-ink">Nothing needs you</p>
              <p className="text-[0.9rem] text-ink-3">
                Failures, stuck CI and green pull requests land here.
              </p>
            </div>
          ) : (
            <FitList onHidden={setHiddenLeft}>
              {data.attention.map((item, index) => (
                <AttentionCard
                  key={item.key}
                  item={item}
                  viewer={data.viewer}
                  now={now}
                  index={index}
                  onFailure={setFailure}
                />
              ))}

              {data.ready.length > 0 && (
                <SubHead
                  icon="i-tick"
                  label="Green, waiting for you to merge"
                  tone="text-ok"
                  count={data.ready.length}
                />
              )}
              {data.ready.map((pr) => (
                <div
                  key={pr.number}
                  data-item
                  className="flex shrink-0 items-center gap-3 rounded-[0.8rem] bg-ok-card px-[0.9rem] py-[0.55rem]"
                >
                  <span className="min-w-0 flex-1 truncate text-[1.05rem] font-semibold">
                    {pr.title}
                  </span>
                  <span className="shrink-0 text-[0.85rem] text-ink-3">{pr.number}</span>
                  <span className="shrink-0 text-[0.85rem] text-ink-2">
                    green for{" "}
                    <b className="text-[1.05rem] font-semibold text-ink">
                      {lasted(pr.updatedAt, now)}
                    </b>
                  </span>
                </div>
              ))}
            </FitList>
          )}
        </Column>

        <Column
          icon="i-flowchart"
          label="In progress"
          count={moving}
          hidden={hiddenRight}
          className="quiet"
        >
          <FitList onHidden={setHiddenRight}>
            {data.deploy && <DeployCard deploy={data.deploy} typical={data.deployTypical} />}

            {data.queue.length > 0 && (
              <SubHead
                icon="i-queue"
                label="Merge queue"
                tone="text-ink-2"
                count={data.queue.length}
              />
            )}
            {data.queue.length > 0 && <QueueList entries={data.queue} />}

            {(data.deploy || data.queue.length > 0) && data.running.length > 0 && (
              <SubHead icon="i-spin" label="Checks" tone="text-ink-2" count={data.running.length} />
            )}
            {data.running.map((pr, index) => (
              <RunningCard key={pr.number} pr={pr} ci={data.ci} index={index} />
            ))}

            {moving === 0 && (
              <p className="shrink-0 px-[0.3rem] py-[0.6rem] text-[1rem] text-ink-3">
                Nothing running right now.
              </p>
            )}

            {data.shipped.length > 0 && (
              <SubHead
                icon="i-ship"
                label="Shipped"
                tone="text-ok"
                note={
                  data.shippedTypical
                    ? `usually open ${duration(data.shippedTypical)} before merging`
                    : undefined
                }
              />
            )}
            {data.shipped.map((pull) => (
              <div
                key={pull.number}
                className="flex shrink-0 items-center gap-3 px-[0.3rem] py-[0.1rem] text-[0.9rem]"
              >
                <Icon name="i-tick" className="size-[0.85rem] shrink-0 text-ok" />
                <span className="min-w-0 flex-1 truncate text-ink-2">{pull.title}</span>
                <span className="shrink-0 text-ink-3">
                  open {duration(pull.openMinutes)} · {timeAgo(pull.mergedAt, now)}
                </span>
              </div>
            ))}
          </FitList>
        </Column>
      </div>

      <FailureDialog report={failure} onClose={() => setFailure(null)} />
    </>
  );
}
