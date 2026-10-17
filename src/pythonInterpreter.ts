import * as vscode from 'vscode';
import * as fs from 'fs';
import * as path from 'path';

const CONFIG_SECTION = 'codilizer';
const CONFIG_KEY = 'pythonPath';

/**
 * Resolves which Python interpreter to run the complexity profiler with,
 * in priority order:
 *
 *   1. codilizer.pythonPath  — explicit user override (this extension's
 *      own setting, so it works even without the Python extension installed)
 *   2. ms-python.python's active interpreter for the current workspace
 *   3. python.defaultInterpreterPath (the Python extension's own setting)
 *   4. A workspace-local virtualenv (./venv, ./.venv) if one exists
 *   5. VIRTUAL_ENV / CONDA_PREFIX environment variables, if set
 *   6. The first `python3`/`python` found by scanning PATH
 *   7. Bare 'python3' (or 'python' on Windows) as a last-resort fallback
 */
export async function resolvePythonInterpreter(): Promise<string> {
  const configured = vscode.workspace.getConfiguration(CONFIG_SECTION).get<string>(CONFIG_KEY);
  if (configured && configured.trim().length > 0) {
    return configured;
  }

  try {
    const pythonExt = vscode.extensions.getExtension('ms-python.python');
    if (pythonExt) {
      const api = pythonExt.isActive ? pythonExt.exports : await pythonExt.activate();
      const activeInterpreter = api?.settings?.getExecutionDetails?.()?.execCommand;
      if (Array.isArray(activeInterpreter) && activeInterpreter.length > 0) {
        return activeInterpreter[0];
      }
    }
  } catch {
    // fall through
  }

  const pythonExtConfigured = vscode.workspace.getConfiguration('python').get<string>('defaultInterpreterPath');
  if (pythonExtConfigured && pythonExtConfigured.trim().length > 0) {
    return pythonExtConfigured;
  }

  const workspaceVenv = findWorkspaceVenv();
  if (workspaceVenv) {
    return workspaceVenv;
  }

  const envVenv = findEnvVarInterpreter();
  if (envVenv) {
    return envVenv;
  }

  const pathScan = scanPathForPython();
  if (pathScan.length > 0) {
    return pathScan[0];
  }

  return process.platform === 'win32' ? 'python' : 'python3';
}

function venvPythonPath(venvRoot: string): string | undefined {
  const candidate = process.platform === 'win32'
    ? path.join(venvRoot, 'Scripts', 'python.exe')
    : path.join(venvRoot, 'bin', 'python');
  return fs.existsSync(candidate) ? candidate : undefined;
}

function findWorkspaceVenv(): string | undefined {
  const folders = vscode.workspace.workspaceFolders;
  if (!folders) return undefined;

  for (const folder of folders) {
    for (const name of ['.venv', 'venv']) {
      const found = venvPythonPath(path.join(folder.uri.fsPath, name));
      if (found) return found;
    }
  }
  return undefined;
}

function findEnvVarInterpreter(): string | undefined {
  const virtualEnv = process.env.VIRTUAL_ENV;
  if (virtualEnv) {
    const found = venvPythonPath(virtualEnv);
    if (found) return found;
  }
  const condaPrefix = process.env.CONDA_PREFIX;
  if (condaPrefix) {
    const candidate = process.platform === 'win32'
      ? path.join(condaPrefix, 'python.exe')
      : path.join(condaPrefix, 'bin', 'python');
    if (fs.existsSync(candidate)) return candidate;
  }
  return undefined;
}

/** Scans every directory on PATH for a python3/python executable, returning
 * every match found (deduplicated), most-specific-name-first (python3
 * before python) so callers can prefer a more explicit match. */
export function scanPathForPython(): string[] {
  const pathEnv = process.env.PATH ?? process.env.Path ?? '';
  const dirs = pathEnv.split(path.delimiter).filter(Boolean);
  const names = process.platform === 'win32'
    ? ['python.exe', 'python3.exe']
    : ['python3', 'python'];

  const found: string[] = [];
  const seen = new Set<string>();

  for (const name of names) {
    for (const dir of dirs) {
      const candidate = path.join(dir, name);
      if (!seen.has(candidate) && fs.existsSync(candidate)) {
        seen.add(candidate);
        found.push(candidate);
      }
    }
  }
  return found;
}

/**
 * Command handler: scans PATH plus common venv/env locations, shows a
 * QuickPick of everything found (with a manual-entry option), and writes
 * the choice to codilizer.pythonPath so it's used from then on.
 */
export async function selectPythonInterpreterCommand() {
  const candidates = new Set<string>();

  const workspaceVenv = findWorkspaceVenv();
  if (workspaceVenv) candidates.add(workspaceVenv);

  const envVenv = findEnvVarInterpreter();
  if (envVenv) candidates.add(envVenv);

  for (const p of scanPathForPython()) {
    candidates.add(p);
  }

  const items: vscode.QuickPickItem[] = Array.from(candidates).map((p) => ({ label: p }));
  items.push({ label: '$(edit) Enter a custom path...', description: 'Type a full path to a Python executable' });

  const picked = await vscode.window.showQuickPick(items, {
    title: 'Codilizer Python: Select Python Interpreter',
    placeHolder: candidates.size > 0 ? 'Found interpreters on this machine' : 'No interpreters found automatically — enter a path'
  });

  if (!picked) return;

  let chosenPath = picked.label;
  if (chosenPath.startsWith('$(edit)')) {
    const typed = await vscode.window.showInputBox({
      prompt: 'Full path to a Python executable',
      placeHolder: '/usr/bin/python3'
    });
    if (!typed) return;
    chosenPath = typed;
  }

  await vscode.workspace.getConfiguration(CONFIG_SECTION).update(
    CONFIG_KEY,
    chosenPath,
    vscode.ConfigurationTarget.Workspace
  );
  vscode.window.showInformationMessage(`Codilizer Python: using ${chosenPath}`);
}
