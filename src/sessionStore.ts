import * as vscode from 'vscode';

export interface CursorPosition {
  line: number;
  character: number;
}

export interface OpenFileState {
  path: string;      // workspace-relative path
  cursor: CursorPosition;
  isActive: boolean; // was this the focused editor
  visibleRange?: { start: number; end: number };
}

export interface QuickNote {
  text: string;
  timestamp: number;
  file?: string;      // workspace-relative path, if attached to a location
  line?: number;
}

export interface TerminalSnapshot {
  name: string;
  cwd?: string;
}

export type ChangeStatus = 'modified' | 'added' | 'deleted' | 'renamed' | 'untracked' | 'other';

export interface DiffSnapshot {
  path: string;           // workspace-relative path
  status: ChangeStatus;
  insertions: number;
  deletions: number;
  snippet?: string;       // truncated unified diff, for the resume panel
  truncated: boolean;     // true if snippet was cut short
}

export type SessionEndReason = 'restart' | 'idle' | 'branch-switch';

export interface SessionSnapshot {
  savedAt: number;
  branch?: string;
  openFiles: OpenFileState[];
  terminals: TerminalSnapshot[];
  notes: QuickNote[];
  diffs: DiffSnapshot[];
  /** Why this snapshot was archived to history. Undefined for the live/current snapshot. */
  endedReason?: SessionEndReason;
}

const STORAGE_KEY = 'leftoff.lastSession';
const HISTORY_KEY = 'leftoff.sessionHistory';
const DEFAULT_MAX_HISTORY = 15;

export class SessionStore {
  constructor(private context: vscode.ExtensionContext) {}

  get(): SessionSnapshot | undefined {
    return this.context.workspaceState.get<SessionSnapshot>(STORAGE_KEY);
  }

  async save(snapshot: SessionSnapshot): Promise<void> {
    await this.context.workspaceState.update(STORAGE_KEY, snapshot);
  }

  async clear(): Promise<void> {
    await this.context.workspaceState.update(STORAGE_KEY, undefined);
  }

  /** Merge a new note into whatever snapshot currently exists (creating one if needed). */
  async addNote(note: QuickNote): Promise<void> {
    const current = this.get() ?? {
      savedAt: Date.now(),
      openFiles: [],
      terminals: [],
      notes: [],
      diffs: []
    };
    current.notes.push(note);
    current.savedAt = Date.now();
    await this.save(current);
  }

  /** Past sessions, most recent first. Does not include the live/current session. */
  getHistory(): SessionSnapshot[] {
    return this.context.workspaceState.get<SessionSnapshot[]>(HISTORY_KEY) ?? [];
  }

  /**
   * Moves a snapshot into history (most-recent-first, capped at maxHistory).
   * Called at each detected session boundary — editor restart, a long idle
   * period ending, or a git branch switch — right before the live session
   * starts overwriting `current`. This is what gives us stable per-session
   * boundaries rather than one blob that silently mutates into the next
   * session's data.
   */
  async archiveToHistory(snapshot: SessionSnapshot, reason: SessionEndReason = 'restart'): Promise<void> {
    if (!snapshot.openFiles.length && !snapshot.notes.length && !snapshot.diffs.length) return;

    const history = this.getHistory();
    // Avoid double-archiving the same snapshot (e.g. extension reactivating without a real restart).
    if (history[0]?.savedAt === snapshot.savedAt) return;

    history.unshift({ ...snapshot, endedReason: reason });
    const maxHistory = vscode.workspace.getConfiguration('leftoff').get<number>('maxHistory', DEFAULT_MAX_HISTORY);
    if (history.length > maxHistory) history.length = maxHistory;
    await this.context.workspaceState.update(HISTORY_KEY, history);
  }

  async clearHistory(): Promise<void> {
    await this.context.workspaceState.update(HISTORY_KEY, undefined);
  }
}
