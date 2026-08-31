"""
Root entry point for Render / cloud deployment.
Adds `src` to sys.path so `athena` package is found regardless of install method.
"""

import os
import sys
from pathlib import Path

# Ensure CPU-only mode before any torch/transformers import
os.environ["CUDA_VISIBLE_DEVICES"] = ""
os.environ["TOKENIZERS_PARALLELISM"] = "false"
os.environ["OMP_NUM_THREADS"] = "1"
os.environ["MKL_NUM_THREADS"] = "1"

# Add src/ directory to Python path
SRC_DIR = Path(__file__).resolve().parent / "src"
if str(SRC_DIR) not in sys.path:
    sys.path.insert(0, str(SRC_DIR))

# Expose FastAPI application instance
from athena.api.main import app, run_server  # noqa: E402

if __name__ == "__main__":
    run_server()
