<!--
Copyright 2026 Yaroslav Mariukha
SPDX-License-Identifier: MIT
-->

# Qsys View

Qsys View is a read-only Visual Studio Code viewer for Intel Platform Designer systems and IP components. It opens `.qsys`, exported system `.tcl`, and component `*_hw.tcl` files as compact layered graphs.

Open tcl with Qsys View:
![Open tcl with Qsys View](media/tcl_view.png)

Show base addresses:
![Show base addresses](media/avmm.png)

and much more!

## What it does

- Opens `.qsys` directly. Exported `.tcl` and `*_hw.tcl` remain text by default and open through **Reopen Editor With…** or **Open Qsys Graph**.
- Shows component parameters and external interfaces, including elaborated physical port names and widths.
- Runs validation, elaboration, and composition callbacks locally so parameter-dependent instances and connections update immediately.
- Keeps leaf hardware-Tcl components as one block and expands composition components into their internal graph on demand.
- Lists leaf-component files registered locally or through sourced helper procedures as an expandable folder tree without running Quartus.
- Keeps hierarchical subsystems collapsed as single IP blocks.
- Expands a selected subsystem in place, enters it in the same canvas, or opens it in a new editor without automatically expanding deeper levels.
- Draws a left-to-right graph with orthogonal connections.
- Shows IP and connection parameters on click.
- Groups configured IP parameters by their Platform Designer sections after Quartus interface analysis.
- Highlights clock, reset, Avalon-MM, and interrupt domains without filling the graph with their edges.
- Draws explicit interconnect nodes for fan-out, fan-in, and many-to-many interfaces while keeping every logical connection inspectable.
- Temporarily hides all connections of a selected IP or interconnect so **Relayout** can rebuild a simpler canvas without editing the source system.
- Detects Avalon-ST adapters after Quartus analysis and marks them with a red dot.
- Shows elaborated interface ports, parameters, and an illustrative Avalon-ST waveform.
- Updates a Tcl graph without moving existing IP or rerouting unchanged connections.
- Adds new IP below the frozen graph; **Relayout** recalculates positions without discarding Quartus analysis.
- Reloads the source hierarchy and sourced configuration explicitly with **Reload source**.
- Reports static Tcl parser problems and opens the source line from the problems list.
- Opens Qsys directly in Platform Designer or converts Tcl in a disposable sibling folder first.

## Views and interfaces

Qsys View has two modes:

| Interface | Pipeline | Classic |
| --- | --- | --- |
| Avalon-ST | Directed edge and layout anchor | Directed edge |
| Conduit | Directed edge or interconnect | Directed edge or interconnect |
| Avalon-MM | Highlight hub | Directed edge or interconnect |
| Interrupt | Highlight hub | Directed edge or interconnect |
| Clock | Highlight hub | Highlight hub |
| Reset | Highlight hub | Highlight hub |
| Other or unknown | Hidden | Grey directed edge or interconnect |

Only interface filters present in the current system are shown. Pipeline layout is anchored exclusively by Avalon-ST when streaming connections exist. For exported system Tcl, Pipeline remains disabled until **Read interfaces…** resolves the real interface types for every visible hierarchy level. Safely elaborated `*_hw.tcl` compositions already provide their declared connection types and can use Pipeline view without Quartus.

The Tcl reader accepts Platform Designer declarations for `avalon`, `axi`, `tristate_conduit`, `avalon_streaming`, `interrupt`, `conduit`, `clock`, `reset`, and `nios_custom_instruction`. Before Quartus analysis, Avalon-MM is also recognized from exported connection properties such as `baseAddress` and `arbitrationPriority`; unrelated unknown connections remain grey.

## Hardware Tcl components without Quartus

Open a `*_hw.tcl` file with **Reopen Editor With… → Platform Designer IP**. Qsys View evaluates it with a local restricted `tclsh` interpreter, emulates the component API needed for parameters, module properties, filesets, interfaces, instances, and connections, then invokes `VALIDATION_CALLBACK` and either `COMPOSITION_CALLBACK` or `ELABORATION_CALLBACK`.

Every definition first appears as one component block. Leaf components stay as one block. A composition component has a **+** control that replaces the block with its internal instances and connections; **−** collapses it again. Click a one-line external interface such as `din` or `dout` directly on the canvas to expand it into physical signals such as `din.valid`, `din.data`, and `din.ready`; click any expanded signal to collapse the interface. Use **IP definition** to inspect parameters and the same signal metadata. **Apply & re-elaborate** runs the callbacks again and redraws parameter-dependent contents.

For both leaf and composition components, **Files** lists effective `add_fileset_file` results and direct registrations made through sourced file helpers as a compact terminal-style `+`/`−` folder tree, for example `common/wip/common_hdl/packages` and `common/others/hdl/common_sc_fifo`. Click a filename to open that registered source beside the graph. Calls made through sourced helpers such as `add_wip_common_pkg_files` and `add_files_common_others_common_sc_fifo` are evaluated normally; the helper name remains available as file provenance rather than becoming a visual group. A file used by multiple filesets appears once with all purposes, such as `QUARTUS_SYNTH` and `SIM_VERILOG`. This workflow does not require Quartus.

