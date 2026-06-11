# AI Handover Document — PlanForge AI v2.0

> **For future AI assistants:** This document provides complete context to continue development of PlanForge AI without reading all source files. Start here.

---

## What This App Does

PlanForge AI is a **browser-only** React + Vite application that:
1. Takes a topic string and/or uploaded PDFs/images as input
2. Uses NVIDIA NIM AI APIs to generate a complete educational document
3. Exports the result as PDF, Word (.docx), or Markdown

No backend. All AI calls go directly from the browser to `https://integrate.api.nvidia.com/v1`.

---

## File Map (6 source files)

| File | Lines | Purpose |
|------|-------|---------|
| `src/config.js` | ~20 | NVIDIA API keys + model ID constants |
| `src/api.js` | ~150 | KeyRotator class + NVIDIA stream/non-stream + Jina search |
| `src/docProcessor.js` | ~130 | PDF text extraction + OCR + SimpleRAG chunking |
| `src/useGenerator.js` | ~300 | React hook — full 6-phase pipeline |
| `src/exportUtils.js` | ~350 | jsPDF PDF builder + docx + markdown |
| `src/App.jsx` | ~600 | Complete UI — all components inline |

---

## Phase Architecture

### Phase 0 — Document Processing
- `processAllUploads(files)` in `docProcessor.js`
- PDFs → `pdfjs-dist` → text string → `chunkText(text, 400)` → string[]
- Images → `tesseract.js` → text string → `chunkText(text, 400)` → string[]
- All chunks stored in `chunksRef.current` in the hook

### Phase 1 — Orchestration
- `callNvidiaNonStream(key, ORCHESTRATOR_MODEL, messages, 4096)` in `api.js`
- Model: `meta/llama-4-maverick-17b-128e-instruct`
- Input: user topic + RAG context (top 10 chunks) + settings
- Output: JSON `{ title, chapters: [{ id, name, topics: [{ id, name, subtopics, needs_web_search, web_query }] }] }`
- JSON parsing: strips markdown fences, extracts with regex `/{[\s\S]*}/`

### Phase 2 — User Review
- `gen.setChapters()` triggers re-render of `TopicReviewPanel` component
- Users can edit chapter/topic names inline, add/remove topics, choose split mode

### Phase 3 — Dual Worker Generation
- Two concurrent `workerFn()` calls in `Promise.allSettled()`
- **Chapter-based split (default):** Worker A = first half of chapters, Worker B = second half
- **Content-type split:** Worker A generates theory/concepts, Worker B generates examples for ALL chapters
- Per topic: `buildRAGContext()` → optional `jinaSearch()` → `buildWorkerPrompt()` → `callNvidiaStream()`
- Model: `nvidia/nemotron-3-super-120b-a12b`, maxTokens: 8192
- On 429: `rotator.markLimited(key)` → retry with next available key (up to 3 attempts) → fallback model

### Phase 4 — Merge
- Sort `resultsRef.current` by original chapter order
- Content-type mode: interleave theory + examples per topic ID

### Phase 5 — Enhancement (Optional)
- Per-chapter `callNvidiaStream()` with `ENHANCER_MODEL` = `qwen/qwen3.5-397b-a17b`
- Prompt: asks model to add analogies, mnemonics, "Common Mistakes" box, "Quick Revision" box

### Phase 6 — Export
- `exportToPDF()` in `exportUtils.js` — jsPDF, cover page + TOC + chapter pages
- `exportToWord()` — docx library with heading hierarchy
- `exportToMarkdown()` — Blob download

---

## Key Data Structures

### `chapters` array (from orchestrator)
```javascript
[{
  id: 1,                    // number
  name: "Chapter Name",     // string, user-editable
  topics: [{
    id: "1.1",              // string
    name: "Topic Name",     // string, user-editable
    subtopics: ["sub1"],    // string[]
    needs_web_search: false, // boolean
    web_query: "string"     // used for jinaSearch()
  }]
}]
```

### `results` array (from workers)
```javascript
[{
  id: "1.1",               // matches topic.id
  chapterId: 1,            // matches chapter.id
  chapterName: "string",   // for display/export
  topicName: "string",     // for display
  content: "## markdown...", // full generated markdown
  sectionType: null        // "theory"|"examples"|null (content_type mode only)
}]
```

