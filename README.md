# Codilizer Python

[![License: GPL v3](https://img.shields.io/badge/License-GPL%20v3-blue.svg)](https://www.gnu.org/licenses/gpl-3.0)

Interactive diagram of code execution, memory heap references, and algorithmic complexity, linked live to your Python debugger.

![Codilizer Python logo](media/logo.png)

---

## Features

- **Live Stack & Heap Visualization**: Automatically maps function call frames, variables, and compound heap data structures (`list`, `dict`, `set`, `tuple`, custom objects) with curved reference pointers when breakpoints hit.
- **Multiple Visual Views**:
  - **Stack & Heap**: Interactive card-based call stack and memory layout.
  - **Execution Flowchart**: Dynamic SVG flow of active call frames and parameters.
  - **Mermaid Graph**: Auto-generated live Mermaid (`graph TD`) graph representations.
  - **LaTeX Mathematical Formulas**: Rendered asymptotic notations ($T(n) = \mathcal{O}(\dots)$, $S(n) = \mathcal{O}(\dots)$) with category badges (Constant, Linear, Logarithmic, Exponential, etc.).
- **Bidirectional Live REPL / Structural Edits**: Execute arbitrary Python expressions directly in any paused frame (`data.append(99)`, `del info['key']`, `x = 42`) to mutate state on-the-fly and observe the diagram refresh.
- **Inline Variable Editing**: Click any primitive value on the stack to edit it live via DAP `setVariable`.
- **Dynamic Big-O Profiler**: Runs non-intrusive background complexity analysis sweeping inputs to detect time and peak memory complexity across standard complexity classes ($\mathcal{O}(1)$ through $\mathcal{O}(n!)$).
- **Editor Actions & Toolbar Support**: Quick-access action buttons on the editor title bar (`$(graph)` Open Diagram, `$(pulse)` Analyze Complexity, `$(gear)` Select Interpreter).
- **Theme Adaptive**: Automatically adheres to VS Code user and system dark, light, and high-contrast color themes.

---

## Architecture

- `src/extension.ts` — Extension entry point, command registrations, editor toolbar integration, and debug adapter tracker hooks (`python` and `debugpy`).
- `src/dapTracker.ts` — Concurrently maps DAP `stopped` breakpoint events via `Promise.all` across frames, scopes, and heap objects into the unified `VizSnapshot` schema.
- `src/schema.ts` — Language-agnostic visualization data contract.
- `src/vizPanel.ts` — Manages the Webview panel, resource roots (`webview`, `media`), and throttles snapshot postMessage delivery.
- `webview/index.html` — Glassmorphic multi-view visualizer supporting Stack & Heap, Flowcharts, Mermaid, and LaTeX math.
- `profiler/complexity_profiler.py` — Dynamic line-hit trace and `tracemalloc` memory profiler using model comparison regression.
- `profiler/complexity_runner.py` — Standalone subprocess runner supporting all standard Python types, typing generics (`List`, `Dict`, `Optional`, unions), and name heuristics.

---

## Getting Started

### Prerequisites
- VS Code 1.85+ (or VSCodium / Cursor)
- Node.js (v18+) & pnpm / npm
- Python 3.8+ with the **Python** (`ms-python.python` / `ms-python.debugpy`) extension installed

### Editor Fork Compatibility

Codilizer Python is expected to work in VS Code-compatible forks such as VSCodium or Cursor when they support the VS Code 1.85+ extension API and the Python debugger's Debug Adapter Protocol integration. You may need to install Codilizer Python and the Python extension from that editor's marketplace or as VSIX packages.

### Installation & Build
```bash
# Install dependencies
pnpm install

# Compile TypeScript
pnpm run compile

# Run webview tests
pnpm run test:webview
```

### Running Locally in Extension Host
1. Press **F5** in VS Code to open an **[Extension Development Host]** window.
2. In the new window, open the included [`simple.py`](simple.py) and set a breakpoint on a line marked `# <-- BREAKPOINT`.
3. Click the **$(graph) Codilizer Python** icon in the editor top-right toolbar (or run `Codilizer Python: Open Diagram Panel`).
4. Press **F5** to start debugging. Step through with **F10** to watch variables and heap pointers update in real time!

### Live Frame Edit Examples

The input at the bottom of each stack-frame card evaluates code in that paused frame using the Python debugger. Press **Enter** to run it; mutations and assignments affect the live program, then Codilizer Python refreshes the diagram. Names are frame-local, so use each example while paused in its named function. The included [`simple.py`](simple.py) has breakpoint comments for every function below.

In `process_data`, where `data` and `info` are parameters, try list edits:

```python
data.append(99)
data.extend([100, 200, 300])
data.reverse()
data.pop()
```

Dictionary edits:

```python
info["status"] = "Verified"
info["scores"].append(100)
del info["age"]
```

Create a variable in the current frame and inspect its nested list values in the heap preview:

```python
matrix = [[1, 2], [3, 4]]
```

In `find_factorial(n)`, pause on the multiplication line, after `i` and `result` have been set. Assigning `result` changes the value used by the pending multiplication:

```python
result = 999
history = [i, result, n]
```

In `is_palindrome(text)`, pause on the marked comparison line, after `chars` and `clean_text` exist:

```python
chars.append("!")
clean_text = "radar"
```

In `add_numbers(a, b)`, pause on the return line:

```python
total = total * 10
notes = {"operation": "addition", "inputs": [a, b]}
```

The selected frame matters: for example, `a` and `b` exist in `add_numbers`, not in the module frame. A `NameError` means the name is not defined in the frame where the expression was submitted.

---

## Publishing

To bundle and publish to the **Visual Studio Code Marketplace** or **Open VSX Registry**, refer to the detailed [PUBLISHING.md](PUBLISHING.md) guide.

```bash
# Package as .vsix
npx @vscode/vsce package
```

---

## License

MIT
