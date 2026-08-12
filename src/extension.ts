import * as vscode from 'vscode';
import { SessionStore, QuickNote, SessionSnapshot } from './sessionStore';
import { captureSession } from './captureContext';
import { showResumePanel } from './resumePanel';
import { generateAiSummary, AiSummaryError, AiProviderSettings, ProviderId, PROVIDERS, getProviderDefinition } from './aiProviders';

let statusBarItem: vscode.StatusBarItem;
let menuStatusBarItem: vscode.StatusBarItem;

function secretKeyFor(provider: ProviderId): string {
  return `leftoff.apiKey.${provider}`;
}

/** Reads the fully-resolved AI provider settings for the currently-configured provider, or undefined if not usable yet. */
async function resolveProviderSettings(context: vscode.ExtensionContext): Promise<AiProviderSettings | undefined> {
  const config = vscode.workspace.getConfiguration('leftoff');
  const providerId = config.get<ProviderId>('aiProvider', 'gemini');
  const def = getProviderDefinition(providerId);

  const apiKey = def.requiresApiKey ? await context.secrets.get(secretKeyFor(providerId)) : undefined;
  if (def.requiresApiKey && !apiKey) return undefined;

  const model = config.get<string>('aiModel', '').trim() || def.defaultModel;

  return {
    provider: providerId,
    apiKey,
    model,
    baseUrl:
      providerId === 'azure'
        ? config.get<string>('azureBaseUrl', '')
        : providerId === 'local'
        ? config.get<string>('localBaseUrl', 'http://localhost:11434/v1')
        : undefined,
    azureDeployment: config.get<string>('azureDeployment', ''),
    azureApiVersion: config.get<string>('azureApiVersion', '')
  };
}

/** Kicks off an AI summary request and streams the result into an already-open resume panel. */
async function runAiSummary(panel: vscode.WebviewPanel, settings: AiProviderSettings, snapshot: SessionSnapshot) {
  try {
    const { summary } = await generateAiSummary(settings, snapshot);
    panel.webview.postMessage({ type: 'aiSummary', status: 'done', text: summary });
  } catch (err) {
    const message = err instanceof AiSummaryError ? err.message : `Unexpected error: ${err}`;
    panel.webview.postMessage({ type: 'aiSummary', status: 'error', text: message });
  }
}

