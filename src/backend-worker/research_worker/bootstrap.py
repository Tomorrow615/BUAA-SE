from pathlib import Path
import sys


def bootstrap_backend_api_path() -> Path:
    src_dir = Path(__file__).resolve().parents[2]
    backend_api_dir = src_dir / "backend-api"
    backend_api_path = str(backend_api_dir)
    if backend_api_path not in sys.path:
        sys.path.insert(0, backend_api_path)
    return backend_api_dir

