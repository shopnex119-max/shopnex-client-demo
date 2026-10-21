from __future__ import annotations

import os
import secrets
import sys
from pathlib import Path


def app_dir() -> Path:
    # PyInstaller's runtime directory contains the bundled Alembic files.
    return Path(sys._MEIPASS) if getattr(sys, "frozen", False) else Path(__file__).resolve().parent


def configure_local_runtime() -> None:
    data_dir = Path(os.environ.get("SHOPNEX_DATA_DIR", Path.home() / "AppData" / "Local" / "SHOPNEX ULTIMATE"))
    data_dir.mkdir(parents=True, exist_ok=True)
    database_path = data_dir / "shopnex.db"
    os.environ.setdefault("DATABASE_URL", f"sqlite:///{database_path.as_posix()}")
    secret_path = data_dir / ".secret-key"
    if not secret_path.exists():
        secret_path.write_text(secrets.token_hex(32), encoding="ascii")
    os.environ.setdefault("APP_SECRET", secret_path.read_text(encoding="ascii").strip())
    # Create an empty file named require-open-shift.flag in the data folder to force cashiers to open a shift before selling.
    if (data_dir / "require-open-shift.flag").exists():
        os.environ.setdefault("REQUIRE_OPEN_SHIFT", "true")


def main() -> None:
    configure_local_runtime()
    root = app_dir()
    os.chdir(root)
    from alembic import command
    from alembic.config import Config

    config = Config(str(root / "alembic.ini"))
    command.upgrade(config, "head")

    import uvicorn
    from app.main import app

    uvicorn.run(app, host="127.0.0.1", port=8000, log_level="warning", access_log=False)


if __name__ == "__main__":
    main()
