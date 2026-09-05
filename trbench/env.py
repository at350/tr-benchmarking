"""Environment loading shared by every command."""
import os

from dotenv import find_dotenv, load_dotenv

TRUTHY = {"1", "true", "yes", "on"}


def load_env() -> None:
    """Load a .env file found in the current directory or any parent (usually the repository root)."""
    load_dotenv(find_dotenv(usecwd=True))
    load_dotenv()  # also honour a .env next to the caller, if any


def env_flag(name: str) -> bool:
    return os.getenv(name, "").strip().lower() in TRUTHY
