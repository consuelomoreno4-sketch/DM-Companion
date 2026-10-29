// Conexión con la API de Anthropic (Claude) desde la tablet, sin servidor intermedio.
// La clave de API la pone el usuario y se guarda solo en este dispositivo (IndexedDB, clave 'ai').
// Se usa para: descripciones de escena (Ambientación) y la revisión de notas de sesión (Campaña).

import { kvGet, kvSet } from './db.js';

const API_URL = 'https://api.anthropic.com/v1/messages';
const API_VERSION = '2026-10-21';

// Modelos que se pueden elegir (precio en USD por millón de tokens: entrada / salida).
export const MODELS = [
  { id: 'claude-opus-5-5', name: 'Claude Opus 5.5', input: 4, output: 20, fallbacks: true },
  { id: 'claude-sonnet-5-5', name: 'Claude Sonnet 5.5', input: 2, output: 10, fallbacks: true },
  { id: 'claude-haiku-5-5', name: 'Claude Haiku 5.5', input: 0.1, output: 0.5, fallbacks: false },
];
export const DEFAULT_MODEL = 'claude-opus-5-5';

// ---------- Ajustes ----------

let settings = null;

export async function loadAiSettings() {
  if (!settings) settings = { apiKey: '', model: DEFAULT_MODEL, ...((await kvGet('ai').catch(() => null)) || {}) };
  return settings;
}

export async function saveAiSettings(patch) {
  settings = { ...(await loadAiSettings()), ...patch };
  await kvSet('ai', settings);
  return settings;
}

export const hasKey = () => !!settings?.apiKey;
export const modelInfo = (id) => MODELS.find((m) => m.id === id) || MODELS[0];

// ---------- Errores ----------

// code: 'no-key' | 'offline' | 'auth' | 'rate' | 'overloaded' | 'bad-request' | 'refusal' | 'truncated' | 'server' | 'network'
export class AiError extends Error {
  constructor(code, detail = '') {
    super(detail || code);
    this.code = code;
    this.detail = detail;
  }
}

function errorFromStatus(status, detail) {
  if (status === 401 || status === 403) return new AiError('auth', detail);
  if (status === 429) return new AiError('rate', detail);
  if (status === 529 || status === 503) return new AiError('overloaded', detail);
  if (status === 400 || status === 404 || status === 413) return new AiError('bad-request', detail);
  return new AiError('server', detail);
}

// ---------- Llamada con streaming ----------

/**
 * Envía un mensaje a Claude y va devolviendo el texto a medida que llega.
 * onText(textoAcumulado) se llama con cada trozo. Devuelve { text, stopReason, usage, model }.
 * Lanza AiError si algo falla (incluida una negativa del modelo: código 'refusal').
 */
export async function streamMessage({ system, user, maxTokens = 16000, effort = 'medium', format = null, onText = () => {}, signal }) {
  const cfg = await loadAiSettings();
  if (!cfg.apiKey) throw new AiError('no-key');
  if (!navigator.onLine) throw new AiError('offline');
  const model = modelInfo(cfg.model);

  const body = {
    model: model.id,
    max_tokens: maxTokens,
    stream: true,
    system,
    messages: [{ role: 'user', content: user }],
    output_config: { effort, ...(format ? { format } : {}) },
  };
  const headers = {
    'content-type': 'application/json',
    'x-api-key': cfg.apiKey,
    'anthropic-version': API_VERSION,
    'anthropic-dangerous-direct-browser-access': 'true', // necesario para llamar desde el navegador
  };
  // Si el modelo rechaza la petición por sus filtros de seguridad, el servidor la reintenta solo con otro modelo.
  if (model.fallbacks) {
    body.fallbacks = 'default';
    headers['anthropic-beta'] = 'server-side-fallback-2026-07-01';
  }

  let res;
  try {
    res = await fetch(API_URL, { method: 'POST', headers, body: JSON.stringify(body), signal });
  } catch (err) {
    if (err.name === 'AbortError') throw err;
    throw new AiError(navigator.onLine ? 'network' : 'offline', err.message);
  }
  if (!res.ok) {
    let detail = '';
    try { detail = (await res.json())?.error?.message || ''; } catch { /* sin cuerpo JSON */ }
    throw errorFromStatus(res.status, detail);
  }

  // Lectura de los eventos (Server-Sent Events): bloques "event: …\ndata: {…}" separados por una línea en blanco.
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let text = '';
  let stopReason = null;
  let usedModel = model.id;
  const usage = { input_tokens: 0, output_tokens: 0 };

  const handle = (data) => {
    switch (data.type) {
      case 'message_start':
        usedModel = data.message?.model || usedModel;
        Object.assign(usage, data.message?.usage || {});
        break;
      case 'content_block_delta':
        if (data.delta?.type === 'text_delta') {
          text += data.delta.text;
          onText(text);
        }
        break;
      case 'message_delta':
        if (data.delta?.stop_reason) stopReason = data.delta.stop_reason;
        if (data.usage) Object.assign(usage, data.usage);
        break;
      case 'error':
        throw errorFromStatus(data.error?.type === 'overloaded_error' ? 529 : 500, data.error?.message || '');
      default:
        break;
    }
  };

  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let cut;
    while ((cut = buffer.indexOf('\n\n')) !== -1) {
      const chunk = buffer.slice(0, cut);
      buffer = buffer.slice(cut + 2);
      const dataLine = chunk.split('\n').filter((l) => l.startsWith('data:')).map((l) => l.slice(5).trim()).join('');
      if (dataLine) handle(JSON.parse(dataLine));
    }
  }

  if (stopReason === 'refusal') throw new AiError('refusal'); // se descarta el texto parcial
  if (stopReason === 'max_tokens') throw new AiError('truncated');
  return { text, stopReason, usage, model: usedModel };
}

