# PlanForge AI v2.0

> **AI-powered educational document generator** — Turn any topic, PDF, or image into a perfectly structured, professionally exported PDF, Word document, or Markdown file.

---

## 🚀 Quick Start

```bash
# 1. Install dependencies
npm install

# 2. Start dev server
npm run dev

# 3. Open http://localhost:5173
```

---

## ✨ Features

| Feature | Details |
|---------|---------|
| **Vision-capable Orchestrator** | Llama 4 Maverick reads uploaded images & PDFs to build chapter structure |
| **Dual Worker Generation** | Two NVIDIA Nemotron-120B workers generate content in parallel |
| **SimpleRAG** | Uploaded documents are chunked and injected as context — fully browser-based |
| **Smart Web Search** | Jina AI search only fires when orchestrator flags a topic as needing current info |
| **Enhancement Pass** | Qwen3.5-397B with Chain-of-Thought adds analogies, memory tricks, revision boxes |
| **4-Key Round-Robin** | 4 NVIDIA NIM keys → 160 RPM total; smart cooldown skips rate-limited keys |
| **Live Workflow Visualizer** | Real-time step progress + stats during generation |
| **3 Export Formats** | PDF (jsPDF), Word (.docx), Markdown (.md) |

---

## 📁 Project Structure

```
planforge-ai/
├── index.html              ← Entry HTML with CSP headers
├── vite.config.js          ← Vite config + security headers
├── package.json            ← Dependencies
├── .gitignore              ← Includes config.js (keys never committed)
├── README.md               ← This file
├── AI_HANDOVER.md          ← Full architecture for future AI context
└── src/
    ├── main.jsx            ← React entry (2 lines)
    ├── config.js           ← ⚠️ GITIGNORED — API keys & model IDs
    ├── App.jsx             ← Complete UI (~600 lines)
    ├── api.js              ← KeyRotator + NVIDIA API calls + Jina
    ├── useGenerator.js     ← 6-phase pipeline hook
    ├── exportUtils.js      ← PDF/Word/Markdown export
    └── docProcessor.js     ← PDF extraction + OCR + SimpleRAG
```

---

## 🔑 API Keys

Keys are stored in `src/config.js` (gitignored) and in `sessionStorage` at runtime.

**To update keys:**
1. Edit `src/config.js` — replace the `NVIDIA_KEYS` array values
2. Or update them live in the UI under "🔑 API Keys" section

**Get free NVIDIA NIM keys:** https://build.nvidia.com

---

## 🤖 AI Models Used

| Role | Model | Why |
|------|-------|-----|
| Orchestrator | `meta/llama-4-maverick-17b-128e-instruct` | Vision-capable, reads uploaded images/PDFs |
| Worker A & B | `nvidia/nemotron-3-super-120b-a12b` | 262K output tokens, 1M context — best text gen |
| Enhancement | `qwen/qwen3.5-397b-a17b` | Built-in Chain-of-Thought reasoning |
| VLM Fallback | `meta/llama-3.2-90b-vision-instruct` | Reliable vision backup |
| Text Fallback | `nvidia/llama-3.3-nemotron-super-49b-v1.5` | Reliable text backup |

> **Note:** NVIDIA NIM catalog updates frequently. If you get a 404 error, visit https://build.nvidia.com to verify current model IDs and update `src/config.js`.

---

## 🏗️ Generation Pipeline

```
Phase 0 → Upload Processing (PDF extraction + OCR + RAG chunking)
Phase 1 → Orchestrator AI (builds chapter/topic structure as JSON)
Phase 2 → User Review (edit chapters, choose split mode)
Phase 3 → Dual Worker Generation (parallel content creation)
Phase 4 → Content Merge (stitch by chapter order)
Phase 5 → Enhancement Pass (optional — Qwen CoT improves quality)
Phase 6 → Export (PDF / Word / Markdown)
```

---

## 📦 Dependencies

```bash
npm install jspdf jspdf-autotable docx file-saver pdfjs-dist tesseract.js
```

| Package | Purpose |
|---------|---------|
| `jspdf` | PDF generation with cover, TOC, and styled content |
| `jspdf-autotable` | Table support in PDFs |
| `docx` | Word document generation |
| `file-saver` | Browser file download |
| `pdfjs-dist` | Client-side PDF text extraction |
| `tesseract.js` | Client-side image OCR |

---

## 🔒 Security

- API keys stored in `sessionStorage` only — never `localStorage`, never committed
- Input sanitized: strips `<>{}` chars, max 500 chars on topic field
- File validation: max 5MB per file, max 3 files
- Generation cooldown: 30-second minimum between generations
- CSP headers in `index.html` (allows NVIDIA NIM, Jina, Tesseract workers)
- Security headers in `vite.config.js` (X-Frame-Options, X-Content-Type-Options, Referrer-Policy)

---

## 🛠️ Development

```bash
npm run dev      # Start dev server at localhost:5173
npm run build    # Production build → dist/
npm run preview  # Preview production build
```

---

## ⚠️ Known Limitations

1. **Tesseract.js** requires `blob:` and `worker-src blob:` in CSP — already configured
2. **pdfjs-dist** requires `workerSrc` pointing to CDN — already configured
3. All processing happens **in the browser** — no backend required
4. Large PDFs (>5MB) are rejected to avoid memory issues
5. If all 4 API keys hit rate limits simultaneously, generation pauses and retries after cooldown

---

*PlanForge AI v2.0 — Built for Dhanusiya*
