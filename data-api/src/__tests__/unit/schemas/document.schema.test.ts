import {
  CreateDocumentSchema,
  PatchDocumentSchema,
  PatchDocumentStatusSchema,
} from "../../../schemas/document.schema";

// ---------------------------------------------------------------------------
// CreateDocumentSchema
// ---------------------------------------------------------------------------

describe("CreateDocumentSchema", () => {
  const valid = {
    name: "report.pdf",
    file_type: "pdf",
    mime_type: "application/pdf",
    s3_key: "projects/p1/documents/d1/report.pdf",
    size_bytes: 2048,
    checksum_sha256: "abc123",
  };

  it("accepts a fully valid payload", () => {
    expect(CreateDocumentSchema.safeParse(valid).success).toBe(true);
  });

  it("defaults status to 'uploading' when omitted", () => {
    const result = CreateDocumentSchema.safeParse(valid);
    expect(result.success && result.data.status).toBe("uploading");
  });

  it("accepts all valid file_type values", () => {
    for (const file_type of ["pdf", "docx", "xlsx", "md", "txt", "csv", "json", "other"]) {
      expect(CreateDocumentSchema.safeParse({ ...valid, file_type }).success).toBe(true);
    }
  });

  it("rejects invalid file_type", () => {
    expect(CreateDocumentSchema.safeParse({ ...valid, file_type: "exe" }).success).toBe(false);
  });

  it("rejects zero size_bytes", () => {
    expect(CreateDocumentSchema.safeParse({ ...valid, size_bytes: 0 }).success).toBe(false);
  });

  it("rejects negative size_bytes", () => {
    expect(CreateDocumentSchema.safeParse({ ...valid, size_bytes: -1 }).success).toBe(false);
  });

  it("rejects empty name", () => {
    expect(CreateDocumentSchema.safeParse({ ...valid, name: "" }).success).toBe(false);
  });

  it("rejects empty mime_type", () => {
    expect(CreateDocumentSchema.safeParse({ ...valid, mime_type: "" }).success).toBe(false);
  });

  it("rejects empty s3_key", () => {
    expect(CreateDocumentSchema.safeParse({ ...valid, s3_key: "" }).success).toBe(false);
  });

  it("accepts metadata as a record", () => {
    const result = CreateDocumentSchema.safeParse({ ...valid, metadata: { pages: 5 } });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.metadata).toEqual({ pages: 5 });
  });

  it("accepts metadata as null", () => {
    const result = CreateDocumentSchema.safeParse({ ...valid, metadata: null });
    expect(result.success).toBe(true);
    if (result.success) expect(result.data.metadata).toBeNull();
  });

  it("defaults metadata to null when omitted", () => {
    const result = CreateDocumentSchema.safeParse(valid);
    expect(result.success && result.data.metadata).toBeNull();
  });
});

// ---------------------------------------------------------------------------
// PatchDocumentSchema
// ---------------------------------------------------------------------------

describe("PatchDocumentSchema", () => {
  it("accepts an empty object (all fields optional)", () => {
    expect(PatchDocumentSchema.safeParse({}).success).toBe(true);
  });

  it("accepts a valid name update", () => {
    expect(PatchDocumentSchema.safeParse({ name: "new-name.pdf" }).success).toBe(true);
  });

  it("rejects empty name string", () => {
    expect(PatchDocumentSchema.safeParse({ name: "" }).success).toBe(false);
  });

  it("accepts all valid status values", () => {
    for (const status of ["uploading", "processing", "ready", "error"]) {
      expect(PatchDocumentSchema.safeParse({ status }).success).toBe(true);
    }
  });

  it("rejects invalid status", () => {
    expect(PatchDocumentSchema.safeParse({ status: "done" }).success).toBe(false);
  });

  it("accepts null error_message", () => {
    expect(PatchDocumentSchema.safeParse({ error_message: null }).success).toBe(true);
  });

  it("accepts string error_message", () => {
    expect(PatchDocumentSchema.safeParse({ error_message: "Something failed" }).success).toBe(true);
  });

  it("accepts null metadata", () => {
    expect(PatchDocumentSchema.safeParse({ metadata: null }).success).toBe(true);
  });

  it("accepts record metadata", () => {
    expect(PatchDocumentSchema.safeParse({ metadata: { key: "val" } }).success).toBe(true);
  });
});

// ---------------------------------------------------------------------------
// PatchDocumentStatusSchema (used by internal endpoint)
// ---------------------------------------------------------------------------

describe("PatchDocumentStatusSchema", () => {
  it("accepts status only", () => {
    expect(PatchDocumentStatusSchema.safeParse({ status: "ready" }).success).toBe(true);
  });

  it("accepts status with error_message", () => {
    expect(
      PatchDocumentStatusSchema.safeParse({ status: "error", error_message: "extraction failed" }).success,
    ).toBe(true);
  });

  it("rejects missing status", () => {
    expect(PatchDocumentStatusSchema.safeParse({}).success).toBe(false);
  });

  it("rejects invalid status", () => {
    expect(PatchDocumentStatusSchema.safeParse({ status: "unknown" }).success).toBe(false);
  });
});
