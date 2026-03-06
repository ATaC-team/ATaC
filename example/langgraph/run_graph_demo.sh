#!/bin/sh
set -eu

uv run python3 -m atac.cli.main graph example.langgraph.tool_call_graph:build_graph \
  --bootstrap example.langgraph.bootstrap:get_service \
  --input who="${1:-mob}" \
  --input max_attempts="${2:-3}"
