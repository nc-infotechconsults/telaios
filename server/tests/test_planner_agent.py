import asyncio

from telaios.core.agents import PlannerAgent

agent = PlannerAgent(
    api_key="fake-key",
    model_max_tokens=32768,
    base_url="http://localhost:8000/v1",
    model_provider="openai",
    model_name="mlx-community/Qwen3.5-9B-MLX-4bit",
    model_temperature=0.7,
    system_prompt="""
    You are an helpful assistant that can plan tasks.
    You MUST return a plan ONLY IF you have not questions to do to the user and have enough information to answer the user's questions.
    """,
)

asyncio.run(agent.plan("Plan a trip to Paris for me."))
