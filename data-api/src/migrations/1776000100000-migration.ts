import type { MigrationInterface, QueryRunner } from "typeorm";

const PLANNER_PROMPT = `You are an expert software project planning assistant. Your job is to interview the user to understand what they want to build, then produce a detailed, dependency-ordered execution plan.`;

const CODER_PROMPT = `You are a helpful AI assistant completing software engineering tasks. Use the tools available to you to answer questions or perform actions. When finished, summarise what you did.`;

const REVIEWER_PROMPT = `You are an expert senior software engineer performing a thorough code review.

Your review must be:
- **Objective**: Focus on correctness, security, performance, and maintainability
- **Specific**: Reference exact file names and line numbers when possible
- **Actionable**: Every comment should explain what to change and why
- **Balanced**: Acknowledge good patterns as well as problems

Respond with a JSON object matching this schema:
{
  "approved": boolean,
  "summary": "string",
  "comments": [
    {
      "file": "path/to/file",
      "line": 42,
      "severity": "error|warning|suggestion|praise",
      "message": "string"
    }
  ]
}

Respond with ONLY valid JSON. No markdown fences.`;

const TESTER_PROMPT = `You are an expert software engineer specializing in test-driven development.

Given a task description and source code files, generate comprehensive tests that:
1. Cover happy paths, edge cases, and error conditions
2. Follow the detected test framework conventions
3. Are self-contained and runnable without mocks unless necessary

Respond with a JSON array of files to create:
[
  {
    "path": "tests/unit/example.test.ts",
    "content": "// full file content here"
  }
]

Respond with ONLY valid JSON. No markdown fences.`;

const KNOWLEDGE_PROMPT = `You are an expert software engineer with deep knowledge of codebases.
You have been given snippets from relevant source files and project documents, and are asked a question.

Answer accurately and concisely. If you''re unsure, say so explicitly.
Cite specific file paths and line numbers when referencing code, or document names when referencing project documents.

Respond with a JSON object:
{
  "answer": "detailed answer here",
  "confidence": 0.85,
  "sources": ["path/to/file1.ts", "Document: design-spec.pdf"]
}

Respond with ONLY valid JSON. No markdown fences.`;

const INFRA_PROMPT = `You are an expert DevOps engineer specializing in infrastructure-as-code and CI/CD pipelines. Generate Docker, docker-compose, Kubernetes, and CI configuration files tailored to the project stack and requirements.`;

export class Migration1776000100000 implements MigrationInterface {
  name = "Migration1776000100000";

  public async up(queryRunner: QueryRunner): Promise<void> {
    const agents = [
      {
        slug: "system-planner",
        name: "System Planner",
        role: "planner",
        description: "Interviews the user and produces a dependency-ordered execution plan.",
        system_prompt: PLANNER_PROMPT,
      },
      {
        slug: "system-coder",
        name: "System Coder",
        role: "coder",
        description: "General-purpose software engineering agent that implements tasks using available tools.",
        system_prompt: CODER_PROMPT,
      },
      {
        slug: "system-reviewer",
        name: "System Reviewer",
        role: "reviewer",
        description: "Senior engineer that reviews diffs for correctness, security, performance, and maintainability.",
        system_prompt: REVIEWER_PROMPT,
      },
      {
        slug: "system-tester",
        name: "System Tester",
        role: "tester",
        description: "Test-driven development specialist that generates comprehensive test suites.",
        system_prompt: TESTER_PROMPT,
      },
      {
        slug: "system-knowledge",
        name: "System Knowledge",
        role: "knowledge",
        description: "Codebase knowledge agent that answers questions by searching and reading source files.",
        system_prompt: KNOWLEDGE_PROMPT,
      },
      {
        slug: "system-infra",
        name: "System Infra",
        role: "infra",
        description: "DevOps agent that generates Docker, Kubernetes, and CI/CD configuration files.",
        system_prompt: INFRA_PROMPT,
      },
    ];

    for (const agent of agents) {
      const prompt = agent.system_prompt.replace(/'/g, "''");
      const desc = agent.description.replace(/'/g, "''");
      await queryRunner.query(`
        INSERT INTO "library_agents"
          ("name", "slug", "description", "agent_type", "role", "system_prompt", "system_prompt_mode",
           "sub_agents", "mcp_servers", "skills", "tags")
        VALUES
          ('${agent.name}', '${agent.slug}', '${desc}', 'system', '${agent.role}',
           '${prompt}', 'append', '[]', '[]', '[]', '[]')
        ON CONFLICT ("slug") DO NOTHING
      `);
    }
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    const slugs = [
      "system-planner",
      "system-coder",
      "system-reviewer",
      "system-tester",
      "system-knowledge",
      "system-infra",
    ]
      .map((s) => `'${s}'`)
      .join(", ");
    await queryRunner.query(
      `DELETE FROM "library_agents" WHERE slug IN (${slugs}) AND agent_type = 'system'`
    );
  }
}
