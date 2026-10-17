<p align="center">
  <img src="media/logo.png" width="70%" alt="Codilizer Python logo">
</p>

<!-- Badges -->
<p align="center">
  <a href="https://www.gnu.org/licenses/gpl-3.0"><img src="https://img.shields.io/badge/License-GPL%20v3-blue.svg" alt="License: GPL v3"></a>
  <a href="https://code.visualstudio.com/"><img src="https://img.shields.io/badge/VS%20Code-v1.85+-007ACC?logo=visualstudiocode&logoColor=white" alt="VS Code Extension"></a>
  <a href="https://www.python.org/"><img src="https://img.shields.io/badge/Python-3.12+-3776AB?logo=python&logoColor=white" alt="Python Version"></a>
  <a href="https://www.typescriptlang.org/"><img src="https://img.shields.io/badge/TypeScript-007ACC?logo=typescript&logoColor=white" alt="TypeScript"></a>
  <a href="https://nodejs.org/"><img src="https://img.shields.io/badge/Node.js-20+-339933?logo=nodedotjs&logoColor=white" alt="Node.js"></a>
  <a href="https://pnpm.io/"><img src="https://img.shields.io/badge/pnpm-F69220?logo=pnpm&logoColor=white" alt="Package Manager"></a>
  <a href="https://github.com/chukjosh/codilizer-python"><img src="https://img.shields.io/badge/Forks-Cursor%20%7C%20VSCodium-purple" alt="Compatible with Cursor & VSCodium"></a>
  <a href="https://github.com/chukjosh"><img src="https://img.shields.io/badge/PRs-welcome-brightgreen.svg" alt="PRs Welcome"></a>
</p>

# Codilizer Python

Interactive diagram of code execution, memory heap references, and algorithmic complexity, linked live to your Python debugger.

## Features

* **Live Stack \& Heap Visualization**: Automatically maps function call frames, variables, and compound heap data structures (`list`, `dict`, `set`, `tuple`, custom objects) with curved reference pointers when breakpoints hit.
* **Multiple Visual Views**:

  * **Stack \& Heap**: Interactive card-based call stack and memory layout.
  * **Execution Flowchart**: Dynamic SVG flow of active call frames and parameters.
  * **Mermaid Graph**: Auto-generated live Mermaid (`graph TD`) graph representations.
  * **LaTeX Mathematical Formulas**: Rendered asymptotic notations ($T(n) = \\mathcal{O}(\\dots)$, $S(n) = \\mathcal{O}(\\dots)$) with category badges (Constant, Linear, Logarithmic, Exponential, etc.).
* **Bidirectional Live REPL / Structural Edits**: Execute arbitrary Python expressions directly in any paused frame (`data.append(99)`, `del info\['key']`, `x = 42`) to mutate state on-the-fly and observe the diagram refresh.
* **Inline Variable Editing**: Click any primitive value on the stack to edit it live via DAP `setVariable`.
* **Dynamic Big-O Profiler**: Runs non-intrusive background complexity analysis sweeping inputs to detect time and peak memory complexity across standard complexity classes ($\\mathcal{O}(1)$ through $\\mathcal{O}(n!)$).
* **Editor Actions \& Toolbar Support**: Quick-access action buttons on the editor title bar (`$(graph)` Open Diagram, `$(pulse)` Analyze Complexity, `$(gear)` Select Interpreter).
* **Theme Adaptive**: Automatically adheres to VS Code user and system dark, light, and high-contrast color themes.

## Architecture

* `src/extension.ts` — Extension entry point, command registrations, editor toolbar integration, and debug adapter tracker hooks (`python` and `debugpy`).
* `src/dapTracker.ts` — Concurrently maps DAP `stopped` breakpoint events via `Promise.all` across frames, scopes, and heap objects into the unified `VizSnapshot` schema.
* `src/schema.ts` — Language-agnostic visualization data contract.
* `src/vizPanel.ts` — Manages the Webview panel, resource roots (`webview`, `media`), and throttles snapshot postMessage delivery.
* `webview/index.html` — Glassmorphic multi-view visualizer supporting Stack \& Heap, Flowcharts, Mermaid, and LaTeX math.
* `profiler/complexity\_profiler.py` — Dynamic line-hit trace and `tracemalloc` memory profiler using model comparison regression.
* `profiler/complexity\_runner.py` — Standalone subprocess runner supporting all standard Python types, typing generics (`List`, `Dict`, `Optional`, unions), and name heuristics.

