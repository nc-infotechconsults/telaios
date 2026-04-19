import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject, createTestDocument } from "../helpers/factories";
import * as authService from "../../services/auth.service";
import { AppDataSource } from "../../configs/data-source.config";
import { ProjectMember } from "../../entities/ProjectMember.entity";

// ---------------------------------------------------------------------------
// Mock the upstream agent-service fetch so tests are fully self-contained.
// The controller is pure proxy logic — unit tests verify it forwards correctly.
// ---------------------------------------------------------------------------
const mockFetch = jest.fn();
global.fetch = mockFetch;

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let ownerToken: string;
let viewerToken: string;
let outsiderToken: string;
let projectId: string;
let documentId: string;

beforeAll(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await clearAllTables();
  mockFetch.mockReset();

  const owner = await createTestUser({ email: "owner@test.com" });
  ownerToken = authService.signToken(owner);

  const viewer = await createTestUser({ email: "viewer@test.com" });
  viewerToken = authService.signToken(viewer);

  const outsider = await createTestUser({ email: "outsider@test.com" });
  outsiderToken = authService.signToken(outsider);

  const project = await createTestProject({ name: "Test Project" });
  projectId = project.id;

  // Make owner and viewer members of the project
  const memberRepo = AppDataSource.getRepository(ProjectMember);
  await memberRepo.save([
    memberRepo.create({ project_id: projectId, user_id: owner.id, role: "owner" }),
    memberRepo.create({ project_id: projectId, user_id: viewer.id, role: "viewer" }),
  ]);

  const doc = await createTestDocument(projectId);
  documentId = doc.id;
});

afterAll(async () => {
  await destroyTestDb();
});

// ---------------------------------------------------------------------------
// Helper
// ---------------------------------------------------------------------------

function makeAgentResponse(body: unknown, status = 200): Response {
  return {
    ok: status >= 200 && status < 300,
    status,
    json: async () => body,
  } as unknown as Response;
}

// ---------------------------------------------------------------------------
// POST /projects/:projectId/documents/:id/copilot/summarize
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/documents/:id/copilot/summarize", () => {
  it("proxies to agent-service and returns 200 with summary", async () => {
    const summary = { summary: "A great doc.", key_points: ["Point 1"], word_count: 100 };
    mockFetch.mockResolvedValueOnce(makeAgentResponse(summary));

    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/summarize`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.summary).toBe("A great doc.");
    expect(res.body.key_points).toEqual(["Point 1"]);
    // Verify the proxy called agent-service at the right path
    expect(mockFetch).toHaveBeenCalledTimes(1);
    const [calledUrl] = mockFetch.mock.calls[0] as [string, ...unknown[]];
    expect(calledUrl).toContain(`/projects/${projectId}/documents/${documentId}/copilot/summarize`);
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/summarize`);
    expect(res.status).toBe(401);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 403 for non-member", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/summarize`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("allows viewers (viewer role) to summarize", async () => {
    mockFetch.mockResolvedValueOnce(makeAgentResponse({ summary: "ok", key_points: [], word_count: 0 }));
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/summarize`)
      .set("Authorization", `Bearer ${viewerToken}`);
    expect(res.status).toBe(200);
  });

  it("forwards agent-service 500 errors to the caller", async () => {
    mockFetch.mockResolvedValueOnce(makeAgentResponse({ detail: "LLM unavailable" }, 500));
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/summarize`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(500);
    expect(res.body.error).toBe("LLM unavailable");
  });

  it("returns 502 when agent-service is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/summarize`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(502);
    expect(res.body.error).toMatch(/reach agent service/i);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/documents/:id/copilot/ask
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/documents/:id/copilot/ask", () => {
  it("proxies question and returns answer", async () => {
    const answer = { answer: "It uses microservices.", confidence: 0.9, sources: ["Chunk 0"] };
    mockFetch.mockResolvedValueOnce(makeAgentResponse(answer));

    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/ask`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ question: "What architecture is used?" });

    expect(res.status).toBe(200);
    expect(res.body.answer).toBe("It uses microservices.");
    const [, fetchOpts] = mockFetch.mock.calls[0] as [string, RequestInit];
    const body = JSON.parse(fetchOpts.body as string);
    expect(body.question).toBe("What architecture is used?");
  });

  it("returns 400 when question is missing", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/ask`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 400 when question is blank whitespace", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/ask`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ question: "   " });
    expect(res.status).toBe(400);
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/ask`)
      .send({ question: "hello" });
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-member", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/ask`)
      .set("Authorization", `Bearer ${outsiderToken}`)
      .send({ question: "hello" });
    expect(res.status).toBe(403);
  });

  it("returns 502 when agent-service is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("ECONNREFUSED"));
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/ask`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ question: "what is this?" });
    expect(res.status).toBe(502);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/documents/:id/copilot/extract
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/documents/:id/copilot/extract", () => {
  it("proxies and returns structured extraction", async () => {
    const extraction = {
      entities: { people: ["Alice"], organizations: [], dates: [], locations: [] },
      tables: [],
      key_values: { version: "2.0" },
    };
    mockFetch.mockResolvedValueOnce(makeAgentResponse(extraction));

    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/extract`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.entities.people).toEqual(["Alice"]);
    expect(res.body.key_values.version).toBe("2.0");
  });

  it("returns 401 without auth", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/extract`);
    expect(res.status).toBe(401);
  });

  it("returns 403 for non-member", async () => {
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/extract`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });

  it("forwards agent-service 422 to the caller", async () => {
    mockFetch.mockResolvedValueOnce(makeAgentResponse({ detail: "Unprocessable" }, 422));
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/extract`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(422);
  });

  it("returns 502 when agent-service is unreachable", async () => {
    mockFetch.mockRejectedValueOnce(new Error("network failure"));
    const res = await request(app)
      .post(`/projects/${projectId}/documents/${documentId}/copilot/extract`)
      .set("Authorization", `Bearer ${ownerToken}`);
    expect(res.status).toBe(502);
  });
});
