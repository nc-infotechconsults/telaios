import type { Config } from "jest";

const config: Config = {
  displayName: "integration",
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/__tests__/integration/**/*.test.ts"],
  setupFiles: ["<rootDir>/src/__tests__/setup.env.ts"],
  setupFilesAfterFramework: ["<rootDir>/src/__tests__/setup.framework.ts"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  clearMocks: true,
  testTimeout: 30000,
};

export default config;
