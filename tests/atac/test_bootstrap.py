import pytest

from atac.bootstrap import aload_service_from_bootstrap, load_service_from_bootstrap
from atac.service import AtacService


def test_load_service_from_bootstrap_success(tmp_path, monkeypatch):
    pkg_dir = tmp_path / "myapp"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    (pkg_dir / "bootstrap.py").write_text(
        "from atac.service import AtacService\n"
        "def get_service():\n"
        "    return AtacService()\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    service = load_service_from_bootstrap("myapp.bootstrap:get_service")

    assert isinstance(service, AtacService)


def test_load_service_from_bootstrap_invalid_format():
    with pytest.raises(ValueError):
        load_service_from_bootstrap("invalid-format")


def test_load_service_from_bootstrap_wrong_return_type(tmp_path, monkeypatch):
    pkg_dir = tmp_path / "another_app"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    (pkg_dir / "bootstrap.py").write_text(
        "def get_service():\n"
        "    return {}\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    with pytest.raises(TypeError, match="must return AtacService"):
        load_service_from_bootstrap("another_app.bootstrap:get_service")


@pytest.mark.asyncio
async def test_aload_service_from_bootstrap_supports_async_factory(tmp_path, monkeypatch):
    pkg_dir = tmp_path / "async_app"
    pkg_dir.mkdir()
    (pkg_dir / "__init__.py").write_text("", encoding="utf-8")
    (pkg_dir / "bootstrap.py").write_text(
        "from atac.service import AtacService\n"
        "async def get_service():\n"
        "    return AtacService()\n",
        encoding="utf-8",
    )
    monkeypatch.syspath_prepend(str(tmp_path))

    service = await aload_service_from_bootstrap("async_app.bootstrap:get_service")

    assert isinstance(service, AtacService)
