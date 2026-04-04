import { Chip, Divider, Button } from "@heroui/react";
import type { Plan, Task, AgentProfile, Repository } from "../../types";
import TaskCard from "./TaskCard";

interface Props {
  plan?: Plan;
  tasks: Task[];
  agentProfiles: AgentProfile[];
  repositories: Repository[];
  onConfirm: () => void;
  onRequestChanges: () => void;
}

export default function PlanConfirmModal({
  tasks,
  agentProfiles,
  repositories,
  onConfirm,
  onRequestChanges,
}: Props) {
  const sorted = [...tasks].sort((a, b) => a.execution_order - b.execution_order);

  // Group by agent profile to show summary
  const profileSummary = agentProfiles
    .filter((p) => tasks.some((t) => t.agent_profile_id === p.id))
    .map((p) => ({
      profile: p,
      taskCount: tasks.filter((t) => t.agent_profile_id === p.id).length,
    }));

  return (
    <div className="space-y-4">
      {/* Summary */}
      <div className="p-3 rounded-xl bg-default-50 space-y-2">
        <p className="text-sm font-semibold">Plan Summary</p>
        <div className="flex flex-wrap gap-2 text-xs text-default-600">
          <span>📋 {tasks.length} task{tasks.length !== 1 ? "s" : ""}</span>
          <span>🗂 {repositories.length} repo{repositories.length !== 1 ? "s" : ""}</span>
          <span>🤖 {profileSummary.length} agent profile{profileSummary.length !== 1 ? "s" : ""}</span>
        </div>
        {profileSummary.length > 0 && (
          <div className="flex flex-wrap gap-1">
            {profileSummary.map(({ profile, taskCount }) => (
              <Chip key={profile.id} size="sm" variant="flat" color="secondary">
                {profile.name} ({profile.agent_type}) — {taskCount} task{taskCount > 1 ? "s" : ""}
              </Chip>
            ))}
          </div>
        )}
      </div>

      <Divider />

      {/* Task list */}
      <p className="text-sm font-semibold text-default-600">Execution Order</p>
      <div className="space-y-2 max-h-[400px] overflow-y-auto pr-1">
        {sorted.map((task, i) => {
          const profile = agentProfiles.find((p) => p.id === task.agent_profile_id);
          return (
            <div key={task.id} className="flex gap-3 items-start">
              <div className="w-6 h-6 rounded-full bg-default-200 flex items-center justify-center text-xs font-bold shrink-0 mt-0.5">
                {i + 1}
              </div>
              <div className="flex-1">
                <TaskCard task={task} profile={profile} repositories={repositories} />
              </div>
            </div>
          );
        })}
      </div>

      <Divider />

      <p className="text-xs text-default-400">
        After confirming, the plan is locked and execution begins immediately. You cannot modify
        tasks after this point.
      </p>

      <div className="flex gap-2 pt-1">
        <Button color="success" onPress={onConfirm} className="flex-1">
          ✓ Confirm &amp; Execute
        </Button>
        <Button variant="bordered" onPress={onRequestChanges} className="flex-1">
          ✎ Request Changes
        </Button>
      </div>
    </div>
  );
}
