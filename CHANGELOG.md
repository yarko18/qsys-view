<!--
Copyright 2026 Yaroslav Mariukha
SPDX-License-Identifier: MIT
-->

# Change Log

## 1.0.0

- Mark Qsys View as a stable 1.0 release.
- Add a complete example Platform Designer pipeline.
- Add screenshots comparing Qsys View with Platform Designer and demonstrating Avalon-MM addresses, clock domains, and parameter inspection.

## 0.3.2

- Fix Quartus metadata loading on Windows by passing the temporary `.qsys` file name, rather than its absolute path, to `qsys-script`.

## 0.3.1

- Rename the extension to Qsys View and publish it as `YaroslavMariukha.qsys-view`.
- Update the GitLab project links and public command, editor, and setting namespaces.
- Add Marketplace installation instructions and an absolute HTTPS icon URL.

## 0.3.0

- Draw directed graph edges only for Avalon-ST and conduit connections.
- Replace Avalon-MM, clock, reset, and interrupt edges with interactive interface hubs.
- Highlight every IP related to a hovered or selected hub.
- Show per-slave base-address badges for a selected Avalon-MM master.
- Show known source frequencies on clock hubs and group interrupts by their receiver.
- Hide unknown/other interfaces completely.

## 0.2.2

- Anchor node placement exclusively to the complete Avalon-ST topology when streaming links exist.
- Keep Avalon-ST node coordinates and the current canvas transform unchanged while connection filters are toggled.
- Lay out non-streaming-only modules in a separate stable area and overlay additional connection types without relaying out the stream pipeline.

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
