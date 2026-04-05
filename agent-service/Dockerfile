FROM node:20-alpine
WORKDIR /app

COPY package.json package-lock.json .npmrc ./
COPY data-api/package.json ./data-api/
COPY frontend/package.json ./frontend/
COPY agent-service/package.json ./agent-service/
COPY tests/package.json ./tests/

RUN npm ci

COPY agent-service/ ./agent-service/

WORKDIR /app/agent-service
EXPOSE 8000
CMD ["npm", "run", "dev"]
