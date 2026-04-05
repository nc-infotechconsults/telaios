FROM node:20-alpine
WORKDIR /app

# Copy workspace manifests so npm can build the full workspace graph
COPY package.json package-lock.json .npmrc ./
COPY data-api/package.json ./data-api/
COPY frontend/package.json ./frontend/
COPY agent-service/package.json ./agent-service/
COPY tests/package.json ./tests/

# Single install for the whole monorepo — shared deps land in /app/node_modules
RUN npm ci

COPY data-api/ ./data-api/

WORKDIR /app/data-api
EXPOSE 3000
CMD ["npm", "run", "dev"]
