<!--
Copyright 2026 Yaroslav Mariukha
SPDX-License-Identifier: MIT
-->

# Change Log

## 1.1.6

- Preserve the flat ELK topology when a subsystem is expanded, so hidden IP and empty space inside the dashed hierarchy frame no longer push visible Avalon-ST blocks up or down.

## 1.1.5

- Build a single temporary subsystem catalog for exported Tcl hierarchies so stale sibling `.qsys` files cannot override freshly generated Tcl dependencies.
- Add recursive Qsys-only dependencies by exact path while preserving their original relative resources.
- Redirect Quartus scratch files into Qsys View's disposable directories so `altera_pll` no longer leaves `sopc_altera_pll*` folders in the user's home directory.

## 1.1.4

- Allow nested IP workspaces to safely source sibling helpers under the same `quartus/platform/ip` tree, fixing empty files and interfaces for components such as Symbol Adapter.
- Show the concrete safe-Tcl failure in the IP definition panel and Diagnostics instead of only displaying a generic partial-preview notice.
- Search the shared Platform Designer IP tree when resolving exported interfaces to local child `*_hw.tcl` definitions.
- Align all exported terminals and signal-label centres on each side of a component block.
- Replace file cards with a compact terminal-style `+`/`−` tree and open registered sources by clicking their names.
- Keep composition exports and registered source files visible when a component callback stops early, while reporting the Tcl error as a diagnostic.
- Expand `din`/`dout` directly on the canvas into physical signals such as `din.valid`, with each signal's real direction and width.
- Resolve exported composition ports from local child `*_hw.tcl` definitions without Quartus.
- Show the folder-tree file list near the top of both leaf and composition IP definitions.
- Keep component exports visible independently of the active system interface filters.
- Display every Platform Designer `*_hw.tcl` definition as one collapsed component block.
- Keep leaf components as a single block and allow composition components to expand into their internal IP instances and connections.
- Show each external interface on one row and expand it on demand to inspect physical signal names, roles, directions, and widths.
- Collect effective leaf-component files from workspace-local sourced Tcl helpers without running Quartus.
- Show files as an expandable folder tree based on their effective paths while retaining helper provenance and merging synthesis and simulation registrations.
- Leave `.tcl` and `*_hw.tcl` files in the text editor by default; only `.qsys` opens directly in Qsys View.

## 1.1.3

- Draw an explicit interconnect node for one-to-many, many-to-one, and many-to-many topologies across Avalon-MM, IRQ, conduit, and unresolved connections.
- Give every source domain one independent interconnect input and every target endpoint one output, preventing unrelated buses from overlapping while keeping all logical connections inspectable.
- Keep local self-loops outside shared interconnects and retain stable synthetic nodes as Tcl branches are added or removed.
- Keep all statically inferred branches of one source interface in the same domain; report Avalon-ST fan-in and fan-out as P2P errors instead of creating an interconnect.
- Temporarily disable all connections of an IP or interconnect on the current canvas, restore them from the toolbar, and relayout only the remaining topology without changing Qsys or Tcl sources.

## 1.1.2

- Create shared-input junctions for every directly rendered interface type, including unresolved static Tcl connections.
- Detect junctions by their common input endpoint even when interface analysis changes a connection from unknown to a resolved type.
- Report multiple Avalon-ST sources connected to one sink as an error instead of drawing a junction.
- Accept `auto_assign_system_base_addresses` and `validate_system` in exported Platform Designer Tcl scripts.

## 1.1.1

- Grow IP blocks vertically when they expose many interfaces, keeping exported port labels evenly spaced and readable.
- Reserve horizontal layout space for long exported-interface names so labels no longer overlap neighbouring IP blocks.
- Merge multiple outputs targeting the same input interface at a visible junction point with one shared input arrow.
- Keep hover port labels separated and place each input junction dot at the real beginning of its shared route.

## 1.1.0

