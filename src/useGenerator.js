// useGenerator.js — Complete 6-phase pipeline React hook
import { useState, useRef, useCallback } from 'react';
import {
  KeyRotator,
  callNvidiaStream,
  callNvidiaNonStream,
  jinaSearch,
} from './api.js';
import {
  processAllUploads,
  buildRAGContext,
} from './docProcessor.js';
import {
  NVIDIA_KEYS,
  ORCHESTRATOR_MODEL,
  WORKER_MODEL,
  FALLBACK_VLM,
  FALLBACK_TEXT,
  EMERGENCY_FALLBACK,
} from './config.js';

// ── Key sanitizing — drop blank/partial entries, fall back to config ──
function sanitizeKeys(keys) {
  const valid = (keys || [])
    .map((k) => (k || '').trim())
    .filter((k) => k.startsWith('nvapi-'));
  return valid.length ? valid : NVIDIA_KEYS;
}

// ── Workflow steps definition ────────────────────────────────────
export const WORKFLOW_STEPS = [
  { id: 'pdf_extract',  label: 'Extracting PDF text',           phase: 0 },
  { id: 'ocr',          label: 'Running OCR on images',          phase: 0 },
  { id: 'rag_build',    label: 'Building knowledge base',        phase: 0 },
  { id: 'orchestrate',  label: 'Orchestrator AI planning',       phase: 1 },
  { id: 'split',        label: 'Dispatching to 4 agents',        phase: 1 },
  { id: 'worker_a',     label: 'Agent 1 — generating content',   phase: 3 },
  { id: 'worker_b',     label: 'Agent 2 — generating content',   phase: 3 },
  { id: 'worker_c',     label: 'Agent 3 — generating content',   phase: 3 },
  { id: 'worker_d',     label: 'Agent 4 — generating content',   phase: 3 },
  { id: 'merge',        label: 'Merging content',                phase: 4 },
  { id: 'pdf_build',    label: 'Building final document',        phase: 6 },
  { id: 'done',         label: 'Export ready!',                  phase: 6 },
];

function initStepStatuses() {
  return WORKFLOW_STEPS.reduce((acc, s) => ({ ...acc, [s.id]: 'pending' }), {});
}

function estimatePages(content = '') {
  return Math.max(1, Math.round(content.length / 3000));
}

// ── Prompt builders ──────────────────────────────────────────────
function buildOrchestratorPrompt(topic, outputType, options, ragContext, customTopics = '') {
  const { depth = 'Detailed', audience = 'Student', length = 'Medium' } = options;
  const lengthMap = {
    'Short (~20pp)': '5-8 chapters, 2-3 topics each',
    'Medium (~40pp)': '8-12 chapters, 3-4 topics each',
    'Long (~60pp)': '12-18 chapters, 4-5 topics each',
    'Comprehensive (~100pp)': '18-25 chapters, 5-6 topics each',
    Short: '5-8 chapters, 2-3 topics each',
    Medium: '8-12 chapters, 3-4 topics each',
    Long: '12-18 chapters, 4-5 topics each',
    Comprehensive: '18-25 chapters, 5-6 topics each',
  };
  const structureRule = lengthMap[length] || '8-12 chapters, 3-4 topics each';

  const customSection = customTopics.trim()
    ? `\nUSER'S REQUIRED TOPICS (you MUST include and organize content around exactly these topics):\n${customTopics.trim()}\n`
    : '';

  return `You are an expert curriculum architect. Analyze the following and create a detailed chapter structure.

USER TOPIC: ${topic}
OUTPUT TYPE: ${outputType}
DEPTH: ${depth}
TARGET AUDIENCE: ${audience}
CONTENT LENGTH: ${length}
${customSection}
${ragContext ? ragContext : ''}

Create a logical learning structure. Respond with ONLY valid JSON, no markdown code fences, no extra text.

Structure: {"title":"Full document title","split_suggestion":"chapter","chapters":[{"id":1,"name":"Chapter Name","topics":[{"id":"1.1","name":"Topic Name","subtopics":["subtopic1","subtopic2"],"needs_web_search":false,"web_query":"topic name tutorial"}]}]}

Rules:
- Structure: ${structureRule}
- Make chapter names specific to the actual topic
- Set needs_web_search: true ONLY for: current events, latest tech (post-2023), recent releases
- For standard educational content: needs_web_search: false
- Return ONLY the JSON object, no other text`;
}

