from langchain.agents import create_agent
from langchain.chat_models import init_chat_model
from langchain_core.language_models import BaseChatModel
from langchain_core.messages import SystemMessage


class BaseAgent(BaseChatModel):
    def _init_model(self):
        chat_model_values = {
            "model_provider": self._llm_config.provider,
            "model": self._llm_config.model,
            "temperature": self._llm_config.temperature,
            "timeout": self._llm_config.timeout,
            "max_tokens": self._llm_config.max_tokens,
            "api_key": self._llm_config.api_key,
            "streaming": True,
        }

        if self._llm_config.base_url is not None:
            chat_model_values["base_url"] = self._llm_config.base_url

        self._llm = init_chat_model(**chat_model_values)

    def _init_agent(self):
        self._agent = create_agent(
            self._llm,
            name=self._name,
            system_prompt=SystemMessage(content=self._system_prompt),
            debug=self._debug,
        )

    @property
    def instance(self):
        return self._agent
