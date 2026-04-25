import { Router, type Request, type Response } from "express";

const router = Router();

export interface LlmProviderDefinition {
  id: string;
  name: string;
  /** cloud = hosted API; onprem = self-hosted, model is user-defined */
  type: "cloud" | "onprem";
  models: string[];
  needs_api_key: boolean;
  needs_base_url: boolean;
  /** True when the provider follows OpenAI-style frequency/presence penalties */
  openai_compat: boolean;
}

const PROVIDERS: LlmProviderDefinition[] = [
  {
    id: "openai",
    name: "OpenAI",
    type: "cloud",
    models: [
      "gpt-4o",
      "gpt-4o-mini",
      "gpt-4-turbo",
      "gpt-4",
      "gpt-3.5-turbo",
    ],
    needs_api_key: true,
    needs_base_url: false,
    openai_compat: true,
  },
  {
    id: "anthropic",
    name: "Anthropic",
    type: "cloud",
    models: [
      "claude-opus-4-5",
      "claude-sonnet-4-5",
      "claude-haiku-4-5",
      "claude-3-5-sonnet-20241022",
      "claude-3-5-haiku-20241022",
      "claude-3-opus-20240229",
    ],
    needs_api_key: true,
    needs_base_url: false,
    openai_compat: false,
  },
  {
    id: "ollama",
    name: "Ollama",
    type: "onprem",
    models: [],
    needs_api_key: false,
    needs_base_url: true,
    openai_compat: true,
  },
  {
    id: "vllm",
    name: "vLLM",
    type: "onprem",
    models: [],
    needs_api_key: false,
    needs_base_url: true,
    openai_compat: true,
  },
  {
    id: "lmstudio",
    name: "LM Studio",
    type: "onprem",
    models: [],
    needs_api_key: false,
    needs_base_url: true,
    openai_compat: true,
  },
];

router.get("/providers", (_req: Request, res: Response) => {
  res.json(PROVIDERS);
});

export default router;
