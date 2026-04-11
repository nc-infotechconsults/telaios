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


## Domain Entities

### Configuration
The configuration settings for the application.
```
id (uuid), 
key (string),
value (string),
created_at (timestamp),
updated_at (timestamp)
```

### Role
The role (at system scope) that could be assigned to the user
```
id (uuid), 
name (string),
key (string),
permissions (json),
created_at (timestamp),
updated_at (timestamp)
```

### User
The users of the application
```
id (uuid), 
name (string),
surname (string),
role_id (uuid),
created_at (timestamp),
updated_at (timestamp)
```

### Project
A project is composed by plans, documentations and sourcecode repositories.
```
id (uuid), 
name (string),
description (text),
created_at (timestamp),
updated_at (timestamp)
```

### ProjectMember
Members are real users with different roles (such as owner, editor, viewer, ecc.).  
```
id (uuid), 
project_id (string),
user_id (string),
role (string), 
created_at (timestamp),
updated_at (timestamp)
```

### Agent
A project can have multiple AI agents definition where each one can have different roles (such as owner, editor, viewer, ecc.) and capabilities (skills, mcp, model, parameters, ecc.)
```
id (uuid), 
name (string),
description (text),
tags (string[])
project_id (string),
role (string),
llm_config (json),
skills (json),
mcp (json),
system_prompt (text),
created_at (timestamp),
updated_at (timestamp)
```

### Documentation
Documentation (pdf, docx, excel, Markdown) related to a project. It is stored in an object storage using S3 protocol. 
```
id (uuid), 
name (string),
status (string),
project_id (uuid),
path (text),
created_at (timestamp),
updated_at (timestamp)
```

### Repository
Source code repository (GIT) related to a project. Could be a remote repository (GitHub, GitLab, etc.) or a local repository (stored in an object storage using S3 protocol).
```
id (uuid), 
name (string),
status (string),
project_id (uuid),
branch (string),
url (text), // could be a remote url (GitHub, GitLab, etc.) or a local url (object storage path)
username (string), // only for private remote repositories
password (string), // only for private remote repositories
certificate (text), // only for private remote repositories
created_at (timestamp),
updated_at (timestamp)
```

### Plan
A plan is a collection of tasks. It could be generated from an AI Agent coordinated by the user or directly by the user. 
```
id (uuid), 
name (string),
status (string),
project_id (uuid),
created_at (timestamp),
updated_at (timestamp),
completed_at (timestamp),
```

### Task
The work item to do.
```
id (uuid), 
name (string),
description (text),
plan_id (uuid),
status (string),
assigned_to (uuid), // could be a user or agent  
created_at (timestamp), 
updated_at (timestamp),
completed_at (timestamp),
```

### TaskDependency
Dependencies across tasks. 
```
id (uuid), 
task_id (uuid),
depends_on (uuid)
```

### TaskRepository
Dependencies between tasks and repository.
```
id (uuid), 
task_id (uuid),
depends_on (uuid),
```

### TaskDocumentation
Dependencies between tasks and documentations.
```
id (uuid), 
task_id (uuid),
depends_on (uuid),
```

