import { GetObjectCommand, S3Client } from "@aws-sdk/client-s3";
import { config } from "../core/config";
import { dataClient } from "./dataClient";
import { extractText } from "./documentExtractor";
import { chunkText } from "./textChunker";
import { embedTexts } from "./embeddingService";

const s3 = new S3Client({
  endpoint: config.S3_ENDPOINT,
  region: config.S3_REGION,
  credentials: {
    accessKeyId: config.S3_ACCESS_KEY,
    secretAccessKey: config.S3_SECRET_KEY,
  },
  forcePathStyle: true,
});

/**
 * Full document processing pipeline:
 * 1. Fetch document metadata from data-api
 * 2. Download file buffer from S3
 * 3. Extract text
 * 4. Chunk text
 * 5. Embed chunks
 * 6. Store chunks in data-api
 * 7. Update document status to "ready"
 *
 * On any error, marks the document status as "error".
 */
export async function processDocument(
  documentId: string,
  projectId: string,
): Promise<void> {
  try {
    // 1. Get document metadata
    const doc = await dataClient.getDocument(projectId, documentId);

    // 2. Download from S3
    const getCmd = new GetObjectCommand({
      Bucket: config.S3_BUCKET,
      Key: doc.s3_key,
    });
    const s3Res = await s3.send(getCmd);
    if (!s3Res.Body) {
      throw new Error("Empty S3 response body");
    }

    // Convert S3 stream to Buffer
    const chunks: Uint8Array[] = [];
    for await (const chunk of s3Res.Body as AsyncIterable<Uint8Array>) {
      chunks.push(chunk);
    }
    const buffer = Buffer.concat(chunks);

    // 3. Extract text (pass file_type as fallback for generic mime types)
    const text = await extractText(buffer, doc.mime_type, doc.file_type);
    if (!text || text.trim().length === 0) {
      // No extractable text — mark ready with empty chunks
      await dataClient.updateDocumentStatus(documentId, "ready");
      return;
    }

    // 4. Chunk
    const textChunks = chunkText(text);

    // 5. Embed (in batches of 100 to avoid rate-limit issues)
    const BATCH = 100;
    const allEmbeddings: number[][] = [];
    for (let i = 0; i < textChunks.length; i += BATCH) {
      const batch = textChunks.slice(i, i + BATCH);
      const embeddings = await embedTexts(batch);
      allEmbeddings.push(...embeddings);
    }

    // 6. Store chunks
    const chunkPayload = textChunks.map((content, idx) => ({
      chunk_index: idx,
      content,
      embedding: allEmbeddings[idx],
    }));

    await dataClient.storeDocumentChunks(documentId, chunkPayload);

    // 7. Mark ready
    await dataClient.updateDocumentStatus(documentId, "ready");
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    // Best-effort status update
    await dataClient
      .updateDocumentStatus(documentId, "error", message)
      .catch(() => undefined);
  }
}
