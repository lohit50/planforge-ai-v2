// api.js — NVIDIA NIM API client + Key rotation + Jina search
import { NVIDIA_BASE, JINA_KEY } from './config.js';

// ─────────────────────────────────────────────────────────────────
// KeyRotator — smart round-robin that skips rate-limited keys
// ─────────────────────────────────────────────────────────────────
export class KeyRotator {
  constructor(keys) {
    this.keys = [...keys];
    this.idx = 0;
    this.cooldowns = {}; // key → timestamp when available again
  }

  next() {
    const now = Date.now();
    const avail = this.keys.filter(
      (k) => !this.cooldowns[k] || this.cooldowns[k] < now
    );
    if (!avail.length) {
      const soonest = Math.min(...Object.values(this.cooldowns));
      throw { code: 'ALL_KEYS_LIMITED', waitMs: soonest - now };
    }
    const key = avail[this.idx++ % avail.length];
    return key;
  }

  markLimited(key, retryAfterMs = 62000) {
    this.cooldowns[key] = Date.now() + retryAfterMs;
  }

  availableCount() {
    const now = Date.now();
    return this.keys.filter(
      (k) => !this.cooldowns[k] || this.cooldowns[k] < now
    ).length;
  }

  totalCount() {
    return this.keys.length;
  }
}

// ─────────────────────────────────────────────────────────────────
// callNvidiaStream — streaming SSE request to NVIDIA NIM
// ─────────────────────────────────────────────────────────────────
export async function callNvidiaStream(
  key,
  model,
  messages,
  maxTokens = 8192,
  onChunk,
  onDone,
  onError,
  signal = null
) {
  let response;
  try {
    response = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: true,
        temperature: 0.7,
        top_p: 0.95,
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError && onError({ code: 'NETWORK_ERROR', message: err.message });
    return;
  }

  if (response.status === 429) {
    onError && onError({ code: 'RATE_LIMITED' });
    return;
  }
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    onError && onError({ code: 'API_ERROR', status: response.status, message: text });
    return;
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop(); // keep incomplete line

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;
        const data = trimmed.slice(6);
        if (data === '[DONE]') {
          onDone && onDone();
          return;
        }
        try {
          const parsed = JSON.parse(data);
          const text = parsed?.choices?.[0]?.delta?.content;
          if (text) onChunk && onChunk(text);
        } catch {
          // skip malformed chunk
        }
      }
    }
    onDone && onDone();
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError && onError({ code: 'STREAM_ERROR', message: err.message });
  }
}

// ─────────────────────────────────────────────────────────────────
// callNvidiaNonStream — blocking single response
// ─────────────────────────────────────────────────────────────────
export async function callNvidiaNonStream(
  key,
  model,
  messages,
  maxTokens = 4096,
  signal = null
) {
  let response;
  try {
    response = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${key}`,
      },
      body: JSON.stringify({
        model,
        messages,
        max_tokens: maxTokens,
        stream: false,
        temperature: 0.4,
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') throw { code: 'ABORTED' };
    throw { code: 'NETWORK_ERROR', message: err.message };
  }

  if (response.status === 429) throw { code: 'RATE_LIMITED' };
  if (!response.ok) {
    const text = await response.text().catch(() => '');
    throw { code: 'API_ERROR', status: response.status, message: text };
  }

  const data = await response.json();
  return data?.choices?.[0]?.message?.content || '';
}

// ─────────────────────────────────────────────────────────────────
// retryWithFallback — tries primary model, then fallbacks
// ─────────────────────────────────────────────────────────────────
export async function retryWithFallback(rotator, primaryModel, fallbackModels, messages, maxTokens = 4096) {
  const models = [primaryModel, ...fallbackModels];
  let lastErr;
  for (const model of models) {
    try {
      const key = rotator.next();
      return await callNvidiaNonStream(key, model, messages, maxTokens);
    } catch (err) {
      lastErr = err;
      if (err.code === 'RATE_LIMITED') {
        // continue to next model/key
        continue;
      }
      // For non-rate-limit errors, try next model anyway
    }
  }
  throw lastErr || new Error('All models failed');
}

// ─────────────────────────────────────────────────────────────────
// jinaSearch — free web search via Jina AI
// ─────────────────────────────────────────────────────────────────
export async function jinaSearch(query) {
  try {
    const resp = await fetch(`/api/jina-s/${encodeURIComponent(query)}`, {
      headers: {
        Accept: 'text/plain',
        ...(JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}` } : {}),
      },
    });
    if (!resp.ok) return '';
    const text = await resp.text();
    return text.slice(0, 2500);
  } catch {
    return '';
  }
}

// ─────────────────────────────────────────────────────────────────
// jinaFetch — URL reader via Jina AI
// ─────────────────────────────────────────────────────────────────
export async function jinaFetch(targetUrl) {
  try {
    const resp = await fetch(`/api/jina-r/${targetUrl}`, {
      headers: {
        Accept: 'text/plain',
        ...(JINA_KEY ? { Authorization: `Bearer ${JINA_KEY}` } : {}),
      },
    });
    if (!resp.ok) return '';
    const text = await resp.text();
    return text.slice(0, 2500);
  } catch {
    return '';
  }
}
