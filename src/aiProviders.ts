import * as vscode from 'vscode';
import { SessionSnapshot } from './sessionStore';

export type ProviderId = 'gemini' | 'openai' | 'anthropic' | 'azure' | 'local';

export interface ProviderDefinition {
  id: ProviderId;
  label: string;
  description: string;
  requiresApiKey: boolean;
  defaultModel: string;
}

// Gemini listed first — it has a genuinely free tier, good default for people who don't want to pay.
export const PROVIDERS: ProviderDefinition[] = [
  {
    id: 'gemini',
    label: 'Google Gemini',
    description: 'Free tier available at ai.google.dev — good default if you don\'t want to pay for anything.',
    requiresApiKey: true,
    defaultModel: 'gemini-2.0-flash'
  },
  {
    id: 'local',
    label: 'Local LLM (Ollama, LM Studio, etc.)',
    description: 'Any OpenAI-compatible local server. No API key, no cost, nothing leaves your machine.',
    requiresApiKey: false,
    defaultModel: 'llama3.1'
  },
  {
    id: 'openai',
    label: 'OpenAI',
    description: 'GPT models via api.openai.com.',
    requiresApiKey: true,
    defaultModel: 'gpt-4o-mini'
  },
  {
    id: 'anthropic',
    label: 'Anthropic',
    description: 'Claude models via api.anthropic.com.',
    requiresApiKey: true,
    defaultModel: 'claude-haiku-4-5-20251001'
  },
  {
    id: 'azure',
    label: 'Azure OpenAI',
    description: 'Your own Azure OpenAI resource and deployment.',
    requiresApiKey: true,
    defaultModel: ''
  }
];

export function getProviderDefinition(id: ProviderId): ProviderDefinition {
  return PROVIDERS.find((p) => p.id === id) ?? PROVIDERS[0];
}

export interface AiProviderSettings {
  provider: ProviderId;
  apiKey?: string;          // not required for 'local'
  model: string;
  baseUrl?: string;         // 'local': server URL. 'azure': resource endpoint.
  azureDeployment?: string;
  azureApiVersion?: string;
}

export interface AiSummaryResult {
  summary: string;
}

export class AiSummaryError extends Error {}

const MAX_TOKENS = 300;

// Default caps on how much we send — overridable via leftoff.ai* settings.
const DEFAULT_MAX_DIFF_FILES_IN_PROMPT = 8;
const DEFAULT_MAX_SNIPPET_CHARS_IN_PROMPT = 800;
const DEFAULT_MAX_NOTES_IN_PROMPT = 10;

interface PromptCaps {
  maxDiffFiles: number;
  maxSnippetChars: number;
  maxNotes: number;
}

function getPromptCaps(): PromptCaps {
  const config = vscode.workspace.getConfiguration('leftoff');
  return {
    maxDiffFiles: config.get<number>('aiMaxDiffFiles', DEFAULT_MAX_DIFF_FILES_IN_PROMPT),
    maxSnippetChars: config.get<number>('aiMaxSnippetChars', DEFAULT_MAX_SNIPPET_CHARS_IN_PROMPT),
    maxNotes: config.get<number>('aiMaxNotes', DEFAULT_MAX_NOTES_IN_PROMPT)
  };
}

function buildPrompt(snapshot: SessionSnapshot, caps: PromptCaps): string {
  const lines: string[] = [];

  if (snapshot.branch) lines.push(`Git branch: ${snapshot.branch}`);

  const activeFile = snapshot.openFiles.find((f) => f.isActive) ?? snapshot.openFiles[0];
  if (activeFile) {
    lines.push(`Last active file: ${activeFile.path} (cursor at line ${activeFile.cursor.line + 1})`);
  }
  if (snapshot.openFiles.length) {
    lines.push(`All open files: ${snapshot.openFiles.map((f) => f.path).join(', ')}`);
  }

  if (snapshot.notes.length) {
    lines.push('', 'Developer notes (chronological, oldest first):');
    for (const note of snapshot.notes.slice(-caps.maxNotes)) {
      const loc = note.file ? ` [${note.file}${note.line !== undefined ? ':' + (note.line + 1) : ''}]` : '';
      lines.push(`- ${note.text}${loc}`);
    }
  }

  if (snapshot.diffs.length) {
    lines.push('', 'Uncommitted changes:');
    for (const d of snapshot.diffs.slice(0, caps.maxDiffFiles)) {
      lines.push(`\n### ${d.path} (${d.status}, +${d.insertions}/-${d.deletions})`);
      if (d.snippet) {
        lines.push(d.snippet.slice(0, caps.maxSnippetChars));
      }
    }
    if (snapshot.diffs.length > caps.maxDiffFiles) {
      lines.push(`\n...and ${snapshot.diffs.length - caps.maxDiffFiles} more changed file(s), not shown.`);
    }
  }

  return lines.join('\n');
}

const SYSTEM_PROMPT =
  'You help a developer resume work after time away from a project. ' +
  'You will be given their last open files, any notes they left themselves, and their uncommitted git diffs. ' +
  'Write a summary in at most 3 short sentences: (1) what they were doing / working on, ' +
  '(2) a likely concrete next step, based only on the evidence given. ' +
  'Be specific and reference actual file names or function/variable names you see in the diffs when useful. ' +
  'If the evidence is thin, say so plainly rather than inventing detail. ' +
  'Do not use markdown headers or bullet lists — plain prose only. Do not add a preamble like "Here is a summary".';