// Costo aproximado en USD (el razonamiento interno del modelo cuenta como salida).
export function estimateCost(usage, modelId) {
  const m = modelInfo(modelId);
  const input = (usage.input_tokens || 0) + (usage.cache_creation_input_tokens || 0) + (usage.cache_read_input_tokens || 0);
  return (input * m.input + (usage.output_tokens || 0) * m.output) / 1e6;
}

// Prueba la clave con una petición mínima.
export async function testConnection() {
  const r = await streamMessage({ system: 'Reply with the single word OK.', user: 'Test', maxTokens: 2000, effort: 'low' });
  return r;
}

// ---------- Descripciones de escena ----------

export const SCENE_SYSTEM = `You are a co-Dungeon Master for a Dungeons & Dragons game (2024 rules). You write scene descriptions the Dungeon Master can use at the table.

- Use vivid, concrete sensory detail and a clear sense of place; avoid clichés and overwrought prose.
- Never decide what the player characters do, think or feel, and never resolve actions.
- Do not invent important plot facts (secrets, NPC motives, treasure). Small atmospheric details are fine.
- If campaign context is given, stay consistent with it.
- Plain text only: no title, no headings and no Markdown.`;

export function sceneUserPrompt({ scene, context, moods, senses, style, words, language }) {
  const lines = [`Scene: ${scene}`];
  if (context) lines.push(`Campaign context (from the DM's notes):\n${context}`);
  if (moods.length) lines.push(`Mood: ${moods.join(', ')}`);
  if (senses.length) lines.push(`Senses to emphasize: ${senses.join(', ')}`);
  lines.push(style === 'notes'
    ? 'Style: notes for the DM, as short lines that each start with "- " (what is there, what stands out, sounds and smells, one or two hooks for interaction).'
    : 'Style: read-aloud text addressed to the players in the second person plural, present tense, ending at a moment that invites them to act.');
  lines.push(`Length: about ${words} words.`);
  lines.push(`Write in ${language}.`);
  return lines.join('\n\n');
}

// ---------- Análisis de notas de sesión (Campaña) ----------

export const DIRECTIONS = ['north', 'northeast', 'east', 'southeast', 'south', 'southwest', 'west', 'northwest', 'near', 'inside'];

