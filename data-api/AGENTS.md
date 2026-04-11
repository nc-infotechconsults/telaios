# Agents.md

## Project guidelines
- TypeScript project based on Bun + Express + TypeORM.
- Use PostgreSQL as RDBMS.
- All dto validations are done using zod schemas.
- Use Controller pattern to manage the API endpoints.
- Use Service pattern to manage the business logic.
- Use Repository from TypeORM for DB operation.
- Use UUID as a primary key for all entities but save as varchar.
- Use pino as logging framework.
- Always prefer simplicity and readability over complex solutions.
- Use snake_case as a global name convention.
- Use migrations when the schema changes (e.g., adding new tables, modifying existing tables), command to use `bun run migration:run`.
- Always use type annotations for variables and function parameters.
- Prefer async/await over callbacks for asynchronous operations.
- Prefer composition to inheritance when designing classes and modules.
- Write unit tests and integration tests for all source code. 
- Use Jest as testing framework, command to use `bun run test`.
- Use environment variables for configuration settings, such as database connection settings, API keys, etc. 
- Use dotenv to load environment variables from a .env file.
- For entity's fields that could contain long text use text or varchar without limit
- For entity's fields that are json value use jsonb type.
- All entities are soft deleted, never really removed. 
- All the business logic that treats data should have guardrails about data consistency, integrity and security. 

## Project structure
This is the folder scope:
- **configs**: 
  - contains configuration files, such as database connection settings, environment variables mapping for application variables. 
  - All files have .config suffix.
- **controllers**: 
  - Contains controller files that implement the Express route handlers. 
  - All files have .controller suffix.
- **services**: 
  - Contains service files that implement the application business logic. 
  - All files have .service suffix. 
- **routes**: 
  - Contains Express route files. 
  - All files have .route suffix.
- **entities**: 
  - Contains TypeORM entity files. 
  - All files have .entity suffix.
- **middlewares**: 
  - Contains Express middleware files, such as authentication, error handling, etc. 
  - All files have .middleware suffix.
- **types**: 
  - Contains configuration files, such as database connection settings, environment variables mapping.
- **utils**: 
  - Contains utilities files such as logger, error handling, etc.
