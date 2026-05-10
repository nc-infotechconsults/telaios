"""Smoke tests for the application factory and Phase 1 wiring."""

from __future__ import annotations

from fastapi import APIRouter
from fastapi.testclient import TestClient

from telaios.main import create_app
from telaios.utils.errors import NotFoundError


def test_create_app_returns_fastapi_instance() -> None:
    app = create_app()
    assert app.title == "telaios"


def test_health_endpoint_returns_ok() -> None:
    app = create_app()
    client = TestClient(app)
    response = client.get("/health")
    assert response.status_code == 200
    assert response.json() == {"status": "ok"}


def test_app_error_returns_uniform_envelope() -> None:
    app = create_app()

    router = APIRouter()

    @router.get("/boom")
    async def boom() -> None:
        raise NotFoundError("widget not found", details={"id": "x"})

    app.include_router(router)
    client = TestClient(app)
    response = client.get("/boom")
    assert response.status_code == 404
    body = response.json()
    assert body["error"]["code"] == "NOT_FOUND"
    assert body["error"]["message"] == "widget not found"
    assert body["error"]["details"] == {"id": "x"}


def test_cors_headers_present() -> None:
    app = create_app()
    client = TestClient(app)
    response = client.options(
        "/health",
        headers={
            "Origin": "http://localhost:5173",
            "Access-Control-Request-Method": "GET",
        },
    )
    assert response.status_code in {200, 204}
    assert "access-control-allow-origin" in {k.lower() for k in response.headers}
