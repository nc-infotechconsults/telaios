import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { PlanningState, PlannedTask } from "./state";
import { dataClient } from "../../services/dataClient";

const SYSTEM_PROMPT = `You are an expert software project planning assistant.
Your job is to interview the user to understand what they want to build, then produce
a detailed, dependency-ordered execution plan. You know which specialized coding agents
are available and their capabilities. Assign each task to the most suitable agent profile.`;

export function buildNodes(llm: BaseChatModel) {
  async function greet(state: PlanningState): Promise<Partial<PlanningState>> {
    const greeting =
      "Hello! I'm your AI planning assistant. I'll help you break down your project into an actionable execution plan.\n\n" +
      "Tell me: **what are you building?** (You can describe it at any level of detail — we'll refine together.)";
    return {
      messages: [
        ...state.messages,
        { role: "assistant", content: greeting },
      ],
    };
  }

  async function interview(state: PlanningState): Promise<Partial<PlanningState>> {
    const systemMsg = {
      role: "system" as const,
      content:
        SYSTEM_PROMPT +
        "\n\nAvailable agent profiles:\n" +
        state.agentProfiles
          .map(
            (p) =>
              `- ${p.name} (${p.agent_type}): ${p.description}. Skills: ${p.skills.map((s) => s.name).join(", ") || "none"}`
          )
          .join("\n") +
        "\n\nProject repositories:\n" +
        state.projectRepositories
          .map((r) => `- ${r.name}: ${r.remote_url}`)
          .join("\n") +
        "\n\nContinue the interview. Ask ONE focused follow-up question to gather " +
        "enough context to build a plan. When you have enough info, respond with " +
        "ONLY the JSON marker: {\"ready_to_plan\": true}",
    };

    const response = await llm.invoke([
      systemMsg,
      ...state.messages.map((m) => ({ role: m.role, content: m.content })),
    ]);

    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    let interviewComplete = false;
    try {
      const parsed = JSON.parse(content);
      if (parsed.ready_to_plan) interviewComplete = true;
    } catch {
      // not JSON — continue interview
    }

    return {
      messages: [
        ...state.messages,
        { role: "assistant", content: interviewComplete ? "" : content },
      ],
      interviewComplete,
    };
  }

  async function draftPlan(state: PlanningState): Promise<Partial<PlanningState>> {
    const systemMsg = {
      role: "system" as const,
      content:
        SYSTEM_PROMPT +
        "\n\nAvailable agent profiles:\n" +
        state.agentProfiles
          .map(
            (p) =>
              `- id:${p.id} name:${p.name} type:${p.agent_type} skills:[${p.skills.map((s) => s.name).join(",")}]`
          )
          .join("\n") +
        "\n\nProject repositories:\n" +
        state.projectRepositories
          .map((r) => `- id:${r.id} name:${r.name}`)
          .join("\n") +
        "\n\nBased on the conversation, produce a JSON execution plan with this exact schema:\n" +
        '{"tasks":[{"title":"string","description":"string","type":"code|test|review|general",' +
        '"execution_order":0,"depends_on_task_indices":[],"recommended_agent_profile_id":"uuid_or_null",' +
        '"repository_ids":["repo_uuid"]}]}\n' +
        "Rules:\n" +
        "- depends_on_task_indices are 0-based indices into the tasks array\n" +
        "- repository_ids should include all repos the task needs to read/write\n" +
        "- Assign the best-matching agent profile for each task based on its type and skills\n" +
        "Respond with ONLY valid JSON.",
    };

    const response = await llm.invoke([
      systemMsg,
      ...state.messages.map((m) => ({ role: m.role, content: m.content })),
    ]);

    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: "Failed to parse plan from LLM response" };
    }

    const planDraft = JSON.parse(jsonMatch[0]) as { tasks: PlannedTask[] };
    return { planDraft, error: null };
  }

  async function review(state: PlanningState): Promise<Partial<PlanningState>> {
    if (!state.planDraft) {
      return { error: "No plan draft to review" };
    }

    const profileMap = new Map(state.agentProfiles.map((p) => [p.id, p.name]));
    const repoMap = new Map(state.projectRepositories.map((r) => [r.id, r.name]));

    const planSummary = state.planDraft.tasks
      .map(
        (t, i) =>
          `${i + 1}. **${t.title}** (${t.type})\n` +
          `   - Agent: ${t.recommended_agent_profile_id ? profileMap.get(t.recommended_agent_profile_id) ?? "Unknown" : "None"}\n` +
          `   - Repos: ${t.repository_ids.map((id) => repoMap.get(id) ?? id).join(", ") || "none"}\n` +
          `   - Depends on: ${t.depends_on_task_indices.length ? t.depends_on_task_indices.map((i) => `Task ${i + 1}`).join(", ") : "none"}\n` +
          `   - ${t.description}`
      )
      .join("\n\n");

    const reviewMessage =
      `Here's the execution plan I've drafted:\n\n${planSummary}\n\n` +
      "Does this look good? You can:\n" +
      "- **Confirm** to start execution\n" +
      "- **Request changes** (describe what to adjust)";

    return {
      messages: [
        ...state.messages,
        { role: "assistant", content: reviewMessage },
      ],
    };
  }

  async function refine(state: PlanningState): Promise<Partial<PlanningState>> {
    if (!state.userRequestedChanges || !state.planDraft) {
      return {};
    }

    const systemMsg = {
      role: "system" as const,
      content:
        SYSTEM_PROMPT +
        "\n\nThe user wants to change the plan. Their feedback: " +
        state.userRequestedChanges +
        "\n\nCurrent plan:\n" +
        JSON.stringify(state.planDraft, null, 2) +
        "\n\nAvailable profiles:\n" +
        state.agentProfiles
          .map((p) => `- id:${p.id} name:${p.name}`)
          .join("\n") +
        "\n\nAvailable repos:\n" +
        state.projectRepositories.map((r) => `- id:${r.id} name:${r.name}`).join("\n") +
        "\n\nProduce an updated plan JSON following the same schema. Respond with ONLY valid JSON.",
    };

    const response = await llm.invoke([systemMsg]);
    const content = typeof response.content === "string"
      ? response.content
      : JSON.stringify(response.content);

    const jsonMatch = content.match(/\{[\s\S]*\}/);
    if (!jsonMatch) {
      return { error: "Failed to parse refined plan" };
    }

    return {
      planDraft: JSON.parse(jsonMatch[0]) as { tasks: PlannedTask[] },
      userRequestedChanges: null,
      error: null,
    };
  }

  async function confirm(state: PlanningState): Promise<Partial<PlanningState>> {
    if (!state.planDraft) return {};

    const plan = await dataClient.createPlan({
      project_id: state.projectId,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });

    for (let i = 0; i < state.planDraft.tasks.length; i++) {
      const t = state.planDraft.tasks[i];
      const depIndices = t.depends_on_task_indices ?? [];
      await dataClient.createTask({
        plan_id: plan.id,
        title: t.title,
        description: t.description,
        type: t.type,
        execution_order: t.execution_order ?? i,
        agent_profile_id: t.recommended_agent_profile_id ?? null,
        repository_ids: t.repository_ids ?? [],
        status: depIndices.length === 0 ? "ready" : "pending",
      });
    }

    return {
      userConfirmed: true,
      messages: [
        ...state.messages,
        {
          role: "assistant",
          content: `✅ Plan confirmed and saved! Execution will begin shortly. Plan ID: \`${plan.id}\``,
        },
      ],
    };
  }

  return { greet, interview, draftPlan, review, refine, confirm };
}
