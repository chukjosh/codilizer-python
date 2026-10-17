import * as vscode from 'vscode';
import { VizPanel } from './vizPanel';
import { attachDebugTracker, buildSnapshot } from './dapTracker';
import { runComplexityAnalysis } from './complexityRunner';
import { selectPythonInterpreterCommand } from './pythonInterpreter';
import { WebviewOutboundMessage } from './schema';

export function activate(context: vscode.ExtensionContext) {
  let panel: VizPanel | undefined;

  // The most recently stopped session/thread — needed so a webview message
  // (reveal source, edit a variable, run an expression) knows which live
  // debug session to act against. Only one active debug target is
  // supported in phase 1.
  let activeSession: vscode.DebugSession | undefined;
  let activeThreadId: number | undefined;

  function ensurePanel(): VizPanel {
    if (!panel) {
      panel = VizPanel.createOrShow(context.extensionUri);
      wirePanelMessages(panel);
    }
    return panel;
  }

  function wirePanelMessages(p: VizPanel) {
    p.onMessage(async (msg: WebviewOutboundMessage) => {
      if (msg.type === 'revealLine') {
        await revealSourceLine(msg.path, msg.line);
      } else if (msg.type === 'setVariable') {
        await handleSetVariable(msg);
      } else if (msg.type === 'evaluate') {
        await handleEvaluate(msg);
      }
    });
  }

  async function revealSourceLine(path: string, line: number) {
    try {
      const doc = await vscode.workspace.openTextDocument(path);
      const editor = await vscode.window.showTextDocument(doc, { viewColumn: vscode.ViewColumn.One, preserveFocus: true });
      const range = new vscode.Range(line - 1, 0, line - 1, 0);
      editor.revealRange(range, vscode.TextEditorRevealType.InCenter);
      editor.selection = new vscode.Selection(range.start, range.start);
    } catch (err) {
      vscode.window.showErrorMessage(`Codilizer Python: could not open ${path}`);
    }
  }

  async function refreshDiagram() {
    if (!activeSession || activeThreadId === undefined) return;
    const snapshot = await buildSnapshot(activeSession, activeThreadId);
    panel?.postSnapshot(snapshot);
  }

  async function handleSetVariable(msg: { containerRef: number; name: string; value: string }) {
    if (!activeSession || activeThreadId === undefined) {
      vscode.window.showWarningMessage('Codilizer Python: no active debug session to edit.');
      return;
    }
    try {
      await activeSession.customRequest('setVariable', {
        variablesReference: msg.containerRef,
        name: msg.name,
        value: msg.value
      });
      // Refresh the diagram so the edit (and any effect it has on other
      // variables/heap objects) is reflected immediately.
      await refreshDiagram();
    } catch (err: any) {
      vscode.window.showErrorMessage(`Codilizer Python: could not set ${msg.name} — ${err?.message ?? err}`);
    }
  }

  /**
   * Structural edit path: runs the given expression/statement in the
   * frame's context via DAP `evaluate`. This is what lets the diagram
   * support shape-changing edits (list.append(...), del d['key'], a new
   * assignment) rather than only single-value edits. See schema.ts's
   * EvaluateMessage doc comment for the honest scope of what this is and
   * isn't.
   */
  async function handleEvaluate(msg: { frameId: string; expression: string }) {
    if (!activeSession) {
      vscode.window.showWarningMessage('Codilizer Python: no active debug session to run this against.');
      return;
    }
    try {
      const result = await activeSession.customRequest('evaluate', {
        expression: msg.expression,
        frameId: Number(msg.frameId),
        context: 'repl'
      });
      panel?.postEvaluateResult({ ok: true, output: result?.result ?? '' });
      await refreshDiagram();
    } catch (err: any) {
      const message = err?.message ?? String(err);
      panel?.postEvaluateResult({ ok: false, output: message });
    }
  }

  const openCommand = vscode.commands.registerCommand('codilizer.open', () => {
    ensurePanel();
  });

  const analyzeCommand = vscode.commands.registerCommand('codilizer.analyzeComplexity', async () => {
    const editor = vscode.window.activeTextEditor;
    if (!editor || editor.document.languageId !== 'python') {
      vscode.window.showWarningMessage('Codilizer Python: place the cursor inside a Python function first.');
      return;
    }

    const functionName = findEnclosingFunctionName(editor.document, editor.selection.active.line);
    if (!functionName) {
      vscode.window.showWarningMessage('Codilizer Python: could not find an enclosing function at the cursor.');
      return;
    }

    const p = ensurePanel();

    vscode.window.setStatusBarMessage(`Codilizer Python: profiling ${functionName}...`, 3000);
    const result = await runComplexityAnalysis(context, editor.document.uri.fsPath, functionName);

    if ('error' in result) {
      vscode.window.showErrorMessage(`Codilizer Python: ${result.error}`);
      return;
    }

    p.postComplexity(result);
  });

  const selectInterpreterCommand = vscode.commands.registerCommand(
    'codilizer.selectPythonInterpreter',
    selectPythonInterpreterCommand
  );

  // Hook into every debug session started in the editor.
  // Register for both 'python' (legacy) and 'debugpy' (modern ms-python.debugpy)
  // debug adapter types to work across Python extension versions.
  function createTracker(session: vscode.DebugSession): vscode.DebugAdapterTracker {
    return attachDebugTracker(session, (snapshot, threadId) => {
      activeSession = session;
      activeThreadId = threadId;
      if (panel) {
        panel.postSnapshot(snapshot);
      }
    });
  }

  const trackerFactoryPython = vscode.debug.registerDebugAdapterTrackerFactory('python', {
    createDebugAdapterTracker: createTracker
  });
  const trackerFactoryDebugpy = vscode.debug.registerDebugAdapterTrackerFactory('debugpy', {
    createDebugAdapterTracker: createTracker
  });

  const sessionEndListener = vscode.debug.onDidTerminateDebugSession((session) => {
    if (session === activeSession) {
      activeSession = undefined;
      activeThreadId = undefined;
    }
  });

  context.subscriptions.push(
    openCommand,
    analyzeCommand,
    selectInterpreterCommand,
    trackerFactoryPython,
    trackerFactoryDebugpy,
    sessionEndListener
  );
}

/**
 * Walks upward from the cursor line to find the nearest enclosing
 * `def name(...)` — a simple indentation-based scan rather than a full
 * Python parser, sufficient for locating "the function under the cursor".
 */
function findEnclosingFunctionName(document: vscode.TextDocument, fromLine: number): string | undefined {
  // Matches standard functions, async functions, class methods
  const defPattern = /^\s*(?:async\s+)?def\s+([a-zA-Z_][a-zA-Z0-9_]*)\s*\(/;

  for (let line = fromLine; line >= 0; line--) {
    const text = document.lineAt(line).text;
    const match = text.match(defPattern);
    if (match) {
      return match[1];
    }
  }
  return undefined;
}

export function deactivate() {}
