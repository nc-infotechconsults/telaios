import {
  listDocuments,
  createDocument,
  getDocument,
  getDocumentById,
  patchDocument,
  deleteDocument,
} from "../../../services/document.service";
import { AppDataSource } from "../../../configs/data-source.config";
import { Document } from "../../../entities/Document.entity";

jest.mock("../../../configs/data-source.config", () => ({
  AppDataSource: { getRepository: jest.fn() },
}));

const mockRepo = {
  find: jest.fn(),
  findOneBy: jest.fn(),
  create: jest.fn(),
  save: jest.fn(),
  softDelete: jest.fn(),
};

beforeEach(() => {
  jest.clearAllMocks();
  (AppDataSource.getRepository as jest.Mock).mockReturnValue(mockRepo);
});

// ---------------------------------------------------------------------------
// listDocuments
// ---------------------------------------------------------------------------

describe("listDocuments", () => {
  it("returns documents ordered by created_at DESC", async () => {
    const docs = [{ id: "d1" }, { id: "d2" }] as Document[];
    mockRepo.find.mockResolvedValue(docs);

    const result = await listDocuments("p1");

    expect(result).toBe(docs);
    expect(mockRepo.find).toHaveBeenCalledWith({
      where: { project_id: "p1" },
      order: { created_at: "DESC" },
    });
  });

  it("returns empty array when no documents exist", async () => {
    mockRepo.find.mockResolvedValue([]);
    const result = await listDocuments("p-empty");
    expect(result).toHaveLength(0);
  });
});

// ---------------------------------------------------------------------------
// createDocument
// ---------------------------------------------------------------------------

describe("createDocument", () => {
  const dto = {
    name: "report.pdf",
    file_type: "pdf" as const,
    mime_type: "application/pdf",
    s3_key: "projects/p1/documents/d1/report.pdf",
    size_bytes: 2048,
    checksum_sha256: "abc123",
    status: "uploading" as const,
    metadata: null,
  };

  it("creates and returns a document with provided fields", async () => {
    const created = { id: "d1", ...dto, project_id: "p1", uploaded_by: "u1" } as unknown as Document;
    mockRepo.create.mockReturnValue(created);
    mockRepo.save.mockResolvedValue(created);

    const result = await createDocument("p1", "u1", dto);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({
        project_id: "p1",
        uploaded_by: "u1",
        name: "report.pdf",
        file_type: "pdf",
        s3_key: dto.s3_key,
        status: "uploading",
      }),
    );
    expect(result).toBe(created);
  });

  it("passes null as uploaded_by when no user", async () => {
    const created = { id: "d2", ...dto, project_id: "p1", uploaded_by: null } as unknown as Document;
    mockRepo.create.mockReturnValue(created);
    mockRepo.save.mockResolvedValue(created);

    await createDocument("p1", null, dto);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ uploaded_by: null }),
    );
  });

  it("defaults status to 'uploading' when dto.status is undefined", async () => {
    const dtoNoStatus = { ...dto, status: undefined };
    const created = { id: "d3" } as Document;
    mockRepo.create.mockReturnValue(created);
    mockRepo.save.mockResolvedValue(created);

    await createDocument("p1", null, dtoNoStatus as unknown as typeof dto);

    expect(mockRepo.create).toHaveBeenCalledWith(
      expect.objectContaining({ status: "uploading" }),
    );
  });
});

// ---------------------------------------------------------------------------
// getDocument
// ---------------------------------------------------------------------------

describe("getDocument", () => {
  it("returns the document when found", async () => {
    const doc = { id: "d1", project_id: "p1" } as Document;
    mockRepo.findOneBy.mockResolvedValue(doc);

    const result = await getDocument("d1", "p1");

    expect(result).toBe(doc);
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: "d1", project_id: "p1" });
  });

  it("returns null when not found", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    const result = await getDocument("missing", "p1");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// getDocumentById
// ---------------------------------------------------------------------------

describe("getDocumentById", () => {
  it("looks up document by id only (no project_id constraint)", async () => {
    const doc = { id: "d1", project_id: "p2" } as Document;
    mockRepo.findOneBy.mockResolvedValue(doc);

    const result = await getDocumentById("d1");

    expect(result).toBe(doc);
    expect(mockRepo.findOneBy).toHaveBeenCalledWith({ id: "d1" });
  });

  it("returns null when document does not exist", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    const result = await getDocumentById("unknown");
    expect(result).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// patchDocument
// ---------------------------------------------------------------------------

describe("patchDocument", () => {
  it("updates name when provided", async () => {
    const doc = { id: "d1", project_id: "p1", name: "old.pdf", status: "ready", error_message: null, metadata: null } as unknown as Document;
    mockRepo.findOneBy.mockResolvedValue(doc);
    mockRepo.save.mockResolvedValue({ ...doc, name: "new.pdf" });

    const result = await patchDocument("d1", "p1", { name: "new.pdf" });

    expect(result).not.toBeNull();
    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ name: "new.pdf" }));
  });

  it("updates status when provided", async () => {
    const doc = { id: "d1", project_id: "p1", name: "doc.pdf", status: "processing", error_message: null, metadata: null } as unknown as Document;
    mockRepo.findOneBy.mockResolvedValue(doc);
    mockRepo.save.mockResolvedValue({ ...doc, status: "ready" });

    await patchDocument("d1", "p1", { status: "ready" });

    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ status: "ready" }));
  });

  it("sets error_message to null when explicitly passed null", async () => {
    const doc = { id: "d1", project_id: "p1", name: "doc.pdf", status: "error", error_message: "oops", metadata: null } as unknown as Document;
    mockRepo.findOneBy.mockResolvedValue(doc);
    mockRepo.save.mockResolvedValue({ ...doc, error_message: null });

    await patchDocument("d1", "p1", { error_message: null });

    expect(mockRepo.save).toHaveBeenCalledWith(expect.objectContaining({ error_message: null }));
  });

  it("returns null when document does not exist", async () => {
    mockRepo.findOneBy.mockResolvedValue(null);
    const result = await patchDocument("missing", "p1", { name: "new.pdf" });
    expect(result).toBeNull();
    expect(mockRepo.save).not.toHaveBeenCalled();
  });
});

// ---------------------------------------------------------------------------
// deleteDocument
// ---------------------------------------------------------------------------

describe("deleteDocument", () => {
  it("calls softDelete with correct id and project_id", async () => {
    mockRepo.softDelete.mockResolvedValue(undefined);

    await deleteDocument("d1", "p1");

    expect(mockRepo.softDelete).toHaveBeenCalledWith({ id: "d1", project_id: "p1" });
  });
});
