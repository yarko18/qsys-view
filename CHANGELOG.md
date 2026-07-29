<!--
Copyright 2026 Yaroslav Mariukha
SPDX-License-Identifier: MIT
-->

# Change Log

## 1.0.6

- Discover sibling Platform Designer systems used as IP and mark them as expandable subsystems.
- Lazily expand a selected subsystem on the current canvas while leaving deeper hierarchy levels collapsed.
- Reconnect parent connections through exported child interfaces for both Qsys and Tcl hierarchy sources.
- Open a subsystem as a complete Qsys View from its details or by double-clicking the subsystem block.
- Add sibling Qsys systems to the Quartus search path and suppress adapter guesses for unresolved interfaces, eliminating false `ready`/`valid` differences.
- Analyze each expanded subsystem with Quartus when the parent has exact metadata, so nested Tcl pipelines retain their real interface types.
- Preserve one clock/reset highlight domain across exported `clock_source` boundaries instead of duplicating it after expansion.
- Draw expanded subsystems inside rounded dashed containers with an on-canvas collapse control.
- Draw interrupt arrows in signal-flow order from sender to receiver and group IRQ highlights by the actual receiver.

## 1.0.5

- Keep unchanged Tcl connection routes fixed during live edits; removing one `add_connection` no longer reroutes the remaining graph.
- Reorganize the toolbar into responsive rows that wrap instead of requiring horizontal scrolling.
- Show static Tcl parser errors and warnings in Qsys View with source line navigation and suggestions for likely misspelled Platform Designer commands.
- Keep known but unsupported Platform Designer commands as warnings to avoid false parser errors.

## 1.0.4

- Start new viewers in Complete mode with All IP and Disabled IP turned off.
- Optionally remember the last view mode, filters, IP visibility, and name inference across editors.
- Classify unknown Tcl clock/reset connections from common interface names, including `reset_n`, `rst_n`, `nrst`, and `rstn`; the inference can be disabled from the toolbar.
- Keep existing IP positions fixed while a Tcl document changes, append new IP without moving the old graph, and preserve positions for temporarily removed IP.
- Add a Relayout button to explicitly recalculate the active Complete or Pipeline layout.
- Replace the long README with a concise guide to views, interfaces, Quartus analysis, and settings.

## 1.0.3

- Parse `add_interface`, `add_interface_port`, exported interfaces, and explicit connection kinds from Platform Designer Tcl scripts.
- Keep two-argument Tcl connections unknown until exact interface analysis is requested with Quartus.
- Limit Pipeline view edges to Avalon-ST and conduit while keeping clock and reset domains as highlights in both view modes.
- Show interface filters only for connection types present in the current system and supported by the selected view.
- Dim graph connections while highlighting clock, reset, Avalon-MM, or interrupt domains.
- Open Platform Designer directly on Linux and Windows without leaving a loading overlay over the graph.
- Convert exported Tcl in a unique disposable folder beside the source script before opening Platform Designer.

## 1.0.2

- Support for exported Platform Designer Tcl scripts, with static parsing and optional exact Quartus elaboration.
- Separate Pipeline and Complete views with independent interface filters.
- Show statically unknown (before elaboration) Tcl connections as grey edges.
- Mark Avalon-ST connections that require automatic Quartus adapter with a red dot and list the endpoint differences.
- Derive the effective Avalon-ST symbols per beat from elaborated port width, matching Quartus adapter insertion logic.

## 1.0.1
Develop test version.

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