async function safeFetchJson(url: string, init: RequestInit, providerLabel: string): Promise<any> {
  let response: Response;
  try {
    response = await fetch(url, init);
  } catch (err: any) {
    throw new AiSummaryError(`Network error calling ${providerLabel}: ${err?.message ?? err}. If this is a local server, make sure it's running and reachable.`);
  }

  if (!response.ok) {
    let detail = '';
    try {
      const body = await response.json();
      detail = body?.error?.message ?? body?.message ?? JSON.stringify(body).slice(0, 300);
    } catch {
      /* ignore parse failure, fall back to status text */
    }
    throw new AiSummaryError(`${providerLabel} returned ${response.status} ${response.statusText}${detail ? `: ${detail}` : ''}`);
  }

  try {
    return await response.json();
  } catch (err: any) {
    throw new AiSummaryError(`Could not parse ${providerLabel} response: ${err?.message ?? err}`);
  }
}

// --- Anthropic Messages API ---
async function callAnthropic(settings: AiProviderSettings, userContent: string): Promise<string> {
  const data = await safeFetchJson(
    'https://api.anthropic.com/v1/messages',
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': settings.apiKey ?? '',
        'anthropic-version': '2023-06-01'
      },
      body: JSON.stringify({
        model: settings.model,
        max_tokens: MAX_TOKENS,
        system: SYSTEM_PROMPT,
        messages: [{ role: 'user', content: userContent }]
      })
    },
    'Anthropic'
  );
  const textBlock = (data.content ?? []).find((b: any) => b.type === 'text');
  if (!textBlock?.text) throw new AiSummaryError('Anthropic response contained no text content.');
  return textBlock.text.trim();
}

// --- OpenAI-compatible Chat Completions API (OpenAI itself, and any local server exposing the same shape) ---
async function callOpenAiCompatible(baseUrl: string, apiKey: string, model: string, userContent: string, providerLabel: string): Promise<string> {
  const url = `${baseUrl.replace(/\/+$/, '')}/chat/completions`;
  const data = await safeFetchJson(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${apiKey}`
      },
      body: JSON.stringify({
        model,
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ]
      })
    },
    providerLabel
  );
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AiSummaryError(`${providerLabel} response contained no message content.`);
  return String(text).trim();
}

// --- Azure OpenAI (same request/response shape as OpenAI, different URL + auth header) ---
async function callAzureOpenAi(settings: AiProviderSettings, userContent: string): Promise<string> {
  if (!settings.baseUrl) throw new AiSummaryError('Azure OpenAI endpoint URL is not set. Run "LeftOff: Setup AI Provider" to configure it.');
  if (!settings.azureDeployment) throw new AiSummaryError('Azure OpenAI deployment name is not set. Run "LeftOff: Setup AI Provider" to configure it.');

  const apiVersion = settings.azureApiVersion || '2024-06-01';
  const url = `${settings.baseUrl.replace(/\/+$/, '')}/openai/deployments/${settings.azureDeployment}/chat/completions?api-version=${apiVersion}`;

  const data = await safeFetchJson(
    url,
    {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'api-key': settings.apiKey ?? ''
      },
      body: JSON.stringify({
        max_tokens: MAX_TOKENS,
        messages: [
          { role: 'system', content: SYSTEM_PROMPT },
          { role: 'user', content: userContent }
        ]
      })
    },
    'Azure OpenAI'
  );
  const text = data.choices?.[0]?.message?.content;
  if (!text) throw new AiSummaryError('Azure OpenAI response contained no message content.');
  return String(text).trim();
}

// --- Google Gemini (generateContent API) ---
async function callGemini(settings: AiProviderSettings, userContent: string): Promise<string> {
  const model = settings.model || 'gemini-2.0-flash';
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(model)}:generateContent?key=${encodeURIComponent(settings.apiKey ?? '')}`;

  const data = await safeFetchJson(
    url,
    {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        contents: [{ role: 'user', parts: [{ text: userContent }] }],
        systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
        generationConfig: { maxOutputTokens: MAX_TOKENS }
      })
    },
    'Google Gemini'
  );
  const text = data.candidates?.[0]?.content?.parts?.map((p: any) => p.text ?? '').join('');
  if (!text) throw new AiSummaryError('Gemini response contained no text content.');
  return String(text).trim();
}

/**
 * Generates a short "what you were doing / likely next step" summary from a session
 * snapshot, using whichever provider the person configured. Requires Node's global
 * `fetch` (available in the VS Code extension host on recent versions).
 */
export async function generateAiSummary(settings: AiProviderSettings, snapshot: SessionSnapshot): Promise<AiSummaryResult> {
  if (!snapshot.notes.length && !snapshot.diffs.length && !snapshot.openFiles.length) {
    throw new AiSummaryError('Nothing to summarize.');
  }

  const userContent = buildPrompt(snapshot, getPromptCaps());

  switch (settings.provider) {
    case 'anthropic':
      return { summary: await callAnthropic(settings, userContent) };
    case 'openai':
      return { summary: await callOpenAiCompatible('https://api.openai.com/v1', settings.apiKey ?? '', settings.model, userContent, 'OpenAI') };
    case 'local':
      return {
        summary: await callOpenAiCompatible(
          settings.baseUrl || 'http://localhost:11434/v1',
          settings.apiKey || 'not-needed',
          settings.model,
          userContent,
          'Local LLM server'
        )
      };
    case 'azure':
      return { summary: await callAzureOpenAi(settings, userContent) };
    case 'gemini':
      return { summary: await callGemini(settings, userContent) };
    default:
      throw new AiSummaryError(`Unknown AI provider: ${settings.provider}`);
  }
}