export async function activate(context: vscode.ExtensionContext) {
  const store = new SessionStore(context);

  // --- Status bar: quick-note (primary, one click) + menu (secondary, everything else) ---
  statusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 100);
  statusBarItem.command = 'leftoff.addNote';
  statusBarItem.text = '$(note) Add note';
  statusBarItem.tooltip = 'LeftOff: leave a note for future-you';
  statusBarItem.show();
  context.subscriptions.push(statusBarItem);

  menuStatusBarItem = vscode.window.createStatusBarItem(vscode.StatusBarAlignment.Left, 99);
  menuStatusBarItem.command = 'leftoff.openMenu';
  menuStatusBarItem.text = '$(chevron-down)';
  menuStatusBarItem.tooltip = 'LeftOff menu';
  menuStatusBarItem.show();
  context.subscriptions.push(menuStatusBarItem);

  const openResumePanel = async (snapshot: SessionSnapshot, isHistorical: boolean = false) => {
    const config = vscode.workspace.getConfiguration('leftoff');
    const aiEnabled = config.get<boolean>('enableAiSummary', false);
    const settings = aiEnabled ? await resolveProviderSettings(context) : undefined;

    const panel = showResumePanel(context, snapshot, Boolean(aiEnabled && settings), isHistorical);

    if (aiEnabled && settings) {
      runAiSummary(panel, settings, snapshot);

      // Let the panel's "Regenerate" button trigger another AI call for the same snapshot.
      context.subscriptions.push(
        panel.webview.onDidReceiveMessage((message) => {
          if (message?.command === 'regenerateAiSummary') {
            runAiSummary(panel, settings, snapshot);
          }
        })
      );
    } else if (aiEnabled && !settings) {
      vscode.window
        .showInformationMessage('AI summaries are on but not fully set up yet.', 'Setup AI Provider')
        .then((choice) => {
          if (choice === 'Setup AI Provider') vscode.commands.executeCommand('leftoff.setupAI');
        });
    }
  };

  // --- On startup: if there's a prior snapshot, archive it into history, then show the resume panel ---
  const previous = store.get();
  if (previous && (previous.openFiles.length > 0 || previous.notes.length > 0)) {
    await store.archiveToHistory(previous, 'restart');
    // Small delay so it doesn't fight with VS Code's own workspace-restore animation.
    setTimeout(() => openResumePanel(previous), 600);
  }

  // --- One-time welcome message pointing people at the menu instead of the command palette ---
  const WELCOMED_KEY = 'leftoff.hasShownWelcome';
  if (!context.globalState.get<boolean>(WELCOMED_KEY)) {
    context.globalState.update(WELCOMED_KEY, true);
    vscode.window
      .showInformationMessage(
        'LeftOff is active — click the note icon in the status bar to leave yourself a note, or the arrow next to it for everything else (AI setup, history, etc).',
        'Open Menu'
      )
      .then((choice) => {
        if (choice === 'Open Menu') vscode.commands.executeCommand('leftoff.openMenu');
      });
  }

  // --- Command: quick-access menu — the single place to find everything, no command palette needed ---
  context.subscriptions.push(
    vscode.commands.registerCommand('leftoff.openMenu', async () => {
      const config = vscode.workspace.getConfiguration('leftoff');
      const aiEnabled = config.get<boolean>('enableAiSummary', false);
      const providerId = config.get<ProviderId>('aiProvider', 'gemini');
      const providerLabel = getProviderDefinition(providerId).label;

      const items: (vscode.QuickPickItem & { action: string })[] = [
        { label: '$(comment) Add quick note', description: 'Why am I here? (Ctrl/Cmd+Alt+N)', action: 'leftoff.addNote' },
        { label: '$(watch) Show resume summary', description: 'View your last saved session', action: 'leftoff.showResume' },
        { label: '$(history) Browse past sessions', description: 'Pick from archived sessions', action: 'leftoff.showHistory' },
        {
          label: '$(sparkle) Setup AI provider',
          description: aiEnabled ? `Currently: ${providerLabel} (on)` : `Currently: off`,
          action: 'leftoff.setupAI'
        },
        { label: '$(trash) Clear saved session', description: '', action: 'leftoff.clearSession' },
        { label: '$(clear-all) Clear session history', description: '', action: 'leftoff.clearHistory' },
        { label: '$(key) Clear AI API key', description: `Removes the stored key for ${providerLabel}`, action: 'leftoff.clearApiKey' }
      ];

      const picked = await vscode.window.showQuickPick(items, { placeHolder: 'LeftOff — what do you want to do?' });
      if (picked) vscode.commands.executeCommand(picked.action);
    })
  );

  // --- Command: add a quick note, optionally tied to current file/line ---
  context.subscriptions.push(
    vscode.commands.registerCommand('leftoff.addNote', async () => {
      const text = await vscode.window.showInputBox({
        prompt: 'What are you doing / why? (this is what future-you will read)',
        placeHolder: 'e.g. Debugging auth bug — token refresh fails silently after 15 min'
      });
      if (!text) return;

      const editor = vscode.window.activeTextEditor;
      const note: QuickNote = {
        text,
        timestamp: Date.now(),
        file: editor ? vscode.workspace.asRelativePath(editor.document.uri, false) : undefined,
        line: editor ? editor.selection.active.line : undefined
      };

      await store.addNote(note);
      vscode.window.showInformationMessage('Note saved to LeftOff.');
    })
  );

  // --- Command: manually show the resume summary ---
  context.subscriptions.push(
    vscode.commands.registerCommand('leftoff.showResume', () => {
      const snapshot = store.get();
      if (!snapshot) {
        vscode.window.showInformationMessage('No saved session yet. Come back after your next session!');
        return;
      }
      openResumePanel(snapshot);
    })
  );

  // --- Command: browse and reopen a past session ---
  context.subscriptions.push(
    vscode.commands.registerCommand('leftoff.showHistory', async () => {
      const history = store.getHistory();
      if (!history.length) {
        vscode.window.showInformationMessage('No past sessions recorded yet — check back after a couple of restarts.');
        return;
      }

      const reasonLabel: Record<string, string> = {
        restart: '',
        idle: ' (returned from idle)',
        'branch-switch': ' (branch switch)'
      };

      const items = history.map((snap) => {
        const date = new Date(snap.savedAt);
        const lastNote = snap.notes[snap.notes.length - 1];
        const fileCount = snap.openFiles.length;
        const diffCount = snap.diffs.length;
        return {
          label: `$(history) ${date.toLocaleString()}${snap.branch ? ` — ${snap.branch}` : ''}${reasonLabel[snap.endedReason ?? 'restart']}`,
          description: lastNote ? lastNote.text : `${fileCount} file(s) open, ${diffCount} changed`,
          snapshot: snap
        };
      });

      const picked = await vscode.window.showQuickPick(items, {
        placeHolder: 'Select a past session to view',
        matchOnDescription: true
      });
      if (picked) openResumePanel(picked.snapshot, true);
    })
  );

  // --- Command: clear saved session ---
  context.subscriptions.push(
    vscode.commands.registerCommand('leftoff.clearSession', async () => {
      await store.clear();
      vscode.window.showInformationMessage('LeftOff session cleared.');
    })
  );

  // --- Command: clear session history ---
  context.subscriptions.push(
    vscode.commands.registerCommand('leftoff.clearHistory', async () => {
      await store.clearHistory();
      vscode.window.showInformationMessage('LeftOff session history cleared.');
    })
  );

  // --- Command: guided setup for the AI provider — no settings.json editing required ---
  context.subscriptions.push(
    vscode.commands.registerCommand('leftoff.setupAI', async () => {
      const providerPick = await vscode.window.showQuickPick(
        PROVIDERS.map((p) => ({
          label: p.label,
          description: p.requiresApiKey ? 'API key required' : 'No API key needed',
          detail: p.description,
          id: p.id
        })),
        { placeHolder: 'Choose an AI provider for session summaries' }
      );
      if (!providerPick) return;

      const def = getProviderDefinition(providerPick.id);
      const config = vscode.workspace.getConfiguration('leftoff');

      // API key (skip for local servers that don't need one).
      if (def.requiresApiKey) {
        const existingKey = await context.secrets.get(secretKeyFor(def.id));
        const key = await vscode.window.showInputBox({
          prompt: `Enter your ${def.label} API key`,
          placeHolder: existingKey ? 'Already set — paste a new key to replace it, or press Esc to keep it' : 'Paste your API key',
          password: true,
          ignoreFocusOut: true
        });
        if (key) {
          await context.secrets.store(secretKeyFor(def.id), key);
        } else if (!existingKey) {
          vscode.window.showWarningMessage("No API key entered — AI summaries won't work until one is set.");
        }
      }

      // Provider-specific extra fields.
      if (def.id === 'azure') {
        const baseUrl = await vscode.window.showInputBox({
          prompt: 'Azure OpenAI resource endpoint',
          placeHolder: 'https://your-resource.openai.azure.com',
          value: config.get<string>('azureBaseUrl', ''),
          ignoreFocusOut: true
        });
        if (baseUrl !== undefined) await config.update('azureBaseUrl', baseUrl, vscode.ConfigurationTarget.Global);

        const deployment = await vscode.window.showInputBox({
          prompt: 'Azure OpenAI deployment name',
          placeHolder: 'e.g. gpt-4o-mini-deployment',
          value: config.get<string>('azureDeployment', ''),
          ignoreFocusOut: true
        });
        if (deployment !== undefined) await config.update('azureDeployment', deployment, vscode.ConfigurationTarget.Global);

        const apiVersion = await vscode.window.showInputBox({
          prompt: 'Azure OpenAI API version',
          placeHolder: 'e.g. 2024-06-01',
          value: config.get<string>('azureApiVersion', '') || '2024-06-01',
          ignoreFocusOut: true
        });
        if (apiVersion !== undefined) await config.update('azureApiVersion', apiVersion, vscode.ConfigurationTarget.Global);
      } else if (def.id === 'local') {
        const baseUrl = await vscode.window.showInputBox({
          prompt: 'Local server URL (OpenAI-compatible /chat/completions endpoint base)',
          placeHolder: 'http://localhost:11434/v1',
          value: config.get<string>('localBaseUrl', '') || 'http://localhost:11434/v1',
          ignoreFocusOut: true
        });
        if (baseUrl !== undefined) await config.update('localBaseUrl', baseUrl, vscode.ConfigurationTarget.Global);
      }

      // Model override (optional — blank means "use the provider's default").
      const model = await vscode.window.showInputBox({
        prompt: `Model name (leave blank to use the default: ${def.defaultModel || "(required — enter your deployment's base model if needed)"})`,
        placeHolder: def.defaultModel,
        value: config.get<string>('aiModel', ''),
        ignoreFocusOut: true
      });
      if (model !== undefined) await config.update('aiModel', model, vscode.ConfigurationTarget.Global);

      await config.update('aiProvider', def.id, vscode.ConfigurationTarget.Global);
      await config.update('enableAiSummary', true, vscode.ConfigurationTarget.Global);

      vscode.window.showInformationMessage(`LeftOff: AI summaries are now on, using ${def.label}.`);
    })
  );

  // --- Command: clear the API key for whichever provider is currently configured ---
  context.subscriptions.push(
    vscode.commands.registerCommand('leftoff.clearApiKey', async () => {
      const providerId = vscode.workspace.getConfiguration('leftoff').get<ProviderId>('aiProvider', 'gemini');
      await context.secrets.delete(secretKeyFor(providerId));
      vscode.window.showInformationMessage(`LeftOff: cleared the stored API key for ${getProviderDefinition(providerId).label}.`);
    })
  );

  // --- Autosave snapshot on relevant events, preserving existing notes ---
  // Diff capture now calls into the Git extension per changed file, so we debounce
  // frequent events (cursor movement) but persist immediately on "stepping away" signals.
  const persistNow = async () => {
    const existing = store.get();
    const snapshot = await captureSession(existing?.notes ?? []);

    // Branch-switch session boundary: if the branch changed since the last capture,
    // treat the previous branch's work as a finished session rather than letting it
    // blur into the new branch's notes/diffs.
    const config = vscode.workspace.getConfiguration('leftoff');
    const detectBranchSwitch = config.get<boolean>('detectBranchSwitch', true);
    if (detectBranchSwitch && existing?.branch && snapshot.branch && existing.branch !== snapshot.branch) {
      const oldSnapshot = existing;
      await store.archiveToHistory(oldSnapshot, 'branch-switch');
      const freshSnapshot = await captureSession([]); // start the new branch with no carried-over notes
      await store.save(freshSnapshot);
      vscode.window
        .showInformationMessage(
          `LeftOff: archived your session on "${oldSnapshot.branch}" — now tracking "${snapshot.branch}".`,
          'View archived session'
        )
        .then((choice) => {
          if (choice === 'View archived session') openResumePanel({ ...oldSnapshot, endedReason: 'branch-switch' }, true);
        });
      return;
    }

    await store.save(snapshot);
  };

  let debounceHandle: ReturnType<typeof setTimeout> | undefined;
  const DEBOUNCE_MS = 2000;
  const persistDebounced = () => {
    if (debounceHandle) clearTimeout(debounceHandle);
    debounceHandle = setTimeout(() => {
      debounceHandle = undefined;
      persistNow();
    }, DEBOUNCE_MS);
  };

  // Frequent, low-signal events: debounce.
  context.subscriptions.push(vscode.window.onDidChangeTextEditorSelection(() => persistDebounced()));

  // Meaningful, infrequent events: persist right away (also flushes any pending debounce).
  const persistImmediate = () => {
    if (debounceHandle) {
      clearTimeout(debounceHandle);
      debounceHandle = undefined;
    }
    persistNow();
  };
  context.subscriptions.push(vscode.window.tabGroups.onDidChangeTabs(() => persistImmediate()));
  context.subscriptions.push(vscode.window.onDidChangeActiveTextEditor(() => persistImmediate()));

  // Idle-return session boundary: if the window was unfocused for at least the configured
  // threshold, treat regaining focus as "welcome back" — archive what was there before the
  // idle gap and show the resume panel, same as a fresh editor restart would.
  let blurredAt: number | undefined;
  context.subscriptions.push(
    vscode.window.onDidChangeWindowState(async (state) => {
      if (!state.focused) {
        blurredAt = Date.now();
        persistImmediate();
        return;
      }

      if (blurredAt === undefined) return;
      const awayMs = Date.now() - blurredAt;
      blurredAt = undefined;

      const idleThresholdMin = vscode.workspace.getConfiguration('leftoff').get<number>('idleThresholdMinutes', 30);
      if (idleThresholdMin <= 0 || awayMs < idleThresholdMin * 60000) return;

      const justSaved = store.get();
      if (!justSaved || (!justSaved.openFiles.length && !justSaved.notes.length && !justSaved.diffs.length)) return;

      await store.archiveToHistory(justSaved, 'idle');
      await store.clear(); // next capture starts a clean session, mirroring what happens on restart
      openResumePanel(justSaved);
    })
  );
}

export function deactivate() {
  // Final save happens via onDidChangeWindowState/tabGroups listeners during the session;
  // VS Code does not guarantee async work completes here, so we avoid relying on deactivate().
}
