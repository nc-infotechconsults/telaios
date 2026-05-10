from fastapi import FastAPI
from starlette.middleware.cors import CORSMiddleware

from telaios.api.middleware.authenticate import AuthenticateMiddleware
from telaios.api.middleware.limit_size_body import LimitBodySizeMiddleware
from telaios.config.settings import config
from telaios.api.routers.health import router as health_router

def create_app() -> FastAPI:
    app = FastAPI(
        title="TelaiOS — Agent Service",
        version="1.0.0",
        description="LLM-driven planning, multi-agent execution, document processing, SSE streaming."
    )

    app.add_middleware(AuthenticateMiddleware)
    app.add_middleware(LimitBodySizeMiddleware)

    # Restrict CORS to the configured frontend origin.
    allowed_origins = [
        o.strip() for o in config.ALLOWED_ORIGINS.split(",") if o.strip()
    ]
    allowed_headers = [
        o.strip() for o in config.ALLOWED_HEADERS.split(",") if o.strip()
    ]
    allowed_methods = [
        o.strip() for o in config.ALLOWED_METHODS.split(",") if o.strip()
    ]

    app.add_middleware(
        CORSMiddleware,
        allow_origins=allowed_origins,
        allow_credentials=bool(allowed_origins),
        allow_methods=allowed_methods,
        allow_headers=allowed_headers,
    )

    app.include_router(health_router)
    # app.include_router(chat_router)
    # app.include_router(documents_router)
    # app.include_router(document_copilot_router)
    # app.include_router(plans_router)
    # app.include_router(skills_router)
    # app.include_router(v2_router)

    return app