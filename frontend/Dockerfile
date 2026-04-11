FROM oven/bun:1-alpine
WORKDIR /app

COPY package.json bun.lock ./
COPY data-api/package.json ./data-api/
COPY frontend/package.json ./frontend/
COPY agent-service/package.json ./agent-service/
COPY tests/package.json ./tests/

RUN bun install --frozen-lockfile

COPY frontend/ ./frontend/

WORKDIR /app/frontend
EXPOSE 5173
CMD ["bun", "run", "dev", "--", "--host", "0.0.0.0"]
