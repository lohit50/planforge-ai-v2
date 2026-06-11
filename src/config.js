// config.js — API keys come from environment variables (set in Vercel dashboard or .env.local for dev)
// For local dev: create .env.local and set VITE_* vars (see .env.example)

export const NVIDIA_KEYS = [
  import.meta.env.VITE_NVIDIA_KEY_1,
  import.meta.env.VITE_NVIDIA_KEY_2,
  import.meta.env.VITE_NVIDIA_KEY_3,
  import.meta.env.VITE_NVIDIA_KEY_4,
].filter(Boolean);

// ─── Model IDs ───
export const ORCHESTRATOR_MODEL = "meta/llama-4-maverick-17b-128e-instruct";
export const WORKER_MODEL       = "meta/llama-3.3-70b-instruct";
export const ENHANCER_MODEL     = "meta/llama-3.3-70b-instruct";
export const FALLBACK_VLM       = "meta/llama-3.2-90b-vision-instruct";
export const FALLBACK_TEXT      = "meta/llama-3.3-70b-instruct";
export const EMERGENCY_FALLBACK = "meta/llama-3.3-70b-instruct";

// ─── Unsplash ───
export const UNSPLASH_KEY = import.meta.env.VITE_UNSPLASH_KEY || "";

// ─── Jina AI ───
export const JINA_KEY = import.meta.env.VITE_JINA_KEY || "";

// ─── Google Sheets Logging ───
export const SHEETS_WEBHOOK = import.meta.env.VITE_SHEETS_WEBHOOK || "";

// ─── API Base — same path works in both dev (Vite proxy) and prod (Vercel rewrites) ───
export const NVIDIA_BASE = "/api/nvidia";