### `stats` object
```javascript
{
  pagesGenerated: 0,     // estimated from content.length / 3000
  chaptersComplete: 0,   // unique chapterIds in results
  topicsWritten: 0,      // results.length
  imagesProcessed: 0,    // from processAllUploads
  pdfsProcessed: 0,      // from processAllUploads
  workersActive: 0|1|2,  // 2 during generation
  estCompletionSec: 0,   // calculated from elapsed time + remaining topics
  totalTopics: 0         // from chapters
}
```

---

## KeyRotator Logic

```javascript
// In api.js
class KeyRotator {
  next()              // returns next available key (skips rate-limited)
  markLimited(key)    // cooldown = now + 62000ms
  availableCount()    // keys not in cooldown
}
```

Workers call `rotator.markLimited(usedKey)` on 429 responses. If ALL keys are limited, `rotator.next()` throws `{ code: 'ALL_KEYS_LIMITED' }` — worker retries after 3s delay.

---

## SimpleRAG Algorithm

No vectors, no FAISS. Pure keyword matching:
```javascript
// docProcessor.js
scoreChunk(chunk, query):
  qWords = query words with length > 3
  score = count of qWords found in chunk (case-insensitive)

retrieveChunks(chunks, query, topK=4):
  return top K chunks by score, filtered to score > 0
```

Used in workers: `buildRAGContext(chunks, topicName, subtopics)` → formatted string injected into prompt.

---

## Prompt Templates

### Orchestrator prompt (Phase 1)
- Located in `useGenerator.js` → `buildOrchestratorPrompt()`
- Returns ONLY JSON — no markdown fences
- Length rules: Short=5-8ch, Medium=8-12ch, Long=12-18ch, Comprehensive=18-25ch

### Worker prompt (Phase 3)
- Located in `useGenerator.js` → `buildWorkerPrompt()`
- Generates markdown with `## TopicName`, `### Introduction`, `### Core Concepts`, etc.
- Ends with `---TOPIC_END---` marker
- Supports `sectionTypes` param for content_type split mode

### Enhancement prompt (Phase 5)
- Located in `useGenerator.js` → `buildEnhancementPrompt()`
- Asks for: analogies, mnemonics, "Common Mistakes", "Quick Revision" box, clearer wording
- Returns enhanced version only, ends with `---SECTION_END---`

---

## UI Component Map (all in App.jsx)

| Component | What it renders |
|-----------|----------------|
| `App` | Root — holds all state, layout grid |
| `Badge` | Purple pill label |
| `StepCircle` | Numbered purple circle (1, 2, 3) |
| `Toggle` | iOS-style toggle switch |
| `DropZone` | Drag-and-drop file upload area |
| `WorkflowVisualizer` | Live step checklist + stats grid |
| `TopicReviewPanel` | Editable chapter/topic list (Phase 2) |
| `ExportSection` | 3 export buttons + "coming soon" card |

---

## Things That Break (and fixes)

| Issue | Cause | Fix |
|-------|-------|-----|
| PDF export corrupt | jsPDF `addPage()` before content | Don't call `addPage()` before first page |
| Tesseract fails | Missing `blob:` in CSP | Already in index.html — don't remove it |
| Orchestrator returns non-JSON | Model preamble before JSON | `raw.match(/{[\s\S]*}/)` extracts it |
| 404 on model ID | NVIDIA catalog updated | Check build.nvidia.com, update config.js |
| Preview not scrolling | Fixed height without overflow | `preview-scroll` class sets overflow-y:auto |
| Keys not rotating | `rotatorRef.current` cached | `resetKeys()` creates new `KeyRotator` instance |

---

## What's Not Built Yet (v3 ideas)

1. **Quiz Generator** — "Test Yourself" tab after generation (UI placeholder exists)
2. **True vector RAG** — Replace keyword scoring with embeddings (needs backend or WASM FAISS)
3. **Tavily search** — Better web search; input field exists in UI but not wired
4. **Image generation** — ASCII diagram descriptions → actual diagrams
5. **Session persistence** — Save/resume generated documents
6. **Streaming PDF preview** — Render pages as they generate, not just text
7. **Multi-language output** — Prompt language detection + response in same language

---

## How to Continue Development

1. Start a conversation with this file + the source file you're modifying
2. The 6-file structure is intentional — resist splitting into more components unless App.jsx exceeds ~800 lines
3. All AI prompts are in `useGenerator.js` — they're the most impactful thing to tune
4. `exportUtils.js`'s `parseMarkdownToSegments()` is the weakest link — it handles basic markdown only
5. To add a new export format: add a function to `exportUtils.js` and a button to `ExportSection` in `App.jsx`

---

*v2.0 — June 2026 | PlanForge AI by Dhanusiya*
