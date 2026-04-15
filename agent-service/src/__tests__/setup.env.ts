/** Agent-service test env setup — loaded before every test file via jest setupFilesAfterSetup */
process.env.NODE_ENV = "test";
process.env.DATA_API_URL = "http://localhost:3000";
process.env.DATA_API_KEY = "test-api-key";
process.env.REDIS_URL = "redis://localhost:6379";
process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-ok!";
process.env.WORKSPACES_ROOT = "/tmp/swe-ai-test-workspaces";
process.env.LLM_PROVIDER = "openai";
process.env.LLM_MODEL = "gpt-4o";
process.env.LLM_API_KEY = "test-llm-key";
