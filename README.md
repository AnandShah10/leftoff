# LeftOff

A VS Code extension that remembers *why* you were doing something, not just what changed in git.

## What it does

- **Auto-captures**, on a debounce as you work: open tabs, cursor position per file, which tab was active, open terminal names, current git branch, and **uncommitted diffs** — all via VS Code's built-in Git extension API, no shelling out.
- **Diff-aware capture.** For every file with uncommitted changes (staged or working tree), it records the status (modified/added/deleted/renamed/untracked), an insertions/deletions count, and a truncated unified-diff snippet — so the resume panel shows *what actually changed*, not just which files were touched.
- **AI summary (opt-in).** If enabled and an API key is set, on reopen the panel also streams in a short AI-generated summary — what you were doing and a likely next step — generated from your notes, diffs, and open files via the Anthropic API. Off by default; see "AI summaries" below.
- **Quick notes**: `Ctrl+Alt+N` / `Cmd+Alt+N` (or the status bar button) opens a one-line prompt to jot down *why* — tied to whatever file/line you had focused.
- **On reopen**: shows a "Welcome back" panel — active file + line, total diff stats, your last note, a collapsible diff per changed file, all open files, and terminals.
- **Session history.** Every time you reopen the project, the previous session is archived (up to the last 15). Run **"LeftOff: Browse Past Sessions"** to pick any of them from a list and view the same resume panel for that point in time — useful when you didn't touch a project for a week and need more than just "yesterday."
- **Smart session boundaries.** A "session" no longer has to end at editor restart. Two more triggers close out the current session and archive it to history automatically: **returning after being idle** past a configurable threshold, and **switching git branches**. Both are on by default and configurable — see "Smart session boundaries" below.

## Known limitations (by design)

- **Terminal scrollback/cwd is not captured.** VS Code's extension API doesn't expose arbitrary shell history or working directory for terminals it didn't create — only the terminal's name/title is stored as a memory cue.
- **Diffs are capped, not exhaustive.** To keep `workspaceState` small and fast, capture is limited to the first 20 changed files, and each snippet is truncated to ~40 lines / 3000 chars (full stats — insertions/deletions — are still counted from the untruncated diff). Untracked/newly-added files are recorded by name only (nothing exists in HEAD to diff against).
- **No AI summarization yet.** The "why" comes from your own quick notes plus the raw diff, not an LLM guessing at your intent. This keeps v0.1 fast, private, and dependency-free.
- **Per-workspace, not global.** Session state is stored via `workspaceState`, so each project has its own independent memory.
- **Idle detection is focus-based, not truly idle-based.** "Away" is measured as "the VS Code window lost OS focus for N minutes," not keyboard/mouse inactivity while focused — if you leave the window focused but walk away, that isn't detected. There's also a small race window right at the moment focus returns where a same-tick editor event could beat the archive-and-reset to the punch; rare in practice, not something to design around yet.
- **Debounced, not real-time.** Cursor-movement events are debounced 2s before triggering a re-capture (diffing is comparatively expensive); tab switches, focus loss, and explicit note-adding always persist immediately.

## Smart session boundaries

A session is archived to history (and the resume panel shown, same as reopening the editor) whenever any of these happen:

1. **Editor restart** — the original behavior. Always on.
2. **Idle return.** If the VS Code window loses focus for at least `leftoff.idleThresholdMinutes` (default **30**), the moment it regains focus is treated as "welcome back": the session from before you stepped away is archived, and the resume panel opens automatically. Set to `0` to disable.
3. **Branch switch.** If `leftoff.detectBranchSwitch` (default **on**) is true and the git branch changes since the last capture, the previous branch's session is archived immediately and a new one starts — no restart or idle gap needed. Unlike idle-return, this doesn't pop the full resume panel (that would be disruptive mid-flow); instead a small notification appears with a "View archived session" action.

Each archived session in history remembers *why* it ended — "returned from idle" or "branch switch" show up next to the timestamp in **"LeftOff: Browse Past Sessions."** Sessions ended by a plain restart show no suffix.

Both idle and branch-switch boundaries reset the *notes* for the new session (so future-you doesn't see last week's note mixed into a fresh branch) but naturally still capture whatever files/diffs are live at that moment.

## AI summaries (opt-in)

Off by default. To turn it on:

