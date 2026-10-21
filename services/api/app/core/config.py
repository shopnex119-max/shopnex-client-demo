from pydantic_settings import BaseSettings, SettingsConfigDict


class Settings(BaseSettings):
    app_name: str = "SHOPNEX Local API"
    api_prefix: str = "/api/v1"
    database_url: str = "sqlite:///./shopnex-dev.db"
    app_secret: str = "development-only-change-before-install"
    cors_origins: str = "http://127.0.0.1:1420,http://localhost:1420,tauri://localhost,http://tauri.localhost,https://tauri.localhost"
    integration_mode: str = "offline-first"
    # When true, a cashier must open a shift before recording sales (set REQUIRE_OPEN_SHIFT=true).
    require_open_shift: bool = False

    model_config = SettingsConfigDict(env_file=".env", env_file_encoding="utf-8", extra="ignore")

    @property
    def allowed_origins(self) -> list[str]:
        return [origin.strip() for origin in self.cors_origins.split(",") if origin.strip()]


settings = Settings()
