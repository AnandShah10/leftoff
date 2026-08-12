# LeftOff Development Guide

## Project Structure

```
src/
├── extension.ts          # Activation, commands, status bar, event listeners, session boundary detection
├── sessionStore.ts       # Core data models (Session, DiffSnapshot, Note), persistence via workspaceState, history management
├── captureContext.ts     # Captures live state: editors, terminals, git branch, uncommitted diffs via Git API
├── aiProviders.ts        # Multi-provider AI implementation (Gemini, Local, OpenAI, Anthropic, Azure) + prompt building
├── resumePanel.ts        # Webview panel with HTML/CSS/JS for the rich "Welcome Back" UI, colorized diffs, AI streaming
└── types.ts              # (if present) Shared TypeScript interfaces
```

`out/` contains the compiled JavaScript.

## Getting Started

### Prerequisites

- Node.js (v18+ recommended)
- VS Code
- Git

### Setup

```bash
# Clone the repo (if not already)
git clone https://github.com/AnandShah10/leftoff.git
cd leftoff

# Install dependencies
npm install
```

### Development Workflow

1. **Compile** the TypeScript:
   ```bash
   npm run compile
   ```

2. **Launch Extension Development Host**:
   - Open this folder in VS Code
   - Press `F5` or select **Run → Start Debugging**
   - A new VS Code window ("[Extension Development Host]") will open with LeftOff loaded

3. **Test the extension**:
   - Open or create a project with some git history
   - Make edits, switch files, open terminals
   - Use `Ctrl+Alt+N` (`Cmd+Alt+N` on macOS) to add quick notes
   - Close and reopen the window, switch branches, or wait for idle timeout to trigger resume panel
   - Test AI setup with `LeftOff: Setup AI Provider` (use a test key or local LLM)

For continuous development, run:
```bash
npm run watch
```
This will recompile on changes.

## Packaging

```bash
# Install VSCE globally (if needed)
npm install -g @vscode/vsce

# Create VSIX package
npm run package
```

This generates `leftoff-0.9.0.vsix` (version from package.json).

**Install from VSIX**:
- In VS Code: Extensions view → ⋯ menu → **Install from VSIX...**
- Or from terminal: `code --install-extension leftoff-0.9.0.vsix`

## Publishing to VS Code Marketplace

The `package.json` is fully configured with:
- Icon, gallery banner, categories, keywords
- Repository, bugs, homepage links
- Commands, configuration schema, keybindings
- Activation events

**Steps to publish**:

1. Ensure the GitHub repository exists at `https://github.com/AnandShah10/leftoff` and all code is pushed.
2. Register as a publisher at [https://marketplace.visualstudio.com/manage](https://marketplace.visualstudio.com/manage) with ID `AnandShah` (if not done).
3. Generate a Personal Access Token from Azure DevOps.
4. Login: `vsce login AnandShah`
5. Update version in `package.json` and add entry to `CHANGELOG.md`
6. Publish:
   ```bash
   vsce publish
   ```
   Or use `vsce publish minor` to automatically bump version.

**Notes**:
- Currently set to `"preview": true` — remove this for the 1.0 release to remove the Preview badge.
- Always update `CHANGELOG.md` before publishing. The Marketplace links to it.
- Test thoroughly across different scenarios (large repos, no git, different AI providers, idle detection, etc.).

## Architecture Highlights

- **No external dependencies** at runtime (only dev deps for building)
- Uses VS Code's `GitExtension` API for accurate diff information without spawning processes
- Session data stored in `context.workspaceState` (per-workspace, not synced)
- AI keys stored securely in VS Code's `SecretStorage`
- Webview uses Tailwind-like inline styles + Prism.js style syntax highlighting for diffs
- Debouncing and smart boundary detection prevent excessive writes

## Debugging Tips

- Use the Debug Console in the Extension Development Host
- Check Output panel → "LeftOff" for logs
- The resume panel can be inspected by opening DevTools (in the panel's context menu)

## Testing AI Providers

- **Gemini**: Easiest to start with (free tier available)
- **Local**: Point to Ollama/LM Studio at the default URL
- Others require API keys from their respective platforms

See `src/aiProviders.ts` for exact prompt templates and request formats.

## Questions?

Open an issue on GitHub or check the main [README.md](../README.md) for user-facing documentation.

---

*Happy hacking! This extension was built to help developers maintain context and flow state.*
