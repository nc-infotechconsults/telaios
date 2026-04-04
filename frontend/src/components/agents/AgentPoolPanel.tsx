import { Card, CardBody, CardHeader, Chip, Divider } from "@heroui/react";
import type { AgentProfile } from "../../types";
import { AgentStatusBadge, type AgentInstance } from "./AgentStatusBadge";

const DRIVER_COLOR: Record<AgentProfile["agent_type"], "primary" | "secondary" | "success"> = {
  langgraph: "primary",
  opencode: "secondary",
  "github-copilot": "success",
};

interface Props {
  agentProfiles: AgentProfile[];
  instances: AgentInstance[];
}

export default function AgentPoolPanel({ agentProfiles, instances }: Props) {
  if (agentProfiles.length === 0) {
    return (
      <Card>
        <CardBody>
          <p className="text-sm text-default-400">No agent profiles configured.</p>
        </CardBody>
      </Card>
    );
  }

  const profilesInUse = agentProfiles.filter((p) =>
    instances.some((i) => i.profile_id === p.id)
  );

  const allProfiles = profilesInUse.length > 0 ? profilesInUse : agentProfiles;

  return (
    <div className="space-y-3">
      <p className="text-sm font-semibold text-default-600">Agent Pool</p>
      {allProfiles.map((profile) => {
        const profileInstances = instances.filter((i) => i.profile_id === profile.id);
        const idle = profileInstances.filter((i) => i.status === "idle").length;
        const busy = profileInstances.filter((i) => i.status === "busy").length;

        return (
          <Card key={profile.id}>
            <CardHeader className="flex items-start justify-between pb-1">
              <div className="flex flex-col gap-1">
                <span className="text-sm font-semibold">{profile.name}</span>
                <div className="flex gap-1">
                  <Chip size="sm" color={DRIVER_COLOR[profile.agent_type]} variant="flat">
                    {profile.agent_type}
                  </Chip>
                  {profileInstances.length > 0 && (
                    <>
                      <Chip size="sm" color="success" variant="flat">{idle} idle</Chip>
                      {busy > 0 && <Chip size="sm" color="warning" variant="flat">{busy} busy</Chip>}
                    </>
                  )}
                </div>
              </div>
            </CardHeader>

            {profileInstances.length > 0 && (
              <>
                <Divider />
                <CardBody className="pt-2 space-y-2">
                  {profileInstances.map((inst) => (
                    <div key={inst.instance_id} className="flex items-center gap-2">
                      <AgentStatusBadge status={inst.status} />
                      <div className="flex-1 min-w-0">
                        <code className="text-xs text-default-500">{inst.instance_id}</code>
                        {inst.current_task_title && (
                          <p className="text-xs text-default-400 truncate" title={inst.current_task_title}>
                            → {inst.current_task_title}
                          </p>
                        )}
                      </div>
                      <Chip size="sm" variant="flat" color={inst.status === "idle" ? "success" : "warning"}>
                        {inst.status}
                      </Chip>
                    </div>
                  ))}
                </CardBody>
              </>
            )}

            {profileInstances.length === 0 && (
              <CardBody className="pt-1 pb-2">
                <p className="text-xs text-default-400 italic">No instances running</p>
              </CardBody>
            )}
          </Card>
        );
      })}
    </div>
  );
}
