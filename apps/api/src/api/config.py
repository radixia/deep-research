from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    manus_api_key: str = ""
    manus_base_url: str = "https://open.manus.im"
    manus_webhook_secret: str = ""

    perplexity_api_key: str = ""
    perplexity_model: str = "sonar-deep-research"

    tavily_api_key: str = ""
    firecrawl_api_key: str = ""

    app_env: str = "development"
    log_level: str = "INFO"
    webhook_base_url: str = "http://localhost:8000"

    model_config = {"env_file": ".env", "env_file_encoding": "utf-8"}


settings = Settings()
