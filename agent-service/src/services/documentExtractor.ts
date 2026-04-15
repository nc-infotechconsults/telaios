// eslint-disable-next-line @typescript-eslint/no-require-imports
const pdfParse = require("pdf-parse") as (buf: Buffer) => Promise<{ text: string }>;
import mammoth from "mammoth";
import * as XLSX from "xlsx";

/**
 * Extract plain text from a file buffer.
 * Uses mimeType first; falls back to fileType (extension) for generic mime types.
 * Returns empty string if extraction is not supported.
 */
export async function extractText(
  buffer: Buffer,
  mimeType: string,
  fileType?: string,
): Promise<string> {
  const mime = mimeType.toLowerCase();
  const ext = (fileType ?? "").toLowerCase();

  // PDF
  if (mime === "application/pdf" || ext === "pdf") {
    const result = await pdfParse(buffer);
    return result.text ?? "";
  }

  // DOCX (Word)
  if (
    mime === "application/vnd.openxmlformats-officedocument.wordprocessingml.document" ||
    mime === "application/msword" ||
    ext === "docx"
  ) {
    const result = await mammoth.extractRawText({ buffer });
    return result.value ?? "";
  }

  // XLSX (Excel) — flatten all sheets into text
  if (
    mime === "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" ||
    mime === "application/vnd.ms-excel" ||
    ext === "xlsx"
  ) {
    const workbook = XLSX.read(buffer, { type: "buffer" });
    const lines: string[] = [];
    for (const sheetName of workbook.SheetNames) {
      const sheet = workbook.Sheets[sheetName];
      const csv = XLSX.utils.sheet_to_csv(sheet);
      if (csv.trim()) {
        lines.push(`## Sheet: ${sheetName}\n${csv}`);
      }
    }
    return lines.join("\n\n");
  }

  // Plain-text formats — decode as UTF-8
  if (
    mime.startsWith("text/") ||
    mime === "application/json" ||
    mime === "application/x-ndjson" ||
    ["md", "txt", "csv", "json"].includes(ext)
  ) {
    return buffer.toString("utf-8");
  }

  // For generic octet-stream, try text decoding if extension suggests a text file
  if (mime === "application/octet-stream" && ext) {
    const textExts = ["md", "txt", "csv", "json", "ts", "js", "py", "yaml", "yml", "toml", "xml", "html", "css", "sh"];
    if (textExts.includes(ext)) {
      return buffer.toString("utf-8");
    }
  }

  // Unsupported — return empty
  return "";
}
