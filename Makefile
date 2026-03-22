.PHONY: help lint test ui-build package-build release-check

help:
	@echo "Available targets:"
	@echo "  make lint          # Run ruff checks"
	@echo "  make test          # Run Python tests"
	@echo "  make ui-build      # Build the packaged audit UI"
	@echo "  make package-build # Build the Python package"
	@echo "  make release-check # Run all release prerequisite steps"

lint:
	uv run ruff check .

test:
	uv run pytest tests/

ui-build:
	pnpm --dir audit-ui build

package-build:
	uv build

release-check: lint test ui-build package-build