- Open Platform Designer `*_hw.tcl` component definitions directly as IP graphs.
- Evaluate component parameters, validation callbacks, elaboration callbacks, and composition callbacks in a restricted local `tclsh` interpreter without Quartus.
- Show external interfaces with their directions, properties, physical ports, widths, and exported internal endpoints.
- Show composed internal IP instances and connections, including conditional topology selected by the current parameter values.
- Add an **IP definition** panel for editing enabled parameters and immediately re-elaborating the graph.
- Preserve workspace-only `source` support while keeping process execution and unsafe filesystem operations blocked.

## 1.0.13

- Favor straight interface routes in Classic view and distribute fixed input/output ports evenly in natural numeric order.
- Keep switch inputs on the left and outputs on the right, ordered from top to bottom.
- Draw enabled top-level exported interfaces as labelled external connections before and after Quartus interface analysis.

## 1.0.12

- Keep input interfaces on the left and output interfaces on the right, routing feedback connections around IP blocks instead of flipping their port sides.
- Separate Reload source, which rereads the loaded Qsys/Tcl hierarchy and invalidates stale analysis, from Relayout, which changes only geometry and preserves Quartus metadata.
- Read instance parameter groups from Quartus and display configured IP parameters in their Platform Designer sections after interface analysis.
- Infer Avalon-MM connections from exported Tcl address and arbitration parameters before Quartus analysis.
- Draw one shared Avalon-MM bus from a master to multiple slaves in Classic view while keeping every branch selectable.
- Use Quartus-safe temporary project names during Windows interface analysis.

## 1.0.11

- Build sibling exported Tcl subsystems in dependency order before converting a top-level Tcl system for Platform Designer.
- Keep the generated subsystem Qsys files on the Platform Designer search path for the lifetime of the disposable system.
- Source subsystem Tcl files from their original locations during exact analysis so relative configuration includes continue to resolve through `info script`.

## 1.0.10

- Resolve `source`, namespaces, procedures, substitutions, `if`, `switch`, and loops automatically in a restricted safe Tcl interpreter, without starting Quartus.
- Display resolved dynamic instance parameters and conditional connections immediately when a Tcl graph opens.
- Restrict sourced files to the workspace, block unsafe file operations and external commands, cap trace output, and terminate slow static evaluation.
- Add `qsysView.tclshPath` and retain the lexical parser as a fallback when `tclsh` or unsupported Tcl capabilities prevent safe resolution.
- Keep **Read interfaces…** as the explicit action for exact Quartus elaboration only.

## 1.0.9

- Build Tcl graphs from the Qsys system actually produced by `qsys-script`, so parameters, instances, and connections created through `source`, `if`, `switch`, loops, and substitutions are displayed after evaluation.
- Source the original Tcl path during analysis so sibling configuration files resolve through `info script`.
- Rename the Tcl analysis action to **Evaluate Tcl…** to distinguish exact execution from the static approximation.

## 1.0.8

- Preserve the original exported Tcl location during disposable conversion so sibling `source` files resolve through `info script`.
- Pass the configured and automatically discovered IP search paths to Platform Designer when opening both Qsys and converted Tcl systems.

## 1.0.7
- Update media and Readme

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
- Keep expanded subsystem containers clear of top-level IP and prevent canvas panning from intercepting their controls.
- Enter a subsystem in the same canvas and return through a breadcrumb Back control while preserving the parent layout and zoom.
- Hide interface-analysis controls while metadata is current and invalidate it when a loaded Qsys or Tcl source changes.
- Hide clock/reset-only IP unless All IP is enabled, while retaining functional Avalon-MM and IRQ hub endpoints.
- Disable Pipeline view for Tcl until every visible hierarchy level has exact Quartus interface metadata.
- Recursively prepare sibling Tcl subsystems before analyzing a top-level export and retain the first useful Quartus errors instead of a noisy log tail.
- Keep an expanded subsystem inline with its parent pipeline while moving only top-level IP that would overlap its container.
- Rename the user-facing Complete mode to Classic mode.

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