1. Run **"LeftOff: Set Anthropic API Key (for AI Summaries)"** from the Command Palette and paste your key. It's stored in VS Code's encrypted [SecretStorage](https://code.visualstudio.com/api/references/vscode-api#SecretStorage) — never written to `settings.json`, never synced, never logged.
2. Set `leftoff.enableAiSummary: true` in your settings (workspace or user).
3. Next time you reopen the project, the resume panel shows a "Generating..." spinner that fills in with a short AI-written summary once the API call returns. The rest of the panel (notes, diffs, files) renders immediately and doesn't wait on it.

**What gets sent, and when:** only when this setting is on, and only at the moment the resume panel opens. The request includes: your quick notes (last 10), open file paths, the active file/line, git branch, and up to 8 changed files' diff stats + a truncated snippet (~800 chars each) of their diffs. No full file contents, no files outside your notes/diffs/open-tab list. See `src/aiSummary.ts` for the exact prompt construction if you want to audit it.

**Model & cost:** defaults to `claude-haiku-4-5-20251001` (fast, cheap — this is a short summarization task, not deep reasoning) via `leftoff.aiModel`. Each summary is one API call, capped at 300 output tokens. How much context goes into the prompt is tunable via `leftoff.aiMaxDiffFiles` / `aiMaxSnippetChars` / `aiMaxNotes`.

**Turning it off:** set `leftoff.enableAiSummary: false`, or run **"LeftOff: Clear Anthropic API Key"** to remove the stored key entirely. If a summary comes back wrong or the call fails, use the **Regenerate** button in the resume panel rather than reopening it.

## All settings

| Setting | Default | Description |
|---|---|---|
| `leftoff.enableAiSummary` | `false` | Turn on AI-generated session summaries. |
| `leftoff.aiModel` | `claude-haiku-4-5-20251001` | Model used for AI summaries. |
| `leftoff.maxDiffFiles` | `20` | Max changed files to capture diff info for per snapshot. |
| `leftoff.maxSnippetLines` | `40` | Max lines kept per file's diff snippet in the resume panel. |
| `leftoff.maxSnippetChars` | `3000` | Max characters kept per file's diff snippet in the resume panel. |
| `leftoff.maxHistory` | `15` | Max number of past sessions kept in history. |
| `leftoff.aiMaxDiffFiles` | `8` | Max changed files' diffs sent in the AI summary prompt. |
| `leftoff.aiMaxSnippetChars` | `800` | Max characters per file's diff sent in the AI summary prompt. |
| `leftoff.aiMaxNotes` | `10` | Max recent notes sent in the AI summary prompt. |
| `leftoff.idleThresholdMinutes` | `30` | Minutes unfocused before regaining focus counts as a new session. `0` disables. |
| `leftoff.detectBranchSwitch` | `true` | Whether a git branch switch ends the current session and starts a new one. |

## Run it locally (development)

```bash
cd leftoff
npm install
npm run compile
```

Then in VS Code:
1. Open this folder.
2. Press `F5` (or Run → Start Debugging). This launches an "Extension Development Host" window with the extension loaded.
3. In that new window, open any project, edit some files, leave a note (`Cmd/Ctrl+Alt+N`), then close and reopen the window — you'll see the resume panel.

## Package as a `.vsix` (installable file)

```bash
npm install -g @vscode/vsce   # if not already installed
vsce package
```

This produces `leftoff-0.7.0.vsix`. Install it via:
- VS Code → Extensions panel → `...` menu → "Install from VSIX..."
- or `code --install-extension leftoff-0.7.0.vsix`

## Publishing to the Marketplace

The `package.json` is publish-ready (icon, license, changelog, repository/bugs/homepage fields, keywords, publisher) — `vsce package` runs clean with no warnings. Identity is already set: publisher `AnandShah`, repo `https://github.com/AnandShah10/leftoff`. Before actually publishing:

1. **Create the GitHub repo** at `github.com/AnandShah10/leftoff` if it doesn't exist yet, and push this code there — the `repository`/`bugs`/`homepage` links in `package.json` already point at it.
2. **Register the publisher** (if not already done) at the [Marketplace publisher management page](https://marketplace.visualstudio.com/manage), using the ID `AnandShah`.
3. **Get a Personal Access Token** from Azure DevOps (the Marketplace publishing docs walk through this) and run `vsce login AnandShah`.
4. **Publish**: `vsce publish` (or `vsce publish patch`/`minor`/`major` to bump the version automatically).
5. Update `CHANGELOG.md` with each release — the Marketplace links to it directly.
6. This is currently marked `"preview": true` in `package.json` (shows a "Preview" badge on the listing) since it's pre-1.0 — remove that flag once you're confident in stability across real-world use.

## Project structure

```
src/
  extension.ts      → activation, commands, event wiring, status bar, debounce, API key handling, session-boundary detection
  sessionStore.ts    → data model (incl. DiffSnapshot, SessionEndReason) + workspaceState persistence for current session + history
  captureContext.ts  → reads live editor/terminal/git/diff state into a snapshot
  aiSummary.ts        → builds the prompt and calls the Anthropic Messages API (opt-in)
  resumePanel.ts      → webview that renders the "welcome back" / historical summary + colorized diffs + AI summary
```

## Where to take it next

1. **True idle detection.** Currently "away" is measured by OS window focus, not actual keyboard/mouse inactivity — someone who leaves the window focused but steps away isn't detected. A lightweight activity timer (reset on keystroke/click, checked periodically) would catch that case too.
2. **Team mode.** Optionally sync notes + diff summaries (not full file contents) to a shared location so teammates picking up a branch see the same "why" you left.
