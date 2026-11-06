import { useState } from "react";
import { Column } from "./Column";
import { DeployCard } from "./DeployCard";
import { DeploymentCard } from "./DeploymentCard";
import { FailureDialog } from "./FailureDialog";
import { PrCard } from "./PrCard";
import type { BoardData, FailureReport } from "./types";

const MAX_PER_COLUMN = 5;

function Empty({ label }: { label: string }) {
  return (
    <div className="flex flex-1 items-center justify-center py-6">
      <p className="text-[11.5px] text-ink-3">{label}</p>
    </div>
  );
}

export function Board({ data }: { data: BoardData; viewer: string }) {
  const [failure, setFailure] = useState<FailureReport | null>(null);

  const needs = data.needs.slice(0, MAX_PER_COLUMN);
  const running = data.running.slice(0, MAX_PER_COLUMN);
  const deployments = data.deployments.slice(0, MAX_PER_COLUMN);

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

        <Column
          icon="i-flowchart"
          label="Running checks"
          count={data.running.length}
          more={data.running.length - running.length}
        >
          {running.length === 0 ? (
            <Empty label="No checks are running." />
          ) : (
            running.map((pr, index) => (
              <PrCard key={pr.number} pr={pr} index={index} onFailure={setFailure} />
            ))
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
                key={`${deployment.at}-${deployment.environment}`}
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
