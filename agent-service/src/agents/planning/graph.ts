import { StateGraph, Annotation, END } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import type { PlanningState, PlanDraft } from "./state";
import { buildNodes } from "./nodes";

const PlanningStateAnnotation = Annotation.Root({
  projectId: Annotation<string>(),
  messages: Annotation<PlanningState["messages"]>({
    reducer: (_a, b) => b,
    default: () => [],
  }),
  interviewComplete: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  planDraft: Annotation<PlanDraft | null>({ reducer: (_a, b) => b, default: () => null }),
  userConfirmed: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  userRequestedChanges: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
  agentProfiles: Annotation<PlanningState["agentProfiles"]>({ reducer: (_a, b) => b, default: () => [] }),
  projectRepositories: Annotation<PlanningState["projectRepositories"]>({ reducer: (_a, b) => b, default: () => [] }),
  error: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
});

export function buildPlanningGraph(llm: BaseChatModel) {
  const nodes = buildNodes(llm);

  const workflow = new StateGraph(PlanningStateAnnotation)
    .addNode("greet", nodes.greet)
    .addNode("interview", nodes.interview)
    .addNode("draftPlan", nodes.draftPlan)
    .addNode("review", nodes.review)
    .addNode("refine", nodes.refine)
    .addNode("confirm", nodes.confirm)
    .addEdge("__start__", "greet")
    .addEdge("greet", "interview")
    .addConditionalEdges("interview", (state) => {
      if (state.interviewComplete) return "draftPlan";
      return "interview";
    })
    .addEdge("draftPlan", "review")
    .addConditionalEdges("review", (state) => {
      if (state.userConfirmed) return "confirm";
      if (state.userRequestedChanges) return "refine";
      return "review";
    })
    .addEdge("refine", "review")
    .addEdge("confirm", END);

  return workflow.compile();
}
