/**
 * Centralized mock data for demo mode.
 * Activated when VITE_DEMO_MODE=true (run: npm run dev:demo).
 * Pages import nothing from here directly — api.ts / ws.ts handle the switch.
 */
import type {
  Project,
  Repository,
  Plan,
  Task,
  Message,
  AgentProfile,
} from "../types";

// ─── Projects ───────────────────────────────────────────────────────────────

export const PROJECTS: Project[] = [
  {
    id: "demo-1",
    name: "E-commerce API Refactor",
    description:
      "Migrating the monolithic REST API to microservices with improved auth and caching. Zero-downtime deployment using the strangler-fig pattern.",
    status: "active",
    created_at: "2026-03-28T10:00:00Z",
  },
  {
    id: "demo-2",
    name: "Mobile App — Onboarding Flow",
    description:
      "Redesigning the user onboarding experience with step-by-step guidance, error recovery, and A/B testing support.",
    status: "active",
    created_at: "2026-04-01T09:00:00Z",
  },
  {
    id: "demo-3",
    name: "Data Pipeline Orchestration",
    description:
      "Building a fault-tolerant ETL pipeline with Apache Airflow and dbt for the data analytics team.",
    status: "closed",
    created_at: "2026-03-15T14:30:00Z",
  },
];

// ─── Repositories ────────────────────────────────────────────────────────────

export const REPOSITORIES: Record<string, Repository[]> = {
  "demo-1": [
    {
      id: "r1",
      project_id: "demo-1",
      name: "api-service",
      provider_type: "github",
      remote_url: "https://github.com/org/api-service.git",
      branch: "main",
      auth_type: "token",
      has_credentials: true,
      status: "ready",
      updated_at: "2026-03-28T10:05:00Z",
    },
    {
      id: "r2",
      project_id: "demo-1",
      name: "auth-service",
      provider_type: "github",
      remote_url: "https://github.com/org/auth-service.git",
      branch: "main",
      auth_type: "token",
      has_credentials: true,
      status: "ready",
      updated_at: "2026-03-28T10:10:00Z",
    },
    {
      id: "r1-s3",
      project_id: "demo-1",
      name: "infra-artifacts",
      provider_type: "s3",
      auth_type: "none",
      has_credentials: true,
      bucket_name: "my-infra-artifacts",
      region: "us-east-1",
      status: "ready",
      updated_at: "2026-03-28T10:12:00Z",
    },
  ],
  "demo-2": [
    {
      id: "r4",
      project_id: "demo-2",
      name: "mobile-app",
      provider_type: "github",
      remote_url: "https://github.com/org/mobile-app.git",
      branch: "main",
      auth_type: "token",
      has_credentials: true,
      status: "ready",
      updated_at: "2026-04-01T09:00:00Z",
    },
  ],
  "demo-3": [
    {
      id: "r3",
      project_id: "demo-3",
      name: "data-pipeline",
      provider_type: "github",
      remote_url: "https://github.com/org/data-pipeline.git",
      branch: "main",
      auth_type: "none",
      has_credentials: false,
      status: "ready",
      updated_at: "2026-03-16T09:00:00Z",
    },
  ],
};

// ─── Plans ───────────────────────────────────────────────────────────────────

export const PLANS: Record<string, Plan[]> = {
  "demo-1": [
    {
      id: "plan-1",
      project_id: "demo-1",
      status: "executing",
      created_at: "2026-03-28T10:04:00Z",
      confirmed_at: "2026-03-28T10:15:00Z",
    },
    {
      id: "plan-1-v1",
      project_id: "demo-1",
      status: "completed",
      created_at: "2026-03-27T15:30:00Z",
      confirmed_at: "2026-03-27T16:00:00Z",
    },
  ],
  "demo-2": [
    {
      id: "plan-draft-2",
      project_id: "demo-2",
      status: "draft",
      created_at: "2026-04-01T09:10:00Z",
    },
  ],
  "demo-3": [
    {
      id: "plan-3",
      project_id: "demo-3",
      status: "completed",
      created_at: "2026-03-15T15:00:00Z",
      confirmed_at: "2026-03-15T15:30:00Z",
    },
  ],
};

// ─── Tasks ───────────────────────────────────────────────────────────────────

