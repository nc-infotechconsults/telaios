import axios from "axios";
import type { Workspace, DbConnection, DbConnectionSchema, DbQueryResult, GitStash, GitCommit, GitCommitDetail } from "@/types";

const http = axios.create({
  baseURL: "/api",
  headers: { "Content-Type": "application/json" },
});

// ── Workspace (file) API ──────────────────────────────────────────────────────

const workspaces = {
  /** List workspace metadata stored on server (simple JSON file per workspace) */
  async list(): Promise<Workspace[]> {
    const { data } = await http.get<{ data: Workspace[] }>("/workspaces");
    return data.data;
  },

  async create(payload: {
    name: string;
    source: Workspace["source"];
  }): Promise<Workspace> {
    const { data } = await http.post<{ data: Workspace }>("/workspaces", payload);
    return data.data;
  },

  async listDir(
    workspaceId: string,
    path = ".",
  ): Promise<Array<{ name: string; path: string; type: "file" | "directory" }>> {
    const { data } = await http.get(`/workspaces/${workspaceId}/files`, {
      params: { path },
    });
    return data.data;
  },

  async readFile(
    workspaceId: string,
    path: string,
  ): Promise<{ content: string; encoding: "utf8" | "base64" }> {
    const { data } = await http.get(`/workspaces/${workspaceId}/file`, {
      params: { path },
    });
    return data.data;
  },

  async writeFile(
    workspaceId: string,
    path: string,
    content: string,
    encoding: "utf8" | "base64" = "utf8",
  ): Promise<void> {
    await http.put(`/workspaces/${workspaceId}/file`, {
      path,
      content,
      encoding,
    });
  },

  async deleteFile(workspaceId: string, path: string): Promise<void> {
    await http.delete(`/workspaces/${workspaceId}/file`, { params: { path } });
  },

  async renameFile(
    workspaceId: string,
    oldPath: string,
    newPath: string,
  ): Promise<void> {
    await http.post(`/workspaces/${workspaceId}/rename`, { oldPath, newPath });
  },

  async mkdir(workspaceId: string, path: string): Promise<void> {
    await http.post(`/workspaces/${workspaceId}/mkdir`, { path });
  },

  async createFile(workspaceId: string, dirPath: string, filename: string): Promise<void> {
    await http.post(`/workspaces/${workspaceId}/create-file`, { dirPath, filename });
  },

  async createFolder(workspaceId: string, dirPath: string, foldername: string): Promise<void> {
    await http.post(`/workspaces/${workspaceId}/create-folder`, { dirPath, foldername });
  },

  async deleteEntry(workspaceId: string, path: string): Promise<void> {
    await http.delete(`/workspaces/${workspaceId}/entry`, { params: { path } });
  },

  async renameEntry(workspaceId: string, oldPath: string, newPath: string): Promise<void> {
    await http.post(`/workspaces/${workspaceId}/rename-entry`, { oldPath, newPath });
  },

  async search(
    workspaceId: string,
    q: string,
    maxResults = 100,
  ): Promise<Array<{ path: string; line: number; preview: string }>> {
    const { data } = await http.get(`/workspaces/${workspaceId}/search`, {
      params: { q, maxResults },
    });
    return data.data;
  },

  async delete(workspaceId: string): Promise<void> {
    await http.delete(`/workspaces/${workspaceId}`);
  },
};

// ── Container API ─────────────────────────────────────────────────────────────

const containers = {
  async status(workspaceId: string): Promise<string> {
    const { data } = await http.get(`/containers/${workspaceId}/status`);
    return data.data.status;
  },

  async start(workspaceId: string, image?: string): Promise<void> {
    await http.post(`/containers/${workspaceId}/start`, image ? { image } : {});
  },

  async stop(workspaceId: string): Promise<void> {
    await http.post(`/containers/${workspaceId}/stop`);
  },

  async sleep(workspaceId: string): Promise<void> {
    await http.post(`/containers/${workspaceId}/sleep`);
  },

  async heartbeat(workspaceId: string): Promise<void> {
    await http.post(`/containers/${workspaceId}/heartbeat`);
  },
};

// ── Git API ───────────────────────────────────────────────────────────────────

