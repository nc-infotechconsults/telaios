import type { Config } from "jest";

const config: Config = {
  displayName: "unit",
  preset: "ts-jest",
  testEnvironment: "node",
  rootDir: ".",
  testMatch: ["<rootDir>/src/__tests__/unit/**/*.test.ts"],
  setupFiles: ["<rootDir>/src/__tests__/setup.env.ts"],
  setupFilesAfterFramework: ["<rootDir>/src/__tests__/setup.framework.ts"],
  moduleNameMapper: { "^(\\.{1,2}/.*)\\.js$": "$1" },
  clearMocks: true,
};

export default config;
