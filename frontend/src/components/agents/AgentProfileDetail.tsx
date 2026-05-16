import { Chip, Code } from "../ui";
import type { AgentProfile, McpServer, McpToolConfig, Skill } from "../../types";
import { McpToolBody } from "../McpToolBody";

// ─── helpers ──────────────────────────────────────────────────────────────────

const TYPE_COLOR: Record<AgentProfile["agent_type"], "primary" | "secondary" | "success"> = {
  langgraph: "primary",
  opencode: "secondary",
  "github-copilot": "success",
};
const TYPE_LABEL: Record<AgentProfile["agent_type"], string> = {
  langgraph: "LangGraph",
  opencode: "OpenCode",
  "github-copilot": "GitHub Copilot",
};

const MASK = "••••••••";

// ─── Section wrapper ──────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold uppercase tracking-wider text-default-400 mb-3">{title}</h3>
      <div className="apple-card p-4 space-y-2">{children}</div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: React.ReactNode }) {
  return (
    <div className="flex items-start gap-2 text-sm">
      <span className="text-default-400 shrink-0 w-36">{label}</span>
      <span className="text-default-700 break-all">{value ?? "—"}</span>
    </div>
  );
}

// ─── MCP tool card ────────────────────────────────────────────────────────────

function ToolCard({ tool }: { tool: McpToolConfig }) {
  return (
    <div className="rounded-xl border border-divider bg-background/40 p-3 space-y-3">
      <div className="flex items-center gap-2">
        <span className="font-mono text-xs font-semibold text-default-700 flex-1 truncate">
          {tool.name}
        </span>
        <Chip size="sm" variant="flat" color={tool.allowed ? "success" : "danger"}>
          {tool.allowed ? "allowed" : "blocked"}
        </Chip>
      </div>
      <McpToolBody tool={tool} />
    </div>
  );
}

// ─── MCP server card ──────────────────────────────────────────────────────────

