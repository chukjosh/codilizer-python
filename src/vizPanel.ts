import * as vscode from 'vscode';
import * as fs from 'fs';
import { VizSnapshot, ComplexityResult, WebviewOutboundMessage } from './schema';

export class VizPanel {
  private static current: VizPanel | undefined;
  private readonly panel: vscode.WebviewPanel;
  private lastSentAt = 0;
  private pending: VizSnapshot | undefined;
  private messageHandler?: (msg: WebviewOutboundMessage) => void;

  // Simple throttle so rapid stepping / loops don't flood postMessage.
  private static readonly MIN_INTERVAL_MS = 50;

  private constructor(private readonly extensionUri: vscode.Uri) {
    this.panel = vscode.window.createWebviewPanel(
      'codilizer',
      'Codilizer Python',
      vscode.ViewColumn.Beside,
      {
        enableScripts: true,
        retainContextWhenHidden: true,
        localResourceRoots: [
          vscode.Uri.joinPath(extensionUri, 'webview'),
          vscode.Uri.joinPath(extensionUri, 'media'),
          vscode.Uri.joinPath(extensionUri, 'node_modules', 'mermaid', 'dist'),
          vscode.Uri.joinPath(extensionUri, 'node_modules', 'katex', 'dist')
        ]
      }
    );
    this.panel.iconPath = vscode.Uri.joinPath(this.extensionUri, 'media', 'icon.png');
    this.panel.webview.html = this.getHtml();
    this.panel.onDidDispose(() => (VizPanel.current = undefined));
    this.panel.webview.onDidReceiveMessage((msg: WebviewOutboundMessage) => {
      this.messageHandler?.(msg);
    });
  }

  /** Registers the callback invoked whenever the webview sends a message
   * back (reveal-source clicks, variable edits). Only one handler at a
   * time — extension.ts sets this once, right after creating the panel. */
  onMessage(handler: (msg: WebviewOutboundMessage) => void) {
    this.messageHandler = handler;
  }

  static createOrShow(extensionUri: vscode.Uri): VizPanel {
    if (VizPanel.current) {
      VizPanel.current.panel.reveal(vscode.ViewColumn.Beside);
      return VizPanel.current;
    }
    VizPanel.current = new VizPanel(extensionUri);
    return VizPanel.current;
  }

  postSnapshot(snapshot: VizSnapshot) {
    const now = Date.now();
    this.pending = snapshot;
    if (now - this.lastSentAt < VizPanel.MIN_INTERVAL_MS) {
      return; // dropped — a newer snapshot will supersede it on next call
    }
    this.flush();
  }

  postComplexity(result: ComplexityResult) {
    this.panel.webview.postMessage({ type: 'complexity', payload: result });
  }

  postEvaluateResult(result: { ok: boolean; output: string }) {
    this.panel.webview.postMessage({ type: 'evaluateResult', payload: result });
  }

  private flush() {
    if (!this.pending) return;
    this.lastSentAt = Date.now();
    this.panel.webview.postMessage({ type: 'snapshot', payload: this.pending });
    this.pending = undefined;
  }

  private getHtml(): string {
    const htmlPath = vscode.Uri.joinPath(this.extensionUri, 'webview', 'index.html');
    let html = fs.readFileSync(htmlPath.fsPath, 'utf8');

    const webviewUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'webview')
    );
    const mediaUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'media')
    );
    const mermaidUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'mermaid', 'dist')
    );
    const katexUri = this.panel.webview.asWebviewUri(
      vscode.Uri.joinPath(this.extensionUri, 'node_modules', 'katex', 'dist')
    );
    html = html.replace(/\{\{webviewUri\}\}/g, webviewUri.toString());
    html = html.replace(/\{\{mediaUri\}\}/g, mediaUri.toString());
    html = html.replace(/\{\{mermaidUri\}\}/g, mermaidUri.toString());
    html = html.replace(/\{\{katexUri\}\}/g, katexUri.toString());

    return html;
  }
}
