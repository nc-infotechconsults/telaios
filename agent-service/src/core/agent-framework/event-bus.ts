import Redis from "ioredis";
import { config } from "../config";

const CHANNEL_PREFIX = "agent:event:";

type EventHandler = (topic: string, payload: unknown) => void;

/**
 * Lightweight pub/sub bus backed by ioredis.
 *
 * Channels follow the pattern `agent:event:<topic>`.
 * Subscribe with `"*"` to receive all agent events.
 *
 * Publishers use a separate Redis connection from subscribers (ioredis
 * requirement: a connection in subscribe mode cannot send commands).
 */
export class AgentEventBus {
  private publisher: Redis;
  private subscriber: Redis;
  /** Map from topic (or "*") to list of handlers. */
  private handlers = new Map<string, EventHandler[]>();

  constructor(redisUrl: string) {
    this.publisher = new Redis(redisUrl);
    this.subscriber = new Redis(redisUrl);

    this.publisher.on("error", (err) =>
      console.error("[AgentEventBus] publisher error:", err),
    );
    this.subscriber.on("error", (err) =>
      console.error("[AgentEventBus] subscriber error:", err),
    );

    this.subscriber.on("pmessage", (_pattern, channel, message) => {
      const topic = channel.slice(CHANNEL_PREFIX.length);
      let payload: unknown;
      try {
        payload = JSON.parse(message);
      } catch {
        payload = message;
      }
      this._dispatch(topic, payload);
    });

    // Subscribe to all agent event channels via a pattern.
    this.subscriber.psubscribe(`${CHANNEL_PREFIX}*`);
  }

  /**
   * Publish an event to a topic. All subscribers (including wildcard `"*"`)
   * will receive it.
   */
  async publish(topic: string, payload: unknown): Promise<void> {
    await this.publisher.publish(
      `${CHANNEL_PREFIX}${topic}`,
      JSON.stringify(payload),
    );
  }

  /**
   * Subscribe to a specific topic or `"*"` for all topics.
   */
  on(topic: string, handler: EventHandler): void {
    const list = this.handlers.get(topic) ?? [];
    list.push(handler);
    this.handlers.set(topic, list);
  }

  /**
   * Remove a previously registered handler.
   */
  off(topic: string, handler: EventHandler): void {
    const list = this.handlers.get(topic);
    if (!list) return;
    this.handlers.set(
      topic,
      list.filter((h) => h !== handler),
    );
  }

  async close(): Promise<void> {
    await this.subscriber.punsubscribe();
    this.subscriber.disconnect();
    this.publisher.disconnect();
  }

  private _dispatch(topic: string, payload: unknown): void {
    const topicHandlers = this.handlers.get(topic) ?? [];
    const wildcardHandlers = this.handlers.get("*") ?? [];
    for (const h of [...topicHandlers, ...wildcardHandlers]) {
      try {
        h(topic, payload);
      } catch (err) {
        console.error(`[AgentEventBus] handler error for topic "${topic}":`, err);
      }
    }
  }
}

// Singleton instance — lazily created on first import.
let _instance: AgentEventBus | null = null;

export function getAgentEventBus(): AgentEventBus {
  if (!_instance) {
    _instance = new AgentEventBus(config.REDIS_URL);
  }
  return _instance;
}