const git = {
  async status(workspaceId: string) {
    const { data } = await http.get(`/git/${workspaceId}/status`);
    return data.data;
  },

  async branches(workspaceId: string) {
    const { data } = await http.get(`/git/${workspaceId}/branches`);
    return data.data;
  },

  async checkout(workspaceId: string, branch: string, create = false) {
    await http.post(`/git/${workspaceId}/checkout`, { branch, create });
  },

  async stage(workspaceId: string, paths: string[]) {
    await http.post(`/git/${workspaceId}/stage`, { paths });
  },

  async stageAll(workspaceId: string) {
    await http.post(`/git/${workspaceId}/stage-all`);
  },

  async unstage(workspaceId: string, paths: string[]) {
    await http.post(`/git/${workspaceId}/unstage`, { paths });
  },

  async commit(
    workspaceId: string,
    message: string,
    opts?: { authorName?: string; authorEmail?: string; amend?: boolean },
  ) {
    await http.post(`/git/${workspaceId}/commit`, { message, ...opts });
  },

  async push(workspaceId: string) {
    await http.post(`/git/${workspaceId}/push`);
  },

  async pull(workspaceId: string) {
    await http.post(`/git/${workspaceId}/pull`);
  },

  async diff(workspaceId: string, file?: string, staged = false) {
    const { data } = await http.get(`/git/${workspaceId}/diff`, {
      params: { file, staged },
    });
    return data.data.diff as string;
  },

  async log(workspaceId: string, limit = 50): Promise<GitCommit[]> {
    const { data } = await http.get(`/git/${workspaceId}/log`, {
      params: { limit },
    });
    return data.data;
  },

  async fileAtRef(workspaceId: string, path: string, ref: string): Promise<string> {
    const { data } = await http.get(`/git/${workspaceId}/file-at-ref`, {
      params: { path, ref },
    });
    return data.data.content as string;
  },

  async stashList(workspaceId: string): Promise<GitStash[]> {
    const { data } = await http.get(`/git/${workspaceId}/stash`);
    return data.data;
  },

  async stashPush(workspaceId: string, message?: string): Promise<void> {
    await http.post(`/git/${workspaceId}/stash`, { message });
  },

  async stashPop(workspaceId: string, index?: string): Promise<void> {
    await http.post(`/git/${workspaceId}/stash/pop`, { index });
  },

  async stashDrop(workspaceId: string, index: string): Promise<void> {
    await http.post(`/git/${workspaceId}/stash/drop`, { index });
  },

  async discard(workspaceId: string, paths: string[]) {
    await http.post(`/git/${workspaceId}/discard`, { paths });
  },

  async commitDetail(workspaceId: string, hash: string): Promise<GitCommitDetail> {
    const { data } = await http.get(`/git/${workspaceId}/show/${hash}`);
    return data.data as GitCommitDetail;
  },

  async clone(workspaceId: string, url: string, branch?: string) {
    await http.post("/git/clone", { workspaceId, url, branch });
  },
};

// ── Database API ──────────────────────────────────────────────────────────────

const db = {
  async listConnections(workspaceId: string): Promise<DbConnection[]> {
    const { data } = await http.get(`/db/${workspaceId}/connections`);
    return data.data;
  },

  async addConnection(
    workspaceId: string,
    payload: Omit<DbConnection, "id"> & { password?: string },
  ): Promise<DbConnection> {
    const { data } = await http.post(`/db/${workspaceId}/connections`, payload);
    return data.data;
  },

  async updateConnection(
    workspaceId: string,
    connectionId: string,
    payload: Partial<Omit<DbConnection, "id"> & { password?: string }>,
  ): Promise<DbConnection> {
    const { data } = await http.patch(
      `/db/${workspaceId}/connections/${connectionId}`,
      payload,
    );
    return data.data;
  },

  async deleteConnection(
    workspaceId: string,
    connectionId: string,
  ): Promise<void> {
    await http.delete(`/db/${workspaceId}/connections/${connectionId}`);
  },

  async testConnection(
    workspaceId: string,
    payload: Omit<DbConnection, "id"> & { password?: string },
  ): Promise<{ ok: boolean; error?: string }> {
    const { data } = await http.post(`/db/${workspaceId}/test`, payload);
    return data.data;
  },

  async getSchema(
    workspaceId: string,
    connectionId: string,
  ): Promise<DbConnectionSchema> {
    const { data } = await http.get(
      `/db/${workspaceId}/${connectionId}/schema`,
    );
    return data.data;
  },

  async query(
    workspaceId: string,
    connectionId: string,
    sql: string,
  ): Promise<DbQueryResult> {
    const { data } = await http.post(
      `/db/${workspaceId}/${connectionId}/query`,
      { sql },
    );
    return data.data;
  },
};

export const api = { workspaces, containers, git, db };