export const TASKS: Record<string, Task[]> = {
  "plan-1-v1": [
    {
      id: "v1t1",
      plan_id: "plan-1-v1",
      title: "Initial service boundary analysis",
      description: "Map the monolith into candidate service domains and agree on data ownership boundaries.",
      type: "general",
      status: "done",
      execution_order: 0,
      agent_profile_id: "ap1",
      repository_ids: ["r1"],
      depends_on_task_ids: [],
      created_at: "2026-03-27T15:30:00Z",
      updated_at: "2026-03-27T17:00:00Z",
    },
    {
      id: "v1t2",
      plan_id: "plan-1-v1",
      title: "Design API gateway routing rules",
      description: "Define how the existing REST endpoints will be routed to the new microservices via the gateway.",
      type: "code",
      status: "done",
      execution_order: 1,
      agent_profile_id: "ap1",
      repository_ids: ["r1"],
      depends_on_task_ids: ["v1t1"],
      created_at: "2026-03-27T15:30:00Z",
      updated_at: "2026-03-27T18:30:00Z",
    },
    {
      id: "v1t3",
      plan_id: "plan-1-v1",
      title: "Write architectural decision records (ADRs)",
      description: "Document the strangler-fig migration strategy, technology choices, and rollback plan.",
      type: "general",
      status: "done",
      execution_order: 2,
      agent_profile_id: "ap2",
      repository_ids: ["r1"],
      depends_on_task_ids: ["v1t2"],
      created_at: "2026-03-27T15:30:00Z",
      updated_at: "2026-03-27T19:00:00Z",
    },
  ],
  "plan-1": [
    {
      id: "t1",
      plan_id: "plan-1",
      title: "Extract Auth Service",
      description:
        "Move authentication logic into a standalone service with its own database schema and JWT token management.",
      type: "code",
      status: "done",
      execution_order: 0,
      agent_profile_id: "ap1",
      repository_ids: ["r2"],
      depends_on_task_ids: [],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-28T11:00:00Z",
    },
    {
      id: "t2",
      plan_id: "plan-1",
      title: "Extract Product Catalog Service",
      description:
        "Isolate product listing, search, and inventory into a dedicated service backed by PostgreSQL.",
      type: "code",
      status: "done",
      execution_order: 1,
      agent_profile_id: "ap1",
      repository_ids: ["r1"],
      depends_on_task_ids: [],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-28T13:30:00Z",
    },
    {
      id: "t3",
      plan_id: "plan-1",
      title: "Extract Order Management Service",
      description:
        "Split order creation, status tracking, and fulfillment into its own microservice with an event-driven API.",
      type: "code",
      status: "in_progress",
      execution_order: 2,
      agent_profile_id: "ap1",
      repository_ids: ["r1"],
      depends_on_task_ids: ["t1", "t2"],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-29T08:00:00Z",
    },
    {
      id: "t4",
      plan_id: "plan-1",
      title: "Integration & Regression Tests",
      description:
        "Write end-to-end tests covering the auth → product → order flow using the new service boundaries.",
      type: "test",
      status: "pending",
      execution_order: 3,
      agent_profile_id: "ap2",
      repository_ids: ["r1", "r2"],
      depends_on_task_ids: ["t2", "t3"],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-28T10:04:00Z",
    },
    {
      id: "t5",
      plan_id: "plan-1",
      title: "Traffic Cutover & Decommission Monolith",
      description:
        "Gradually reroute 100% of traffic through the new gateway, monitor error rates, and remove legacy code.",
      type: "general",
      status: "pending",
      execution_order: 4,
      agent_profile_id: "ap1",
      repository_ids: ["r1"],
      depends_on_task_ids: ["t4"],
      created_at: "2026-03-28T10:04:00Z",
      updated_at: "2026-03-28T10:04:00Z",
    },
  ],
  "plan-draft-2": [
    {
      id: "d2t1",
      plan_id: "plan-draft-2",
      title: "Audit current drop-off funnel",
      description:
        "Use Mixpanel data to pinpoint exactly where step 3 loses users and identify the top error states.",
      type: "general",
      status: "pending",
      execution_order: 0,
      agent_profile_id: "ap1",
      repository_ids: ["r4"],
      depends_on_task_ids: [],
      created_at: "2026-04-01T09:10:00Z",
      updated_at: "2026-04-01T09:10:00Z",
    },
    {
      id: "d2t2",
      plan_id: "plan-draft-2",
      title: "Redesign step 3 with inline validation",
      description:
        "Replace blocking error dialogs with inline field-level messages. Add a persistent progress bar.",
      type: "code",
      status: "pending",
      execution_order: 1,
      agent_profile_id: "ap1",
      repository_ids: ["r4"],
      depends_on_task_ids: ["d2t1"],
      created_at: "2026-04-01T09:10:00Z",
      updated_at: "2026-04-01T09:10:00Z",
    },
    {
      id: "d2t3",
      plan_id: "plan-draft-2",
      title: "Add back-navigation with state preservation",
      description:
        "Implement wizard state persisted in sessionStorage so users can go back without losing data.",
      type: "code",
      status: "pending",
      execution_order: 2,
      agent_profile_id: "ap1",
      repository_ids: ["r4"],
      depends_on_task_ids: ["d2t1"],
      created_at: "2026-04-01T09:10:00Z",
      updated_at: "2026-04-01T09:10:00Z",
    },
    {
      id: "d2t4",
      plan_id: "plan-draft-2",
      title: "Write automated UI tests",
      description:
        "Playwright tests for the full 5-step flow, including back navigation and validation error paths.",
      type: "test",
      status: "pending",
      execution_order: 3,
      agent_profile_id: "ap2",
      repository_ids: ["r4"],
      depends_on_task_ids: ["d2t2", "d2t3"],
      created_at: "2026-04-01T09:10:00Z",
      updated_at: "2026-04-01T09:10:00Z",
    },
  ],
  "plan-3": [
    {
      id: "p3t1",
      plan_id: "plan-3",
      title: "Design Airflow DAG topology",
      description: "Define DAG structure, task dependencies, and retry policies for the ETL pipeline.",
      type: "general",
      status: "done",
      execution_order: 0,
      agent_profile_id: "ap1",
      repository_ids: ["r3"],
      depends_on_task_ids: [],
      created_at: "2026-03-15T15:00:00Z",
      updated_at: "2026-03-16T10:00:00Z",
    },
    {
      id: "p3t2",
      plan_id: "plan-3",
      title: "Implement dbt transformation models",
      description: "Write dbt models for the staging, intermediate, and marts layers with full test coverage.",
      type: "code",
      status: "done",
      execution_order: 1,
      agent_profile_id: "ap1",
      repository_ids: ["r3"],
      depends_on_task_ids: ["p3t1"],
      created_at: "2026-03-15T15:00:00Z",
      updated_at: "2026-03-17T11:00:00Z",
    },
    {
      id: "p3t3",
      plan_id: "plan-3",
      title: "Set up monitoring & alerting",
      description:
        "Configure Airflow email alerts, dbt test failure notifications, and Grafana dashboards.",
      type: "general",
      status: "done",
      execution_order: 2,
      agent_profile_id: "ap2",
      repository_ids: ["r3"],
      depends_on_task_ids: ["p3t2"],
      created_at: "2026-03-15T15:00:00Z",
      updated_at: "2026-03-18T09:00:00Z",
    },
  ],
};

