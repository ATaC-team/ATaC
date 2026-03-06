from atac import (
    AtacService,
    ToolExecutionContext,
    get_runtime_context,
    get_service,
    set_service,
)


def test_top_level_api_exports_expected_symbols():
    context = ToolExecutionContext({"cwd": "/tmp/demo"})

    assert AtacService is not None
    assert get_runtime_context is not None
    assert get_service() is None
    assert context.workdir.name == "demo"


def test_set_service_round_trip():
    service = AtacService()
    set_service(service)
    try:
        assert get_service() is service
    finally:
        set_service(None)
