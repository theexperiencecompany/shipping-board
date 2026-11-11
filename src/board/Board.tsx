import { useState } from "react";
import { Column } from "./Column";
import { DeployCard } from "./DeployCard";
import { DeploymentCard } from "./DeploymentCard";
import { FailureDialog } from "./FailureDialog";
import { Icon } from "./Icon";
import { PrCard } from "./PrCard";
import type { BoardData, FailureReport } from "./types";

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-6">
      <p className="text-[11.5px] text-ink-3">{label}</p>
    </div>
  );
}

export function Board({ data }: { data: BoardData; viewer: string }) {
  const [failure, setFailure] = useState<FailureReport | null>(null);

  const cap = data.maxPerColumn;
  const needs = data.needs.slice(0, cap);
  const running = data.running.slice(0, cap);
  const ready = data.ready;
  const deployments = data.deployments.slice(0, cap);
  const checks = running.length + ready.length;
  const more = Math.max(0, data.running.length + data.ready.length - cap);

  return (
    <>
      <div className="grid h-full grid-cols-[1fr_1.2fr_1.15fr] gap-3 px-[22px] pb-3">
        <Column
          icon="i-alert"
          label="Needs you"
          count={data.needs.length}
          tone="danger"
          more={data.needs.length - needs.length}
        >
          {needs.length === 0 ? (
            <Empty label="Nothing is failing." />
          ) : (
            needs.map((pr, index) => (
              <PrCard key={pr.number} pr={pr} index={index} onFailure={setFailure} />
            ))
          )}
        </Column>

        <Column icon="i-flowchart" label="Checks" count={checks} more={more}>
          {checks === 0 && <Empty label="Nothing is running." />}

          {ready.length > 0 && (
            <div className="flex flex-col gap-2">
              <div className="flex items-center gap-1.5 px-1">
                <Icon name="i-tick" className="size-3 text-ok" />
                <span className="text-[11px] font-medium text-ok">Ready to merge</span>
                <span className="text-[11px] text-ink-3">{ready.length}</span>
              </div>
              {ready.map((pr, index) => (
                <PrCard key={pr.number} pr={pr} index={index} onFailure={setFailure} ready />
              ))}
            </div>
          )}

          {ready.length > 0 && running.length > 0 && <div className="my-1 h-px bg-[#121a26]" />}

          {running.length > 0 && (
            <div className="flex flex-col gap-2">
              {ready.length > 0 && (
                <div className="flex items-center gap-1.5 px-1">
                  <Icon name="i-spin" className="spin size-3 text-warn" />
                  <span className="text-[11px] font-medium text-warn">Running</span>
                  <span className="text-[11px] text-ink-3">{running.length}</span>
                </div>
              )}
              {running.map((pr, index) => (
                <PrCard key={pr.number} pr={pr} index={index} onFailure={setFailure} />
              ))}
            </div>
          )}
        </Column>

        <Column
          icon="i-ship"
          label="Deployments"
          count={data.deployments.length}
          tone="ok"
          more={data.deployments.length - deployments.length}
        >
          {data.deploy && <DeployCard deploy={data.deploy} />}
          {deployments.length === 0 ? (
            <Empty label="No deployments yet." />
          ) : (
            deployments.map((deployment) => (
              <DeploymentCard
                key={`${deployment.createdAt}-${deployment.environment}`}
                deployment={deployment}
              />
            ))
          )}
        </Column>
      </div>

      <FailureDialog report={failure} onClose={() => setFailure(null)} />
    </>
  );
}
