/**
 * Unit tests for agent-service dataClient.
 *
 * We mock the inner axios instance that dataClient creates so we can verify
 * correct HTTP method, URL, and payload for every helper without hitting a real API.
 */
import axios from "axios";

jest.mock("axios");
const mockedAxios = axios as jest.Mocked<typeof axios>;

// We need to capture the instance returned by axios.create()
const mockInstance = {
  get: jest.fn(),
  post: jest.fn(),
  patch: jest.fn(),
  delete: jest.fn(),
};
mockedAxios.create.mockReturnValue(mockInstance as any);

// Import dataClient AFTER mocking axios so the module-level axios.create() call
// picks up our mock.
import { dataClient } from "../../../services/dataClient";

describe("dataClient", () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  // ── Basic CRUD ────────────────────────────────────────────────────────────

  describe("getProject", () => {
    it("calls GET /projects/:id", async () => {
      const project = { id: "p1", name: "Test" };
      mockInstance.get.mockResolvedValue({ data: project });

      const result = await dataClient.getProject("p1");

      expect(mockInstance.get).toHaveBeenCalledWith("/projects/p1");
      expect(result).toEqual(project);
    });
  });

  describe("getSettings", () => {
    it("calls GET /settings/raw", async () => {
      const settings = { llm_provider: "openai", llm_model: "gpt-4o" };
      mockInstance.get.mockResolvedValue({ data: settings });

      const result = await dataClient.getSettings();

      expect(mockInstance.get).toHaveBeenCalledWith("/settings/raw");
      expect(result).toEqual(settings);
    });
  });

  describe("getPlan", () => {
    it("calls GET /plans/:id", async () => {
      const plan = { id: "plan1", status: "confirmed" };
      mockInstance.get.mockResolvedValue({ data: plan });

      const result = await dataClient.getPlan("plan1");

      expect(mockInstance.get).toHaveBeenCalledWith("/plans/plan1");
      expect(result).toEqual(plan);
    });
  });

  describe("getProjectPlans", () => {
    it("calls GET /plans?project_id=:id", async () => {
      const plans = [{ id: "plan1", status: "draft" }];
      mockInstance.get.mockResolvedValue({ data: plans });

      const result = await dataClient.getProjectPlans("p1");

      expect(mockInstance.get).toHaveBeenCalledWith("/plans?project_id=p1");
      expect(result).toEqual(plans);
    });
  });

  describe("getProjectRepositories", () => {
    it("calls GET /projects/:id/repositories", async () => {
      const repos = [{ id: "r1", name: "repo1" }];
      mockInstance.get.mockResolvedValue({ data: repos });

      const result = await dataClient.getProjectRepositories("p1");

      expect(mockInstance.get).toHaveBeenCalledWith("/projects/p1/repositories");
      expect(result).toEqual(repos);
    });
  });

  describe("getPlanTasks", () => {
    it("calls GET /tasks?plan_id=:id", async () => {
      const tasks = [{ id: "t1", title: "Task 1" }];
      mockInstance.get.mockResolvedValue({ data: tasks });

      const result = await dataClient.getPlanTasks("plan1");

      expect(mockInstance.get).toHaveBeenCalledWith("/tasks?plan_id=plan1");
      expect(result).toEqual(tasks);
    });
  });

  describe("createPlan", () => {
    it("calls POST /plans with body", async () => {
      const body = { project_id: "p1", title: "New plan" };
      const created = { id: "plan2", ...body };
      mockInstance.post.mockResolvedValue({ data: created });

      const result = await dataClient.createPlan(body);

      expect(mockInstance.post).toHaveBeenCalledWith("/plans", body);
      expect(result).toEqual(created);
    });
  });

  describe("updatePlan", () => {
    it("calls PATCH /plans/:id with body", async () => {
      const body = { status: "executing" };
      const updated = { id: "plan1", status: "executing" };
      mockInstance.patch.mockResolvedValue({ data: updated });

      const result = await dataClient.updatePlan("plan1", body);

      expect(mockInstance.patch).toHaveBeenCalledWith("/plans/plan1", body);
      expect(result).toEqual(updated);
    });
  });

  describe("createTask", () => {
    it("calls POST /tasks with body", async () => {
      const body = { plan_id: "plan1", title: "Code task" };
      const created = { id: "t1", ...body, status: "pending" };
      mockInstance.post.mockResolvedValue({ data: created });

      const result = await dataClient.createTask(body);

      expect(mockInstance.post).toHaveBeenCalledWith("/tasks", body);
      expect(result).toEqual(created);
    });
  });

  describe("updateTask", () => {
    it("calls PATCH /tasks/:id with body", async () => {
      const body = { status: "in_progress" };
      mockInstance.patch.mockResolvedValue({ data: { id: "t1", status: "in_progress" } });

      const result = await dataClient.updateTask("t1", body);

      expect(mockInstance.patch).toHaveBeenCalledWith("/tasks/t1", body);
      expect(result.status).toBe("in_progress");
    });
  });

  describe("deleteTasksByPlan", () => {
    it("calls DELETE /plans/:id/tasks", async () => {
      mockInstance.delete.mockResolvedValue({ data: { deleted: 3 } });

      const result = await dataClient.deleteTasksByPlan("plan1");

      expect(mockInstance.delete).toHaveBeenCalledWith("/plans/plan1/tasks");
      expect(result.deleted).toBe(3);
    });
  });

  describe("saveMessage", () => {
    it("calls POST /messages with body", async () => {
      const body = { project_id: "p1", role: "user", content: "Hello" };
      mockInstance.post.mockResolvedValue({ data: { id: "m1", ...body } });

      const result = await dataClient.saveMessage(body);

      expect(mockInstance.post).toHaveBeenCalledWith("/messages", body);
      expect(result.id).toBe("m1");
    });
  });

  describe("updateRepositoryStatus", () => {
    it("calls PATCH /repositories/:id with status", async () => {
      const body = { status: "ready", local_path: "/tmp/repo" };
      mockInstance.patch.mockResolvedValue({ data: { id: "r1", ...body } });

      const result = await dataClient.updateRepositoryStatus("r1", body);

      expect(mockInstance.patch).toHaveBeenCalledWith("/repositories/r1", body);
      expect(result.status).toBe("ready");
    });
  });

  // ── Plan lifecycle (internal endpoints) ───────────────────────────────────

  describe("startPlanExecution", () => {
    it("calls PATCH /internal/plans/:id/status with executing", async () => {
      mockInstance.patch.mockResolvedValue({ data: {} });

      await dataClient.startPlanExecution("plan1");

      expect(mockInstance.patch).toHaveBeenCalledWith(
        "/internal/plans/plan1/status",
        { status: "executing" },
      );
    });
  });

  describe("completePlanExecution", () => {
    it("calls PATCH /internal/plans/:id/status with completed", async () => {
      mockInstance.patch.mockResolvedValue({ data: {} });

      await dataClient.completePlanExecution("plan1");

      expect(mockInstance.patch).toHaveBeenCalledWith(
        "/internal/plans/plan1/status",
        { status: "completed" },
      );
    });
  });

  describe("failPlanExecution", () => {
    it("calls PATCH /internal/plans/:id/status with failed and reason", async () => {
      mockInstance.patch.mockResolvedValue({ data: {} });

      await dataClient.failPlanExecution("plan1", "Out of memory");

      expect(mockInstance.patch).toHaveBeenCalledWith(
        "/internal/plans/plan1/status",
        { status: "failed", failure_reason: "Out of memory" },
      );
    });

    it("sends null failure_reason when reason is undefined", async () => {
      mockInstance.patch.mockResolvedValue({ data: {} });

      await dataClient.failPlanExecution("plan1");

      expect(mockInstance.patch).toHaveBeenCalledWith(
        "/internal/plans/plan1/status",
        { status: "failed", failure_reason: null },
      );
    });
  });

  // ── Task propagation (internal endpoints) ─────────────────────────────────

  describe("skipDependentTasks", () => {
    it("calls POST /internal/tasks/:id/skip-dependents", async () => {
      mockInstance.post.mockResolvedValue({ data: { ok: true } });

      await dataClient.skipDependentTasks("t1");

      expect(mockInstance.post).toHaveBeenCalledWith(
        "/internal/tasks/t1/skip-dependents",
      );
    });
  });

  describe("cancelPlanTasks", () => {
    it("calls POST /internal/plans/:id/cancel-tasks", async () => {
      mockInstance.post.mockResolvedValue({ data: { cancelled: 5 } });

      const result = await dataClient.cancelPlanTasks("plan1");

      expect(mockInstance.post).toHaveBeenCalledWith(
        "/internal/plans/plan1/cancel-tasks",
      );
      expect(result.cancelled).toBe(5);
    });
  });

  // ── Task artifacts (internal endpoints) ────────────────────────────────────

  describe("createTaskArtifacts", () => {
    it("calls POST /internal/tasks/:id/artifacts with artifacts array", async () => {
      mockInstance.post.mockResolvedValue({ data: {} });

      const artifacts = [
        { type: "log" as const, title: "Exec Log", content: "step 1\nstep 2" },
        { type: "diff" as const, title: "Git Diff", content: "diff --git a/f b/f", content_type: "text/x-diff" },
      ];

      await dataClient.createTaskArtifacts("t1", artifacts);

      expect(mockInstance.post).toHaveBeenCalledWith(
        "/internal/tasks/t1/artifacts",
        { artifacts },
      );
    });
  });

  // ── Document processing (internal endpoints) ──────────────────────────────

  describe("updateDocumentStatus", () => {
    it("calls PATCH /internal/documents/:id/status", async () => {
      mockInstance.patch.mockResolvedValue({ data: {} });

      await dataClient.updateDocumentStatus("doc1", "processed");

      expect(mockInstance.patch).toHaveBeenCalledWith(
        "/internal/documents/doc1/status",
        { status: "processed", error_message: null },
      );
    });

    it("includes error_message when provided", async () => {
      mockInstance.patch.mockResolvedValue({ data: {} });

      await dataClient.updateDocumentStatus("doc1", "error", "Parse failed");

      expect(mockInstance.patch).toHaveBeenCalledWith(
        "/internal/documents/doc1/status",
        { status: "error", error_message: "Parse failed" },
      );
    });
  });

  describe("storeDocumentChunks", () => {
    it("calls POST /internal/documents/:id/chunks", async () => {
      mockInstance.post.mockResolvedValue({ data: { stored: 2 } });

      const chunks = [
        { chunk_index: 0, content: "chunk 0", embedding: [0.1, 0.2] },
        { chunk_index: 1, content: "chunk 1", embedding: [0.3, 0.4] },
      ];

      await dataClient.storeDocumentChunks("doc1", chunks);

      expect(mockInstance.post).toHaveBeenCalledWith(
        "/internal/documents/doc1/chunks",
        { chunks },
      );
    });
  });

  describe("searchDocumentChunks", () => {
    it("calls POST /internal/documents/search with correct payload", async () => {
      const results = [{ id: "c1", content: "result", similarity: 0.95 }];
      mockInstance.post.mockResolvedValue({ data: results });

      const result = await dataClient.searchDocumentChunks("p1", [0.1, 0.2], 3);

      expect(mockInstance.post).toHaveBeenCalledWith(
        "/internal/documents/search",
        { project_id: "p1", embedding: [0.1, 0.2], limit: 3 },
      );
      expect(result).toEqual(results);
    });

    it("uses default limit of 5", async () => {
      mockInstance.post.mockResolvedValue({ data: [] });

      await dataClient.searchDocumentChunks("p1", [0.1]);

      expect(mockInstance.post).toHaveBeenCalledWith(
        "/internal/documents/search",
        { project_id: "p1", embedding: [0.1], limit: 5 },
      );
    });
  });

  // ── Error propagation ─────────────────────────────────────────────────────

  describe("error handling", () => {
    it("propagates axios errors from the API", async () => {
      const error = new Error("Request failed with status code 500");
      mockInstance.get.mockRejectedValue(error);

      await expect(dataClient.getProject("p1")).rejects.toThrow(
        "Request failed with status code 500",
      );
    });

    it("propagates network errors", async () => {
      const error = new Error("ECONNREFUSED");
      mockInstance.patch.mockRejectedValue(error);

      await expect(dataClient.startPlanExecution("plan1")).rejects.toThrow(
        "ECONNREFUSED",
      );
    });
  });
});
