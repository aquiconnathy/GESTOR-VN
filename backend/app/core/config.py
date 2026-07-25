from pydantic_settings import BaseSettings
from functools import lru_cache

class Settings(BaseSettings):
    # Supabase
    SUPABASE_URL: str = ""
    SUPABASE_KEY: str = ""  # service_role key
    SUPABASE_ANON_KEY: str = ""
    DATABASE_URL: str = ""  # postgres connection string

    # Telegram
    BOT_TOKEN: str = ""
    CHAT_ID: str = ""
    CHAT_REENVIO_ID: str = ""

    # App
    SECRET_KEY: str = "umsr-secret-change-me"
    ALGORITHM: str = "HS256"
    ACCESS_TOKEN_EXPIRE_MINUTES: int = 60 * 24

    # Promociones válidas (igual que en Apps Script)
    PROMOS_OK: list[str] = [
        "INSTALACIÓN 80$BCV AX3000 01/06/2026",
        "INSTALACION 80$BCV AX3000 01/06/2026",
        "ONU",
        "ONU SENCILLA",
        "ESTE ES TU LUGAR"
    ]

    class Config:
        env_file = ".env"

@lru_cache()
def get_settings() -> Settings:
    return Settings()
