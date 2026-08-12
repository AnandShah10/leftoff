# LeftOff

<p align="center">
  <img src="images/icon.png" width="120" alt="LeftOff Icon" />
</p>

<h1 align="center">Resume Where You Left Off</h1>

<p align="center">
  <strong>A VS Code extension that remembers <em>why</em> you were working on something — not just the git changes.</strong><br>
  Automatic context capture • Quick notes • Rich resume panel with optional AI summaries • Session history
</p>

<p align="center">
  <a href="https://marketplace.visualstudio.com/items?itemName=AnandShah.leftoff">
    <img src="https://img.shields.io/visual-studio-marketplace/v/AnandShah.leftoff.svg?label=Marketplace" alt="VS Marketplace" />
  </a>
  <a href="https://marketplace.visualstudio.com/items?itemName=AnandShah.leftoff">
    <img src="https://img.shields.io/visual-studio-marketplace/d/AnandShah.leftoff.svg?label=Downloads" alt="Downloads" />
  </a>
  <a href="https://github.com/AnandShah10/leftoff/stargazers">
    <img src="https://img.shields.io/github/stars/AnandShah10/leftoff?style=social" alt="GitHub stars" />
  </a>
  <a href="https://github.com/AnandShah10/leftoff/blob/main/LICENSE">
    <img src="https://img.shields.io/badge/License-MIT-yellow.svg" alt="License: MIT" />
  </a>
</p>

## ✨ Key Features

- **🔄 Automatic Context Capture** — Open tabs with cursor positions, active editor, terminal names, current git branch, **and detailed uncommitted diffs** (insertions/deletions + colorized snippets). Powered by VS Code's built-in Git API.
- **📝 Quick "Why" Notes** — `Ctrl+Alt+N` (or click the status bar icon) to record your intent at the current file and line. No more forgetting context!
- **🎨 Beautiful Resume Panel** — On reopen (or session boundary), get a rich overview: your last note, change statistics, collapsible colorized diffs, open files/terminals, and an **optional AI-generated summary** of what you were doing + suggested next steps.
- **📜 Session History** — Automatically archives previous sessions (up to 15). Browse any past session with the same rich panel — invaluable after weekends or longer breaks.
- **🧠 Smart Session Boundaries** — Configurable triggers for ending a session: editor restart (always), returning from idle (default 30min), or switching git branches. No more stale context.
- **🤖 Multi-Provider AI Summaries** (opt-in) — Choose from Google Gemini (free tier), Local LLMs (Ollama, LM Studio, etc.), OpenAI, Anthropic, or Azure OpenAI. Guided one-click setup, keys stored securely, nothing leaves your control.
- **⚡ Frictionless UX** — Status bar icon with dropdown menu (`Ctrl/Cmd+Alt+L`). No Command Palette diving required. Works automatically in the background.

**Privacy-first**: AI only sends minimal context (notes, file paths, truncated diffs) to *your* chosen provider when the resume panel opens. No telemetry, no data collection.

## 📸 Screenshots & Demo

> **Add GIFs and screenshots to the `images/` folder to make the marketplace listing shine!** Recommended: 10-15 second animated demo of adding a note → making changes → closing/reopening window → seeing the resume panel with AI summary and colorized diffs.

### The Resume Panel
![Resume Panel](images/resume-panel.png)

*Your notes, total diff stats, per-file collapsible colorized diffs, open files list, terminals, and AI summary all in one beautiful webview.*

### Status Bar Quick Menu
![Quick Menu](images/menu.png)

*One-click access to Add Note, Show Resume, Browse History, Setup AI, and more.*

*(Replace the placeholder image links with real screenshots once created. Tools like Screen Studio or VS Code's built-in recording work great for creating demo GIFs.)*

## 🚀 Quick Start

1. **Install** from the [VS Code Marketplace](https://marketplace.visualstudio.com/items?itemName=AnandShah.leftoff)
2. Open any workspace — LeftOff activates automatically on startup
3. Edit files, switch branches, open terminals as normal
4. Add a **Quick Note** with <kbd>Ctrl</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> (macOS: <kbd>Cmd</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd>)
5. Close and reopen the VS Code window (or trigger idle return / branch switch) to see the **"Welcome Back"** panel

### Enable AI Summaries (Highly Recommended)

- Click the **LeftOff** status bar item (or use the menu command)
- Select **"Setup AI Provider"**
- Choose **Gemini** (free tier) or your preferred provider
- Follow the guided prompts for API key and settings

The resume panel will now include a concise, context-aware AI summary.

## 📋 Commands & Keybindings

| Command | Keyboard Shortcut | Description |
|---------|-------------------|-------------|
| `LeftOff: Add Quick Note` | <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>N</kbd> | Capture "why am I here?" note tied to current location |
| `LeftOff: Open Menu` | <kbd>Ctrl/Cmd</kbd>+<kbd>Alt</kbd>+<kbd>L</kbd> | Quick dropdown with all actions |
| `LeftOff: Show Resume Summary` | - | Re-open the current session's resume panel |
| `LeftOff: Browse Past Sessions` | - | Select from archived sessions |
| `LeftOff: Setup AI Provider` | - | Guided wizard for AI configuration |
| `LeftOff: Clear AI Provider API Key` | - | Remove stored credentials |

## ⚙️ Configuration

Works great out of the box. Customize via VS Code Settings (search for `leftoff`):

**Key Settings**
- `leftoff.enableAiSummary`: `false` (turn on for AI summaries)
- `leftoff.idleThresholdMinutes`: `30` (0 to disable idle-based boundaries)
- `leftoff.detectBranchSwitch`: `true`
- AI provider/model options, diff capture limits (`maxDiffFiles`, `maxSnippet*`), history size, AI prompt tuning (`aiMax*`)

See the full table and descriptions in the extension's **Features** tab or [DEVELOPMENT.md](DEVELOPMENT.md).

## 🔧 Technical Details

- **Debounced capture** (2s for cursor moves, instant for notes and major events)
- **Diff-aware** using VS Code's Git extension API (no shell commands)
- **Per-workspace storage** via `workspaceState`
- **Smart history** with reasons for session end ("restart", "idle return", "branch switch")
- **Secure AI** — keys in VS Code SecretStorage, minimal data sent only on resume panel open

For complete architecture, file-by-file breakdown, local development, packaging, and publishing instructions, see **[DEVELOPMENT.md](DEVELOPMENT.md)**.

## 📜 What's New

See the full history in [CHANGELOG.md](CHANGELOG.md). The VS Marketplace displays this file directly.

## 🤝 Contributing

Bug reports, feature requests, documentation improvements, and code contributions are all welcome!

- See [CONTRIBUTING.md](CONTRIBUTING.md) for guidelines
- See [CODE_OF_CONDUCT.md](CODE_OF_CONDUCT.md)
- See [DEVELOPMENT.md](DEVELOPMENT.md) for setup

## 📄 License

This project is licensed under the [MIT License](LICENSE).

---

**Built with ❤️ by [Anand Shah](https://github.com/AnandShah10) to help developers maintain context and get back into flow state faster.**

*If you find LeftOff useful, please star the repo on GitHub and leave a review on the [Marketplace](https://marketplace.visualstudio.com/items?itemName=AnandShah.leftoff)! Feedback and ideas are always appreciated — open an [issue](https://github.com/AnandShah10/leftoff/issues).*
