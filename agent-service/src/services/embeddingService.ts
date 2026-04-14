import { OpenAIEmbeddings } from "@langchain/openai";
import { config } from "../core/config";

let _embeddings: OpenAIEmbeddings | null = null;

function getEmbeddings(): OpenAIEmbeddings {
  if (!_embeddings) {
    _embeddings = new OpenAIEmbeddings({
      model: config.EMBEDDING_MODEL,
      apiKey: config.LLM_API_KEY || undefined,
    });
  }
  return _embeddings;
}

/**
 * Embed an array of text strings.
 * Returns a parallel array of float32 vectors (1536 dimensions for text-embedding-3-small).
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];
  return getEmbeddings().embedDocuments(texts);
}
