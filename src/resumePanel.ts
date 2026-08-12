import * as vscode from 'vscode';
import { SessionSnapshot } from './sessionStore';

function timeAgo(ts: number): string {
  const diffMs = Date.now() - ts;
  const mins = Math.round(diffMs / 60000);
  if (mins < 1) return 'just now';
  if (mins < 60) return `${mins} min ago`;
  const hours = Math.round(mins / 60);
  if (hours < 24) return `${hours} hr${hours === 1 ? '' : 's'} ago`;
  const days = Math.round(hours / 24);
  return `${days} day${days === 1 ? '' : 's'} ago`;
}

function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

/**
 * Turns a raw unified-diff snippet into per-line colorized HTML.
 * Text-color only (no backgrounds) to stay safe across VS Code themes and
 * avoid relying on newer CSS features like color-mix() for translucent highlights.
 */
function renderDiffLines(snippet: string): string {
  return snippet
    .split('\n')
    .map((line) => {
      let cls = 'diff-context';
      if (line.startsWith('+++') || line.startsWith('---') || line.startsWith('diff --git') || line.startsWith('index ')) {
        cls = 'diff-meta';
      } else if (line.startsWith('@@')) {
        cls = 'diff-hunk';
      } else if (line.startsWith('+')) {
        cls = 'diff-add';
      } else if (line.startsWith('-')) {
        cls = 'diff-del';
      }
      return `<span class="${cls}">${escapeHtml(line) || ' '}</span>`;
    })
    .join('\n');
}

