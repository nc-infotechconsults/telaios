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
  id: string; // same as file path
  path: string;
  name: string;
  language: string;
  content: string;
  isDirty: boolean;
  cursorLine?: number;
  cursorColumn?: number;
}

export type PanelId = "explorer" | "search" | "git" | "terminal" | "db";

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
