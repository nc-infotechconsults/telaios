from __future__ import annotations

from fastapi import APIRouter
from fastapi.responses import JSONResponse

router = APIRouter()


@router.get("/health")
async def health() -> JSONResponse:
    return JSONResponse({"status": "ok"})


@router.post("/test-llm")
async def test_llm() -> JSONResponse:
    """
    Quick connectivity test for the configured LLM.
    Returns the model's response to a trivial prompt.
    """
    from agent_service.services import data_client
    from agent_service.core.llm import build_chat_model
    from langchain_core.messages import HumanMessage

    try:
        settings = await data_client.get_settings()
        llm = build_chat_model(
            provider=settings["llm_provider"],
            model=settings["llm_model"],
            api_key=settings.get("llm_api_key_raw") or "",
            base_url=settings.get("llm_base_url"),
        )
        response = await llm.ainvoke([HumanMessage(content='Say "hello" in one word.')])
        content = response.content if isinstance(response.content, str) else str(response.content)
        return JSONResponse({"status": "ok", "response": content})
    except Exception as err:
        return JSONResponse({"status": "error", "error": str(err)}, status_code=500)