const FORMAT_RULES = `
MANDATORY FORMATTING — follow EXACTLY or the PDF will be broken:

EQUATIONS — wrap ALL math in single dollar signs: $expression$
  Example: $E = mc^2$, $dH = -890 kJ/mol$, $pH = -log[H+]$
  NEVER write math as plain text.

CHEMISTRY (CRITICAL — ASCII only, no Unicode subscripts or special symbols):
  Arrows: use -> (hyphen then greater-than), NEVER use !' or the arrow symbol or =>
    Correct: CH4 + 2O2 -> CO2 + 2H2O
    Wrong:   CH4 + 2O2 !' CO2 + 2H2O
  Subscripts: write as plain inline number, NO underscore, NO Unicode subscripts
    Correct: CH4  CO2  H2O  NH3  H2SO4  C2H4  NH4Cl
    Wrong:   CH_4  CH₄  C_(2)H_(4)  NH_{4}
  Delta: write as lowercase d — dH, dG, dS, dHf
    Correct: dH = -890 kJ/mol
    Wrong:   DeltaH  Delta H  dH  "DeltaH"

CALLOUT BLOCKS (keep content SHORT, no headings inside):
  :::definition
  [2-3 plain sentences only, no ### headings inside]
  :::

  :::example
  [numbered steps only, no ### headings]
  :::

  :::keypoint
  [3-5 bullet points max]
  :::

  :::note
  [1-2 sentences only]
  :::

  RULES for callouts:
  - NEVER create an empty ::: block
  - NEVER put ### headings inside a ::: block
  - NEVER use :::warning (removed from system)
  - Keep total content inside a block under 6 lines

DIAGRAMS (only when a real process/flow exists, max 1 per topic):
  :::mermaid
  graph TD
    A[Short label] --> B[Short label]
  :::
  Rules: max 8 nodes, labels under 20 chars, ASCII only in labels, no Unicode.
  Skip the mermaid block entirely if no clear flowchart exists — do NOT force it.

TABLES: | Col1 | Col2 |\\n|---|---|\\n| data | data |
`;

function buildWorkerPrompt(chapterName, topicName, subtopics, outputType, options, ragContext, webContext, sectionTypes) {
  const { depth = 'Detailed', audience = 'Student' } = options;
  const wordTarget = {
    Basic: 600, Detailed: 1200, Expert: 2000
  }[depth] || 1200;

  const sectionsToGenerate = sectionTypes
    ? sectionTypes.map(s => `### ${s}\n[Write comprehensive content for ${s}]`).join('\n\n')
    : `### Introduction
[2-3 paragraph overview explaining why this topic matters]

### Core Concepts
[Detailed explanation covering: ${subtopics.join(', ')}]

:::definition
[Define the most important term in this topic]
:::

### Worked Examples
[2-3 detailed examples with step-by-step walkthrough]

:::example
[Write one complete worked example with all steps]
:::

### Key Takeaways
:::keypoint
[3-5 most important points to remember from this topic]
:::`;

  return `You are creating professional ${outputType} for a ${audience} audience.
Depth: ${depth} | Target: ~${wordTarget} words for this topic section.

CHAPTER: ${chapterName}
TOPIC: ${topicName}
SUBTOPICS TO COVER: ${subtopics.join(', ')}

${ragContext || ''}${webContext ? `\nLATEST WEB CONTEXT:\n${webContext}\n` : ''}

${FORMAT_RULES}

Generate comprehensive educational content using this exact markdown structure:

## ${topicName}

${sectionsToGenerate}

---TOPIC_END---

Be thorough. Target ~${wordTarget} words. Do not truncate content.`;
}


