import { StateGraph, Annotation, END } from "@langchain/langgraph";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";
import * as fs from "fs/promises";
import * as path from "path";
import { exec } from "child_process";
import { promisify } from "util";
import type { CodingAgentDriver, AgentTask, AgentResult, AgentStatus } from "./base";
import type { Skill } from "../../../core/types";

const execAsync = promisify(exec);

interface LangGraphDriverConfig {
  llm: BaseChatModel;
  skills: Skill[];
}

const CodingStateAnnotation = Annotation.Root({
  systemPrompt: Annotation<string>(),
  task: Annotation<AgentTask>(),
  workspaces: Annotation<Record<string, string>>(),
  thoughts: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  actions: Annotation<string[]>({ reducer: (a, b) => [...a, ...b], default: () => [] }),
  result: Annotation<string>({ reducer: (_a, b) => b, default: () => "" }),
  done: Annotation<boolean>({ reducer: (_a, b) => b, default: () => false }),
  error: Annotation<string | null>({ reducer: (_a, b) => b, default: () => null }),
});

type CodingState = typeof CodingStateAnnotation.State;

export class LangGraphDriver implements CodingAgentDriver {
  private status: AgentStatus = "idle";
  private config: LangGraphDriverConfig;

  constructor(cfg: LangGraphDriverConfig) {
    this.config = cfg;
  }

  async getStatus(): Promise<AgentStatus> {
    return this.status;
  }

  async execute(task: AgentTask, workspaces: Record<string, string>): Promise<AgentResult> {
    this.status = "busy";

    const skillsContext =
      this.config.skills.length > 0
        ? "\n\nAvailable skills:\n" +
          this.config.skills.map((s) => `## ${s.name}\n${s.instructions}`).join("\n\n")
        : "";

    const systemPrompt =
      `You are an expert software engineer. Complete the following coding task.\n` +
      `Available workspaces (repo_name → local_path):\n` +
      Object.entries(workspaces)
        .map(([name, p]) => `  ${name}: ${p}`)
        .join("\n") +
      `\n\nTask: ${task.title}\n${task.description}` +
      skillsContext +
      `\n\nUse shell commands and file operations to complete the task. ` +
      `When done, summarize what was accomplished.`;

    try {
      const workflow = this.buildGraph();
      const finalState = await workflow.invoke({
        systemPrompt,
        task,
        workspaces,
        thoughts: [],
        actions: [],
        result: "",
        done: false,
        error: null,
      });

      this.status = "idle";
      const state = finalState as CodingState;
      return {
        success: !state.error,
        output: state.result,
        error: state.error ?? undefined,
      };
    } catch (err) {
      this.status = "error";
      return { success: false, output: "", error: String(err) };
    }
  }

  private buildGraph() {
    const self = this;

    const workflow = new StateGraph(CodingStateAnnotation)
      .addNode("think", async (state: CodingState) => {
        const response = await self.config.llm.invoke([
          new SystemMessage(state.systemPrompt),
          new HumanMessage(
            state.thoughts.length === 0
              ? "Start working on the task. Describe your plan and first action."
              : `Previous actions: ${state.actions.join("; ")}. What next? If done, say DONE: <summary>.`
          ),
        ]);
        const content = typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

        if (content.startsWith("DONE:")) {
          return { result: content.slice(5).trim(), done: true, thoughts: [content] };
        }
        return { thoughts: [content] };
      })
      .addNode("act", async (state: CodingState) => {
        const lastThought = state.thoughts[state.thoughts.length - 1];
        const shellMatch = lastThought?.match(/```(?:bash|sh)\n([\s\S]*?)```/);
        if (shellMatch) {
          const cmd = shellMatch[1].trim();
          const cwd = (Object.values(state.workspaces)[0] as string | undefined) ?? "/tmp";
          try {
            const { stdout, stderr } = await execAsync(cmd, { cwd });
            return { actions: [`$ ${cmd}\n${stdout}${stderr}`] };
          } catch (err) {
            return { actions: [`$ ${cmd}\nERROR: ${err}`] };
          }
        }

        const writeMatch = lastThought?.match(/WRITE_FILE:([^\n]+)\n([\s\S]*?)END_FILE/);
        if (writeMatch) {
          const [, filePath, content] = writeMatch;
          const cwd = (Object.values(state.workspaces)[0] as string | undefined) ?? "/tmp";
          const fullPath = path.resolve(cwd, filePath.trim());
          await fs.mkdir(path.dirname(fullPath), { recursive: true });
          await fs.writeFile(fullPath, content);
          return { actions: [`Wrote ${filePath.trim()}`] };
        }

        return { actions: ["No action taken"] };
      })
      .addEdge("__start__", "think")
      .addConditionalEdges("think", (state: CodingState) => (state.done ? END : "act"))
      .addEdge("act", "think");

    return workflow.compile();
  }
}
