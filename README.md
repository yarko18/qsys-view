<!--
Copyright 2026 Yaroslav Mariukha
SPDX-License-Identifier: MIT
-->

# Qsys Viewer

Qsys Viewer turns Intel Platform Designer (`.qsys`) files into readable, layered system diagrams directly in Visual Studio Code. Layout is calculated with ELK's Sugiyama-style layered algorithm.

![Qsys Viewer icon](media/icon.png)

## Features

- Opens `.qsys` files as a read-only graph editor.
- Layered left-to-right automatic layout with orthogonal edge routing.
- Stable Avalon-ST topology: enabling Avalon-MM, clocks, resets, or other links never moves the streaming pipeline.
- Separate filters for Avalon-ST, Avalon-MM, clock, reset, interrupt, conduit, and unknown links.
- Pan, zoom, and fit-to-window navigation.
- Search by IP instance name or type.
- Optional display of disconnected and disabled IP.
- Click an IP to inspect all parameters stored in the Qsys XML.
- Click a connection or endpoint label to inspect connection and exact elaborated interface parameters.
- Read interface ports and parameters on demand with the installed Quartus `qsys-script`; full platform generation is not required.
- Avalon-ST details include an illustrative transfer waveform based only on the ports and properties returned by Quartus. Multiple symbols use separate physical `data[high:low]` rows; unavailable and zero-width signals are omitted.
- Waveforms can be enlarged from 50% to 400% with buttons or Ctrl+mouse-wheel.
- Automatically refreshes after the source document changes.

By default only Avalon-ST links and their connected modules are shown. Enable **All IP** or more connection types from the toolbar to explore the complete system.

When a system contains Avalon-ST links, they are the structural layer for the graph. Qsys Viewer calculates that pipeline independently, places non-streaming-only IP in a separate stable area, and draws other connection types as overlays. Interface filter changes therefore preserve both Avalon-ST node coordinates and the current pan/zoom position.

## Usage

1. Open a `.qsys` file in VS Code. Qsys Viewer is the default custom editor for this file type.
2. Alternatively, right-click a `.qsys` file and select **Open Qsys Graph**.
3. To inspect raw XML, use **Reopen Editor With… → Text Editor**.
4. Click **Read interfaces…** to read exact interface ports. The extension asks before running IP Tcl, uses a disposable copy in the OS temporary directory, and does not write to the source project.

Qsys Viewer finds `qsys-script` through `QUARTUS_ROOTDIR`, conventional Intel FPGA installation folders, or `PATH`. If necessary, set **Qsys Viewer: Quartus Path**. Local `ip/*/component.ipx`, composition dependencies under `ip/common/**/*_hw.tcl`, the standard Quartus catalog, and paths from **Qsys Viewer: IP Search Paths** are passed to Platform Designer. Relative search paths are resolved from the `.qsys` directory.

## Development

```bash
npm install
npm run check
npm test
npm run build
```

Press `F5` in VS Code to launch an Extension Development Host. Open a `.qsys` file there.

To build an installable package:

```bash
npm run package
```

The manifest currently uses `fpga8683920` as its Marketplace publisher ID, matching the GitLab namespace. If your Marketplace publisher has a different ID, update `publisher` in `package.json` before following the [VS Code Marketplace publishing guide](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).

## Current scope

Qsys Viewer never writes to `.qsys` files or the project directory. Basic graph data comes from XML. Exact interface properties come only from a fresh, user-triggered `qsys-script` elaboration of a temporary copy; `.sopcinfo` is not read and metadata is not cached. If Quartus or an IP definition cannot be resolved, no waveform is shown. Waveforms are illustrative protocol examples, not simulation output.

## License

MIT
