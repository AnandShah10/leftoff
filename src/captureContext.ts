import * as vscode from 'vscode';
import * as path from 'path';
import { SessionSnapshot, OpenFileState, TerminalSnapshot, DiffSnapshot, ChangeStatus } from './sessionStore';

// Defaults for diff capture — overridable via the leftoff.* settings below.
// Kept small since snapshots persist in workspaceState.
const DEFAULT_MAX_DIFF_FILES = 20;
const DEFAULT_MAX_SNIPPET_LINES = 40;
const DEFAULT_MAX_SNIPPET_CHARS = 3000;

interface CaptureCaps {
  maxDiffFiles: number;
  maxSnippetLines: number;
  maxSnippetChars: number;
}

function getCaptureCaps(): CaptureCaps {
  const config = vscode.workspace.getConfiguration('leftoff');
  return {
    maxDiffFiles: config.get<number>('maxDiffFiles', DEFAULT_MAX_DIFF_FILES),
    maxSnippetLines: config.get<number>('maxSnippetLines', DEFAULT_MAX_SNIPPET_LINES),
    maxSnippetChars: config.get<number>('maxSnippetChars', DEFAULT_MAX_SNIPPET_CHARS)
  };
}

/** Lazily resolves the built-in vscode.git extension's API (no shelling out to `git`). */
async function getGitApi(): Promise<any | undefined> {
  try {
    const gitExt = vscode.extensions.getExtension('vscode.git');
    if (!gitExt) return undefined;
    const exports = gitExt.isActive ? gitExt.exports : (await gitExt.activate());
    return exports.getAPI(1);
  } catch {
    return undefined;
  }
}

async function getCurrentBranch(gitApi: any | undefined): Promise<string | undefined> {
  try {
    const repo = gitApi?.repositories?.[0];
    return repo?.state?.HEAD?.name;
  } catch {
    return undefined;
  }
}

// Git extension API Status enum values we care about (see vscode.git.d.ts).
const STATUS_MAP: Record<number, ChangeStatus> = {
  0: 'modified',  // INDEX_MODIFIED
  1: 'added',     // INDEX_ADDED
  2: 'deleted',   // INDEX_DELETED
  3: 'renamed',   // INDEX_RENAMED
  5: 'modified',  // MODIFIED
  6: 'deleted',   // DELETED
  7: 'untracked'  // UNTRACKED
};

function countChanges(diffText: string): { insertions: number; deletions: number } {
  let insertions = 0;
  let deletions = 0;
  for (const line of diffText.split('\n')) {
    if (line.startsWith('+++') || line.startsWith('---')) continue;
    if (line.startsWith('+')) insertions++;
    else if (line.startsWith('-')) deletions++;
  }
  return { insertions, deletions };
}

function truncateSnippet(diffText: string, caps: CaptureCaps): { snippet: string; truncated: boolean } {
  const lines = diffText.split('\n');
  let snippet = lines.slice(0, caps.maxSnippetLines).join('\n');
  let truncated = lines.length > caps.maxSnippetLines;
  if (snippet.length > caps.maxSnippetChars) {
    snippet = snippet.slice(0, caps.maxSnippetChars);
    truncated = true;
  }
  return { snippet, truncated };
}

/**
 * Captures uncommitted changes (working tree + staged) against HEAD.
 * Uses the Git extension's `diffWithHEAD(path)` — no child_process, no shell git required.
 */
async function captureDiffs(gitApi: any | undefined, caps: CaptureCaps): Promise<DiffSnapshot[]> {
  const repo = gitApi?.repositories?.[0];
  if (!repo) return [];

  const changes: any[] = [...(repo.state.workingTreeChanges ?? []), ...(repo.state.indexChanges ?? [])];

  // De-dupe by uri (a file can appear in both working tree and index).
  const seen = new Map<string, any>();
  for (const change of changes) {
    seen.set(change.uri.toString(), change);
  }

  const results: DiffSnapshot[] = [];
  for (const change of Array.from(seen.values()).slice(0, caps.maxDiffFiles)) {
    const relPath = vscode.workspace.asRelativePath(change.uri, false);
    const status = STATUS_MAP[change.status] ?? 'other';

    // Untracked/newly-added files have nothing in HEAD to diff against; skip the diff call.
    if (status === 'untracked' || status === 'added') {
      results.push({ path: relPath, status, insertions: 0, deletions: 0, truncated: false });
      continue;
    }

    try {
      const diffText: string = await repo.diffWithHEAD(change.uri.fsPath);
      const { insertions, deletions } = countChanges(diffText);
      const { snippet, truncated } = truncateSnippet(diffText, caps);
      results.push({ path: relPath, status, insertions, deletions, snippet, truncated });
    } catch {
      // File may be binary, newly staged, or otherwise undiffable — record it without a snippet.
      results.push({ path: relPath, status, insertions: 0, deletions: 0, truncated: false });
    }
  }

  return results;
}

function toWorkspaceRelative(uri: vscode.Uri): string {
  const rel = vscode.workspace.asRelativePath(uri, false);
  return rel;
}

export async function captureSession(existingNotes: SessionSnapshot['notes'] = []): Promise<SessionSnapshot> {
  const openFiles: OpenFileState[] = [];

  for (const group of vscode.window.tabGroups.all) {
    for (const tab of group.tabs) {
      const input = tab.input;
      if (input instanceof vscode.TabInputText) {
        const filePath = toWorkspaceRelative(input.uri);

        // Try to find a visible editor matching this tab to grab cursor/scroll info.
        const matchingEditor = vscode.window.visibleTextEditors.find(
          (e) => e.document.uri.toString() === input.uri.toString()
        );

        openFiles.push({
          path: filePath,
          cursor: matchingEditor
            ? { line: matchingEditor.selection.active.line, character: matchingEditor.selection.active.character }
            : { line: 0, character: 0 },
          isActive: tab.isActive,
          visibleRange: matchingEditor
            ? {
                start: matchingEditor.visibleRanges[0]?.start.line ?? 0,
                end: matchingEditor.visibleRanges[0]?.end.line ?? 0
              }
            : undefined
        });
      }
    }
  }

  const terminals: TerminalSnapshot[] = vscode.window.terminals.map((t) => ({
    name: t.name
    // NOTE: VS Code's API does not expose terminal cwd or scrollback for arbitrary shells.
    // We only capture the name/title as a memory cue (e.g. "running dev server").
  }));

  const gitApi = await getGitApi();
  const branch = await getCurrentBranch(gitApi);
  const diffs = await captureDiffs(gitApi, getCaptureCaps());

  return {
    savedAt: Date.now(),
    branch,
    openFiles,
    terminals,
    notes: existingNotes,
    diffs
  };
}
