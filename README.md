<!--
Copyright 2026 Yaroslav Mariukha
SPDX-License-Identifier: MIT
-->

# Qsys View

Qsys View is a read-only Visual Studio Code viewer for Intel Platform Designer systems. It opens `.qsys` files and exported Platform Designer `.tcl` scripts as compact layered graphs.

![Qsys View compared with Platform Designer](media/compare.png)

## What it does

- Opens `.qsys` directly and `.tcl` through **Reopen Editor With… → Qsys TCL Graph**.
- Keeps hierarchical subsystems collapsed as single IP blocks.
- Draws a left-to-right graph with orthogonal connections.
- Shows IP and connection parameters on click.
- Highlights clock, reset, Avalon-MM, and interrupt domains without filling the graph with their edges.
- Detects Avalon-ST adapters after Quartus analysis and marks them with a red dot.
- Shows elaborated interface ports, parameters, and an illustrative Avalon-ST waveform.
- Updates a Tcl graph without moving existing IP or rerouting unchanged connections.
- Adds new IP below the frozen graph; **Relayout** recalculates the active layout.
- Reports static Tcl parser problems and opens the source line from the problems list.
- Opens Qsys directly in Platform Designer or converts Tcl in a disposable sibling folder first.

## Views and interfaces

Qsys View has two modes:

| Interface | Pipeline | Complete |
| --- | --- | --- |
| Avalon-ST | Directed edge and layout anchor | Directed edge |
| Conduit | Directed edge | Directed edge |
| Avalon-MM | Highlight hub | Directed edge |
| Interrupt | Highlight hub | Directed edge |
| Clock | Highlight hub | Highlight hub |
| Reset | Highlight hub | Highlight hub |
| Other or unknown | Hidden | Grey directed edge |

Only interface filters present in the current system are shown. Pipeline layout is anchored exclusively by Avalon-ST when streaming connections exist.

The Tcl reader accepts Platform Designer declarations for `avalon`, `axi`, `tristate_conduit`, `avalon_streaming`, `interrupt`, `conduit`, `clock`, `reset`, and `nios_custom_instruction`.

## Tcl and Quartus analysis

The static reader understands `add_instance`, instance parameters, `add_interface`, `add_interface_port`, `EXPORT_OF`, `add_connection`, and connection parameters. An explicit connection kind is available immediately. The usual two-argument exported `add_connection` remains unknown until **Read interfaces…** runs `qsys-script`.

**Infer clk/reset** classifies only unknown static Tcl connections by interface names. It recognizes `clock`, `clk`, `reset`, `reset_n`, `rst`, `rst_n`, `nrst`, and `rstn`. Reset takes priority for names such as `clk_reset`. Disable the checkbox if a project uses those words for unrelated interfaces. Explicit Qsys/Tcl kinds and Quartus results are never overridden.

Quartus analysis is user-triggered and runs on a disposable copy. It supplies exact types and ports, Avalon-ST format information, and automatic-adapter detection. The source file is never modified.

## Controls

- **View** switches between Complete and Pipeline.
- **All IP** includes disconnected IP; off by default.
- **Disabled IP** includes disabled instances; off by default.
- **Infer clk/reset** controls name inference; on by default.
- **Errors/Warnings** appears when the static Tcl reader finds a problem; click an item to open its source line.
- **Read interfaces…** requests exact Quartus metadata.
- **Open in Platform Designer** opens or converts the system.
- **Relayout** recalculates the active mode; **Fit** fits it to the viewport.
- Drag to pan, use the wheel to zoom, and search by instance name or IP type.

New viewers start in Complete mode. With **Remember Last View State** enabled, Qsys View reuses the last mode, interface filters, IP visibility options, and name-inference choice across editors.

## Installation

Install **Qsys View** from the VS Code Extensions view, or run:

```bash
code --install-extension YaroslavMariukha.qsys-view
```

A local package can be installed with:

```bash
code --install-extension qsys-view-1.0.5.vsix --force
```

## Settings

| Setting | Purpose |
| --- | --- |
| `qsysView.quartusPath` | Quartus directory or direct path to `qsys-script` |
| `qsysView.platformDesignerPath` | Direct path to `qsys-edit` or `qsys.exe` |
| `qsysView.ipSearchPaths` | Additional Platform Designer IP search paths |
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

Qsys View does not edit Qsys or Tcl sources and its static diagnostics do not replace Platform Designer validation. Unknown Tcl connections remain grey in Complete mode until their type is explicit, inferred, or resolved by Quartus. Waveforms are protocol illustrations, not simulation output.

## License

MIT