## Getting Started

### Prerequisites

* VS Code 1.85+ (or VSCodium / Cursor)
* Node.js (v18+) \& pnpm / npm
* Python 3.8+ with the **Python** (`ms-python.python` / `ms-python.debugpy`) extension installed

### Editor Fork Compatibility

Codilizer Python is expected to work in VS Code-compatible forks such as VSCodium or Cursor when they support the VS Code 1.85+ extension API and the Python debugger's Debug Adapter Protocol integration. You may need to install Codilizer Python and the Python extension from that editor's marketplace or as VSIX packages.

### Installation \& Build

```
# Install dependencies
pnpm install

# Compile TypeScript
pnpm run compile

# Run webview tests
pnpm run test:webview

```

### Running Locally in Extension Host

1. Press **F5** in VS Code to open an **\[Extension Development Host]** window.
2. In the new window, open the included [`simple.py`](simple.py) and set a breakpoint on a line marked `# <-- BREAKPOINT`.
3. Click the **$(graph) Codilizer Python** icon in the editor top-right toolbar (or run `Codilizer Python: Open Diagram Panel`).
4. Press **F5** to start debugging. Step through with **F10** to watch variables and heap pointers update in real time!

### Live Frame Edit Examples

The input at the bottom of each stack-frame card evaluates code in that paused frame using the Python debugger. Press **Enter** to run it; mutations and assignments affect the live program, then Codilizer Python refreshes the diagram. Names are frame-local, so use each example while paused in its named function. The included [`simple.py`](simple.py) has breakpoint comments for every function below.

In `process\_data`, where `data` and `info` are parameters, try list edits:

```
data.append(99)
data.extend(\[100, 200, 300])
data.reverse()
data.pop()

```

Dictionary edits:

```
info\["status"] = "Verified"
info\["scores"].append(100)
del info\["age"]

```

Create a variable in the current frame and inspect its nested list values in the heap preview:

```
matrix = \[\[1, 2], \[3, 4]]

```

In `find\_factorial(n)`, pause on the multiplication line, after `i` and `result` have been set. Assigning `result` changes the value used by the pending multiplication:

```
result = 999
history = \[i, result, n]

```

In `is\_palindrome(text)`, pause on the marked comparison line, after `chars` and `clean\_text` exist:

```
chars.append("!")
clean\_text = "radar"

```

In `add\_numbers(a, b)`, pause on the return line:

```
total = total \* 10
notes = {"operation": "addition", "inputs": \[a, b]}

```

The selected frame matters: for example, `a` and `b` exist in `add\_numbers`, not in the module frame. A `NameError` means the name is not defined in the frame where the expression was submitted.

## Contributing

Contributions are welcome! Please follow these steps to contribute:

1. **Fork the Repository**: Create your own copy of the project on GitHub.
2. **Create a Feature Branch**: `git checkout -b feature/amazing-feature`
3. **Commit Your Changes**: Follow clear commit messages (`git commit -m 'Add amazing feature'`).
4. **Run Tests**: Ensure all existing tests pass before opening a pull request (`pnpm run test:webview`).
5. **Open a Pull Request**: Submit your pull request targeting the `main` branch with a clear description of your changes.

Please make sure your contributions adhere to the GNU General Public License v3.0 guidelines.

## Publishing

To bundle and publish to the **Visual Studio Code Marketplace** or **Open VSX Registry**, refer to the detailed [PUBLISHING.md](PUBLISHING.md) guide.

```
# Package as .vsix
npx @vscode/vsce package

```

## License

This project is licensed under the GNU General Public License v3.0 - see the [LICENSE](LICENSE) file for details.

---

⭐ **Star the repo if you found it helpful!**

Thank you for your support and interest in Codilizer Python!