// ─── Messages (text-only; plan-draft cards are reconstructed from PLANS) ─────

export const MESSAGES: Record<string, Message[]> = {
  "demo-1": [
    {
      id: "m1",
      project_id: "demo-1",
      role: "assistant",
      content:
        "Hi! I'm your planning agent. I'll help you break this project into an executable plan.\n\nCan you describe the main goals and any technical constraints I should know about?",
      created_at: "2026-03-28T10:01:00Z",
    },
    {
      id: "m2",
      project_id: "demo-1",
      role: "user",
      content:
        "We need to migrate our monolithic REST API to microservices. The main services are auth, products, orders, and payments. Zero-downtime deployment is a hard requirement.",
      created_at: "2026-03-28T10:02:00Z",
    },
    {
      id: "m3",
      project_id: "demo-1",
      role: "assistant",
      content:
        "Got it. The strangler-fig pattern is the right call here — we extract one service at a time behind the existing API gateway, reroute traffic incrementally, and decommission the monolith last.\n\nI've drafted an execution plan below. Review each task and confirm when you're ready to start.",
      created_at: "2026-03-28T10:03:00Z",
    },
  ],
  "demo-2": [
    {
      id: "m4",
      project_id: "demo-2",
      role: "assistant",
      content:
        "Hi! I'm ready to help plan the onboarding flow redesign. What are the key problems with the current experience?",
      created_at: "2026-04-01T09:01:00Z",
    },
    {
      id: "m5",
      project_id: "demo-2",
      role: "user",
      content:
        "Users are dropping off at step 3 of 5. The error messages are confusing and there's no way to go back without losing progress.",
      created_at: "2026-04-01T09:02:00Z",
    },
    {
      id: "m6",
      project_id: "demo-2",
      role: "assistant",
      content:
        "Classic drop-off pattern — blocking errors and no escape route. I've drafted a plan to fix the funnel: audit the data first, then redesign step 3 with inline validation, add back-navigation with state preservation, and finish with automated UI tests.\n\nHere's the draft plan for your review:",
      created_at: "2026-04-01T09:09:00Z",
    },
  ],
  "demo-3": [
    {
      id: "m7",
      project_id: "demo-3",
      role: "assistant",
      content:
        "Welcome! Let's plan your data pipeline. Tell me about your data sources, target systems, and any SLA requirements.",
      created_at: "2026-03-15T14:31:00Z",
    },
    {
      id: "m8",
      project_id: "demo-3",
      role: "user",
      content:
        "We have 3 Postgres sources and a Snowflake data warehouse. SLA is daily refresh by 6am. The analytics team uses Looker.",
      created_at: "2026-03-15T14:32:00Z",
    },
    {
      id: "m9",
      project_id: "demo-3",
      role: "assistant",
      content:
        "Perfect setup for an Airflow + dbt stack. Airflow handles orchestration and scheduling, dbt handles transformations with full lineage and test coverage, and Looker reads from the Snowflake marts layer.\n\nThe plan has been confirmed and all tasks completed successfully! ✅",
      created_at: "2026-03-15T14:40:00Z",
    },
  ],
};

