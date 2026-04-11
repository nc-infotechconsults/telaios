FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lock ./
COPY data-api/package.json ./data-api/
COPY frontend/package.json ./frontend/
COPY agent-service/package.json ./agent-service/
COPY tests/package.json ./tests/

RUN bun install --frozen-lockfile

COPY agent-service/ ./agent-service/

WORKDIR /app/agent-service
EXPOSE 8000
CMD ["bun", "run", "dev"]
