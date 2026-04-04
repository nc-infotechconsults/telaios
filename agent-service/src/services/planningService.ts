import type { WebSocket } from "ws";
import { buildPlanningGraph } from "../agents/planning/graph";
import { buildChatModel } from "../core/llm";
import { decrypt } from "../core/crypto";
import { dataClient } from "./dataClient";
import { wsManager } from "./wsManager";
import type { PlanningState } from "../agents/planning/state";
import { startExecution } from "./executionService";

const sessions = new Map<string, PlanningState>();

export async function handleUserMessage(
  projectId: string,
  content: string,
  ws: WebSocket
): Promise<void> {
  let state = sessions.get(projectId);

  if (!state) {
    const [settings, profiles, repos] = await Promise.all([
      dataClient.getSettings(),
      dataClient.getAgentProfiles(),
      dataClient.getProjectRepositories(projectId),
    ]);

    const llm = buildChatModel({
      provider: settings.llm_provider,
      model: settings.llm_model,
      apiKey: settings.llm_api_key_raw ?? "",
      baseUrl: settings.llm_base_url,
    });

    state = {
      projectId,
      messages: [],
      interviewComplete: false,
      planDraft: null,
      userConfirmed: false,
      userRequestedChanges: null,
      agentProfiles: profiles,
      projectRepositories: repos,
      error: null,
    };

    const graph = buildPlanningGraph(llm);
    const initialOutput = await graph.invoke(state);
    state = { ...state, ...initialOutput };
    sessions.set(projectId, state);

    const greeting = state.messages[state.messages.length - 1];
    if (greeting) {
      ws.send(JSON.stringify({ type: "chat_token", content: greeting.content }));
      await dataClient.saveMessage({ project_id: projectId, role: "assistant", content: greeting.content });
    }
    return;
  }

  state.messages.push({ role: "user", content });
  await dataClient.saveMessage({ project_id: projectId, role: "user", content });

  const lowerContent = content.toLowerCase().trim();
  const isConfirm =
    lowerContent === "confirm" ||
    lowerContent === "yes" ||
    lowerContent.startsWith("confirm") ||
    lowerContent.includes("looks good") ||
    lowerContent.includes("start execution");

  if (state.planDraft && !state.userConfirmed) {
    if (isConfirm) {
      state.userConfirmed = true;
    } else {
      state.userRequestedChanges = content;
    }
  }

  const settings = await dataClient.getSettings();
  const llm = buildChatModel({
    provider: settings.llm_provider,
    model: settings.llm_model,
    apiKey: settings.llm_api_key_raw ?? "",
    baseUrl: settings.llm_base_url,
  });

  const graph = buildPlanningGraph(llm);
  const output = await graph.invoke(state);
  state = { ...state, ...output };
  sessions.set(projectId, state);

  const lastMsg = state.messages[state.messages.length - 1];
  if (lastMsg?.role === "assistant" && lastMsg.content) {
    ws.send(JSON.stringify({ type: "chat_token", content: lastMsg.content }));
    await dataClient.saveMessage({ project_id: projectId, role: "assistant", content: lastMsg.content });
  }

  if (state.planDraft && !state.userConfirmed) {
    wsManager.broadcast(projectId, { type: "plan_draft", plan: state.planDraft });
  }

  if (state.userConfirmed) {
    const plans = await dataClient.createPlan({
      project_id: projectId,
      status: "confirmed",
      confirmed_at: new Date().toISOString(),
    });
    wsManager.broadcast(projectId, { type: "plan_confirmed", plan_id: plans.id });

    sessions.delete(projectId);
    void startExecution(projectId, plans.id);
  }
}
