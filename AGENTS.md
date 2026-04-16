# Agents.md

## Setup command
- always run command in the root directory
- use `bun install` for base deps of the root project
- use `bun run apps:install` for install deps of all projects
- use `bun run agent:install` for install deps of the agent-service project
- use `bun run data:install` for install deps of a data-api project
- use `bun run frontend:install` for install deps of a frontend project

## Development command
- use `bun run apps:dev` for development of all projects
- use `bun run agent:dev` for development of the agent-service project
- use `bun run data:dev` for development of a data-api project
- use `bun run frontend:dev` for development of a frontend project
- use `bun run docker:dev` for development of all services with docker
- use `bun run docker:postgres` for development of postgres service with docker
- use `bun run docker:redis` for development of redis service with docker

## Build command
- use `bun run apps:build` for build of all projects
- use `bun run agent:build` for build of the agent-service project
- use `bun run data:build` for build of a data-api project
- use `bun run frontend:build` for build of a frontend project

## Project guideline
- Every project should have a README.md file with a brief description of the project and instructions on how to use it.
- Use semantic versioning for project releases.
- Keep the codebase clean and organized.
- Use AGENTS.md in the subdirectory if available to get more insight about the project scope.
- Write clear and concise commit messages using the following convention: 
  - feat: for new features
  - fix: for bug fixes
  - docs: for documentation changes
  - style: for code style changes (e.g., formatting, linting)
  - refactor: for code refactoring without changing functionality
  - test: for adding or updating tests
  - chore: for other changes that don't modify src or test files (e.g., build scripts, dependencies)
