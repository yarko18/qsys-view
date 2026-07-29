// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import { execFile, spawn } from 'node:child_process';
import { constants as fsConstants } from 'node:fs';
import * as fs from 'node:fs/promises';
import * as os from 'node:os';
import * as path from 'node:path';
import * as vscode from 'vscode';
import type { QsysGraph } from '../parser/graph';
import { applyQuartusMetadata } from '../parser/quartusMetadataParser';
import { parseQsys } from '../parser/qsysParser';
import { parseQsysTcl } from '../parser/qsysTclParser';
import { platformDesignerTemporaryPrefix, qsysScriptArguments, qsysTclExportWrapper, qsysTclScriptArguments } from './qsysScript';

const lastViewStateKey = 'qsysView.lastViewState';

class QsysDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri) {}
  dispose(): void {}
}

class QsysEditorProvider implements vscode.CustomReadonlyEditorProvider<QsysDocument> {
  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();
  private readonly activeMetadataLoads = new Set<string>();

  constructor(private readonly context: vscode.ExtensionContext) {}

  openCustomDocument(uri: vscode.Uri): QsysDocument {
    return new QsysDocument(uri);
  }

  async resolveCustomEditor(document: QsysDocument, panel: vscode.WebviewPanel): Promise<void> {
    panel.webview.options = {
      enableScripts: true,
      localResourceRoots: [vscode.Uri.joinPath(this.context.extensionUri, 'dist')],
    };
    panel.webview.html = this.getHtml(panel.webview);

    const key = document.uri.toString();
    const documentPanels = this.panels.get(key) ?? new Set<vscode.WebviewPanel>();
    documentPanels.add(panel);
    this.panels.set(key, documentPanels);
    panel.onDidDispose(() => {
      documentPanels.delete(panel);
      if (documentPanels.size === 0) this.panels.delete(key);
    });

    const sendGraph = (loadQuartus = false, includeViewState = false) =>
      this.sendGraph(document.uri, panel.webview, loadQuartus, includeViewState);
    panel.webview.onDidReceiveMessage(async (message: { type?: string; state?: unknown }) => {
      if (message.type === 'ready') {
        await sendGraph(false, true);
      } else if (message.type === 'refresh') {
        await sendGraph();
      } else if (message.type === 'loadQuartusMetadata') {
        await this.confirmAndLoadQuartus(document.uri, panel.webview);
      } else if (message.type === 'openPlatformDesigner') {
        await this.openPlatformDesigner(document.uri);
        await panel.webview.postMessage({ type: 'platformDesignerFinished' });
      } else if (message.type === 'viewStateChanged' && message.state && typeof message.state === 'object') {
        await this.rememberViewState(document.uri, message.state);
      }
    });

    const watcher = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === key) void sendGraph();
    });
    panel.onDidDispose(() => watcher.dispose());
  }

  private async confirmAndLoadQuartus(uri: vscode.Uri, webview: vscode.Webview): Promise<void> {
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage('Trust this workspace before running Quartus IP Tcl files.');
      await webview.postMessage({ type: 'metadataCancelled' });
      return;
    }
    const key = uri.toString();
    if (this.activeMetadataLoads.has(key)) return;
    const tcl = isQsysTcl(uri);
    const choice = await vscode.window.showWarningMessage(
      tcl
        ? 'Qsys View will execute a temporary copy of this exported Platform Designer Tcl script with qsys-script.'
        : 'Qsys View will run qsys-script on a temporary copy. Quartus loads the IP Tcl files referenced by this system.',
      {
        modal: true,
        detail: tcl
          ? 'The script may load referenced IP Tcl files. Its save_system output is redirected to a disposable directory; the original script and project directory are not modified.'
          : 'The original .qsys file and its project directory are not modified.',
      },
      'Read interfaces',
    );
    if (choice !== 'Read interfaces') {
      await webview.postMessage({ type: 'metadataCancelled' });
      return;
    }
    this.activeMetadataLoads.add(key);
    await webview.postMessage({ type: 'metadataLoading' });
    try {
      await vscode.window.withProgress(
        { location: vscode.ProgressLocation.Notification, title: 'Qsys View: reading interfaces with Quartus…' },
        () => this.sendGraph(uri, webview, true),
      );
    } finally {
      this.activeMetadataLoads.delete(key);
    }
  }

  private async sendGraph(
    uri: vscode.Uri,
    webview: vscode.Webview,
    loadQuartus = false,
    includeViewState = false,
  ): Promise<void> {
    try {
      const openDocument = vscode.workspace.textDocuments.find(
        (document) => document.uri.toString() === uri.toString(),
      );
      const bytes = openDocument
        ? Buffer.from(openDocument.getText())
        : await vscode.workspace.fs.readFile(uri);
      const fileName = uri.path.split('/').pop()?.replace(/\.(?:qsys|tcl)$/i, '') || 'Qsys system';
      let graph: QsysGraph = isQsysTcl(uri)
        ? parseQsysTcl(bytes.toString('utf8'), fileName)
        : parseQsys(bytes.toString('utf8'), fileName);
      if (loadQuartus) {
        try {
          graph = isQsysTcl(uri)
            ? await this.withTclQuartusMetadata(uri, graph, bytes)
            : await this.withQsysQuartusMetadata(uri, graph, bytes, fileName);
        } catch (error) {
          const message = error instanceof Error ? error.message : String(error);
          graph = {
            ...graph,
            warnings: [...graph.warnings, `Quartus metadata unavailable: ${message}`],
            metadata: { source: 'qsys-only', label: `Quartus metadata unavailable: ${message}` },
          };
          void vscode.window.showErrorMessage(`Qsys View: ${message}`);
        }
      }
      const rememberLastViewState = vscode.workspace.getConfiguration('qsysView', uri)
        .get<boolean>('rememberLastViewState', true);
      const rememberedViewState = includeViewState && rememberLastViewState
        ? this.context.globalState.get<unknown>(lastViewStateKey)
        : undefined;
      await webview.postMessage({ type: 'graph', graph, rememberedViewState });
    } catch (error) {
      await webview.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private async rememberViewState(uri: vscode.Uri, state: unknown): Promise<void> {
    const enabled = vscode.workspace.getConfiguration('qsysView', uri)
      .get<boolean>('rememberLastViewState', true);
    if (enabled) await this.context.globalState.update(lastViewStateKey, state);
  }

  private async withQsysQuartusMetadata(
    uri: vscode.Uri,
    graph: QsysGraph,
    qsysBytes: Uint8Array,
    systemName: string,
  ): Promise<QsysGraph> {
    if (uri.scheme !== 'file') throw new Error('qsys-script metadata is available only for local files.');
    const executable = await this.findQsysScript(uri);
    const projectDirectory = path.dirname(uri.fsPath);
    const searchPath = this.ipSearchPath(uri, projectDirectory);
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'qsys-view-'));
    const temporaryQsys = path.join(temporaryDirectory, `${systemName}.qsys`);
    const inspector = path.join(this.context.extensionUri.fsPath, 'quartus', 'inspect-interfaces.tcl');
    try {
      await fs.writeFile(temporaryQsys, qsysBytes);
      const output = await runQsysScript(
        executable,
        qsysScriptArguments(temporaryQsys, searchPath, inspector),
        temporaryDirectory,
      );
      return applyQuartusMetadata(graph, output, executable);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private async withTclQuartusMetadata(
    uri: vscode.Uri,
    graph: QsysGraph,
    scriptBytes: Uint8Array,
  ): Promise<QsysGraph> {
    if (uri.scheme !== 'file') throw new Error('qsys-script metadata is available only for local files.');
    const executable = await this.findQsysScript(uri);
    const projectDirectory = path.dirname(uri.fsPath);
    const searchPath = this.ipSearchPath(uri, projectDirectory);
    const temporaryDirectory = await fs.mkdtemp(path.join(os.tmpdir(), 'qsys-view-tcl-'));
    const temporaryScript = path.join(temporaryDirectory, 'design.tcl');
    const wrapper = path.join(temporaryDirectory, 'inspect-exported-system.tcl');
    const inspector = path.join(this.context.extensionUri.fsPath, 'quartus', 'inspect-interfaces.tcl');
    try {
      await fs.writeFile(temporaryScript, scriptBytes);
      await fs.writeFile(wrapper, [
        'source [file join [file dirname [info script]] design.tcl]',
        `source ${tclQuoted(inspector)}`,
        '',
      ].join('\n'));
      const output = await runQsysScript(
        executable,
        qsysTclScriptArguments(searchPath, wrapper),
        temporaryDirectory,
      );
      return applyQuartusMetadata(graph, output, executable);
    } finally {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
    }
  }

  private ipSearchPath(uri: vscode.Uri, projectDirectory: string): string {
    const configuration = vscode.workspace.getConfiguration('qsysView', uri);
    const configured = configuration.get<string[]>('ipSearchPaths', []);
    const workspaceDirectory = vscode.workspace.getWorkspaceFolder(uri)?.uri.fsPath ?? projectDirectory;
    const expand = (value: string) => {
      const expanded = value
      .replaceAll('${qsysDir}', projectDirectory)
      .replaceAll('${workspaceFolder}', workspaceDirectory);
      return path.isAbsolute(expanded) || expanded === '$' ? expanded : path.resolve(projectDirectory, expanded);
    };
    return [...new Set([
      ...configured.map(expand),
      path.join(projectDirectory, 'ip', '*', 'component.ipx'),
      path.join(projectDirectory, 'ip', 'common', '**', '*_hw.tcl'),
      path.join(projectDirectory, '*', 'component.ipx'),
      '$',
    ].filter(Boolean))].join(',');
  }

  private async findQsysScript(uri: vscode.Uri): Promise<string> {
    const configured = vscode.workspace.getConfiguration('qsysView', uri).get<string>('quartusPath', '').trim();
    const roots = [
      configured,
      process.env.QSYS_ROOTDIR,
      process.env.QUARTUS_ROOTDIR,
      process.env.QUARTUS_ROOTDIR_OVERRIDE,
    ].filter((value): value is string => Boolean(value));
    const candidates: string[] = [];
    for (const root of roots) candidates.push(...qsysScriptCandidates(root));
    for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
      candidates.push(path.join(directory, executableName()));
    }
    const homeDirectory = process.env.HOME || os.homedir();
    for (const installationRoot of [path.join(homeDirectory, 'intelFPGA'), path.join(homeDirectory, 'intelFPGA_lite')]) {
      try {
        const versions = await fs.readdir(installationRoot, { withFileTypes: true });
        for (const version of versions.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse()) {
          candidates.push(path.join(installationRoot, version, 'quartus', 'sopc_builder', 'bin', executableName()));
        }
      } catch {
        // The conventional installation directory is optional.
      }
    }
    for (const candidate of candidates) {
      try {
        await fs.access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // Try the next configured or conventional location.
      }
    }
    return executableName();
  }

  private async openPlatformDesigner(uri: vscode.Uri): Promise<void> {
    if (uri.scheme !== 'file') {
      void vscode.window.showErrorMessage('Open in Platform Designer is available only for local files.');
      return;
    }
    if (!vscode.workspace.isTrusted) {
      void vscode.window.showWarningMessage(
        'Trust this workspace before opening the design in Platform Designer. Platform Designer may execute project IP Tcl files.',
      );
      return;
    }
    try {
      const platformDesignerExecutable = await this.findPlatformDesigner(uri);
      await vscode.window.withProgress(
        {
          location: vscode.ProgressLocation.Notification,
          title: 'Qsys View: opening Platform Designer…',
        },
        async (progress) => {
          const launchTarget = isQsysTcl(uri)
            ? await this.prepareTemporaryQsys(uri, await this.findQsysScript(uri), progress)
            : { filePath: uri.fsPath, cleanup: undefined as (() => Promise<void>) | undefined };
          progress.report({ message: 'Launching Platform Designer…' });
          await this.launchPlatformDesigner(platformDesignerExecutable, launchTarget.filePath, launchTarget.cleanup);
        },
      );
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      void vscode.window.showErrorMessage(`Qsys View: ${message}`);
      console.error('Qsys View Platform Designer launch failed:', message);
    }
  }

  private async prepareTemporaryQsys(
    uri: vscode.Uri,
    executable: string,
    progress?: vscode.Progress<{ message?: string }>,
  ): Promise<{ filePath: string; cleanup?: () => Promise<void> }> {
    const temporaryDirectory = await fs.mkdtemp(platformDesignerTemporaryPrefix(uri.fsPath));
    const temporaryQsys = path.join(temporaryDirectory, `${path.basename(uri.fsPath, path.extname(uri.fsPath))}.qsys`);
    const temporaryScript = path.join(temporaryDirectory, 'design.tcl');
    const wrapper = path.join(temporaryDirectory, 'export-system.tcl');
    try {
      progress?.report({ message: 'Converting Tcl to temporary Qsys…' });
      await fs.copyFile(uri.fsPath, temporaryScript);
      await fs.writeFile(wrapper, qsysTclExportWrapper(temporaryScript, temporaryQsys));
      const searchPath = this.ipSearchPath(uri, path.dirname(uri.fsPath));
      await runQsysScript(executable, qsysTclScriptArguments(searchPath, wrapper), temporaryDirectory);
      return {
        filePath: temporaryQsys,
        cleanup: async () => {
          await fs.rm(temporaryDirectory, { recursive: true, force: true });
        },
      };
    } catch (error) {
      await fs.rm(temporaryDirectory, { recursive: true, force: true });
      throw error;
    }
  }

  private launchPlatformDesigner(executable: string, filePath: string, cleanup?: () => Promise<void>): Promise<void> {
    return new Promise((resolve, reject) => {
      const child = spawn(executable, [filePath], {
        cwd: path.dirname(filePath),
        detached: true,
        stdio: 'ignore',
        windowsHide: true,
      });
      child.once('error', (error) => {
        const err = error as NodeJS.ErrnoException;
        reject(new Error(
          err.code === 'ENOENT'
            ? 'Platform Designer executable not found. Set "Qsys View: Platform Designer Path" in settings.'
            : `Failed to launch Platform Designer: ${error.message}`,
        ));
      });
      child.once('spawn', () => {
        child.unref();
        resolve();
      });
      child.once('exit', () => {
        void cleanup?.();
      });
      child.once('error', () => {
        void cleanup?.();
      });
    });
  }

  private async findPlatformDesigner(uri: vscode.Uri): Promise<string> {
    const configuration = vscode.workspace.getConfiguration('qsysView', uri);
    const configured = configuration.get<string>('platformDesignerPath', '').trim();
    const quartusConfigured = configuration.get<string>('quartusPath', '').trim();
    const roots = [configured, quartusConfigured, process.env.QSYS_ROOTDIR, process.env.QUARTUS_ROOTDIR, process.env.QUARTUS_ROOTDIR_OVERRIDE]
      .filter((value): value is string => Boolean(value));
    const candidates: string[] = [];
    for (const root of roots) candidates.push(...platformDesignerCandidates(root));
    for (const directory of (process.env.PATH ?? '').split(path.delimiter).filter(Boolean)) {
      candidates.push(path.join(directory, platformDesignerExecutableName()));
    }
    const homeDirectory = process.env.HOME || os.homedir();
    for (const installationRoot of [path.join(homeDirectory, 'intelFPGA'), path.join(homeDirectory, 'intelFPGA_lite')]) {
      try {
        const versions = await fs.readdir(installationRoot, { withFileTypes: true });
        for (const version of versions.filter((entry) => entry.isDirectory()).map((entry) => entry.name).sort().reverse()) {
          candidates.push(path.join(installationRoot, version, 'quartus', 'sopc_builder', 'bin', platformDesignerExecutableName()));
        }
      } catch {
        // The conventional installation directory is optional.
      }
    }
    for (const candidate of candidates) {
      try {
        await fs.access(candidate, fsConstants.X_OK);
        return candidate;
      } catch {
        // Try the next configured or conventional location.
      }
    }
    return platformDesignerExecutableName();
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = randomNonce();
    const scriptUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'));
    const styleUri = webview.asWebviewUri(vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css'));
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Qsys View</title>
</head>
<body>
  <div id="app"><div class="initial-loading">Loading Qsys graph…</div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function executableName(): string {
  return process.platform === 'win32' ? 'qsys-script.exe' : 'qsys-script';
}

function qsysScriptCandidates(location: string): string[] {
  const basename = path.basename(location).toLowerCase();
  if (basename === 'qsys-script' || basename === 'qsys-script.exe') return [location];
  if (basename === 'bin') return [path.join(location, executableName())];
  if (basename === 'sopc_builder') return [path.join(location, 'bin', executableName())];
  if (basename === 'quartus') return [path.join(location, 'sopc_builder', 'bin', executableName())];
  return [
    path.join(location, 'sopc_builder', 'bin', executableName()),
    path.join(location, 'quartus', 'sopc_builder', 'bin', executableName()),
  ];
}

function platformDesignerExecutableName(): string {
  return process.platform === 'win32' ? 'qsys.exe' : 'qsys-edit';
}

function platformDesignerCandidates(location: string): string[] {
  const basename = path.basename(location).toLowerCase();
  if (basename === 'qsys' || basename === 'qsys.exe' || basename === 'qsys-edit') return [location];
  if (basename === 'qsys-script' || basename === 'qsys-script.exe') {
    return [path.join(path.dirname(location), platformDesignerExecutableName())];
  }
  if (basename === 'bin') return [path.join(location, platformDesignerExecutableName())];
  if (basename === 'sopc_builder') return [path.join(location, 'bin', platformDesignerExecutableName())];
  if (basename === 'quartus') return [path.join(location, 'sopc_builder', 'bin', platformDesignerExecutableName())];
  return [
    path.join(location, 'sopc_builder', 'bin', platformDesignerExecutableName()),
    path.join(location, 'quartus', 'sopc_builder', 'bin', platformDesignerExecutableName()),
  ];
}

function runQsysScript(executable: string, args: string[], cwd: string): Promise<string> {
  return new Promise((resolve, reject) => {
    execFile(executable, args, {
      cwd,
      encoding: 'utf8',
      maxBuffer: 64 * 1024 * 1024,
      timeout: 120_000,
    }, (error, stdout, stderr) => {
      const output = `${stdout}\n${stderr}`;
      if (!error) {
        resolve(output);
        return;
      }
      const cause = (error as NodeJS.ErrnoException).code === 'ENOENT'
        ? 'qsys-script was not found. Set “Qsys View: Quartus Path” in VS Code settings.'
        : `qsys-script failed: ${lastLines(output, 12) || error.message}`;
      reject(new Error(cause));
    });
  });
}

function lastLines(value: string, count: number): string {
  return value.trim().split(/\r?\n/).slice(-count).join('\n');
}

function randomNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

function isQsysTcl(uri: vscode.Uri): boolean {
  return uri.path.toLowerCase().endsWith('.tcl');
}

function tclQuoted(value: string): string {
  return `"${value.replaceAll('\\', '\\\\').replaceAll('"', '\\"').replaceAll('$', '\\$').replaceAll('[', '\\[')}"`;
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new QsysEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('qsysView.graph', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.window.registerCustomEditorProvider('qsysView.tclGraph', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('qsysView.openGraph', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      const extension = target?.path.toLowerCase();
      if (!target || (!extension?.endsWith('.qsys') && !extension?.endsWith('.tcl'))) {
        void vscode.window.showWarningMessage('Select a .qsys file or exported Platform Designer .tcl script to open its graph.');
        return;
      }
      await vscode.commands.executeCommand(
        'vscode.openWith',
        target,
        extension.endsWith('.tcl') ? 'qsysView.tclGraph' : 'qsysView.graph',
      );
    }),
  );
}

export function deactivate(): void {}