// ─── Agent Profiles ──────────────────────────────────────────────────────────

export const AGENT_PROFILES: AgentProfile[] = [
  {
    id: "ap1",
    name: "GPT-4o Coder",
    description:
      "High-capability agent for complex refactoring and architecture tasks. Uses GPT-4o with filesystem and git access.",
    agent_type: "langgraph",
    llm_provider: "openai",
    llm_model: "gpt-4o",
    has_llm_api_key: true,
    has_github_token: false,
    llm_temperature: 0.7,
    llm_max_tokens: 4096,
    mcp_servers: [
      {
        name: "filesystem",
        transport: "stdio",
        command: "npx",
        args: ["-y", "@modelcontextprotocol/server-filesystem", "/workspace"],
      },
    ],
    skills: [
      {
        name: "code_review",
        title: "Code Review",
        description: "Reviews code for quality, security, and style issues",
        inputSchema: {
          type: "object",
          properties: {
            file_path: { type: "string", description: "Path to the file to review." },
            severity_threshold: {
              type: "string",
              description: "Minimum severity to report: info | warning | error.",
              enum: ["info", "warning", "error"],
            },
          },
          required: ["file_path"],
        },
        annotations: { readOnlyHint: true },
        instructions: "Analyze the file and produce a structured review with severity ratings.",
      },
    ],
    created_at: "2026-03-28T10:00:00Z",
    updated_at: "2026-03-28T10:00:00Z",
  },
  {
    id: "ap2",
    name: "Claude Test Writer",
    description:
      "Specialized in writing comprehensive, well-structured test suites. Pairs with any coder agent.",
    agent_type: "langgraph",
    llm_provider: "anthropic",
    llm_model: "claude-3-5-sonnet-20241022",
    has_llm_api_key: true,
    has_github_token: false,
    llm_temperature: 1.0,
    llm_max_tokens: 8192,
    llm_top_p: 0.9,
    mcp_servers: [],
    skills: [
      {
        name: "generate_tests",
        title: "Generate Tests",
        description: "Generates unit and integration tests for a given module",
        inputSchema: {
          type: "object",
          properties: {
            module_path: { type: "string", description: "Path to the module under test." },
            framework: {
              type: "string",
              description: "Testing framework to use.",
              enum: ["jest", "vitest", "pytest", "mocha"],
            },
            coverage_target: {
              type: "number",
              description: "Target coverage percentage (0–100).",
            },
          },
          required: ["module_path", "framework"],
        },
        outputSchema: {
          type: "object",
          properties: {
            test_file_path: { type: "string", description: "Path to the generated test file." },
            test_count: { type: "integer", description: "Number of test cases generated." },
          },
          required: ["test_file_path", "test_count"],
        },
        annotations: { destructiveHint: false, idempotentHint: true },
        instructions:
          "Write thorough tests covering happy paths, edge cases, and error conditions. Include setup/teardown.",
      },
    ],
    created_at: "2026-04-01T09:00:00Z",
    updated_at: "2026-04-01T09:00:00Z",
  },
];
