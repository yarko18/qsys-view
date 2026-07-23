// Copyright 2026 Yaroslav Mariukha
// SPDX-License-Identifier: MIT

import * as vscode from 'vscode';
import { parseQsys } from '../parser/qsysParser';
import type { QsysGraph } from '../parser/graph';

class QsysDocument implements vscode.CustomDocument {
  constructor(readonly uri: vscode.Uri) {}
  dispose(): void {}
}

class QsysEditorProvider implements vscode.CustomReadonlyEditorProvider<QsysDocument> {
  private readonly panels = new Map<string, Set<vscode.WebviewPanel>>();

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

    const sendGraph = () => this.sendGraph(document.uri, panel.webview);
    panel.webview.onDidReceiveMessage((message: { type?: string }) => {
      if (message.type === 'ready' || message.type === 'refresh') void sendGraph();
    });

    const watcher = vscode.workspace.onDidChangeTextDocument((event) => {
      if (event.document.uri.toString() === key) void sendGraph();
    });
    panel.onDidDispose(() => watcher.dispose());
  }

  private async sendGraph(uri: vscode.Uri, webview: vscode.Webview): Promise<void> {
    try {
      const openDocument = vscode.workspace.textDocuments.find(
        (document) => document.uri.toString() === uri.toString(),
      );
      const bytes = openDocument
        ? Buffer.from(openDocument.getText())
        : await vscode.workspace.fs.readFile(uri);
      const fileName = uri.path.split('/').pop()?.replace(/\.qsys$/i, '') || 'Qsys system';
      const graph: QsysGraph = parseQsys(bytes.toString('utf8'), fileName);
      await webview.postMessage({ type: 'graph', graph });
    } catch (error) {
      await webview.postMessage({
        type: 'error',
        message: error instanceof Error ? error.message : String(error),
      });
    }
  }

  private getHtml(webview: vscode.Webview): string {
    const nonce = randomNonce();
    const scriptUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.js'),
    );
    const styleUri = webview.asWebviewUri(
      vscode.Uri.joinPath(this.context.extensionUri, 'dist', 'webview.css'),
    );
    return `<!doctype html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta http-equiv="Content-Security-Policy" content="default-src 'none'; img-src ${webview.cspSource} data:; style-src ${webview.cspSource} 'unsafe-inline'; script-src 'nonce-${nonce}';">
  <link rel="stylesheet" href="${styleUri}">
  <title>Qsys Viewer</title>
</head>
<body>
  <div id="app"><div class="initial-loading">Loading Qsys graph…</div></div>
  <script nonce="${nonce}" src="${scriptUri}"></script>
</body>
</html>`;
  }
}

function randomNonce(): string {
  const alphabet = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789';
  return Array.from({ length: 32 }, () => alphabet[Math.floor(Math.random() * alphabet.length)]).join('');
}

export function activate(context: vscode.ExtensionContext): void {
  const provider = new QsysEditorProvider(context);
  context.subscriptions.push(
    vscode.window.registerCustomEditorProvider('qsysViewer.graph', provider, {
      webviewOptions: { retainContextWhenHidden: true },
    }),
    vscode.commands.registerCommand('qsysViewer.openGraph', async (uri?: vscode.Uri) => {
      const target = uri ?? vscode.window.activeTextEditor?.document.uri;
      if (!target || target.path.toLowerCase().endsWith('.qsys') === false) {
        void vscode.window.showWarningMessage('Select a .qsys file to open its graph.');
        return;
      }
      await vscode.commands.executeCommand('vscode.openWith', target, 'qsysViewer.graph');
    }),
  );
}

export function deactivate(): void {}
