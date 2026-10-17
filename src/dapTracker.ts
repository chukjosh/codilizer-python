import * as vscode from 'vscode';
import { VizSnapshot, VizFrame, VizVariable, VizHeapObject, VizEdge } from './schema';

const MAX_PREVIEW_ITEMS = 20;

/**
 * Attaches to a debug session's protocol messages via VS Code's
 * DebugAdapterTracker API and converts each "stopped" event into a
 * VizSnapshot by walking stackTrace -> scopes -> variables requests.
 *
 * This intentionally rides on top of the existing debugpy adapter rather
 * than talking to debugpy directly — VS Code already manages that process.
 */
export function attachDebugTracker(
  session: vscode.DebugSession,
  onSnapshot: (snapshot: VizSnapshot, threadId: number) => void
): vscode.DebugAdapterTracker {
  return {
    async onDidSendMessage(message: any) {
      if (message.type === 'event' && message.event === 'stopped') {
        const threadId = message.body?.threadId;
        if (threadId === undefined) return;

        try {
          const snapshot = await buildSnapshot(session, threadId);
          onSnapshot(snapshot, threadId);
        } catch (err) {
          console.error('Codilizer Python: failed to build snapshot', err);
        }
      }
    }
  };
}

export async function buildSnapshot(session: vscode.DebugSession, threadId: number): Promise<VizSnapshot> {
  // Fetch up to 8 stack frames (sufficient for interactive call stack without lagging DAP)
  const stackTraceResp = await session.customRequest('stackTrace', { threadId, startFrame: 0, levels: 8 });
  const stackFrames = stackTraceResp.stackFrames ?? [];

  const frames: VizFrame[] = [];
  const heap: VizHeapObject[] = [];
  const edges: VizEdge[] = [];
  const seenRefs = new Set<number>();
  const heapPromises: Promise<VizHeapObject>[] = [];

  let currentLine = stackFrames[0]?.line ?? 0;

  // Process stack frames in parallel for instant response
  const frameResults = await Promise.all(
    stackFrames.map(async (sf: any) => {
      try {
        const scopesResp = await session.customRequest('scopes', { frameId: sf.id });
        const localsScope = (scopesResp.scopes ?? []).find((s: any) => s.name === 'Locals') ?? scopesResp.scopes?.[0];
        if (!localsScope) return null;

        const varsResp = await session.customRequest('variables', { variablesReference: localsScope.variablesReference });
        const variables: VizVariable[] = [];
        const frameHeapRefs: any[] = [];

        for (const v of varsResp.variables ?? []) {
          const HIDDEN_GROUPS = new Set([
            'special variables', 'function variables', 'class variables'
          ]);
          if (HIDDEN_GROUPS.has(v.name)) continue;
          if (v.name.startsWith('__') && v.name.endsWith('__')) continue;

          const isRef = v.variablesReference && v.variablesReference > 0;
          variables.push({
            name: v.name,
            type: v.type ?? 'unknown',
            value: isRef ? `ref:${v.variablesReference}` : v.value,
            isRef: !!isRef,
            refId: isRef ? String(v.variablesReference) : undefined,
            containerRef: localsScope.variablesReference
          });

          if (isRef && !seenRefs.has(v.variablesReference)) {
            seenRefs.add(v.variablesReference);
            frameHeapRefs.push(v);
          }
        }

        return {
          frame: {
            id: String(sf.id),
            functionName: sf.name,
            line: sf.line,
            sourcePath: sf.source?.path,
            variables
          },
          heapRefs: frameHeapRefs
        };
      } catch {
        return null;
      }
    })
  );

  // Collect frames and batch-fetch all heap objects concurrently
  for (const res of frameResults) {
    if (!res) continue;
    frames.push(res.frame);
    for (const v of res.heapRefs) {
      heapPromises.push(
        buildHeapObject(session, v).then(obj => {
          edges.push({ from: v.name, to: obj.id });
          return obj;
        })
      );
    }
  }

  const resolvedHeap = await Promise.all(heapPromises);
  for (const obj of resolvedHeap) {
    heap.push(obj);
  }

  return { frames, heap, edges, currentLine, timestamp: Date.now() };
}

async function buildHeapObject(session: vscode.DebugSession, v: any): Promise<VizHeapObject> {
  const childrenResp = await session.customRequest('variables', { variablesReference: v.variablesReference });
  const children = childrenResp.variables ?? [];
  const preview = children.slice(0, MAX_PREVIEW_ITEMS).map((c: any) => `${c.name}: ${c.value}`);

  return {
    id: String(v.variablesReference),
    type: v.type ?? 'object',
    preview,
    truncated: children.length > MAX_PREVIEW_ITEMS,
    size: children.length
  };
}