// ── Main hook ────────────────────────────────────────────────────
export function useGenerator() {
  const [phase, setPhase] = useState(0);
  const [stepStatuses, setStepStatuses] = useState(initStepStatuses);
  const [chapters, setChapters] = useState([]);
  const [results, setResults] = useState([]);
  const [stats, setStats] = useState({
    pagesGenerated: 0,
    chaptersComplete: 0,
    topicsWritten: 0,
    imagesProcessed: 0,
    pdfsProcessed: 0,
    workersActive: 0,
    estCompletionSec: 0,
    totalTopics: 0,
  });
  const [previewContent, setPreviewContent] = useState('');
  const [previewLabel, setPreviewLabel] = useState('');
  const [workerPreviews, setWorkerPreviews] = useState(['', '', '', '']);
  const [workerStats, setWorkerStats] = useState([
    { total: 0, done: 0 }, { total: 0, done: 0 },
    { total: 0, done: 0 }, { total: 0, done: 0 },
  ]);
  const [error, setError] = useState(null);

  const chunksRef = useRef([]);
  const rotatorRef = useRef(null);
  const abortRef = useRef(null);
  const startTimeRef = useRef(null);
  const resultsRef = useRef([]);
  const statsRef = useRef(stats);
  const workerAccRef = useRef(['', '', '', '']);
  const previewFlushRef = useRef(null);

  const updateStats = useCallback((patch) => {
    setStats((prev) => {
      const next = { ...prev, ...patch };
      statsRef.current = next;
      return next;
    });
  }, []);

  const setStep = useCallback((id, status) => {
    setStepStatuses((prev) => ({ ...prev, [id]: status }));
  }, []);

  // ── Init rotator ─────────────────────────────────────────────
  const getRotator = useCallback(() => {
    if (!rotatorRef.current) {
      // Try sessionStorage overrides first, else config
      let keys = NVIDIA_KEYS;
      try {
        const stored = sessionStorage.getItem('pf_keys');
        if (stored) keys = JSON.parse(stored);
      } catch {
        // corrupt storage — fall back to config keys
      }
      rotatorRef.current = new KeyRotator(sanitizeKeys(keys));
    }
    return rotatorRef.current;
  }, []);

  // ── processUploads ────────────────────────────────────────────
  const processUploads = useCallback(async (files) => {
    if (!files || files.length === 0) return { chunks: [], filesSummary: '' };

    const hasPDFs = files.some((f) => f.type === 'application/pdf' || f.name.endsWith('.pdf'));
    const hasImages = files.some((f) => f.type.startsWith('image/'));

    if (hasPDFs) setStep('pdf_extract', 'active');
    if (hasImages) setStep('ocr', 'active');

    try {
      const result = await processAllUploads(files, (progress) => {
        if (progress.type === 'ocr_progress') {
          setStep('ocr', 'active');
        }
      });

      chunksRef.current = result.chunks;
      if (hasPDFs) setStep('pdf_extract', 'done');
      if (hasImages) setStep('ocr', 'done');
      setStep('rag_build', 'active');

      await new Promise((r) => setTimeout(r, 300));
      setStep('rag_build', 'done');

      updateStats({
        pdfsProcessed: result.pdfsProcessed,
        imagesProcessed: result.imagesProcessed,
      });

      return result;
    } catch (err) {
      setStep('pdf_extract', 'error');
      setStep('ocr', 'error');
      throw err;
    }
  }, [setStep, updateStats]);

  // ── orchestrate ───────────────────────────────────────────────
  const orchestrate = useCallback(async (topic, outputType, options, uploadedChunks, customTopics = '') => {
    if (uploadedChunks) chunksRef.current = uploadedChunks;
    setStep('orchestrate', 'active');
    setPhase(1);
    setError(null);

    try {
      const rotator = getRotator();
      const ragContext = buildRAGContext(
        chunksRef.current,
        topic,
        [outputType]
      );

      const prompt = buildOrchestratorPrompt(topic, outputType, options, ragContext, customTopics);
      const messages = [{ role: 'user', content: prompt }];

      let raw = '';
      const models = [ORCHESTRATOR_MODEL, FALLBACK_VLM, FALLBACK_TEXT, EMERGENCY_FALLBACK];

      for (const model of models) {
        try {
          const key = rotator.next();
          raw = await callNvidiaNonStream(key, model, messages, 7000);
          if (raw) break;
        } catch (err) {
          if (err.code === 'RATE_LIMITED') {
            rotator.markLimited(rotator.keys?.[0] || '');
            continue;
          }
          continue;
        }
      }

      if (!raw) throw new Error('Orchestrator returned empty response');

      // Strip markdown fences and parse JSON
      let jsonStr = raw
        .replace(/```json\s*/gi, '')
        .replace(/```\s*/gi, '')
        .trim();

      // Extract JSON object
      const jsonMatch = jsonStr.match(/\{[\s\S]*\}/);
      if (!jsonMatch) throw new Error('No valid JSON in orchestrator response');
      jsonStr = jsonMatch[0]
        .replace(/,\s*([}\]])/g, '$1')   // trailing commas
        .replace(/[\x00-\x1F\x7F]/g, (c) => c === '\n' || c === '\r' || c === '\t' ? c : ''); // stray control chars

      let parsed;
      try {
        parsed = JSON.parse(jsonStr);
      } catch {
        // Last-resort: extract with a more permissive approach
        const titlesMatch = jsonStr.match(/"title"\s*:\s*"([^"]+)"/);
        const chapMatches = [...jsonStr.matchAll(/"name"\s*:\s*"([^"]+)"/g)];
        if (!chapMatches.length) throw new Error('Could not parse orchestrator JSON');
        parsed = {
          title: titlesMatch?.[1] || 'Document',
          chapters: chapMatches.slice(1).map((m, i) => ({
            id: i + 1, name: m[1], topics: []
          })),
        };
      }
      if (!parsed.chapters || !Array.isArray(parsed.chapters)) {
        throw new Error('Invalid structure: missing chapters array');
      }

      // Normalize — handle string topics, wrong keys, and missing topics
      parsed.chapters = parsed.chapters.map((ch, ci) => {
        const rawTopics = ch.topics || ch.subtopics || ch.sections || ch.content || ch.items || [];
        const topics = (Array.isArray(rawTopics) ? rawTopics : []).map((t, ti) => {
          if (typeof t === 'string') {
            return {
              id: `${ci + 1}.${ti + 1}`,
              name: t,
              subtopics: [],
              needs_web_search: false,
              web_query: `${t} comprehensive guide`,
            };
          }
          return {
            ...t,
            id: t.id ?? `${ci + 1}.${ti + 1}`,
            subtopics: t.subtopics || [],
            needs_web_search: t.needs_web_search || false,
            web_query: t.web_query || `${t.name || ch.name} comprehensive guide`,
          };
        });
        return { ...ch, id: ch.id ?? ci + 1, topics };
      });

      // If all chapters have 0 topics the AI returned a flat structure — retry
      const totalTopics = parsed.chapters.reduce((s, c) => s + c.topics.length, 0);
      if (totalTopics === 0) {
        throw new Error('Orchestrator returned chapters with no topics — retrying');
      }

      setChapters(parsed.chapters);
      setStep('orchestrate', 'done');
      setPhase(2);

      return parsed;
    } catch (err) {
      setStep('orchestrate', 'error');
      setError(`Orchestration failed: ${err.message}`);
      throw err;
    }
  }, [setStep, getRotator]);

  // ── generate ──────────────────────────────────────────────────
  const generate = useCallback(async (
    splitMode = 'chapter',
    webSearchEnabled = false,
    options = {}
  ) => {
    setPhase(3);
    setResults([]);
    resultsRef.current = [];
    workerAccRef.current = ['', '', '', ''];
    setWorkerPreviews(['', '', '', '']);
    setWorkerStats([{ total: 0, done: 0 }, { total: 0, done: 0 }, { total: 0, done: 0 }, { total: 0, done: 0 }]);
    setError(null);
    startTimeRef.current = Date.now();
    abortRef.current = new AbortController();

    const rotator = getRotator();
    const allKeys = rotator.keys; // one dedicated key per worker
    const numWorkers = Math.min(4, allKeys.length);
    const chaptersToUse = chapters;

    // Max tokens based on depth — was hardcoded 8192 (very slow), now capped
    const depthTokens = { Basic: 1200, Detailed: 2200, Expert: 3500 }[options.depth] || 2200;

    // Count total topics
    const allTopics = chaptersToUse.flatMap((ch) =>
      ch.topics.map((t) => ({ ...t, chapterId: ch.id, chapterName: ch.name }))
    );
    const totalTopics = allTopics.length;
    updateStats({ totalTopics, workersActive: numWorkers });

    // Distribute topics evenly across numWorkers — round-robin by topic (max ±1 difference)
    const workerWork = Array.from({ length: numWorkers }, (_, i) => {
      if (splitMode === 'chapter') {
        // Round-robin by topic index (not chapter) for even distribution
        return allTopics
          .filter((_, ti) => ti % numWorkers === i)
          .map((t) => ({ ...t, sectionTypes: null }));
      } else {
        // Slice topics evenly
        const slice = Math.ceil(allTopics.length / numWorkers);
        return allTopics.slice(i * slice, (i + 1) * slice).map((t) => ({
          ...t,
          sectionTypes: i < numWorkers / 2
            ? ['Introduction', 'Core Concepts', 'Definitions', 'Key Takeaways']
            : ['Worked Examples', 'Real-World Applications', 'Practice Questions'],
        }));
      }
    });

    const workerIds = ['worker_a', 'worker_b', 'worker_c', 'worker_d'].slice(0, numWorkers);
    setStep('split', 'done');
    workerIds.forEach((id) => setStep(id, 'active'));
    setWorkerStats(workerWork.map((w) => ({ total: w.length, done: 0 })));

    // Flush preview state every 120ms to avoid re-render on every token
    previewFlushRef.current = setInterval(() => {
      setWorkerPreviews([...workerAccRef.current]);
    }, 120);

    // ── Worker function ─────────────────────────────────────────
    const workerFn = async (work, workerIdx) => {
      const dedicatedKey = allKeys[workerIdx];
      const workerLabel = `Agent ${workerIdx + 1}`;

      for (const task of work) {
        if (abortRef.current?.signal.aborted) break;

        const ragContext = buildRAGContext(chunksRef.current, task.name, task.subtopics || []);

        let webContext = '';
        if (webSearchEnabled && task.needs_web_search) {
          webContext = await jinaSearch(task.web_query || task.name);
        }

        const prompt = buildWorkerPrompt(
          task.chapterName, task.name, task.subtopics || [],
          options.outputType || 'Study Material', options,
          ragContext, webContext, task.sectionTypes
        );

        const messages = [{ role: 'user', content: prompt }];
        let accumulated = '';

        // Reset this worker's preview for the new topic
        workerAccRef.current[workerIdx] = `▶ ${workerLabel}: ${task.chapterName} — ${task.name}\n\n`;

        await new Promise((resolve) => {
          let attempts = 0;
          const maxAttempts = 3;

          const tryStream = async () => {
            attempts++;
            await callNvidiaStream(
              dedicatedKey,
              WORKER_MODEL,
              messages,
              depthTokens,
              (chunk) => {
                accumulated += chunk;
                workerAccRef.current[workerIdx] =
                  `▶ ${workerLabel}: ${task.chapterName} — ${task.name}\n\n` + accumulated;
              },
              () => {
                const resultEntry = {
                  id: task.id,
                  chapterId: task.chapterId,
                  chapterName: task.chapterName,
                  topicName: task.name,
                  content: accumulated,
                  sectionType: task.sectionTypes
                    ? (workerIdx < numWorkers / 2 ? 'theory' : 'examples')
                    : null,
                };

                resultsRef.current = [...resultsRef.current, resultEntry];
                setResults([...resultsRef.current]);

                const elapsed = (Date.now() - startTimeRef.current) / 1000;
                const done = resultsRef.current.length;
                const remaining = totalTopics - done;
                const avgSecs = elapsed / Math.max(done, 1);
                const est = Math.round((remaining / numWorkers) * avgSecs);
                const chapsDone = new Set(resultsRef.current.map((r) => r.chapterId)).size;
                updateStats({
                  topicsWritten: done,
                  pagesGenerated: resultsRef.current.reduce((a, r) => a + estimatePages(r.content), 0),
                  chaptersComplete: chapsDone,
                  estCompletionSec: est,
                });

                setWorkerStats((prev) => {
                  const next = [...prev];
                  next[workerIdx] = { ...next[workerIdx], done: (next[workerIdx]?.done || 0) + 1 };
                  return next;
                });

                resolve();
              },
              (err) => {
                if (err.code === 'RATE_LIMITED' && attempts < maxAttempts) {
                  setTimeout(tryStream, 3000);
                } else {
                  // Skip this topic on repeated failure
                  resolve();
                }
              },
              abortRef.current?.signal
            );
          };

          tryStream();
        });
      }

      // Mark worker done in its preview
      workerAccRef.current[workerIdx] = `✓ ${workerLabel} complete`;
    };

    // Run all workers in parallel
    await Promise.allSettled(
      workerWork.map((work, idx) => workerFn(work, idx))
    );

    clearInterval(previewFlushRef.current);
    setWorkerPreviews([...workerAccRef.current]);
    updateStats({ workersActive: 0 });
    workerIds.forEach((id) => setStep(id, 'done'));
    // compat: also mark unused worker steps as done so visualizer is clean
    ['worker_a', 'worker_b', 'worker_c', 'worker_d']
      .filter((id) => !workerIds.includes(id))
      .forEach((id) => setStep(id, 'done'));

    // ── Merge ──────────────────────────────────────────────────
    setStep('merge', 'active');
    await new Promise((r) => setTimeout(r, 500));

    let mergedResults = [...resultsRef.current];

    if (splitMode === 'content_type') {
      // Interleave theory + examples per topic
      const theoryMap = {};
      const examplesMap = {};
      mergedResults.forEach((r) => {
        if (r.sectionType === 'theory') theoryMap[r.id] = r;
        else if (r.sectionType === 'examples') examplesMap[r.id] = r;
      });

      mergedResults = allTopics.map((t) => {
        const theory = theoryMap[t.id];
        const examples = examplesMap[t.id];
        if (theory && examples) {
          return {
            ...theory,
            content: (theory.content || '') + '\n\n' + (examples.content || ''),
            sectionType: null,
          };
        }
        return theory || examples || { id: t.id, chapterId: t.chapterId, chapterName: t.chapterName, topicName: t.name, content: '' };
      });
    }

    // Sort by original chapter order
    mergedResults.sort((a, b) => {
      const ai = chaptersToUse.findIndex((c) => c.id === a.chapterId);
      const bi = chaptersToUse.findIndex((c) => c.id === b.chapterId);
      return ai - bi;
    });

    setResults(mergedResults);
    resultsRef.current = mergedResults;
    setStep('merge', 'done');

    // ── Done ───────────────────────────────────────────────────
    setStep('pdf_build', 'done');
    setStep('done', 'done');
    setPhase(6);
    updateStats({ workersActive: 0 });
    setPreviewLabel('✓ Generation complete!');

  }, [chapters, setStep, updateStats, getRotator]);

  // ── cancel ────────────────────────────────────────────────────
  const cancel = useCallback(() => {
    abortRef.current?.abort();
    clearInterval(previewFlushRef.current);
    setPhase(0);
    setStepStatuses(initStepStatuses());
    setWorkerPreviews(['', '', '', '']);
    workerAccRef.current = ['', '', '', ''];
    setError(null);
  }, []);

  // ── resetKeys ─────────────────────────────────────────────────
  const resetKeys = useCallback((keys) => {
    sessionStorage.setItem('pf_keys', JSON.stringify(keys));
    rotatorRef.current = new KeyRotator(sanitizeKeys(keys));
  }, []);

  // ── resetForRetry — clears orchestration state so it can run again ──
  const resetForRetry = useCallback(() => {
    setError(null);
    setChapters([]);
    setStep('orchestrate', 'pending');
    setPhase(1);
  }, [setStep]);

  return {
    phase,
    stepStatuses,
    chapters,
    setChapters,
    results,
    stats,
    previewContent,
    previewLabel,
    workerPreviews,
    error,
    workerStats,
    processUploads,
    orchestrate,
    generate,
    cancel,
    resetKeys,
    resetForRetry,
  };
}
