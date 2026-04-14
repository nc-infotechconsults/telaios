/**
 * InfraAgent — generates infrastructure-as-code files for a project.
 *
 * Generates Dockerfiles, docker-compose.yml, Kubernetes manifests, and
 * CI pipeline configs (GitHub Actions / GitLab CI). This is the Phase 2
 * foundation; Phase 5 will add live Docker/k8s environment management.
 *
 * Lifecycle:
 *  onInit    — build LLM, detect workspace stack
 *  onExecute — generate IaC files via LLM, write to workspaces
 *  onCleanup — no-op
 *
 * Events published via AgentEventBus:
 *  "infra.started"   { agentId, executionId }
 *  "infra.generated" { agentId, executionId, filesGenerated, files }
 *  "infra.failed"    { agentId, executionId, error }
 */
import { BaseAgent } from "../../core/agent-framework/base-agent";
import type { AgentContext } from "../../core/agent-framework/context";
import { getAgentEventBus } from "../../core/agent-framework/event-bus";
import { buildChatModel } from "../../core/llm";
import {
  detectStack,
  writeTemplates,
  buildInfraPrompt,
  type InfraTemplate,
  type InfraTemplateRequest,
} from "./template-gen";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";
import { HumanMessage, SystemMessage } from "@langchain/core/messages";

export interface InfraAgentConfig {
  llmProvider: string;
  llmModel: string;
  llmApiKey: string;
  llmBaseUrl?: string;
  /**
   * Which infra targets to generate. Defaults to "all".
   */
  target?: InfraTemplateRequest["target"];
  /** Application port. Default: 3000. */
  port?: number;
}

export class InfraAgent extends BaseAgent {
  private llm!: BaseChatModel;

  constructor(
    id: string,
    private readonly config: InfraAgentConfig,
  ) {
    super(id, "infra");
  }

  protected async onInit(_ctx: AgentContext): Promise<void> {
    this.llm = buildChatModel({
      provider: this.config.llmProvider,
      model: this.config.llmModel,
      apiKey: this.config.llmApiKey,
      baseUrl: this.config.llmBaseUrl,
    });
  }

  protected async onExecute(ctx: AgentContext): Promise<void> {
    const bus = getAgentEventBus();
    await bus.publish("infra.started", { agentId: this.id, executionId: ctx.executionId });

    const workspaces = ctx.workspaces ?? {};
    const allWritten: string[] = [];

    for (const [repoName, localPath] of Object.entries(workspaces)) {
      const stack = await detectStack(localPath);

      const req: InfraTemplateRequest = {
        stack,
        target: this.config.target ?? "all",
        port: this.config.port ?? 3000,
        context: ctx.task?.description,
      };

      const prompt = buildInfraPrompt(req);

      let templates: InfraTemplate[] = [];
      try {
        const response = await this.llm.invoke([
          new SystemMessage(prompt),
          new HumanMessage(
            `Generate infrastructure files for the ${stack} project in repository: ${repoName}. ` +
            `Task context: ${ctx.task?.description ?? "Standard web application deployment."}`
          ),
        ]);

        const content = typeof response.content === "string"
          ? response.content
          : JSON.stringify(response.content);

        const jsonMatch = content.match(/\[[\s\S]*\]/);
        templates = JSON.parse(jsonMatch?.[0] ?? content) as InfraTemplate[];
      } catch (err) {
        await bus.publish("infra.failed", {
          agentId: this.id,
          executionId: ctx.executionId,
          error: err instanceof Error ? err.message : String(err),
        });
        this._result = {
          success: false,
          output: "",
          error: `Failed to generate infra templates: ${err instanceof Error ? err.message : String(err)}`,
        };
        return;
      }

      const written = await writeTemplates(localPath, templates);
      allWritten.push(...written.map((f) => `${repoName}/${f}`));
    }

    this._result = {
      success: true,
      output: JSON.stringify({
        filesGenerated: allWritten.length,
        files: allWritten,
      }),
    };

    await bus.publish("infra.generated", {
      agentId: this.id,
      executionId: ctx.executionId,
      filesGenerated: allWritten.length,
      files: allWritten,
    });
  }

  protected async onCleanup(): Promise<void> {
    // Nothing to release
  }
}
