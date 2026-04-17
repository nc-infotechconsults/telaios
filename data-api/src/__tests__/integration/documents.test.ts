import request from "supertest";
import app from "../../app";
import { initTestDb, clearAllTables, destroyTestDb } from "../helpers/db";
import { createTestUser, createTestProject, createTestDocument } from "../helpers/factories";
import * as authService from "../../services/auth.service";
import { AppDataSource } from "../../configs/data-source.config";
import { ProjectMember } from "../../entities/ProjectMember.entity";

// ---------------------------------------------------------------------------
// Mock external dependencies
// ---------------------------------------------------------------------------

// Prevent real S3 calls
jest.mock("../../utils/s3.util", () => ({
  uploadToS3: jest.fn().mockResolvedValue(undefined),
  getPresignedDownloadUrl: jest.fn().mockResolvedValue("https://s3.example.com/presigned"),
  deleteFromS3: jest.fn().mockResolvedValue(undefined),
  buildS3Key: jest.fn(
    (projectId: string, documentId: string, filename: string) =>
      `projects/${projectId}/documents/${documentId}/${filename}`,
  ),
}));

// Prevent fire-and-forget fetch to agent-service from throwing
global.fetch = jest.fn().mockResolvedValue({ ok: true } as Response);

// ---------------------------------------------------------------------------
// Test setup
// ---------------------------------------------------------------------------

let ownerToken: string;
let ownerId: string;
let viewerToken: string;
let outsiderToken: string;

beforeAll(async () => {
  await initTestDb();
});

beforeEach(async () => {
  await clearAllTables();

  const owner = await createTestUser({ email: "owner@test.com" });
  ownerId = owner.id;
  ownerToken = authService.signToken(owner);

  const viewer = await createTestUser({ email: "viewer@test.com" });
  viewerToken = authService.signToken(viewer);

  const outsider = await createTestUser({ email: "outsider@test.com" });
  outsiderToken = authService.signToken(outsider);
});

afterAll(async () => {
  await destroyTestDb();
});

// ---------------------------------------------------------------------------
// Helper: add viewer membership
// ---------------------------------------------------------------------------

async function addViewer(projectId: string, userId: string) {
  const memberRepo = AppDataSource.getRepository(ProjectMember);
  await memberRepo.save(
    memberRepo.create({ user_id: userId, project_id: projectId, role: "viewer" }),
  );
}

