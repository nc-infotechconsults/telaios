// ─── Plugin System ────────────────────────────────────────────────────────────
export * from "./plugin";

// ─── Workspace ───────────────────────────────────────────────────────────────

export type WorkspaceSource =
  | { type: "git"; url: string; branch?: string }
  | { type: "s3"; bucket: string; prefix?: string };

export type WorkspaceStatus =
  | "idle"
  | "cloning"
  | "starting"
  | "running"
  | "sleeping"
  | "error";

export interface Workspace {
  id: string;
  name: string;
  source: WorkspaceSource;
  status: WorkspaceStatus;
  containerId?: string;
  containerImage: string;
  forwardedPorts: number[];
  createdAt: string;
  lastActiveAt: string;
}

// ─── File System ─────────────────────────────────────────────────────────────

export type FileNodeType = "file" | "directory";

export interface FileEntry {
  name: string;
  path: string;
  type: FileNodeType;
  size?: number;
  mimeType?: string;
  children?: FileEntry[];
}

export interface FileContent {
  path: string;
  content: string;
  encoding: "utf8" | "base64";
}

// ─── Editor ──────────────────────────────────────────────────────────────────

export interface EditorTab {
  id: string; // file path OR db://connectionId/console-N OR diff://<staged|working>/<path>
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
  cursorLine?: number;
  cursorColumn?: number;
  // Virtual tab fields (Query Console / Diff / Commit Detail)
  isVirtual?: boolean;
  virtualType?: "query-console" | "diff" | "commit-detail" | "git-graph";
  connectionId?: string;
  // Diff tab fields
  diffOriginalContent?: string;
  diffModifiedContent?: string;
  diffFilePath?: string;
  diffStaged?: boolean;
  // Commit detail tab fields
  commitDetail?: GitCommitDetail;
}

// ─── Editor Groups ───────────────────────────────────────────────────────────

export interface EditorGroup {
  id: string;
  tabs: EditorTab[];
  activeTabId: string | null;
}

export type SplitDirection = "horizontal" | "vertical";

export interface EditorSplit {
  id: string;
  direction: SplitDirection;
  children: (EditorGroup | EditorSplit)[];
  sizes: number[];
}

/** Type guard — distinguishes EditorGroup from EditorSplit in the tree. */
export function isEditorGroup(
  node: EditorGroup | EditorSplit,
): node is EditorGroup {
  return "tabs" in node;
}

// ─── Git ─────────────────────────────────────────────────────────────────────

export type GitFileStatus =
  | "modified"
  | "added"
  | "deleted"
  | "renamed"
  | "untracked"
  | "conflicted";

export interface GitFile {
  path: string;
  status: GitFileStatus;
  staged: boolean;
}

export interface GitBranch {
  name: string;
  current: boolean;
  remote?: string;
  ahead: number;
  behind: number;
}

export interface GitStatus {
  branch: string;
  ahead: number;
  behind: number;
  files: GitFile[];
  isClean: boolean;
}

export interface GitCommit {
  hash: string;
  shortHash: string;
  message: string;
  author: string;
  date: string;
  parentHashes: string[];
  refs: string[];
}

export interface GitStash {
  index: string; // e.g. "stash@{0}"
  message: string;
  date: string;
}

export interface GitCommitFile {
  path: string;
  oldPath?: string; // for renames / copies
  /** Single-char git status: A=Added M=Modified D=Deleted R=Renamed C=Copied T=TypeChange */
  status: string;
}

export interface GitCommitDetail extends GitCommit {
  body: string;
  files: GitCommitFile[];
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

export interface TerminalSession {
  id: string;
  workspaceId: string;
  label: string;         // "Terminal 1", "Terminal 2", or custom name
  cols: number;
  rows: number;
  createdAt: number;
}

// ─── WebSocket messages ───────────────────────────────────────────────────────

export type WsMessageType =
  | "ping"
  | "pong"
  | "file:created"
  | "file:changed"
  | "file:deleted"
  | "file:renamed"
  | "terminal:data"
  | "terminal:resize"
  | "container:status";

export interface WsMessage<T = unknown> {
  type: WsMessageType;
  workspaceId?: string;
  payload: T;
}

export interface FileChangePayload {
  path: string;
  oldPath?: string; // for renames
}

export interface TerminalDataPayload {
  sessionId: string;
  data: string;
}

export interface TerminalResizePayload {
  sessionId: string;
  cols: number;
  rows: number;
}

// ─── Database ─────────────────────────────────────────────────────────────────

export type DbDriverType = "postgresql" | "sqlite";

export interface DbConnection {
  id: string;
  name: string;
  driver: DbDriverType;
  // PostgreSQL
  host?: string;
  port?: number;
  user?: string;
  database?: string;
  ssl?: boolean;
  // SQLite
  filePath?: string;
}

export interface DbColumn {
  name: string;
  type: string;
  nullable: boolean;
  isPrimaryKey: boolean;
  isForeignKey: boolean;
  defaultValue?: string;
}

export interface DbTable {
  name: string;
  type: "table" | "view";
  schema: string;
  columns: DbColumn[];
}

export interface DbSchemaGroup {
  name: string;
  tables: DbTable[];
}

export interface DbConnectionSchema {
  connectionId: string;
  schemas: DbSchemaGroup[];
}

export interface DbQueryColumn {
  name: string;
  type: string;
}

export interface DbQueryResult {
  columns: DbQueryColumn[];
  rows: Record<string, unknown>[];
  rowCount: number;
  executionTimeMs: number;
  error?: string;
}

// ─── API responses ────────────────────────────────────────────────────────────

export interface ApiError {
  code: string;
  message: string;
  details?: Record<string, string[]>;
}

export interface ApiResponse<T> {
  data: T;
}

export interface ApiListResponse<T> {
  data: T[];
  total: number;
}
