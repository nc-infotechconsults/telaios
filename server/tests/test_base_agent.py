from langchain_core.messages import HumanMessage

from telaios.core.agents import BaseAgent
from telaios.core.types import LLMConfig

llm_config = LLMConfig(
    api_key="fake-key",
    max_tokens=4096,
    base_url="http://localhost:8000/v1",
    provider="openai",
    model_name="mlx-community/Qwen3.5-9B-MLX-4bit",
    temperature=0.7,
)

agent = BaseAgent("base-agent-test", llm_config)
input = {"messages": [HumanMessage(content="Raccontami una storia")]}
# result = agent.instance.invoke()

for chunk in agent.instance.stream(input, stream_mode=["values", "updates"], version="v2"):
    print(f"Chunk: {chunk}")