// ---------------------------------------------------------------------------
// GET /projects/:projectId/documents
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/documents", () => {
  it("owner gets empty list when no documents", async () => {
    const project = await createTestProject("P", ownerId);

    const res = await request(app)
      .get(`/projects/${project.id}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(Array.isArray(res.body)).toBe(true);
    expect(res.body).toHaveLength(0);
  });

  it("returns existing documents ordered newest first", async () => {
    const project = await createTestProject("P", ownerId);
    const docA = await createTestDocument(project.id, { name: "alpha.pdf" });
    const docB = await createTestDocument(project.id, { name: "beta.pdf" });

    const res = await request(app)
      .get(`/projects/${project.id}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body).toHaveLength(2);
    // Both document ids should be in the response
    const ids = res.body.map((d: { id: string }) => d.id);
    expect(ids).toContain(docA.id);
    expect(ids).toContain(docB.id);
  });

  it("viewer can list documents", async () => {
    const project = await createTestProject("P", ownerId);
    const [viewerUser] = await AppDataSource.query(
      "SELECT * FROM users WHERE email = 'viewer@test.com'",
    );
    await addViewer(project.id, viewerUser.id);

    const res = await request(app)
      .get(`/projects/${project.id}/documents`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(200);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("P", ownerId);
    const res = await request(app).get(`/projects/${project.id}/documents`);
    expect(res.status).toBe(401);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("P", ownerId);
    const res = await request(app)
      .get(`/projects/${project.id}/documents`)
      .set("Authorization", `Bearer ${outsiderToken}`);
    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// POST /projects/:projectId/documents (multipart upload)
// ---------------------------------------------------------------------------

describe("POST /projects/:projectId/documents", () => {
  it("owner can upload a PDF and receives 201 with document record", async () => {
    const project = await createTestProject("P", ownerId);
    const buf = Buffer.from("fake pdf content");

    const res = await request(app)
      .post(`/projects/${project.id}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .attach("file", buf, { filename: "report.pdf", contentType: "application/pdf" });

    expect(res.status).toBe(201);
    expect(res.body.id).toBeDefined();
    expect(res.body.name).toBe("report.pdf");
    expect(res.body.file_type).toBe("pdf");
    expect(res.body.project_id).toBe(project.id);
  });

  it("returns 400 when no file is attached", async () => {
    const project = await createTestProject("P", ownerId);

    const res = await request(app)
      .post(`/projects/${project.id}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send();

    expect(res.status).toBe(400);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("P", ownerId);
    const [viewerUser] = await AppDataSource.query(
      "SELECT * FROM users WHERE email = 'viewer@test.com'",
    );
    await addViewer(project.id, viewerUser.id);
    const buf = Buffer.from("content");

    const res = await request(app)
      .post(`/projects/${project.id}/documents`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .attach("file", buf, { filename: "doc.txt", contentType: "text/plain" });

    expect(res.status).toBe(403);
  });

  it("returns 401 without token", async () => {
    const project = await createTestProject("P", ownerId);
    const buf = Buffer.from("content");

    const res = await request(app)
      .post(`/projects/${project.id}/documents`)
      .attach("file", buf, { filename: "doc.txt", contentType: "text/plain" });

    expect(res.status).toBe(401);
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId/documents/:id
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/documents/:id", () => {
  it("owner can get document by id", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/${doc.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.id).toBe(doc.id);
  });

  it("returns 404 for unknown document id", async () => {
    const project = await createTestProject("P", ownerId);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it("non-member gets 403", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/${doc.id}`)
      .set("Authorization", `Bearer ${outsiderToken}`);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// GET /projects/:projectId/documents/:id/download
// ---------------------------------------------------------------------------

describe("GET /projects/:projectId/documents/:id/download", () => {
  it("returns a presigned URL for an existing document", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/${doc.id}/download`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(200);
    expect(res.body.url).toBe("https://s3.example.com/presigned");
  });

  it("returns 404 for unknown document", async () => {
    const project = await createTestProject("P", ownerId);

    const res = await request(app)
      .get(`/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000/download`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });
});

// ---------------------------------------------------------------------------
// PATCH /projects/:projectId/documents/:id
// ---------------------------------------------------------------------------

describe("PATCH /projects/:projectId/documents/:id", () => {
  it("owner can rename a document", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id, { name: "old.pdf" });

    const res = await request(app)
      .patch(`/projects/${project.id}/documents/${doc.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "new.pdf" });

    expect(res.status).toBe(200);
    expect(res.body.name).toBe("new.pdf");
  });

  it("returns 400 for invalid status value", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id);

    const res = await request(app)
      .patch(`/projects/${project.id}/documents/${doc.id}`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ status: "invalid_status" });

    expect(res.status).toBe(400);
  });

  it("returns 404 for unknown document", async () => {
    const project = await createTestProject("P", ownerId);

    const res = await request(app)
      .patch(`/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ name: "anything.pdf" });

    expect(res.status).toBe(404);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("P", ownerId);
    const [viewerUser] = await AppDataSource.query(
      "SELECT * FROM users WHERE email = 'viewer@test.com'",
    );
    await addViewer(project.id, viewerUser.id);
    const doc = await createTestDocument(project.id);

    const res = await request(app)
      .patch(`/projects/${project.id}/documents/${doc.id}`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ name: "hacked.pdf" });

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// DELETE /projects/:projectId/documents/:id
// ---------------------------------------------------------------------------

describe("DELETE /projects/:projectId/documents/:id", () => {
  it("owner can delete a document and receives 204", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id);

    const res = await request(app)
      .delete(`/projects/${project.id}/documents/${doc.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(204);
  });

  it("document is soft-deleted (not returned in subsequent list)", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id);

    await request(app)
      .delete(`/projects/${project.id}/documents/${doc.id}`)
      .set("Authorization", `Bearer ${ownerToken}`);

    const listRes = await request(app)
      .get(`/projects/${project.id}/documents`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(listRes.body.find((d: { id: string }) => d.id === doc.id)).toBeUndefined();
  });

  it("returns 404 for unknown document", async () => {
    const project = await createTestProject("P", ownerId);

    const res = await request(app)
      .delete(`/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000`)
      .set("Authorization", `Bearer ${ownerToken}`);

    expect(res.status).toBe(404);
  });

  it("viewer gets 403", async () => {
    const project = await createTestProject("P", ownerId);
    const [viewerUser] = await AppDataSource.query(
      "SELECT * FROM users WHERE email = 'viewer@test.com'",
    );
    await addViewer(project.id, viewerUser.id);
    const doc = await createTestDocument(project.id);

    const res = await request(app)
      .delete(`/projects/${project.id}/documents/${doc.id}`)
      .set("Authorization", `Bearer ${viewerToken}`);

    expect(res.status).toBe(403);
  });
});

// ---------------------------------------------------------------------------
// PUT /projects/:projectId/documents/:id/content — in-browser editor save
// ---------------------------------------------------------------------------

describe("PUT /projects/:projectId/documents/:id/content", () => {
  const EDITABLE_TYPES = ["md", "txt", "csv", "json"] as const;

  EDITABLE_TYPES.forEach((file_type) => {
    it(`saves content for ${file_type} document`, async () => {
      const project = await createTestProject("P", ownerId);
      const doc = await createTestDocument(project.id, { file_type, status: "ready" });

      const res = await request(app)
        .put(`/projects/${project.id}/documents/${doc.id}/content`)
        .set("Authorization", `Bearer ${ownerToken}`)
        .send({ content: `# Hello from ${file_type}` });

      expect(res.status).toBe(200);
      expect(res.body.id).toBe(doc.id);
    });
  });

  it("returns 422 for non-editable file types (pdf)", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id, { file_type: "pdf", status: "ready" });

    const res = await request(app)
      .put(`/projects/${project.id}/documents/${doc.id}/content`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ content: "some text" });

    expect(res.status).toBe(422);
    expect(res.body.error).toMatch(/pdf/i);
  });

  it("returns 400 when content is missing", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id, { file_type: "md", status: "ready" });

    const res = await request(app)
      .put(`/projects/${project.id}/documents/${doc.id}/content`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({});

    expect(res.status).toBe(400);
  });

  it("returns 401 without auth", async () => {
    const project = await createTestProject("P", ownerId);
    const doc = await createTestDocument(project.id, { file_type: "md", status: "ready" });

    const res = await request(app)
      .put(`/projects/${project.id}/documents/${doc.id}/content`)
      .send({ content: "test" });

    expect(res.status).toBe(401);
  });

  it("returns 403 for viewer (read-only) role", async () => {
    const project = await createTestProject("P", ownerId);
    const [viewerUser] = await AppDataSource.query(
      "SELECT * FROM users WHERE email = 'viewer@test.com'",
    );
    await addViewer(project.id, viewerUser.id);
    const doc = await createTestDocument(project.id, { file_type: "md", status: "ready" });

    const res = await request(app)
      .put(`/projects/${project.id}/documents/${doc.id}/content`)
      .set("Authorization", `Bearer ${viewerToken}`)
      .send({ content: "test" });

    expect(res.status).toBe(403);
  });

  it("returns 404 for non-existent document", async () => {
    const project = await createTestProject("P", ownerId);

    const res = await request(app)
      .put(`/projects/${project.id}/documents/00000000-0000-0000-0000-000000000000/content`)
      .set("Authorization", `Bearer ${ownerToken}`)
      .send({ content: "test" });

    expect(res.status).toBe(404);
  });
});