function McpServerCard({ server }: { server: McpServer }) {
  const envEntries = Object.entries(server.env ?? {});
  const headerEntries = Object.entries(server.headers ?? {});

  return (
    <div className="rounded-xl border border-divider bg-background/40 p-4 space-y-3">
      {/* Header row */}
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{server.name}</span>
        <Chip size="sm" variant="flat" color="default">
          {server.transport}
        </Chip>
      </div>

      {/* Transport details */}
      {server.transport === "stdio" && server.command && (
        <div className="text-xs font-mono text-default-500 bg-default-50 rounded-lg px-3 py-1.5 border border-divider">
          {[server.command, ...(server.args ?? [])].join(" ")}
        </div>
      )}
      {server.transport === "streamable-http" && server.url && (
        <Row label="URL" value={server.url} />
      )}

      {/* Env vars */}
      {envEntries.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-default-400 font-medium">Environment</span>
          {envEntries.map(([k]) => (
            <div key={k} className="flex items-center gap-1 text-xs font-mono pl-2">
              <span className="text-default-600">{k}</span>
              <span className="text-default-300">=</span>
              <span className="text-default-400">{MASK}</span>
            </div>
          ))}
        </div>
      )}

      {/* HTTP headers */}
      {headerEntries.length > 0 && (
        <div className="space-y-1">
          <span className="text-xs text-default-400 font-medium">Headers</span>
          {headerEntries.map(([k]) => (
            <div key={k} className="flex items-center gap-1 text-xs font-mono pl-2">
              <span className="text-default-600">{k}</span>
              <span className="text-default-300">:</span>
              <span className="text-default-400">{MASK}</span>
            </div>
          ))}
        </div>
      )}

      {/* Tools */}
      {server.tools && server.tools.length > 0 && (
        <div className="space-y-2">
          <span className="text-xs text-default-400 font-medium">
            Tools ({server.tools.length})
          </span>
          <div className="space-y-2">
            {server.tools.map((t, i) => (
              <ToolCard key={i} tool={t} />
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

// ─── Skill card ───────────────────────────────────────────────────────────────

function SkillCard({ skill }: { skill: Skill }) {
  const inputProps = Object.keys(skill.inputSchema?.properties ?? {});
  const outputProps = Object.keys(skill.outputSchema?.properties ?? {});

  return (
    <div className="rounded-xl border border-divider bg-background/40 p-3 space-y-2">
      <div className="flex items-center gap-2">
        <span className="font-semibold text-sm">{skill.title ?? skill.name}</span>
        <span className="text-xs font-mono text-default-400">({skill.name})</span>
      </div>
      {skill.description && (
        <p className="text-xs text-default-500">{skill.description}</p>
      )}
      {inputProps.length > 0 && (
        <div className="text-xs text-default-400">
          <span className="font-medium">Input: </span>
          {inputProps.join(", ")}
        </div>
      )}
      {outputProps.length > 0 && (
        <div className="text-xs text-default-400">
          <span className="font-medium">Output: </span>
          {outputProps.join(", ")}
        </div>
      )}
      {skill.instructions && (
        <details className="text-xs text-default-500">
          <summary className="cursor-pointer select-none text-default-400">Instructions</summary>
          <pre className="mt-1 whitespace-pre-wrap font-mono text-[11px] bg-default-50 rounded-lg p-2 border border-divider overflow-auto max-h-40">
            {skill.instructions}
          </pre>
        </details>
      )}
    </div>
  );
}

// ─── Main component ───────────────────────────────────────────────────────────

interface AgentProfileDetailProps {
  profile: AgentProfile;
  /** All profiles — used to resolve sub-agent names. */
  allProfiles?: AgentProfile[];
}

export default function AgentProfileDetail({ profile, allProfiles = [] }: AgentProfileDetailProps) {
  const hasLlm = profile.llm_provider || profile.llm_model;
  const hasSystemPrompt = !!profile.system_prompt;
  const hasMcps = profile.mcp_servers.length > 0;
  const hasSkills = profile.skills.length > 0;
  const hasSubAgents = (profile.sub_agent_ids?.length ?? 0) > 0;
  const hasStructuredOutput = !!profile.structured_output;

  return (
    <div className="space-y-6">
      {/* ── Header ── */}
      <div className="flex items-start gap-3">
        <div className="flex-1 min-w-0">
          <h2 className="text-xl font-bold leading-tight">{profile.name}</h2>
          {profile.description && (
            <p className="text-default-500 text-sm mt-1 leading-relaxed">{profile.description}</p>
          )}
        </div>
        <Chip color={TYPE_COLOR[profile.agent_type]} variant="flat" className="shrink-0">
          {TYPE_LABEL[profile.agent_type]}
        </Chip>
      </div>

      {/* ── LLM Configuration ── */}
      {hasLlm && (
        <Section title="LLM Configuration">
          {profile.llm_provider && <Row label="Provider" value={profile.llm_provider} />}
          {profile.llm_model && <Row label="Model" value={profile.llm_model} />}
          {profile.llm_base_url && <Row label="Base URL" value={profile.llm_base_url} />}
          <Row
            label="API Key"
            value={
              profile.has_llm_api_key ? (
                <span className="font-mono text-default-400">{MASK}</span>
              ) : (
                <span className="text-warning-500 text-xs">not set</span>
              )
            }
          />
          {profile.llm_temperature != null && (
            <Row label="Temperature" value={profile.llm_temperature} />
          )}
          {profile.llm_max_tokens != null && (
            <Row label="Max Tokens" value={profile.llm_max_tokens} />
          )}
          {profile.llm_top_p != null && (
            <Row label="Top P" value={profile.llm_top_p} />
          )}
          {profile.llm_frequency_penalty != null && (
            <Row label="Frequency Penalty" value={profile.llm_frequency_penalty} />
          )}
          {profile.llm_presence_penalty != null && (
            <Row label="Presence Penalty" value={profile.llm_presence_penalty} />
          )}
          {profile.agent_type === "github-copilot" && (
            <Row
              label="GitHub Token"
              value={
                profile.has_github_token ? (
                  <span className="font-mono text-default-400">{MASK}</span>
                ) : (
                  <span className="text-warning-500 text-xs">not set</span>
                )
              }
            />
          )}
        </Section>
      )}

      {/* ── System Prompt ── */}
      {hasSystemPrompt && (
        <Section title="System Prompt">
          <div className="flex gap-2 mb-2">
            <Chip size="sm" variant="flat" color="default">
              {profile.system_prompt_mode === "override" ? "Override" : "Extend"}
            </Chip>
          </div>
          <pre className="text-xs text-default-600 whitespace-pre-wrap font-mono bg-default-50 p-3 rounded-xl border border-divider overflow-auto max-h-48 leading-relaxed">
            {profile.system_prompt}
          </pre>
        </Section>
      )}

      {/* ── MCP Servers ── */}
      {hasMcps && (
        <Section title={`MCP Servers (${profile.mcp_servers.length})`}>
          <div className="space-y-3">
            {profile.mcp_servers.map((srv, i) => (
              <McpServerCard key={i} server={srv} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Skills ── */}
      {hasSkills && (
        <Section title={`Skills (${profile.skills.length})`}>
          <div className="space-y-3">
            {profile.skills.map((s, i) => (
              <SkillCard key={i} skill={s} />
            ))}
          </div>
        </Section>
      )}

      {/* ── Sub-Agents ── */}
      {hasSubAgents && (
        <Section title={`Sub-Agents (${profile.sub_agent_ids!.length})`}>
          <div className="flex flex-wrap gap-2">
            {profile.sub_agent_ids!.map((id) => {
              const resolved = allProfiles.find((p) => p.id === id);
              return (
                <Chip key={id} size="sm" variant="bordered" color="secondary">
                  {resolved ? resolved.name : id}
                </Chip>
              );
            })}
          </div>
        </Section>
      )}

      {/* ── Structured Output ── */}
      {hasStructuredOutput && (
        <Section title="Structured Output">
          <Code className="text-xs whitespace-pre-wrap break-all max-h-48 overflow-auto block">
            {JSON.stringify(profile.structured_output, null, 2)}
          </Code>
        </Section>
      )}

      {/* Empty state */}
      {!hasLlm && !hasSystemPrompt && !hasMcps && !hasSkills && !hasSubAgents && !hasStructuredOutput && (
        <p className="text-default-400 text-sm text-center py-4 italic">No additional configuration.</p>
      )}
    </div>
  );
}
