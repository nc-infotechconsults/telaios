import { ChatOpenAI } from "@langchain/openai";
import { ChatAnthropic } from "@langchain/anthropic";
import type { BaseChatModel } from "@langchain/core/language_models/chat_models";

export interface LlmConfig {
  provider: string;
  model: string;
  apiKey: string;
  baseUrl?: string;
}

export function buildChatModel(cfg: LlmConfig): BaseChatModel {
  switch (cfg.provider) {
    case "openai":
      return new ChatOpenAI({ model: cfg.model, apiKey: cfg.apiKey });

    case "anthropic":
      return new ChatAnthropic({ model: cfg.model, apiKey: cfg.apiKey });

    default:
      return new ChatOpenAI({
        model: cfg.model,
        apiKey: cfg.apiKey || "placeholder",
        configuration: { baseURL: cfg.baseUrl },
      });
  }
}
