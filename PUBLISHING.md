# Publishing Codilizer Python

This guide covers packaging Codilizer Python as a VSIX, testing that artifact, and optionally publishing it to the Visual Studio Marketplace and Open VSX. Publishing requires owner-specific metadata and credentials; do not publish with placeholder values.

## Readiness Check

The current project manifest is not yet publish-ready. Before packaging a public release:

1. Choose the publisher or namespace ID and add it as `publisher` in `package.json`. The ID becomes part of the extension's public identifier, `<publisher>.codilizer-python`.
2. Add the real source repository URL to the manifest's `repository` field.
3. Choose the project's actual license, add its `LICENSE` file, and set the matching SPDX identifier in `package.json`. The README currently has an MIT badge, but that alone does not grant or establish a license.
4. Confirm the `version` is the intended release version and has not already been published for this publisher.

The manifest already defines `name`, `displayName`, `description`, `icon`, `engines.vscode`, and the extension entry point. Preserve the declared VS Code engine range unless compatibility has been tested and intentionally changed.

## Prerequisites

- Node.js 20 or newer and pnpm.
- A clean install and passing checks: `pnpm install --frozen-lockfile`, `pnpm run compile`, and `pnpm run test:webview`.
- A GitHub repository if using the optional Actions workflow.
- Publisher accounts and access tokens for each registry you plan to use.

Use `pnpm dlx` for the publishing CLIs; global installs are not required.

## Prepare Package Contents

The repository's `.gitignore` excludes `out/`, but `out/extension.js` is required by `package.json` at runtime. Add a `.vscodeignore` file before packaging so VSCE uses an intentional extension-package allowlist. For example:

```gitignore
.git/**
.github/**
.vscode/**
test/**
simple.py
SETUP.md
PUBLISHING.md
**/*.map
```

Do **not** exclude `out/`, `profiler/`, `webview/`, `media/`, or production packages under `node_modules/`. The profiler is loaded from the installed extension, and Mermaid and KaTeX are local webview dependencies. Inspect the resulting file list before publishing.

## Build, Package, and Test the VSIX

From the repository root:

```bash
pnpm install --frozen-lockfile
pnpm run compile
pnpm run test:webview
pnpm dlx @vscode/vsce ls
pnpm dlx @vscode/vsce package --out codilizer-python-0.0.1.vsix
```

Change the VSIX filename to match the version in `package.json`. Review the `ls` output and confirm it includes at least:

- `out/extension.js` and the other required files from `out/`.
- `profiler/complexity_runner.py` and `profiler/complexity_profiler.py`.
- `webview/index.html`, `media/`, and production webview dependencies (including Mermaid and KaTeX).
- `package.json`, README, icon, and LICENSE.

Install and test the packaged file in a development VS Code profile before publishing:

```powershell
code --install-extension .\codilizer-python-0.0.1.vsix --force
```

Alternatively, use **Extensions: Install from VSIX...** from the Extensions view. Test activation, a Python `debugpy` session, live frame edits, and the Mermaid and LaTeX tabs. For a fork, test in that editor as well; a VSIX install proves packaging, not fork compatibility.

## Publish to the Visual Studio Marketplace

1. Create a publisher at the [Visual Studio Marketplace Management Portal](https://marketplace.visualstudio.com/manage). Its ID must exactly match `package.json`'s `publisher` field.
2. Create an Azure DevOps Personal Access Token with the **Marketplace: Manage** scope, following the [Marketplace publisher documentation](https://code.visualstudio.com/api/working-with-extensions/publishing-extension).
3. Publish from the project root:

```bash
pnpm dlx @vscode/vsce publish -p <VSCE_PAT>
```

The command packages and publishes the version currently in `package.json`. Do not commit or paste the token into project files, workflow YAML, or a shared terminal transcript. For local interactive use, `pnpm dlx @vscode/vsce login <publisher-id>` stores publisher credentials for subsequent `publish` commands.

## Publish to Open VSX

Open VSX is a separate registry used by some VS Code forks and other compatible editors. Publishing there does not automatically publish to the Visual Studio Marketplace, or vice versa.

1. Create an account and access token at [open-vsx.org](https://open-vsx.org).
2. Ensure the namespace matching `publisher` in `package.json` exists and is owned by your account.
3. Publish the VSIX built and tested above. In PowerShell:

```powershell
$env:OVSX_PAT = Read-Host "Open VSX token"
pnpm dlx ovsx publish .\codilizer-python-0.0.1.vsix -p $env:OVSX_PAT
Remove-Item Env:OVSX_PAT
```

On macOS/Linux, use an environment variable instead of putting the token directly in a command:

```bash
read -s OVSX_PAT
pnpm dlx ovsx publish ./codilizer-python-0.0.1.vsix -p "$OVSX_PAT"
unset OVSX_PAT
```

## Release Versioning

Choose and commit the release version before packaging. Once a version has been published, registries generally do not allow replacing the same publisher/name/version; publish a new patch, minor, or major version instead. Keep the VSIX filename, Git tag, and `package.json` version consistent, for example `v0.0.2` and `0.0.2`.

## Optional GitHub Actions Publishing

Only enable automated publishing after manual VSIX testing succeeds. Add `VSCE_PAT` and `OVSX_PAT` as GitHub Actions secrets and use a protected release process. The example below publishes on a GitHub release; it assumes package metadata, namespace ownership, and a matching package version are already set.

```yaml
name: Publish Extension

on:
  release:
    types: [published]

permissions:
  contents: read

jobs:
  publish:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: pnpm/action-setup@v4
        with:
          version: 10
      - uses: actions/setup-node@v4
        with:
          node-version: 20
          cache: pnpm
      - run: pnpm install --frozen-lockfile
      - run: pnpm run compile
      - run: pnpm run test:webview
      - run: pnpm dlx @vscode/vsce package --out codilizer-python.vsix
      - name: Publish to Visual Studio Marketplace
        env:
          VSCE_PAT: ${{ secrets.VSCE_PAT }}
        run: pnpm dlx @vscode/vsce publish -p "$VSCE_PAT"
      - name: Publish to Open VSX
        env:
          OVSX_PAT: ${{ secrets.OVSX_PAT }}
        run: pnpm dlx ovsx publish ./codilizer-python.vsix -p "$OVSX_PAT"
```

Add the secrets in the GitHub repository under **Settings → Secrets and variables → Actions**. Restrict release permissions and token scopes to the minimum needed, and do not run publishing jobs for untrusted pull requests.
