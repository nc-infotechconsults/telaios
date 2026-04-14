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
 * Full context provided to an agent for a single execution session.
 * Additional domain-specific fields can be added by concrete agent subclasses.
 */
export interface AgentContext {
  /** Unique execution identifier (e.g. plan-task ID). */
  executionId: string;
  project: ProjectContext;
  /** The user who triggered this execution, if applicable. */
  triggeredBy?: UserContext;
  /** Arbitrary key-value metadata (feature flags, config overrides, etc.). */
  metadata?: Record<string, unknown>;
}
