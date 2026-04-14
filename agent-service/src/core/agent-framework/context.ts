/**
 * Agent context types — passed to every agent at init and execute time.
 * Agents should treat these as read-only views into the surrounding system.
 */

export interface UserContext {
  id: string;
  email: string;
}

export interface RepositoryContext {
  id: string;
  fullName: string; // e.g. "org/repo"
  defaultBranch: string;
  localPath: string; // absolute path to the checked-out workspace on disk
}

export interface ProjectContext {
  id: string;
  name: string;
  repositories: RepositoryContext[];
}

/**
 * Minimal task descriptor passed into agents so they know what they're doing.
 */
export interface TaskContext {
  id: string;
  title: string;
  description: string;
  /**
   * Logical task type that determines which agent kind handles it.
   * Matches the task.type field stored in data-api.
   */
  type: "code" | "test" | "review" | "knowledge" | "infra" | "general";
}

/**
 * Full context provided to an agent for a single execution session.
 * Additional domain-specific fields can be added by concrete agent subclasses.
 */
export interface AgentContext {
  /** Unique execution identifier (e.g. plan-task ID). */
  executionId: string;
  project: ProjectContext;
  /** The task this agent is executing, when triggered by the Scheduler. */
  task?: TaskContext;
  /**
   * Map of repository name → absolute local path on disk.
   * Populated by the Scheduler after repos are cloned.
   */
  workspaces?: Record<string, string>;
  /** The user who triggered this execution, if applicable. */
  triggeredBy?: UserContext;
  /** Arbitrary key-value metadata (feature flags, config overrides, etc.). */
  metadata?: Record<string, unknown>;
}
