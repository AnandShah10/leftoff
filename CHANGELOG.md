# Changelog

All notable changes to the "LeftOff" extension are documented here.
Format loosely follows [Keep a Changelog](https://keepachangelog.com/en/1.1.0/); versions follow [SemVer](https://semver.org/).

## [0.9.0]

### Updated
- `README.md` and `CHANGELOG.md` are updated.

## [0.8.0]

### Added
- **Multi-provider AI summaries.** No longer Anthropic-only — pick from Google Gemini (free tier), a local OpenAI-compatible LLM server (Ollama, LM Studio, etc — no key, no cost), OpenAI, Anthropic, or Azure OpenAI via `leftoff.aiProvider`.
- **"LeftOff: Setup AI Provider"** — a guided wizard (provider picker → API key prompt → provider-specific fields like Azure endpoint/deployment or local server URL → optional model override) that turns AI summaries on without ever touching `settings.json`.
- **Quick-access menu.** A new **▾** status bar item (`leftoff.openMenu`, `Ctrl/Cmd+Alt+L`) lists every action — add note, resume summary, history, AI setup, clearing data — in one QuickPick, so nothing requires digging through the Command Palette.
- A one-time welcome notification on first activation pointing at the status bar menu.
- API keys are now stored per-provider (`leftoff.apiKey.<provider>` in SecretStorage), so switching providers doesn't require re-entering a key you'd already set for another one.

### Changed
- Replaced `leftoff.setApiKey` with `leftoff.setupAI` (the full wizard). `leftoff.clearApiKey` now clears whichever provider is currently active rather than being Anthropic-specific.
- `leftoff.aiModel` default changed from a hardcoded Anthropic model to blank (meaning "use the selected provider's default").

## [0.7.0]

### Added
- **Smart session boundaries.** Sessions can now end without restarting the editor:
  - **Idle return** — if the window is unfocused for at least `leftoff.idleThresholdMinutes` (default 30, `0` to disable), regaining focus archives the previous session and opens the resume panel automatically, just like a restart would.
  - **Branch switch** — if `leftoff.detectBranchSwitch` (default on) detects the git branch changed since the last capture, the previous branch's session is archived immediately (shown via a lightweight notification with a "View archived session" action, not a full panel popup) and a fresh session starts for the new branch.
- Archived sessions now record *why* they ended (`restart` / `idle` / `branch-switch`); "LeftOff: Browse Past Sessions" shows this next to each entry's timestamp.

## [0.6.0]

### Added
- **Colorized diffs.** Diff snippets in the resume panel now color-code by line: additions in green, deletions in red, hunk headers in blue, file metadata dimmed. Text-color only (no backgrounds), so it works across VS Code themes without relying on newer CSS like `color-mix()`.

## [0.5.0]

### Added
- **Configurable capture/prompt caps.** All previously-hardcoded limits are now settings: `leftoff.maxDiffFiles`, `maxSnippetLines`, `maxSnippetChars`, `maxHistory`, `aiMaxDiffFiles`, `aiMaxSnippetChars`, `aiMaxNotes`. Useful for tuning larger-diff workflows or a tighter privacy/storage budget when sending data to the AI summary endpoint.
- **Regenerate button on the AI summary.** Once a summary finishes (or errors), a "Regenerate" button appears in the resume panel to request a fresh one for the same snapshot — no need to close and reopen the panel to retry a failed or unsatisfying call.

## [0.4.0]

### Added
- **Multi-session history.** Past sessions (up to the last 15) are now archived automatically each time the editor restarts, rather than being overwritten by the next session.
- `LeftOff: Browse Past Sessions` command — pick any archived session from a quick-pick list (shown by date, branch, and last note) and view its full resume panel.
- `LeftOff: Clear Session History` command, separate from clearing just the current session.

### Changed
- The resume panel now distinguishes "Welcome back" (current/live session) from "Past session" (historical view) in its title and subtitle.

## [0.3.0]

### Added
- **AI session summaries (opt-in, off by default).** When enabled with an Anthropic API key, the resume panel streams in a short AI-generated summary — what you were doing and a likely next step — built from your notes, open files, and diffs.
- `LeftOff: Set Anthropic API Key` and `LeftOff: Clear Anthropic API Key` commands. The key is stored in VS Code's encrypted `SecretStorage`, never in `settings.json`.
- New settings: `leftoff.enableAiSummary` (default `false`) and `leftoff.aiModel` (default `claude-haiku-4-5-20251001`).

### Notes
- The rest of the resume panel (notes, diffs, open files) renders immediately and does not wait on the AI call. A failed or slow API call degrades gracefully with a visible error, never silently.

## [0.2.0]

### Added
- **Diff-aware capture.** For every file with uncommitted changes (staged or working tree), the extension now records status (modified/added/deleted/renamed/untracked), insertion/deletion counts, and a truncated unified-diff snippet via the built-in Git extension API — no shelling out to `git`.
- "Uncommitted Changes" section in the resume panel, with a collapsible diff per file and a total +/- stat line in the headline summary.

### Changed
- Autosave on cursor movement is now debounced (2s) since diff capture is more expensive than the previous cursor-only capture; tab switches, focus loss, and explicit notes still persist immediately.

## [0.1.0]

### Added
- Initial release.
- Auto-capture of open tabs, per-file cursor position, active tab, open terminal names, and current git branch.
- Quick notes (`Ctrl+Alt+N` / `Cmd+Alt+N`) tied to the file/line you're focused on, for capturing *why*, not just *what*.
- "Welcome back" resume panel shown on reopen, summarizing the last session.
- `LeftOff: Show Resume Summary` and `LeftOff: Clear Saved Session` commands.
