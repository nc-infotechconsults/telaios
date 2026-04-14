// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
import mammoth from "mammoth";

/**
 * Extract plain text from a file buffer given its MIME type.
 * Returns empty string if extraction is not supported.
 */
export async function extractText(buffer: Buffer, mimeType: string): Promise<string> {
  const mime = mimeType.toLowerCase();

  // PDF
  if (mime === "application/pdf") {
    const result = await pdfParse(buffer);
    return result.text ?? "";
  }

  // DOCX (Word)
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  // Plain-text formats — decode as UTF-8
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/x-ndjson"
  ) {
    return buffer.toString("utf-8");
  }

  // Unsupported — return empty; caller will mark document as error
  return "";
}
