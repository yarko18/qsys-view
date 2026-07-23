<!--
Copyright 2026 Yaroslav Mariukha
SPDX-License-Identifier: MIT
-->

# Change Log

## 0.2.1

- Resolve project-internal composition dependencies from `ip/common/**/*_hw.tcl`.
- Render each symbol as a separate physical `data[high:low]` row.
- Keep ready-latency examples compact with consecutive transfer cycles.
- Add 50–400% waveform zoom controls and Ctrl+wheel zooming.

## 0.2.0

- Read exact elaborated interface parameters and ports on demand with `qsys-script`, without generating the platform.
- Run Quartus only after confirmation, on a disposable copy outside the project directory.
- Add configurable Quartus and external IP search paths.
- Remove `.sopcinfo` use and all interface metadata inference.
- Draw waveform rows only for real, non-zero-width ports and show multiple symbols per beat as vertical data lanes.

## 0.1.2

- Generate Avalon-ST waveforms from each connection's inferred metadata.
- Respect symbols per beat, data width, ready latency, and optional signal enable/width values.
- Order signals like Platform Designer and omit unavailable or zero-width signals.

## 0.1.1

- Fixed IP clicks being intercepted by canvas panning.
- Added connection and endpoint parameter details with Avalon-ST metadata inference.
- Added an illustrative Avalon-ST ready/valid/SOP/EOP/data waveform.

## 0.1.0

- Initial read-only Qsys graph viewer.
- ELK layered layout with orthogonal routing.
- Connection filters, search, pan, zoom, fit, and IP parameter details.
