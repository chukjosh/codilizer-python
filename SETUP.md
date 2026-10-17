# SETUP GUIDE — Codilizer Python (VS Code extension)

This guide covers two things: how the project folder is organized, and
the exact steps to install, compile, and run it in VS Code.

---

## 1. Folder structure

```
codilizer-python/
├── SETUP.md                    ← this file
├── README.md                   ← architecture notes, design decisions,
│                                  verification status, roadmap
├── simple.py                   ← runnable debug target with live-edit
│                                  breakpoint examples
├── package.json                ← extension manifest: commands, settings,
│                                  dependencies
├── package-lock.json           ← exact dependency versions (from npm install)
├── tsconfig.json                ← TypeScript compiler config
│
├── src/                         ← the extension itself (TypeScript, runs
│   │                               in VS Code's extension host)
│   ├── extension.ts              ← entry point: activation, command
│   │                                registration, message routing
│   ├── dapTracker.ts             ← listens to the Python debugger (DAP),
│   │                                converts debugger state into the
│   │                                shared diagram schema
│   ├── schema.ts                  ← the shared data shapes (VizSnapshot,
│   │                                VizFrame, VizVariable, etc.) — the
│   │                                contract between the extension and
│   │                                the webview
│   ├── vizPanel.ts               ← owns the diagram panel (Webview),
│   │                                throttles updates, posts messages
│   ├── complexityRunner.ts       ← spawns the Python profiler as a
│   │                                subprocess, parses its JSON output
│   └── pythonInterpreter.ts      ← finds/lets you choose which Python
│                                    interpreter to profile with
│
├── webview/
│   └── index.html                ← the diagram itself: call stack cards,
│                                    heap cards, reference arrows (SVG),
│                                    complexity panel, structural-edit
│                                    console. Plain HTML/JS (no framework)
│
├── profiler/                     ← Python side — runs as a subprocess,
│   │                                never inside the extension process
│   ├── complexity_profiler.py    ← core profiling engine: line-hit
│   │                                counting, memory measurement,
│   │                                adaptive sizing, Big-O classification
│   └── complexity_runner.py      ← CLI wrapper: loads a function from a
│                                    file, builds test inputs, calls the
│                                    profiler, prints JSON
│
└── test/
    └── webview.test.js           ← jsdom behavioral test for the diagram
                                     (19 assertions — rendering, diffing,
                                     editing, structural edits)
```

**What talks to what:**

```
VS Code debugger (debugpy)
        │  DAP protocol
        ▼
dapTracker.ts  ──schema.ts shapes──▶  vizPanel.ts  ──postMessage──▶  webview/index.html
        ▲                                                                    │
        │                                                    postMessage (user actions)
        └──────────────── extension.ts (routes messages back) ◀─────────────┘

extension.ts ──spawns subprocess──▶ profiler/complexity_runner.py ──▶ complexity_profiler.py
```

---

## 2. Prerequisites

- **VS Code** (desktop app — this cannot run in claude.ai or a browser)
- **Node.js** (v18+) and **npm** — for compiling the extension
- **Python 3** — for the debugger backend and the complexity profiler
- The **Python extension for VS Code** (`ms-python.python`) — install
  from the Extensions panel if you don't have it. This provides the
  Python debugger (`debugpy`) that Codilizer Python uses.

### VS Code forks

VSCodium, Cursor, and other VS Code-compatible editors are likely to work
if they support the VS Code 1.85+ extension API and a Python debugger that
exposes the `python` or `debugpy` adapter. Their extension marketplaces differ, so Codilizer Python
or the Python extension may need to be installed from the fork's marketplace
or from a VSIX package.

---

## 3. Setup steps

### Step 1 — Unzip and open in VS Code

```bash
unzip codilizer-python.zip
cd codilizer-python
code .
```

### Step 2 — Install dependencies

In VS Code's integrated terminal (`` Ctrl+` ``):

```bash
npm install
```

This installs the TypeScript compiler, VS Code's type definitions, and
`jsdom` (only needed if you want to re-run the webview test).

### Step 3 — Compile

```bash
npm run compile
```

This runs the TypeScript compiler and produces an `out/` folder — this
is what VS Code actually loads when the extension runs. If this command
shows errors, stop here and fix them before continuing (it should show
none — this was verified clean before packaging).

### Step 4 — (Optional) Run the behavioral test

```bash
npm run test:webview
```

Should print `ALL TESTS PASSED` with 19 passing assertions. This
exercises the diagram's rendering, diffing, editing, and structural-edit
logic without needing a live debug session.

### Step 5 — Launch the extension

Press **F5** (or Run → Start Debugging). This opens a second VS Code
window titled "[Extension Development Host]" with Codilizer Python
loaded.

### Step 6 — Try it

In the Extension Development Host window:

1. Open the included `simple.py` sample.
2. Set a breakpoint on an executable line marked `# <-- BREAKPOINT`.
3. Open the Command Palette (`Ctrl+Shift+P` / `Cmd+Shift+P`) → run
  **"Codilizer Python: Open Diagram Panel"**.
4. Start debugging the file (F5 again, or Run → Start Debugging, choosing
   "Python File").
5. When the breakpoint hits, the diagram panel should populate with the
   call stack, variables, and any heap objects (lists, dicts), with
   reference arrows connecting them.

**Other things to try:**
- Click a **variable's value** (non-list/dict) to edit it inline.
- Click the **"line N"** label on a frame to jump to that source line.
- Type an expression into the **console box** under a frame (e.g.
  `lst.append(99)`) and press Enter — this is the structural edit
  feature; it runs the expression live and refreshes the diagram.
- See [Live Frame Edit Examples](README.md#live-frame-edit-examples) for
  ready-to-paste list, dictionary, factorial, palindrome, and arithmetic
  edits for the bundled `simple.py` sample.
- Put your cursor inside a function (no debugger needed for this one)
  and run **"Codilizer Python: Analyze Complexity of Function Under
  Cursor"** from the Command Palette.
- If profiling fails to find Python, run **"Codilizer Python: Select
  Python Interpreter"** from the Command Palette to point it at the
  right one.

---

## 4. If something goes wrong

- **"Could not start 'python3'"** when analyzing complexity → run
  **Codilizer Python: Select Python Interpreter** from the Command
  Palette, or set `codilizer.pythonPath` directly in Settings.
- **Nothing appears in the diagram panel** → confirm the debugger is
  Python's (not another language), that a breakpoint was actually hit
  (the editor should highlight the paused line), and that the panel was
  opened via the command before or after the debugger started (either
  order works).
- **TypeScript compile errors after editing source** → run
  `npm run watch` instead of `npm run compile` while developing; it
  recompiles on every save and shows errors immediately.

---

## 5. What's verified vs. not (see README.md for full detail)

Verified outside VS Code: TypeScript compiles with zero errors, the
webview passes 19/19 behavioral test assertions, and the complexity
profiler was tested against 9 real Python functions covering every
supported Big-O class.

**Not yet verified: an actual run inside VS Code against a live
`debugpy` session** (steps 5–6 above). That's the one thing that
genuinely needs you to try it.
