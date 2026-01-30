import os
import platform
from pathlib import Path
from shutil import which


def ensure_poppler_available():
    system = platform.system().lower()

    # Windows (local dev)
    if system == "windows":
        poppler_path = os.environ.get("POPPLER_PATH")

        if poppler_path:
            os.environ["PATH"] += f";{poppler_path}"
            return

        default_path = Path(r"C:\poppler\poppler-25.12.0\Library\bin")
        if default_path.exists():
            os.environ["PATH"] += f";{default_path}"
            return

        raise RuntimeError(
            "Poppler not found. Set POPPLER_PATH environment variable."
        )

    # macOS / Linux / Cloud
    else:
        if which("pdftoppm") is None:
            raise RuntimeError(
                "Poppler not found. Install via system package manager."
            )
