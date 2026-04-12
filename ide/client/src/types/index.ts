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
  id: string; // file path OR db://connectionId/console-N
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
  cursorLine?: number;
  cursorColumn?: number;
  // Virtual tab fields (Query Console)
  isVirtual?: boolean;
  virtualType?: "query-console";
  connectionId?: string;
}

export type PanelId = "explorer" | "search" | "git" | "terminal" | "db";

/**
 * Which region a panel currently lives in.
 *
 * "bottom" is the full-width bottom strip (terminal).
 * "left-bottom" / "right-bottom" are the lower halves of the sidebars.
 */
export type PanelArea =
  | "left-top"
  | "left-bottom"
  | "right-top"
  | "right-bottom"
  | "bottom";

export interface PanelState {
  id: PanelId;
  area: PanelArea;
  /** Sort order within the area (0-based). */
  order: number;
  isOpen: boolean;
  /** When true the panel is shrunk to its header bar only (accordion-style). */
  isCollapsed: boolean;
  /** Percentage size (0-100). */
  size: number;
  /** Timestamp of when this panel was last opened; null when closed. Used for FIFO queue. */
  openedAt: number | null;
}

/**
 * Tracks which sidebar section is currently collapsed.
 * A collapsed section hides all its panels without changing their isOpen state.
 */
export type SectionKey = "left-top" | "left-bottom" | "right-top" | "right-bottom";
export type CollapsedSections = Partial<Record<SectionKey, boolean>>;

export interface DragState {
  panelId: PanelId | null;
  sourceArea: PanelArea | null;
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
}

// ─── Terminal ─────────────────────────────────────────────────────────────────

export interface TerminalSession {
  id: string;
  workspaceId: string;
  cols: number;
  rows: number;
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