export function showResumePanel(
  context: vscode.ExtensionContext,
  snapshot: SessionSnapshot,
  aiSummaryPending: boolean = false,
  isHistorical: boolean = false
): vscode.WebviewPanel {
  const panel = vscode.window.createWebviewPanel(
    'leftoffResume',
    isHistorical ? `Session — ${new Date(snapshot.savedAt).toLocaleDateString()}` : 'Welcome back 👋',
    vscode.ViewColumn.Active,
    { enableScripts: true }
  );

  const activeFile = snapshot.openFiles.find((f) => f.isActive) ?? snapshot.openFiles[0];
  const lastNote = snapshot.notes[snapshot.notes.length - 1];

  const filesHtml = snapshot.openFiles
    .map(
      (f) => `
      <li class="${f.isActive ? 'active' : ''}">
        <span class="path">${escapeHtml(f.path)}</span>
        <span class="cursor">line ${f.cursor.line + 1}</span>
      </li>`
    )
    .join('');

  const notesHtml = snapshot.notes.length
    ? snapshot.notes
        .slice()
        .reverse()
        .map(
          (n) => `
        <li>
          <div class="note-text">${escapeHtml(n.text)}</div>
          <div class="note-meta">${n.file ? escapeHtml(n.file) + (n.line !== undefined ? `:${n.line + 1}` : '') + ' · ' : ''}${timeAgo(n.timestamp)}</div>
        </li>`
        )
        .join('')
    : '<li class="empty">No notes left last session. Press Ctrl+Alt+N (Cmd+Alt+N on Mac) next time to leave one for future-you.</li>';

  const terminalsHtml = snapshot.terminals.length
    ? snapshot.terminals.map((t) => `<li>${escapeHtml(t.name)}</li>`).join('')
    : '<li class="empty">No terminals were open.</li>';

  const statusLabel: Record<string, string> = {
    modified: 'M',
    added: 'A',
    deleted: 'D',
    renamed: 'R',
    untracked: 'U',
    other: '?'
  };

  const diffsHtml = snapshot.diffs.length
    ? snapshot.diffs
        .map((d) => {
          const stats =
            d.insertions || d.deletions
              ? `<span class="diff-stats"><span class="ins">+${d.insertions}</span> <span class="del">-${d.deletions}</span></span>`
              : '';
          const snippetHtml = d.snippet
            ? `<details>
                 <summary>show diff${d.truncated ? ' (truncated)' : ''}</summary>
                 <pre class="diff-snippet">${renderDiffLines(d.snippet)}</pre>
               </details>`
            : '';
          return `
          <li class="diff-item">
            <div class="diff-row">
              <span class="status-badge status-${d.status}">${statusLabel[d.status] ?? '?'}</span>
              <span class="path">${escapeHtml(d.path)}</span>
              ${stats}
            </div>
            ${snippetHtml}
          </li>`;
        })
        .join('')
    : '<li class="empty">No uncommitted changes.</li>';

  panel.webview.html = `<!DOCTYPE html>
  <html>
  <head>
    <meta charset="UTF-8">
    <style>
      body {
        font-family: var(--vscode-font-family);
        color: var(--vscode-foreground);
        padding: 24px 32px;
        max-width: 720px;
      }
      h1 { font-size: 1.4em; margin-bottom: 4px; }
      .subtitle { color: var(--vscode-descriptionForeground); margin-bottom: 24px; }
      .headline {
        background: var(--vscode-textBlockQuote-background);
        border-left: 4px solid var(--vscode-textLink-foreground);
        padding: 12px 16px;
        margin-bottom: 24px;
        border-radius: 4px;
      }
      .headline b { color: var(--vscode-textLink-foreground); }
      section { margin-bottom: 20px; }
      h2 {
        font-size: 0.85em;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--vscode-descriptionForeground);
        margin-bottom: 8px;
      }
      ul { list-style: none; padding: 0; margin: 0; }
      li {
        padding: 6px 10px;
        border-radius: 4px;
        display: flex;
        justify-content: space-between;
        font-size: 0.95em;
      }
      li.active { background: var(--vscode-list-activeSelectionBackground); }
      li.empty { color: var(--vscode-descriptionForeground); font-style: italic; }
      .path { font-family: var(--vscode-editor-font-family); }
      .cursor { color: var(--vscode-descriptionForeground); font-size: 0.85em; }
      .note-text { font-weight: 500; }
      .note-meta { color: var(--vscode-descriptionForeground); font-size: 0.8em; margin-top: 2px; }

      li.diff-item { display: block; }
      .diff-row { display: flex; align-items: center; gap: 8px; }
      .status-badge {
        display: inline-block;
        width: 16px;
        height: 16px;
        line-height: 16px;
        text-align: center;
        border-radius: 3px;
        font-size: 0.75em;
        font-weight: 600;
        flex-shrink: 0;
      }
      .status-modified { background: var(--vscode-gitDecoration-modifiedResourceForeground); color: var(--vscode-editor-background); }
      .status-added, .status-untracked { background: var(--vscode-gitDecoration-addedResourceForeground); color: var(--vscode-editor-background); }
      .status-deleted { background: var(--vscode-gitDecoration-deletedResourceForeground); color: var(--vscode-editor-background); }
      .status-renamed, .status-other { background: var(--vscode-gitDecoration-renamedResourceForeground); color: var(--vscode-editor-background); }
      .diff-stats { margin-left: auto; font-size: 0.8em; font-family: var(--vscode-editor-font-family); }
      .ins { color: var(--vscode-gitDecoration-addedResourceForeground); }
      .del { color: var(--vscode-gitDecoration-deletedResourceForeground); }
      .diff-stats .del { margin-left: 4px; }
      details { margin: 4px 0 8px 24px; }
      summary { cursor: pointer; font-size: 0.8em; color: var(--vscode-textLink-foreground); }
      .diff-snippet {
        background: var(--vscode-textCodeBlock-background);
        padding: 8px 10px;
        border-radius: 4px;
        font-family: var(--vscode-editor-font-family);
        font-size: 0.82em;
        overflow-x: auto;
        white-space: pre;
        margin-top: 4px;
      }
      .diff-snippet .diff-add { color: var(--vscode-gitDecoration-addedResourceForeground); }
      .diff-snippet .diff-del { color: var(--vscode-gitDecoration-deletedResourceForeground); }
      .diff-snippet .diff-hunk { color: var(--vscode-textLink-foreground); }
      .diff-snippet .diff-meta { color: var(--vscode-descriptionForeground); }
      .diff-snippet .diff-context { color: var(--vscode-foreground); opacity: 0.75; }
      .ai-summary {
        background: var(--vscode-editorWidget-background);
        border: 1px solid var(--vscode-widget-border, var(--vscode-panel-border));
        border-radius: 4px;
        padding: 12px 16px;
        margin-bottom: 20px;
        font-size: 0.95em;
      }
      .ai-summary .ai-label {
        font-size: 0.75em;
        text-transform: uppercase;
        letter-spacing: 0.06em;
        color: var(--vscode-textLink-foreground);
        margin-bottom: 6px;
        display: flex;
        align-items: center;
        gap: 6px;
      }
      .ai-summary .ai-text { color: var(--vscode-foreground); }
      .ai-summary .ai-text.error { color: var(--vscode-errorForeground); font-style: italic; }
      .ai-regen-btn {
        margin-left: auto;
        background: none;
        border: 1px solid var(--vscode-button-border, var(--vscode-widget-border, transparent));
        color: var(--vscode-textLink-foreground);
        font-size: 0.85em;
        padding: 1px 8px;
        border-radius: 3px;
        cursor: pointer;
      }
      .ai-regen-btn:hover { background: var(--vscode-toolbar-hoverBackground); }
      .spinner {
        display: inline-block;
        width: 10px;
        height: 10px;
        border: 2px solid var(--vscode-textLink-foreground);
        border-top-color: transparent;
        border-radius: 50%;
        animation: spin 0.8s linear infinite;
      }
      @keyframes spin { to { transform: rotate(360deg); } }
    </style>
  </head>
  <body>
    <h1>${isHistorical ? 'Past session' : 'Welcome back 👋'}</h1>
    <div class="subtitle">${isHistorical ? 'Saved' : 'Last session saved'} ${timeAgo(snapshot.savedAt)}${snapshot.branch ? ` on branch <b>${escapeHtml(snapshot.branch)}</b>` : ''}</div>

    ${
      aiSummaryPending
        ? `<div class="ai-summary" id="ai-summary-box">
            <div class="ai-label">
              <span class="spinner" id="ai-spinner"></span>
              <span>AI summary</span>
              <button class="ai-regen-btn" id="ai-regen-btn" style="display:none;">Regenerate</button>
            </div>
            <div class="ai-text" id="ai-summary-text">Generating...</div>
          </div>`
        : ''
    }

    ${(() => {
      const totalIns = snapshot.diffs.reduce((s, d) => s + d.insertions, 0);
      const totalDel = snapshot.diffs.reduce((s, d) => s + d.deletions, 0);
      const hasDiffLine = snapshot.diffs.length > 0;
      if (!activeFile && !lastNote && !hasDiffLine) return '';
      return `<div class="headline">
        ${activeFile ? `You were last working in <b>${escapeHtml(activeFile.path)}</b> around line ${activeFile.cursor.line + 1}.<br/>` : ''}
        ${
          hasDiffLine
            ? `You had <b>${snapshot.diffs.length}</b> file${snapshot.diffs.length === 1 ? '' : 's'} with uncommitted changes (<span class="ins">+${totalIns}</span> / <span class="del">-${totalDel}</span>).<br/>`
            : ''
        }
        ${lastNote ? `Your last note: <b>${escapeHtml(lastNote.text)}</b>` : ''}
      </div>`;
    })()}

    <section>
      <h2>Uncommitted Changes (${snapshot.diffs.length})</h2>
      <ul>${diffsHtml}</ul>
    </section>

    <section>
      <h2>Open Files (${snapshot.openFiles.length})</h2>
      <ul>${filesHtml || '<li class="empty">None recorded.</li>'}</ul>
    </section>

    <section>
      <h2>Notes</h2>
      <ul>${notesHtml}</ul>
    </section>

    <section>
      <h2>Terminals</h2>
      <ul>${terminalsHtml}</ul>
    </section>

    <script>
      const vscodeApi = acquireVsCodeApi();

      const box = document.getElementById('ai-summary-box');
      const textEl = document.getElementById('ai-summary-text');
      const spinnerEl = document.getElementById('ai-spinner');
      const regenBtn = document.getElementById('ai-regen-btn');

      window.addEventListener('message', (event) => {
        const msg = event.data;
        if (msg.type !== 'aiSummary' || !box || !textEl) return;

        if (msg.status === 'done') {
          textEl.textContent = msg.text;
          textEl.classList.remove('error');
        } else if (msg.status === 'error') {
          textEl.textContent = msg.text || 'Could not generate a summary.';
          textEl.classList.add('error');
        }

        if (spinnerEl) spinnerEl.style.display = 'none';
        if (regenBtn) regenBtn.style.display = 'inline-block';
      });

      if (regenBtn) {
        regenBtn.addEventListener('click', () => {
          regenBtn.style.display = 'none';
          if (spinnerEl) spinnerEl.style.display = 'inline-block';
          if (textEl) {
            textEl.textContent = 'Regenerating...';
            textEl.classList.remove('error');
          }
          vscodeApi.postMessage({ command: 'regenerateAiSummary' });
        });
      }
    </script>
  </body>
  </html>`;

  return panel;
}
