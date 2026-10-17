/**
 * Shared visualization schema.
 * Every language backend (Python first, others later) must translate its
 * debugger snapshot into this shape. The webview renderer only ever
 * consumes this schema, never a language-specific representation.
 */

export interface VizVariable {
  name: string;
  type: string;
  value: string;       // primitive display value, or a heap ref id if isRef
  isRef: boolean;       // true if this points to a heap object
  refId?: string;
  containerRef?: number; // DAP variablesReference of the scope holding this
                          // variable — required to send a setVariable request
}

export interface VizFrame {
  id: string;
  functionName: string;
  line: number;
  sourcePath?: string;   // absolute path of the source file for this frame
  variables: VizVariable[];
}

export interface VizHeapObject {
  id: string;
  type: string;         // list, dict, object, array, etc.
  preview: string[];     // truncated preview of contents (capped length)
  truncated: boolean;
  size?: number;         // total item/field count if truncated
}

export interface VizEdge {
  from: string;   // variable name or heap object id
  to: string;     // heap object id
}

export interface VizSnapshot {
  frames: VizFrame[];
  heap: VizHeapObject[];
  edges: VizEdge[];
  currentLine: number;
  timestamp: number;
}

export interface ComplexityResult {
  functionName: string;
  timeComplexity: string;   // e.g. "O(n)", "O(n^2)" (best-fit estimate)
  spaceComplexity: string;
  sampledInputSizes: number[];
  sampledOpCounts: number[];
}

export interface ComplexityRunRequest {
  filePath: string;
  functionName: string;
}

// --- messages sent FROM the webview TO the extension ------------------

export interface RevealLineMessage {
  type: 'revealLine';
  path: string;
  line: number;
}

export interface SetVariableMessage {
  type: 'setVariable';
  frameId: string;
  containerRef: number;
  name: string;
  value: string;
}

/**
 * Structural edit: runs an arbitrary expression/statement in a frame's
 * context via the DAP `evaluate` request (context: 'repl') — the same
 * mechanism VS Code's own debug console uses. This is how the diagram
 * supports edits that change SHAPE, not just a single value: appending
 * or removing a list item, inserting a dict key, rebinding a variable to
 * a new object, calling a mutating method. It is genuinely "structural"
 * in effect — the running program's data structures actually change and
 * the diagram reflects it — but it works by re-executing code in the
 * live process, not by editing the diagram and regenerating source text.
 * See README's "Structural bidirectional editing" section for the
 * distinction and why that's the honest, buildable version of this.
 */
export interface EvaluateMessage {
  type: 'evaluate';
  frameId: string;
  expression: string;
}

export type WebviewOutboundMessage = RevealLineMessage | SetVariableMessage | EvaluateMessage;