export const ANALYSIS_SYSTEM = `You help a Dungeon Master keep a campaign codex (a small database of characters, places, items and factions) for a Dungeons & Dragons campaign. You read the DM's notes from one game session, written quickly during play.

Return:

1. notes: only when the request asks for corrections. Fix spelling, grammar, punctuation and capitalization of each note and improve the wording so it reads clearly and concisely. Keep the meaning, the facts and the language each note is written in. Do not merge, split, add or remove notes. Keep proper names as written unless the codex shows the correct spelling. Return every note with its id; when a note needs no change, return its text unchanged. When corrections are not requested, return an empty list.

2. entities: every named character, place, item and faction that matters in this session, both new ones and ones already in the codex. For one already in the codex, set existing_id to its id; otherwise use an empty string. Give the name as it should be written, its kind, a short subtitle (who or what it is, in a few words), other names the notes use for it (including misspellings), and facts: one to four short sentences with what this session tells about it. Write subtitle and facts in the language of the notes. Base everything only on the notes; do not invent. Leave out the party as a whole, generic creatures without a name (for example "two wererats") and generic nouns.

3. relations: pairs of entities from your list that the notes connect (for example a leader and her gang, a character and the place where they live), with a label of two to five words in the language of the notes.

4. locations: for places in your list, where the notes say they are relative to another named place ("south of Conyberry", "inside the mountain"). Use the direction "near" when the notes only say they are close, and "inside" when one place is within the other. Only include what the notes say.`;

export const ANALYSIS_SCHEMA = {
  type: 'object',
  properties: {
    notes: {
      type: 'array',
      items: {
        type: 'object',
        properties: { id: { type: 'string' }, text: { type: 'string' } },
        required: ['id', 'text'],
        additionalProperties: false,
      },
    },
    entities: {
      type: 'array',
      items: {
        type: 'object',
        properties: {
          name: { type: 'string' },
          kind: { type: 'string', enum: ['character', 'place', 'item', 'faction'] },
          existing_id: { type: 'string' },
          subtitle: { type: 'string' },
          aliases: { type: 'array', items: { type: 'string' } },
          facts: { type: 'array', items: { type: 'string' } },
        },
        required: ['name', 'kind', 'existing_id', 'subtitle', 'aliases', 'facts'],
        additionalProperties: false,
      },
    },
    relations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { a: { type: 'string' }, b: { type: 'string' }, label: { type: 'string' } },
        required: ['a', 'b', 'label'],
        additionalProperties: false,
      },
    },
    locations: {
      type: 'array',
      items: {
        type: 'object',
        properties: { place: { type: 'string' }, near: { type: 'string' }, direction: { type: 'string', enum: DIRECTIONS } },
        required: ['place', 'near', 'direction'],
        additionalProperties: false,
      },
    },
  },
  required: ['notes', 'entities', 'relations', 'locations'],
  additionalProperties: false,
};

export function analysisUserPrompt(session, codex, { corrections }) {
  const notes = (session.notes || []).filter((n) => n.text?.trim()).map((n) => ({ id: n.id, depth: n.depth, text: n.text }));
  const entries = codex.map((c) => ({ id: c.id, name: c.name, kind: c.kind, aliases: c.aliases || [] }));
  return `Corrections: ${corrections ? 'yes' : 'no'}

Session ${session.number ?? ''}${session.date ? ` (${session.date})` : ''}${session.title ? `: ${session.title}` : ''}

Existing codex entries (JSON):
${JSON.stringify(entries)}

Notes in order (JSON; depth is the indentation level, a deeper note is a sub-point of the previous shallower one):
${JSON.stringify(notes)}`;
}

/** Analiza una sesión y devuelve el JSON del esquema. */
export async function analyzeSession(session, codex, { corrections = false, signal } = {}) {
  const r = await streamMessage({
    system: ANALYSIS_SYSTEM,
    user: analysisUserPrompt(session, codex, { corrections }),
    maxTokens: 32000,
    effort: 'medium',
    format: { type: 'json_schema', schema: ANALYSIS_SCHEMA },
    signal,
  });
  let data;
  try { data = JSON.parse(r.text); } catch { throw new AiError('bad-json'); }
  return { data, usage: r.usage, model: r.model };
}

// Costo aproximado antes de empezar: entrada ≈ texto / 3,5 (más instrucciones); salida ≈ 60 % de la entrada
// (o casi el doble con correcciones, que repiten cada nota), más el razonamiento del modelo.
export function estimateBefore(sessions, codexSize, modelId, { corrections }) {
  const m = modelInfo(modelId);
  let input = 0;
  let output = 0;
  for (const s of sessions) {
    const chars = (s.notes || []).reduce((n, x) => n + (x.text || '').length + 30, 0);
    const tin = 900 + codexSize * 25 + chars / 3.5;
    input += tin;
    output += 1500 + (chars / 3.5) * (corrections ? 1.6 : 0.6);
  }
  return (input * m.input + output * m.output) / 1e6;
}
