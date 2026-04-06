// Set all env vars before any module is imported
process.env.DATABASE_URL = "postgres://sweai:sweai@localhost:5432/sweai_test";
process.env.JWT_SECRET = "test-jwt-secret-at-least-32-chars-ok";
process.env.ENCRYPTION_KEY = "test-encryption-key-32-chars-ok!";
process.env.NODE_ENV = "test";
