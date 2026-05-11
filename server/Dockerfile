# syntax=docker/dockerfile:1.7

# ---- Stage 1: builder ----
FROM python:3.14-slim AS builder

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    UV_LINK_MODE=copy \
    UV_PROJECT_ENVIRONMENT=/opt/venv

# Install uv (matches local toolchain)
COPY --from=ghcr.io/astral-sh/uv:0.11 /uv /usr/local/bin/uv

# System deps for compiled wheels (asyncpg, bcrypt, pgvector, docker SDK indirectly)
RUN apt-get update && apt-get install -y --no-install-recommends \
    build-essential \
    libpq-dev \
    curl \
    ca-certificates \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY pyproject.toml uv.lock* ./
COPY src ./src

# Install full dependency set (including optional extras used in production).
# Adjust extras as future phases lock decisions.
RUN uv sync --frozen --no-dev --extra docker --extra k8s --extra storage || \
    uv sync --no-dev --extra docker --extra k8s --extra storage

# ---- Stage 2: runtime ----
FROM python:3.14-slim AS runtime

ENV PYTHONUNBUFFERED=1 \
    PYTHONDONTWRITEBYTECODE=1 \
    PATH="/opt/venv/bin:${PATH}"

# Runtime libs only + helm CLI (used by infra/helm via subprocess)
RUN apt-get update && apt-get install -y --no-install-recommends \
    libpq5 \
    ca-certificates \
    curl \
    wget \
    && curl -fsSL https://raw.githubusercontent.com/helm/helm/main/scripts/get-helm-3 | bash \
    && apt-get purge -y curl \
    && rm -rf /var/lib/apt/lists/*

WORKDIR /app
COPY --from=builder /opt/venv /opt/venv
COPY --from=builder /app/src ./src
COPY alembic.ini ./
COPY alembic/ ./alembic/

EXPOSE 8000

# Default to running the FastAPI app via uvicorn against the create_app factory.
CMD ["uvicorn", "telaios.main:app", "--host", "0.0.0.0", "--port", "8000"]