The interpreter supports normal Tcl control flow, procedures, substitutions, and workspace-local `source` files. It blocks external commands and unsafe filesystem operations, limits output, and stops slow evaluation. If a component depends on a vendor command that cannot be safely emulated, Qsys View falls back to a static preview and reports the reason.

## System Tcl and Quartus analysis

In a trusted workspace, Qsys View automatically runs the system in a restricted safe `tclsh` interpreter. Platform Designer commands only record their resolved arguments, so `source`, namespaces, procedures, substitutions, `if`, `switch`, and loops appear immediately without starting Quartus. File access and external commands remain blocked; sourced Tcl is restricted to the current workspace and the resolver has a short timeout. If `tclsh` is unavailable or the script needs unsupported capabilities, Qsys View falls back to the lexical reader and reports a warning.

The **Read interfaces…** action still runs `qsys-script` on demand. Use it when exact elaborated interfaces, ports, streaming formats, or automatic adapters are required.

Use `qsysView.tclVariables` to select a configuration before evaluation or before opening the Tcl system in Platform Designer. For example:

```json
{
  "qsysView.tclVariables": {
    "PLATFORM_CONFIG": "WHC"
  }
}
```

**Infer clk/reset** classifies only unknown static Tcl connections by interface names. It recognizes `clock`, `clk`, `reset`, `reset_n`, `rst`, `rst_n`, `nrst`, and `rstn`. Reset takes priority for names such as `clk_reset`. Disable the checkbox if a project uses those words for unrelated interfaces. Explicit Qsys/Tcl kinds and Quartus results are never overridden.

Quartus analysis is user-triggered and runs on a disposable copy. It supplies exact types and ports, Avalon-ST format information, and automatic-adapter detection. While this metadata is current, **Read interfaces…** and **Infer clk/reset** are hidden. Editing any loaded source invalidates its metadata and shows the controls again. The source file is never modified.

## Hierarchical systems

When an IP type matches a sibling `.qsys` or `.tcl` file, its block has a **+** control. Expanding replaces only that instance with its internal graph, reconnects parent links through exported interfaces, and surrounds the child with a dashed container without changing the flat IP topology chosen by the layout engine. Use **−** to collapse the container or **↘** to enter it as the full canvas.

If the parent was read with **Read interfaces…**, expanded children are analyzed too. Nested Tcl connections therefore keep their exact interface types in Pipeline view, while exported clock and reset bridges remain part of the parent domain.

Choose **Enter subsystem** in the IP details to navigate within the current viewer; **← Back** restores the parent layout and zoom. Choose **Open in new editor**, or double-click the block, for a separate Qsys View. Nested children remain collapsed and can be expanded independently.

## Controls

- **View** switches between Classic and Pipeline.
- **All IP** includes IP without visible functional connections; off by default. Clock/reset highlighting alone does not make an IP visible.
- **Disabled IP** includes disabled instances; off by default.
- **Infer clk/reset** controls name inference; on by default.
- **Errors/Warnings** appears when the static Tcl reader finds a problem; click an item to open its source line.
- **+** expands a detected subsystem; **−** collapses its container; **↘** enters it; **← Back** returns to the parent.
- **Read interfaces…** requests exact Quartus metadata.
- **IP definition** opens parameters and external interfaces for a `*_hw.tcl` component.
- **Open in Platform Designer** opens or converts the system.
- **Reload source** rereads the active Qsys/Tcl hierarchy, including sourced configuration files, and invalidates stale Quartus analysis.
- **Disable connections** in IP or interconnect details hides those links only in the current viewer; **Restore connections** brings all hidden links back.
- **Relayout** recalculates the active layout from currently visible connections while preserving analysis; **Fit** fits it to the viewport.
- Drag to pan, use the wheel to zoom, and search by instance name or IP type.

New viewers start in Classic mode. With **Remember Last View State** enabled, Qsys View reuses the last mode, interface filters, IP visibility options, and name-inference choice across editors.

## Installation

Install **Qsys View** from the VS Code Extensions view, or run:

```bash
code --install-extension YaroslavMariukha.qsys-view
```

A local package can be installed with:

```bash
code --install-extension qsys-view-1.2.2.vsix --force
```

## Settings

| Setting | Purpose |
| --- | --- |
| `qsysView.quartusPath` | Quartus directory or direct path to `qsys-script` |
| `qsysView.platformDesignerPath` | Direct path to `qsys-edit` or `qsys.exe` |
| `qsysView.ipSearchPaths` | Additional Platform Designer IP search paths |
| `qsysView.tclVariables` | Global variables set before evaluating a Tcl system |
| `qsysView.tclshPath` | Tcl interpreter used for automatic safe control-flow resolution |
| `qsysView.rememberLastViewState` | Remember toolbar choices across editors |

## Development

Node.js 20 or newer is required.

```bash
npm ci
npm test
npm run check
npm run package
```

`npm run package` creates `qsys-view-<version>.vsix`. Press `F5` in VS Code to run an Extension Development Host.

## Scope

Qsys View does not edit Qsys or Tcl sources. Its safe component API covers common Platform Designer commands but does not replace vendor validation for unusual proprietary extensions. Unknown system Tcl connections remain grey in Classic mode until their type is explicit, inferred, or resolved by Quartus. Waveforms are protocol illustrations, not simulation output.

## License

MIT
