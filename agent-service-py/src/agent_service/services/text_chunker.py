from __future__ import annotations


def chunk_text(text: str, chunk_size: int = 500, overlap: int = 50) -> list[str]:
    """
    Split ``text`` into overlapping chunks for embedding.

    :param text: Source text to chunk.
    :param chunk_size: Approximate character count per chunk.
    :param overlap: Number of characters to overlap between consecutive chunks.
    :returns: List of non-empty chunk strings.
    """
    if not text or not text.strip():
        return []

    chunks: list[str] = []
    start = 0

    while start < len(text):
        end = min(start + chunk_size, len(text))
        chunk = text[start:end].strip()
        if chunk:
            chunks.append(chunk)
        start += chunk_size - overlap
        if start >= len(text):
            break

    return chunks
