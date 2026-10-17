import * as vscode from 'vscode';
import { spawn } from 'child_process';
import * as path from 'path';
import { ComplexityResult } from './schema';
import { resolvePythonInterpreter } from './pythonInterpreter';

type RunnerResult = ComplexityResult | { error: string };

/**
 * Runs profiler/complexity_runner.py against the given file/function as a
 * one-off subprocess (never during live debugging — see README). See
 * pythonInterpreter.ts for the interpreter resolution priority order.
 */
export async function runComplexityAnalysis(
  context: vscode.ExtensionContext,
  filePath: string,
  functionName: string
): Promise<RunnerResult> {
  const pythonPath = await resolvePythonInterpreter();

  return new Promise((resolve) => {
    const scriptPath = path.join(context.extensionPath, 'profiler', 'complexity_runner.py');
    const proc = spawn(pythonPath, [scriptPath, filePath, functionName]);

    let stdout = '';
    let stderr = '';

    proc.stdout.on('data', (chunk) => (stdout += chunk.toString()));
    proc.stderr.on('data', (chunk) => (stderr += chunk.toString()));

    proc.on('error', (err) => {
      resolve({
        error: `Could not start '${pythonPath}': ${err.message}. ` +
               `Run "Codilizer Python: Select Python Interpreter" to fix this.`
      });
    });

    proc.on('close', () => {
      const line = stdout.trim().split('\n').pop() ?? '';
      try {
        const parsed = JSON.parse(line);
        resolve(parsed as RunnerResult);
      } catch {
        resolve({ error: stderr.trim() || 'Complexity runner produced no output.' });
      }
    });
  });
}
