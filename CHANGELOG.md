# Changelog

All notable changes to this project will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.1.0/).

## [0.1.5] - 2026-02-23

### Changed / 变更
- **[Architecture]** Refactored the internal `KimiExecutor` to utilize the native PyPI `kimi-cli` logic instead of searching the system directory via subprocess paths.
- **[Architecture]** 彻底重构了内部的 `KimiExecutor`：抛弃了基于子进程的环境探测机制，改为利用原生 PyPI `kimi-cli` 作为扩展底座。
- **[Engineering]** Shifted `kimi-cli` to a project optional dependency to reduce the default installation footprint of ATaC. Users evaluating the Kimi builtin tools must now install via `uv pip install "atac[kimi]"`.
- **[Engineering]** 将 `kimi-cli` 移至项目的可选依赖列表中（Optional Dependencies），极大缩减了 ATaC 的基础安装体积。只有当您需要使用 Kimi 特供工具时只需加锁安装 `"atac[kimi]"` 即可。
