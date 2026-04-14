import { BaseAgent } from "./base-agent";

type AgentFactory = (id: string, config?: Record<string, unknown>) => BaseAgent;

/**
 * Singleton registry that maps agent type strings to factory functions.
 *
 * Usage:
 *   AgentRegistry.getInstance().register("coder", (id, cfg) => new CoderAgent(id, cfg));
 *   const agent = AgentRegistry.getInstance().create("coder", "uuid-1");
 */
export class AgentRegistry {
  private static _instance: AgentRegistry | null = null;

  private factories = new Map<string, AgentFactory>();

  private constructor() {}

  static getInstance(): AgentRegistry {
    if (!AgentRegistry._instance) {
      AgentRegistry._instance = new AgentRegistry();
    }
    return AgentRegistry._instance;
  }

  /**
   * Register a factory for a given agent type.
   * Registering the same type twice overwrites the previous factory.
   */
  register(type: string, factory: AgentFactory): void {
    this.factories.set(type, factory);
  }

  /**
   * Create a new agent instance of the given type.
   * Throws if the type has not been registered.
   */
  create(type: string, id: string, config?: Record<string, unknown>): BaseAgent {
    const factory = this.factories.get(type);
    if (!factory) {
      throw new Error(
        `AgentRegistry: unknown type "${type}". Registered types: ${this.getRegisteredTypes().join(", ") || "(none)"}`,
      );
    }
    return factory(id, config);
  }

  /** Returns true if the given type has a registered factory. */
  has(type: string): boolean {
    return this.factories.has(type);
  }

  /** Returns the list of all registered agent type strings. */
  getRegisteredTypes(): string[] {
    return Array.from(this.factories.keys());
  }
}
