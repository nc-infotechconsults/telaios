/**
 * Split text into overlapping chunks for embedding.
 *
 * @param text       Source text to chunk
 * @param chunkSize  Approximate character count per chunk (default 500)
 * @param overlap    Number of characters to overlap between consecutive chunks (default 50)
 * @returns Array of chunk strings (non-empty)
 */
export function chunkText(
  text: string,
  chunkSize = 500,
  overlap = 50,
): string[] {
  if (!text || text.trim().length === 0) return [];

  const chunks: string[] = [];
  let start = 0;

  while (start < text.length) {
    const end = Math.min(start + chunkSize, text.length);
    const chunk = text.slice(start, end).trim();
    if (chunk.length > 0) {
      chunks.push(chunk);
    }
    // Advance by (chunkSize - overlap) so next chunk overlaps
    start += chunkSize - overlap;
    if (start >= text.length) break;
  }

  return chunks;
}
