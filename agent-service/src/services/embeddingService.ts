import { OpenAIEmbeddings } from "@langchain/openai";
import { EmbeddingModel, FlagEmbedding } from "fastembed";
import { config } from "../core/config";

let _openaiEmbeddings: OpenAIEmbeddings | null = null;
let _localEmbeddings: FlagEmbedding | null = null;

/** True when an API key suitable for OpenAI-compatible embeddings is configured. */
function hasOpenAIKey(): boolean {
  const key = config.EMBEDDING_API_KEY || config.LLM_API_KEY || "";
  // Anthropic keys start with "sk-ant-" — they won't work with OpenAI embeddings
  return key.length > 0 && !key.startsWith("sk-ant-");
}

async function getLocalEmbeddings(): Promise<FlagEmbedding> {
  if (!_localEmbeddings) {
    // BAAI/bge-small-en-v1.5 — 384-dim, ~40 MB, no internet key required
    _localEmbeddings = await FlagEmbedding.init({
      model: EmbeddingModel.BGESmallENV15,
    });
  }
  return _localEmbeddings;
}

function getOpenAIEmbeddings(): OpenAIEmbeddings {
  if (!_openaiEmbeddings) {
    const apiKey = config.EMBEDDING_API_KEY || config.LLM_API_KEY || undefined;
    _openaiEmbeddings = new OpenAIEmbeddings({
      model: config.EMBEDDING_MODEL,
      apiKey,
      ...(config.EMBEDDING_BASE_URL
        ? { configuration: { baseURL: config.EMBEDDING_BASE_URL } }
        : {}),
    });
  }
  return _openaiEmbeddings;
}

/**
 * Embed an array of text strings.
 *
 * - If an OpenAI-compatible key is configured (`EMBEDDING_API_KEY` or a non-Anthropic
 *   `LLM_API_KEY`), uses the OpenAI embeddings API.
 * - Otherwise falls back to a local ONNX model via fastembed (BAAI/bge-small-en-v1.5,
 *   384-dimensional) that requires no API key.
 *
 * NOTE: mixing providers across document uploads will make cosine-similarity search
 * unreliable. Stick to one provider per project.
 */
export async function embedTexts(texts: string[]): Promise<number[][]> {
  if (texts.length === 0) return [];

  if (hasOpenAIKey()) {
    return getOpenAIEmbeddings().embedDocuments(texts);
  }

  // Local fallback
  const model = await getLocalEmbeddings();
  const results: number[][] = [];
  // model.embed() yields Float32Array[] (one entry per input text per batch)
  for await (const batch of model.embed(texts)) {
    for (const emb of batch) {
      results.push(Array.from(emb));
    }
  }
  return results;
}
