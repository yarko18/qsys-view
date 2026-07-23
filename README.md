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
- Separate filters for Avalon-ST, Avalon-MM, clock, reset, interrupt, conduit, and unknown links.
- Pan, zoom, and fit-to-window navigation.
- Search by IP instance name or type.
- Optional display of disconnected and disabled IP.
- Click an IP to inspect all parameters stored in the Qsys XML.
- Automatically refreshes after the source document changes.

By default only Avalon-ST links and their connected modules are shown. Enable **All IP** or more connection types from the toolbar to explore the complete system.

## Usage

1. Open a `.qsys` file in VS Code. Qsys Viewer is the default custom editor for this file type.
2. Alternatively, right-click a `.qsys` file and select **Open Qsys Graph**.
3. To inspect raw XML, use **Reopen Editor With… → Text Editor**.

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

Qsys Viewer never writes to `.qsys` files. It parses module and connection metadata that is present in the XML; interface port details not serialized by Platform Designer are shown using their connection endpoint names.

## License

MIT
