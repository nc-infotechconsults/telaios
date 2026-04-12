import chokidar, { type FSWatcher } from "chokidar";
import path from "node:path";
import { config } from "@/core/config";

export type FileEvent = "created" | "changed" | "deleted" | "renamed";

export interface FileChangeEvent {
  type: FileEvent;
  path: string;       // relative to workspace root
  oldPath?: string;   // for renames
}

type Subscriber = (event: FileChangeEvent) => void;

// workspaceId → { watcher, subscribers }
const watchers = new Map<
  string,
  { watcher: FSWatcher; subscribers: Set<Subscriber> }
>();

function workspaceRoot(workspaceId: string): string {
  return path.join(config.WORKSPACES_ROOT, workspaceId);
}

function relPath(workspaceId: string, abs: string): string {
  return path.relative(workspaceRoot(workspaceId), abs);
}

export const FileWatcherService = {
  /** Subscribe to file-change events for a workspace. Returns an unsubscribe function. */
  subscribe(workspaceId: string, fn: Subscriber): () => void {
    if (!watchers.has(workspaceId)) {
      const root = workspaceRoot(workspaceId);
      const watcher = chokidar.watch(root, {
        ignored: /(^|[/\\])\.git|(^|[/\\])node_modules/,
        persistent: true,
        ignoreInitial: true,
        awaitWriteFinish: { stabilityThreshold: 100, pollInterval: 50 },
      });

      const subscribers = new Set<Subscriber>();

      const emit = (event: FileChangeEvent) => {
        for (const sub of subscribers) sub(event);
      };

      watcher
        .on("add", (p) =>
          emit({ type: "created", path: relPath(workspaceId, p) }),
        )
        .on("change", (p) =>
          emit({ type: "changed", path: relPath(workspaceId, p) }),
        )
        .on("unlink", (p) =>
          emit({ type: "deleted", path: relPath(workspaceId, p) }),
        )
        .on("unlinkDir", (p) =>
          emit({ type: "deleted", path: relPath(workspaceId, p) }),
        )
        .on("addDir", (p) =>
          emit({ type: "created", path: relPath(workspaceId, p) }),
        );

      watchers.set(workspaceId, { watcher, subscribers });
    }

    const entry = watchers.get(workspaceId)!;
    entry.subscribers.add(fn);

    return () => {
      entry.subscribers.delete(fn);
      // Stop watcher when last subscriber leaves
      if (entry.subscribers.size === 0) {
        entry.watcher.close();
        watchers.delete(workspaceId);
      }
    };
  },

  /** Stop and remove the watcher for a workspace (e.g. when container stops). */
  async close(workspaceId: string): Promise<void> {
    const entry = watchers.get(workspaceId);
    if (entry) {
      await entry.watcher.close();
      watchers.delete(workspaceId);
    }
  },
};
