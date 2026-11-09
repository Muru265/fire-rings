import importlib.util
import sys
from pathlib import Path

import pytest

PIPE = Path(__file__).resolve().parents[1]
sys.path.insert(0, str(PIPE))


def load_step(name: str):
    """Import a numbered pipeline script (e.g. '02_unify') as a module."""
    spec = importlib.util.spec_from_file_location(f"step_{name}", PIPE / f"{name}.py")
    mod = importlib.util.module_from_spec(spec)
    spec.loader.exec_module(mod)
    return mod


@pytest.fixture(scope="session")
def unify_mod():
    return load_step("02_unify")


@pytest.fixture
def con():
    from lib.common import connect
    c = connect(threads=2)
    yield c
    c.close()
