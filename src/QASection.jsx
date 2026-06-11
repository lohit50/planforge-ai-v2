// ─────────────────────────────────────────────────────────────────────────────
// QASection.jsx — AI Quiz & Q&A Generator
// SINGLE COMPONENT FILE — all logic, state, and UI are inline here.
// • PDF content is extracted CLIENT-SIDE — raw PDFs are NEVER sent to any API.
// • Feature unlocks when an NVIDIA NIM API key is entered in this section.
// • Works with: (A) already-generated PlanForge document, or (B) your own PDF upload.
// ─────────────────────────────────────────────────────────────────────────────
import { useState, useRef, useCallback } from 'react';

// ── Design tokens (self-contained, not imported) ──────────────────────────────
const C = {
  ACCENT:      '#6C3EE8',
  ACCENT_GRAD: 'linear-gradient(135deg, #6C3EE8 0%, #8B5CF6 100%)',
  ACCENT_SOFT: '#EDE9FE',
  ACCENT_LIGHT:'#8B5CF6',
  BG:          '#F8F9FF',
  CARD:        '#FFFFFF',
  TEXT:        '#1A1A2E',
  MUTED:       '#6B7280',
  BORDER:      '#E5E7EB',
  SUCCESS:     '#10B981',
  DANGER:      '#EF4444',
  WARNING:     '#F59E0B',
  CORRECT_BG:  'rgba(16,185,129,0.08)',
  WRONG_BG:    'rgba(239,68,68,0.06)',
};

const NVIDIA_BASE = 'https://integrate.api.nvidia.com/v1';
const QA_MODEL    = 'meta/llama-3.3-70b-instruct'; // fast, reliable for structured JSON

// ── Question type configs ─────────────────────────────────────────────────────
const Q_TYPES = [
  { id: 'mcq',     label: 'Multiple Choice',  icon: '🔵', desc: '4 options, one correct answer' },
  { id: 'tf',      label: 'True / False',      icon: '⚖️',  desc: 'Simple true or false judgement' },
  { id: 'short',   label: 'Short Answer',      icon: '✍️',  desc: 'Open-ended written answers' },
  { id: 'fill',    label: 'Fill in the Blank', icon: '📝', desc: 'Complete the missing word/phrase' },
];
const DIFFICULTIES = ['Easy', 'Medium', 'Hard', 'Mixed'];
const COUNTS = [5, 10, 15, 20, 25];

// ── Inline PDF text extractor (pdfjs-dist, client-side only) ──────────────────
async function extractTextFromPDF(file, onProgress) {
  const pdfjsLib = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc =
    'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

  const arrayBuffer = await file.arrayBuffer();
  const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
  const numPages = pdf.numPages;
  let fullText = '';

  for (let p = 1; p <= numPages; p++) {
    if (onProgress) onProgress(p, numPages);
    const page = await pdf.getPage(p);
    const textContent = await page.getTextContent();
    fullText += textContent.items.map(i => i.str).join(' ') + '\n\n';
  }
  return fullText.trim();
}

// ── Inline NVIDIA API call ────────────────────────────────────────────────────
async function callNvidiaForQA(apiKey, prompt, onChunk, onDone, onError, signal) {
  let response;
  try {
    response = await fetch(`${NVIDIA_BASE}/chat/completions`, {
      method: 'POST',
      signal,
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${apiKey}` },
      body: JSON.stringify({
        model: QA_MODEL,
        messages: [{ role: 'user', content: prompt }],
        max_tokens: 4096,
        stream: true,
        temperature: 0.4,
      }),
    });
  } catch (err) {
    if (err.name === 'AbortError') return;
    onError(`Network error: ${err.message}`);
    return;
  }

  if (response.status === 401) { onError('Invalid API key — check your NVIDIA NIM key.'); return; }
  if (response.status === 429) { onError('Rate limited — wait a moment and try again.'); return; }
  if (!response.ok) { onError(`API error ${response.status}`); return; }

  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';
  let accumulated = '';

  try {
    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop();

      for (const line of lines) {
        const t = line.trim();
        if (!t.startsWith('data: ')) continue;
        const d = t.slice(6);
        if (d === '[DONE]') { onDone(accumulated); return; }
        try {
          const text = JSON.parse(d)?.choices?.[0]?.delta?.content;
          if (text) { accumulated += text; onChunk(text); }
        } catch { /* skip */ }
      }
    }
    onDone(accumulated);
  } catch (err) {
    if (err.name !== 'AbortError') onError(`Stream error: ${err.message}`);
  }
}

// ── Prompt builder ────────────────────────────────────────────────────────────
function buildQAPrompt(contentText, qType, count, difficulty) {
  const truncated = contentText.slice(0, 6000); // safe context window

  const formats = {
    mcq: `{
  "type": "mcq",
  "question": "question text here",
  "options": ["A) option1", "B) option2", "C) option3", "D) option4"],
  "answer": "A) option1",
  "explanation": "brief explanation why this is correct"
}`,
    tf: `{
  "type": "tf",
  "question": "statement that is either true or false",
  "answer": "True",
  "explanation": "brief explanation"
}`,
    short: `{
  "type": "short",
  "question": "open-ended question",
  "answer": "model answer in 1-3 sentences",
  "explanation": "key points the answer should cover"
}`,
    fill: `{
  "type": "fill",
  "question": "The _____ is responsible for [context]",
  "answer": "missing word or phrase",
  "explanation": "why this answer is correct"
}`,
  };

  return `You are an expert quiz creator. Based on the educational content below, generate exactly ${count} ${difficulty.toLowerCase()} difficulty ${qType === 'mcq' ? 'multiple choice' : qType === 'tf' ? 'true/false' : qType === 'short' ? 'short answer' : 'fill-in-the-blank'} questions.

EDUCATIONAL CONTENT:
---
${truncated}
---

Return ONLY a valid JSON array. No markdown fences, no extra text, just the array.
Each question must follow this exact format:
${formats[qType]}

Rules:
- Questions must be directly based on the content above
- Difficulty ${difficulty}: ${difficulty === 'Easy' ? 'basic recall and definitions' : difficulty === 'Medium' ? 'understanding and application' : difficulty === 'Hard' ? 'analysis, synthesis and edge cases' : 'mix of all levels'}
- All ${count} questions must be unique and non-overlapping
- Return ONLY the JSON array, no other text

JSON Array:`;
}

// ── Parse AI response into questions array ───────────────────────────────────
function parseQAResponse(raw) {
  try {
    let clean = raw.replace(/```json\s*/gi, '').replace(/```\s*/gi, '').trim();
    const match = clean.match(/\[[\s\S]*\]/);
    if (!match) throw new Error('No array found');
    return JSON.parse(match[0]);
  } catch {
    return null;
  }
}

// ── Small internal UI pieces ──────────────────────────────────────────────────
function QAPill({ children, active, onClick, color }) {
  return (
    <button
      onClick={onClick}
      style={{
        padding: '6px 14px', borderRadius: 20, border: `1.5px solid ${active ? C.ACCENT : C.BORDER}`,
        background: active ? C.ACCENT_SOFT : '#FAFBFF', cursor: 'pointer',
        fontSize: 13, fontWeight: active ? 600 : 400, color: active ? C.ACCENT : C.MUTED,
        transition: 'all 0.15s'
      }}
    >{children}</button>
  );
}

function ProgressBar({ value, max, color = C.ACCENT }) {
  const pct = max > 0 ? Math.round((value / max) * 100) : 0;
  return (
    <div style={{ height: 6, borderRadius: 3, background: '#E5E7EB', overflow: 'hidden' }}>
      <div style={{
        height: '100%', width: `${pct}%`, borderRadius: 3,
        background: color, transition: 'width 0.4s ease'
      }} />
    </div>
  );
}

// ─────────────────────────────────────────────────────────────────────────────
// MAIN COMPONENT
// ─────────────────────────────────────────────────────────────────────────────
export default function QASection({ generatedResults = [], generatedTitle = '' }) {
  // ── Lock / unlock state ─────────────────────────────────────────────────────
  const [apiKey,     setApiKey]     = useState('');
  const [isUnlocked, setIsUnlocked] = useState(false);
  const [keyError,   setKeyError]   = useState('');

  // ── Content source ──────────────────────────────────────────────────────────
  const [source,      setSource]     = useState('generated'); // 'generated' | 'upload'
  const [uploadedPDF, setUploadedPDF]= useState(null);
  const [pdfText,     setPdfText]    = useState('');
  const [pdfStatus,   setPdfStatus]  = useState(''); // extraction progress

  // ── Quiz settings ───────────────────────────────────────────────────────────
  const [qType,      setQType]      = useState('mcq');
  const [count,      setCount]      = useState(10);
  const [difficulty, setDifficulty] = useState('Medium');

  // ── Generation state ────────────────────────────────────────────────────────
  const [phase,      setPhase]      = useState('idle'); // idle | extracting | generating | done | error
  const [streaming,  setStreaming]  = useState('');
  const [questions,  setQuestions]  = useState([]);
  const [genError,   setGenError]   = useState('');

  // ── Quiz interaction state ──────────────────────────────────────────────────
  const [answers,     setAnswers]    = useState({}); // { qIndex: selectedOption }
  const [revealed,    setRevealed]   = useState({}); // { qIndex: true }
  const [showAll,     setShowAll]    = useState(false);
  const [quizDone,    setQuizDone]   = useState(false);
  const [activeQ,     setActiveQ]    = useState(0);

  const abortRef  = useRef(null);
  const pdfInputRef = useRef(null);

  // ── Unlock feature ──────────────────────────────────────────────────────────
  const handleUnlock = () => {
    const k = apiKey.trim();
    if (!k.startsWith('nvapi-') && !k.startsWith('sk-')) {
      setKeyError('Key should start with nvapi- (NVIDIA NIM). Get one free at build.nvidia.com');
      return;
    }
    setKeyError('');
    setIsUnlocked(true);
  };

  // ── PDF Upload handler ──────────────────────────────────────────────────────
  const handlePDFUpload = async (file) => {
    if (!file) return;
    if (file.size > 10 * 1024 * 1024) {
      setPdfStatus('⚠ File too large (max 10MB)');
      return;
    }
    setUploadedPDF(file);
    setPhase('extracting');
    setPdfStatus('Extracting text from PDF…');
    try {
      const text = await extractTextFromPDF(file, (p, t) => {
        setPdfStatus(`Extracting page ${p} of ${t}…`);
      });
      if (!text || text.length < 100) {
        setPdfStatus('⚠ Could not extract enough text. Is this a scanned PDF?');
        setPhase('idle');
        return;
      }
      setPdfText(text);
      setPdfStatus(`✓ Extracted ${text.split(/\s+/).filter(Boolean).length.toLocaleString()} words from ${file.name}`);
      setPhase('idle');
    } catch (err) {
      setPdfStatus(`⚠ Extraction failed: ${err.message}`);
      setPhase('idle');
    }
  };

  // ── Get content to use ──────────────────────────────────────────────────────
  const getContentText = useCallback(() => {
    if (source === 'upload') return pdfText;
    if (generatedResults.length > 0) {
      return generatedResults.map(r => r.content || '').join('\n\n').slice(0, 12000);
    }
    return '';
  }, [source, pdfText, generatedResults]);

  // ── Generate Q&A ────────────────────────────────────────────────────────────
  const handleGenerate = async () => {
    const content = getContentText();
    if (!content || content.length < 100) {
      setGenError(source === 'upload'
        ? 'Please upload and extract a PDF first.'
        : 'No generated document found. Generate a PDF document first, then come back here.');
      return;
    }

    setPhase('generating');
    setGenError('');
    setStreaming('');
    setQuestions([]);
    setAnswers({});
    setRevealed({});
    setShowAll(false);
    setQuizDone(false);
    setActiveQ(0);

    abortRef.current = new AbortController();
    const prompt = buildQAPrompt(content, qType, count, difficulty);

    await callNvidiaForQA(
      apiKey,
      prompt,
      (chunk) => setStreaming(prev => prev + chunk),
      (full) => {
        const parsed = parseQAResponse(full);
        if (parsed && parsed.length > 0) {
          setQuestions(parsed);
          setPhase('done');
        } else {
          setGenError('Could not parse AI response. Try again.');
          setPhase('error');
        }
        setStreaming('');
      },
      (err) => {
        setGenError(err);
        setPhase('error');
        setStreaming('');
      },
      abortRef.current.signal
    );
  };

  // ── Quiz interaction ─────────────────────────────────────────────────────────
  const selectAnswer = (qIdx, option) => {
    if (revealed[qIdx] || showAll) return;
    setAnswers(prev => ({ ...prev, [qIdx]: option }));
  };

  const revealAnswer = (qIdx) => {
    setRevealed(prev => ({ ...prev, [qIdx]: true }));
  };

  const submitAll = () => {
    const allRevealed = {};
    questions.forEach((_, i) => { allRevealed[i] = true; });
    setRevealed(allRevealed);
    setShowAll(true);
    setQuizDone(true);
  };

  const getScore = () => {
    let correct = 0;
    questions.forEach((q, i) => {
      if (answers[i] && q.answer) {
        const ans = answers[i].toLowerCase().trim();
        const correct_ans = q.answer.toLowerCase().trim();
        if (ans === correct_ans || ans.includes(correct_ans) || correct_ans.includes(ans)) {
          correct++;
        }
      }
    });
    return correct;
  };

  const resetQuiz = () => {
    setAnswers({});
    setRevealed({});
    setShowAll(false);
    setQuizDone(false);
    setActiveQ(0);
  };

  const hasGeneratedContent = generatedResults.length > 0;
  const contentReady = source === 'generated' ? hasGeneratedContent : pdfText.length > 100;

  // ─────────────────────────────────────────────────────────────────────────────
  // RENDER
  // ─────────────────────────────────────────────────────────────────────────────
  return (
    <div style={{ position: 'relative', fontFamily: "'Inter', -apple-system, sans-serif" }}>

      {/* ── SECTION HEADER ─────────────────────────────────────────────────── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        marginBottom: 24, flexWrap: 'wrap', gap: 10
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
          <div style={{
            width: 44, height: 44, borderRadius: 12,
            background: C.ACCENT_GRAD, display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 20
          }}>🧠</div>
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <h2 style={{ fontSize: 20, fontWeight: 800, color: C.TEXT, margin: 0 }}>
                AI Quiz Generator
              </h2>
              {!isUnlocked && (
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 12,
                  background: 'linear-gradient(135deg, #F59E0B, #EF4444)',
                  color: '#fff', fontWeight: 700, letterSpacing: '0.05em'
                }}>🚧 COMING SOON</span>
              )}
              {isUnlocked && (
                <span style={{
                  fontSize: 11, padding: '2px 10px', borderRadius: 12,
                  background: 'rgba(16,185,129,0.1)', color: C.SUCCESS,
                  border: `1px solid rgba(16,185,129,0.3)`, fontWeight: 600
                }}>✓ UNLOCKED</span>
              )}
            </div>
            <p style={{ fontSize: 13, color: C.MUTED, margin: '2px 0 0' }}>
              Generate quizzes from your document or any PDF — PDF content is extracted locally, never uploaded raw.
            </p>
          </div>
        </div>
      </div>

      {/* ── UNLOCK GATE ────────────────────────────────────────────────────── */}
      {!isUnlocked && (
        <div style={{
          background: '#fff', borderRadius: 16, padding: 28,
          border: `2px dashed ${C.BORDER}`,
          display: 'flex', flexDirection: 'column', alignItems: 'center',
          textAlign: 'center', gap: 16, marginBottom: 0
        }}>
          <div style={{ fontSize: 40 }}>🔒</div>
          <div>
            <div style={{ fontSize: 16, fontWeight: 700, color: C.TEXT, marginBottom: 6 }}>
              Unlock AI Quiz Generator
            </div>
            <div style={{ fontSize: 13, color: C.MUTED, maxWidth: 420, lineHeight: 1.6 }}>
              This feature requires an NVIDIA NIM API key. Get one free at{' '}
              <a href="https://build.nvidia.com" target="_blank" rel="noopener noreferrer"
                style={{ color: C.ACCENT }}>build.nvidia.com</a>. Your key is stored only in
              session memory and never sent anywhere except the NVIDIA API.
            </div>
          </div>

          {/* Key input */}
          <div style={{ width: '100%', maxWidth: 460 }}>
            <div style={{ display: 'flex', gap: 8 }}>
              <input
                type="password"
                value={apiKey}
                onChange={(e) => { setApiKey(e.target.value); setKeyError(''); }}
                onKeyDown={(e) => { if (e.key === 'Enter') handleUnlock(); }}
                placeholder="nvapi-… (your NVIDIA NIM API key)"
                style={{
                  flex: 1, padding: '11px 14px', borderRadius: 10,
                  border: `1.5px solid ${keyError ? C.DANGER : C.BORDER}`,
                  fontSize: 13, fontFamily: 'monospace', outline: 'none',
                  background: '#FAFBFF', color: C.TEXT
                }}
                onFocus={(e) => e.target.style.borderColor = C.ACCENT}
                onBlur={(e) => e.target.style.borderColor = keyError ? C.DANGER : C.BORDER}
              />
              <button
                onClick={handleUnlock}
                style={{
                  padding: '11px 20px', borderRadius: 10, border: 'none',
                  background: C.ACCENT_GRAD, color: '#fff',
                  fontSize: 13, fontWeight: 600, cursor: 'pointer',
                  whiteSpace: 'nowrap'
                }}
              >Unlock →</button>
            </div>
            {keyError && (
              <div style={{ fontSize: 12, color: C.DANGER, marginTop: 5, textAlign: 'left' }}>
                ⚠ {keyError}
              </div>
            )}
          </div>

          {/* Preview of what's inside (blurred) */}
          <div style={{ width: '100%', position: 'relative', marginTop: 8 }}>
            <div style={{
              filter: 'blur(4px)', opacity: 0.4, pointerEvents: 'none',
              display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(110px, 1fr))', gap: 10
            }}>
              {Q_TYPES.map(t => (
                <div key={t.id} style={{
                  padding: '12px 8px', borderRadius: 12, border: `2px solid ${C.BORDER}`,
                  textAlign: 'center', background: C.BG
                }}>
                  <div style={{ fontSize: 20 }}>{t.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: C.TEXT }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: C.MUTED }}>{t.desc}</div>
                </div>
              ))}
            </div>
            <div style={{
              position: 'absolute', inset: 0, display: 'flex',
              alignItems: 'center', justifyContent: 'center'
            }}>
              <span style={{
                padding: '6px 18px', borderRadius: 20, background: '#fff',
                border: `1px solid ${C.BORDER}`, fontSize: 13, color: C.MUTED,
                boxShadow: '0 2px 8px rgba(0,0,0,0.08)'
              }}>Enter API key to unlock →</span>
            </div>
          </div>
        </div>
      )}

      {/* ── UNLOCKED UI ────────────────────────────────────────────────────── */}
      {isUnlocked && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

          {/* API Key badge + change */}
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            padding: '8px 14px', borderRadius: 10,
            background: 'rgba(16,185,129,0.06)', border: `1px solid rgba(16,185,129,0.2)`
          }}>
            <span style={{ fontSize: 12, color: C.SUCCESS }}>
              ✓ API key active · NVIDIA NIM · {QA_MODEL}
            </span>
            <button
              onClick={() => { setIsUnlocked(false); setApiKey(''); setPhase('idle'); setQuestions([]); }}
              style={{
                fontSize: 11, color: C.MUTED, background: 'none', border: 'none',
                cursor: 'pointer', textDecoration: 'underline'
              }}
            >Change key</button>
          </div>

          {/* Source selector */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: 20,
            border: `1px solid ${C.BORDER}`, boxShadow: '0 4px 16px rgba(108,62,232,0.06)'
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.TEXT, marginBottom: 12 }}>
              📂 Content Source
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 10, marginBottom: 14 }}>
              {[
                {
                  id: 'generated', icon: '✦', label: 'Use Generated Document',
                  desc: hasGeneratedContent
                    ? `${generatedResults.length} topics from "${generatedTitle || 'your document'}"`
                    : 'No document generated yet — generate one above first'
                },
                {
                  id: 'upload', icon: '📄', label: 'Upload Your Own PDF',
                  desc: pdfText ? `✓ ${pdfText.split(/\s+/).filter(Boolean).length.toLocaleString()} words extracted`
                    : 'Upload any PDF — text extracted locally'
                },
              ].map(s => {
                const disabled = s.id === 'generated' && !hasGeneratedContent;
                return (
                  <button
                    key={s.id}
                    onClick={() => !disabled && setSource(s.id)}
                    disabled={disabled}
                    style={{
                      padding: '14px', borderRadius: 12, textAlign: 'left', cursor: disabled ? 'not-allowed' : 'pointer',
                      border: `2px solid ${source === s.id ? C.ACCENT : C.BORDER}`,
                      background: source === s.id ? C.ACCENT_SOFT : disabled ? '#F9FAFB' : '#FAFBFF',
                      opacity: disabled ? 0.5 : 1, transition: 'all 0.15s'
                    }}
                  >
                    <div style={{ fontSize: 18, marginBottom: 4 }}>{s.icon}</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: source === s.id ? C.ACCENT : C.TEXT }}>{s.label}</div>
                    <div style={{ fontSize: 11, color: C.MUTED, marginTop: 3, lineHeight: 1.4 }}>{s.desc}</div>
                  </button>
                );
              })}
            </div>

            {/* PDF Upload Zone (only shown for upload source) */}
            {source === 'upload' && (
              <div>
                <input
                  ref={pdfInputRef}
                  type="file"
                  accept=".pdf,application/pdf"
                  style={{ display: 'none' }}
                  onChange={(e) => handlePDFUpload(e.target.files[0])}
                />
                {!uploadedPDF ? (
                  <div
                    onClick={() => pdfInputRef.current?.click()}
                    style={{
                      border: `2px dashed ${C.BORDER}`, borderRadius: 12,
                      padding: '20px', textAlign: 'center', cursor: 'pointer',
                      background: '#FAFBFF', transition: 'all 0.2s'
                    }}
                    onMouseEnter={e => { e.currentTarget.style.borderColor = C.ACCENT; e.currentTarget.style.background = C.ACCENT_SOFT; }}
                    onMouseLeave={e => { e.currentTarget.style.borderColor = C.BORDER; e.currentTarget.style.background = '#FAFBFF'; }}
                  >
                    <div style={{ fontSize: 28, marginBottom: 6 }}>📄</div>
                    <div style={{ fontSize: 13, fontWeight: 600, color: C.TEXT }}>Click to upload PDF</div>
                    <div style={{ fontSize: 11, color: C.MUTED, marginTop: 3 }}>
                      Text is extracted locally — max 10MB
                    </div>
                  </div>
                ) : (
                  <div style={{
                    padding: '12px 14px', borderRadius: 12,
                    background: 'rgba(16,185,129,0.06)', border: `1px solid rgba(16,185,129,0.2)`,
                    display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10
                  }}>
                    <div>
                      <div style={{ fontSize: 13, fontWeight: 600, color: C.TEXT }}>
                        {phase === 'extracting' ? '⟳ ' : '✓ '}{uploadedPDF.name}
                      </div>
                      <div style={{ fontSize: 11, color: C.MUTED, marginTop: 2 }}>{pdfStatus}</div>
                      {phase === 'extracting' && (
                        <div style={{ marginTop: 6 }}>
                          <ProgressBar value={50} max={100} color={C.ACCENT} />
                        </div>
                      )}
                    </div>
                    <button
                      onClick={() => { setUploadedPDF(null); setPdfText(''); setPdfStatus(''); }}
                      style={{
                        background: 'none', border: 'none', cursor: 'pointer',
                        color: C.MUTED, fontSize: 18, padding: '0 4px', lineHeight: 1
                      }}
                    >×</button>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* Question Type */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: 20,
            border: `1px solid ${C.BORDER}`, boxShadow: '0 4px 16px rgba(108,62,232,0.06)'
          }}>
            <div style={{ fontSize: 14, fontWeight: 700, color: C.TEXT, marginBottom: 12 }}>
              🎯 Question Type
            </div>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(130px, 1fr))', gap: 10 }}>
              {Q_TYPES.map(t => (
                <button
                  key={t.id}
                  onClick={() => setQType(t.id)}
                  style={{
                    padding: '12px 8px', borderRadius: 12, textAlign: 'center', cursor: 'pointer',
                    border: `2px solid ${qType === t.id ? C.ACCENT : C.BORDER}`,
                    background: qType === t.id ? C.ACCENT_SOFT : '#FAFBFF',
                    transition: 'all 0.15s'
                  }}
                >
                  <div style={{ fontSize: 20, marginBottom: 4 }}>{t.icon}</div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: qType === t.id ? C.ACCENT : C.TEXT }}>{t.label}</div>
                  <div style={{ fontSize: 10, color: C.MUTED, marginTop: 2, lineHeight: 1.3 }}>{t.desc}</div>
                </button>
              ))}
            </div>
          </div>

          {/* Settings row */}
          <div style={{
            background: '#fff', borderRadius: 16, padding: 20,
            border: `1px solid ${C.BORDER}`, boxShadow: '0 4px 16px rgba(108,62,232,0.06)'
          }}>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(200px, 1fr))', gap: 20 }}>
              {/* Count */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.TEXT, marginBottom: 8 }}>
                  Number of Questions
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {COUNTS.map(n => (
                    <QAPill key={n} active={count === n} onClick={() => setCount(n)}>{n}</QAPill>
                  ))}
                </div>
              </div>
              {/* Difficulty */}
              <div>
                <div style={{ fontSize: 13, fontWeight: 600, color: C.TEXT, marginBottom: 8 }}>
                  Difficulty
                </div>
                <div style={{ display: 'flex', gap: 6, flexWrap: 'wrap' }}>
                  {DIFFICULTIES.map(d => (
                    <QAPill key={d} active={difficulty === d} onClick={() => setDifficulty(d)}>{d}</QAPill>
                  ))}
                </div>
              </div>
            </div>
          </div>

          {/* Generate button */}
          {phase !== 'done' && (
            <button
              onClick={handleGenerate}
              disabled={phase === 'generating' || phase === 'extracting' || !contentReady}
              style={{
                width: '100%', padding: '15px', borderRadius: 14, border: 'none',
                background: (!contentReady || phase === 'generating')
                  ? '#9CA3AF'
                  : C.ACCENT_GRAD,
                color: '#fff', fontSize: 15, fontWeight: 700,
                cursor: (!contentReady || phase === 'generating') ? 'not-allowed' : 'pointer',
                boxShadow: contentReady && phase !== 'generating' ? '0 4px 16px rgba(108,62,232,0.35)' : 'none',
                display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                transition: 'all 0.2s'
              }}
            >
              {phase === 'generating' ? (
                <>
                  <span style={{ display: 'inline-block', animation: 'spin 1s linear infinite' }}>⟳</span>
                  Generating {count} questions…
                </>
              ) : !contentReady ? (
                source === 'generated'
                  ? '⚠ Generate a document above first'
                  : '⚠ Upload a PDF first'
              ) : (
                <>🧠 Generate {count} Questions — {difficulty}</>
              )}
            </button>
          )}

          {/* Streaming preview while generating */}
          {phase === 'generating' && streaming && (
            <div style={{
              padding: '12px 14px', borderRadius: 12,
              background: '#1E2240', border: `1px solid rgba(108,62,232,0.3)`
            }}>
              <div style={{ fontSize: 11, color: C.ACCENT_LIGHT, marginBottom: 6, fontFamily: 'monospace' }}>
                ⟳ AI writing questions…
              </div>
              <div style={{
                fontSize: 11, color: 'rgba(232,233,243,0.7)',
                fontFamily: 'monospace', lineHeight: 1.5,
                maxHeight: 120, overflow: 'hidden'
              }}>
                {streaming.slice(-600)}
              </div>
            </div>
          )}

          {/* Error */}
          {(phase === 'error' || genError) && (
            <div style={{
              padding: '12px 16px', borderRadius: 12,
              background: 'rgba(239,68,68,0.06)', border: `1px solid ${C.DANGER}`,
              color: C.DANGER, fontSize: 13,
              display: 'flex', justifyContent: 'space-between', alignItems: 'center', gap: 10
            }}>
              <span>⚠ {genError}</span>
              <button onClick={() => { setPhase('idle'); setGenError(''); }}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: C.DANGER, fontSize: 12, textDecoration: 'underline' }}>
                Try again
              </button>
            </div>
          )}

          {/* ── QUIZ DISPLAY ─────────────────────────────────────────────── */}
          {phase === 'done' && questions.length > 0 && (
            <div style={{ display: 'flex', flexDirection: 'column', gap: 14 }}>

              {/* Quiz header */}
              <div style={{
                background: C.ACCENT_GRAD, borderRadius: 16, padding: '18px 22px',
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                flexWrap: 'wrap', gap: 10
              }}>
                <div>
                  <div style={{ fontSize: 16, fontWeight: 800, color: '#fff' }}>
                    {questions.length} {Q_TYPES.find(t => t.id === qType)?.label} Questions
                  </div>
                  <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.7)', marginTop: 2 }}>
                    {difficulty} · {source === 'generated' ? generatedTitle || 'Generated Document' : uploadedPDF?.name}
                  </div>
                </div>
                <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
                  <button
                    onClick={resetQuiz}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.3)',
                      background: 'rgba(255,255,255,0.1)', color: '#fff',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >↺ Reset</button>
                  <button
                    onClick={() => { setPhase('idle'); setQuestions([]); }}
                    style={{
                      padding: '7px 14px', borderRadius: 8, border: 'none',
                      background: 'rgba(255,255,255,0.2)', color: '#fff',
                      fontSize: 12, fontWeight: 600, cursor: 'pointer', whiteSpace: 'nowrap'
                    }}
                  >+ New Quiz</button>
                </div>
              </div>

              {/* Score (when quiz submitted) */}
              {quizDone && (
                <div style={{
                  padding: '16px 20px', borderRadius: 14,
                  background: '#fff', border: `2px solid ${C.SUCCESS}`,
                  boxShadow: '0 4px 16px rgba(16,185,129,0.12)',
                  display: 'flex', alignItems: 'center', gap: 16, flexWrap: 'wrap'
                }}>
                  <div style={{ fontSize: 36 }}>
                    {getScore() / questions.length >= 0.8 ? '🏆' : getScore() / questions.length >= 0.6 ? '🎯' : '📚'}
                  </div>
                  <div>
                    <div style={{ fontSize: 18, fontWeight: 800, color: C.TEXT }}>
                      {getScore()} / {questions.length} Correct
                    </div>
                    <div style={{ fontSize: 13, color: C.MUTED }}>
                      {Math.round((getScore() / questions.length) * 100)}% score ·{' '}
                      {getScore() / questions.length >= 0.8 ? 'Excellent work!' :
                       getScore() / questions.length >= 0.6 ? 'Good effort! Review the highlighted answers.' :
                       'Keep studying — review the explanations below.'}
                    </div>
                    <div style={{ marginTop: 8 }}>
                      <ProgressBar
                        value={getScore()}
                        max={questions.length}
                        color={getScore() / questions.length >= 0.7 ? C.SUCCESS : C.WARNING}
                      />
                    </div>
                  </div>
                </div>
              )}

              {/* Questions */}
              {questions.map((q, qi) => {
                const userAns    = answers[qi];
                const isRevealed = revealed[qi] || showAll;
                const isCorrect  = userAns && isRevealed &&
                  (userAns.toLowerCase().includes(q.answer?.toLowerCase() || '') ||
                   (q.answer?.toLowerCase() || '').includes(userAns.toLowerCase()));

                return (
                  <div
                    key={qi}
                    style={{
                      background: '#fff', borderRadius: 16, overflow: 'hidden',
                      border: `1px solid ${isRevealed
                        ? (isCorrect ? 'rgba(16,185,129,0.3)' : userAns ? 'rgba(239,68,68,0.25)' : C.BORDER)
                        : C.BORDER}`,
                      boxShadow: '0 2px 12px rgba(0,0,0,0.04)',
                      transition: 'border 0.3s'
                    }}
                  >
                    {/* Q header */}
                    <div
                      onClick={() => setActiveQ(qi === activeQ ? -1 : qi)}
                      style={{
                        padding: '14px 18px', cursor: 'pointer',
                        background: qi === activeQ ? C.ACCENT_SOFT : '#fff',
                        display: 'flex', alignItems: 'flex-start', gap: 10,
                        borderBottom: qi === activeQ ? `1px solid ${C.BORDER}` : 'none'
                      }}
                    >
                      <span style={{
                        flexShrink: 0, width: 26, height: 26, borderRadius: '50%',
                        background: isRevealed
                          ? (isCorrect ? C.SUCCESS : userAns ? C.DANGER : C.ACCENT)
                          : C.ACCENT,
                        color: '#fff', fontSize: 12, fontWeight: 700,
                        display: 'flex', alignItems: 'center', justifyContent: 'center'
                      }}>
                        {isRevealed ? (isCorrect ? '✓' : userAns ? '✗' : qi + 1) : qi + 1}
                      </span>
                      <div style={{ flex: 1 }}>
                        <div style={{ fontSize: 14, fontWeight: 600, color: C.TEXT, lineHeight: 1.4 }}>
                          {q.question}
                        </div>
                        {userAns && !isRevealed && (
                          <div style={{ fontSize: 11, color: C.MUTED, marginTop: 3 }}>
                            Your answer: <span style={{ color: C.ACCENT, fontWeight: 600 }}>{userAns}</span>
                          </div>
                        )}
                      </div>
                      <span style={{ color: C.MUTED, fontSize: 12, flexShrink: 0 }}>
                        {qi === activeQ ? '▲' : '▼'}
                      </span>
                    </div>

                    {/* Q body (expanded) */}
                    {qi === activeQ && (
                      <div style={{ padding: '14px 18px 18px' }}>

                        {/* MCQ options */}
                        {q.type === 'mcq' && q.options && (
                          <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 12 }}>
                            {q.options.map((opt, oi) => {
                              const isSelected = userAns === opt;
                              const isRight = isRevealed && opt.toLowerCase().trim() === (q.answer || '').toLowerCase().trim();
                              const isWrong = isRevealed && isSelected && !isRight;
                              return (
                                <button
                                  key={oi}
                                  onClick={() => selectAnswer(qi, opt)}
                                  disabled={isRevealed}
                                  style={{
                                    padding: '10px 14px', borderRadius: 10, textAlign: 'left',
                                    border: `1.5px solid ${isRight ? C.SUCCESS : isWrong ? C.DANGER : isSelected ? C.ACCENT : C.BORDER}`,
                                    background: isRight ? C.CORRECT_BG : isWrong ? C.WRONG_BG : isSelected ? C.ACCENT_SOFT : '#FAFBFF',
                                    cursor: isRevealed ? 'default' : 'pointer',
                                    fontSize: 13, fontWeight: isSelected ? 600 : 400, color: C.TEXT,
                                    transition: 'all 0.15s',
                                    display: 'flex', alignItems: 'center', gap: 8
                                  }}
                                >
                                  <span style={{
                                    width: 22, height: 22, borderRadius: '50%', flexShrink: 0,
                                    border: `1.5px solid ${isRight ? C.SUCCESS : isWrong ? C.DANGER : isSelected ? C.ACCENT : C.BORDER}`,
                                    background: isSelected ? (isRight ? C.SUCCESS : isWrong ? C.DANGER : C.ACCENT) : 'transparent',
                                    color: isSelected ? '#fff' : C.MUTED,
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: 10, fontWeight: 700
                                  }}>
                                    {isSelected ? (isRight ? '✓' : '✗') : String.fromCharCode(65 + oi)}
                                  </span>
                                  {opt.replace(/^[A-D]\)\s*/i, '')}
                                </button>
                              );
                            })}
                          </div>
                        )}

                        {/* True / False */}
                        {q.type === 'tf' && (
                          <div style={{ display: 'flex', gap: 10, marginBottom: 12 }}>
                            {['True', 'False'].map(opt => {
                              const isSelected = userAns === opt;
                              const isRight = isRevealed && opt.toLowerCase() === (q.answer || '').toLowerCase();
                              const isWrong = isRevealed && isSelected && !isRight;
                              return (
                                <button
                                  key={opt}
                                  onClick={() => selectAnswer(qi, opt)}
                                  disabled={isRevealed}
                                  style={{
                                    flex: 1, padding: '12px', borderRadius: 10, cursor: isRevealed ? 'default' : 'pointer',
                                    border: `2px solid ${isRight ? C.SUCCESS : isWrong ? C.DANGER : isSelected ? C.ACCENT : C.BORDER}`,
                                    background: isRight ? C.CORRECT_BG : isWrong ? C.WRONG_BG : isSelected ? C.ACCENT_SOFT : '#FAFBFF',
                                    fontSize: 14, fontWeight: 600,
                                    color: isRight ? C.SUCCESS : isWrong ? C.DANGER : isSelected ? C.ACCENT : C.TEXT,
                                    transition: 'all 0.15s'
                                  }}
                                >{opt === 'True' ? '✓ True' : '✗ False'}</button>
                              );
                            })}
                          </div>
                        )}

                        {/* Short Answer */}
                        {q.type === 'short' && (
                          <div style={{ marginBottom: 12 }}>
                            <textarea
                              value={userAns || ''}
                              onChange={(e) => !isRevealed && setAnswers(prev => ({ ...prev, [qi]: e.target.value }))}
                              disabled={isRevealed}
                              placeholder="Type your answer here…"
                              rows={3}
                              style={{
                                width: '100%', padding: '10px 12px', borderRadius: 10,
                                border: `1.5px solid ${C.BORDER}`, fontSize: 13,
                                background: isRevealed ? '#F9FAFB' : '#FAFBFF',
                                color: C.TEXT, resize: 'vertical', outline: 'none',
                                fontFamily: 'inherit', lineHeight: 1.5
                              }}
                              onFocus={(e) => !isRevealed && (e.target.style.borderColor = C.ACCENT)}
                              onBlur={(e) => e.target.style.borderColor = C.BORDER}
                            />
                          </div>
                        )}

                        {/* Fill in the blank */}
                        {q.type === 'fill' && (
                          <div style={{ marginBottom: 12 }}>
                            <input
                              value={userAns || ''}
                              onChange={(e) => !isRevealed && setAnswers(prev => ({ ...prev, [qi]: e.target.value }))}
                              disabled={isRevealed}
                              placeholder="Fill in the blank…"
                              style={{
                                padding: '8px 12px', borderRadius: 8, fontSize: 13,
                                border: `1.5px solid ${isRevealed ? (isCorrect ? C.SUCCESS : C.DANGER) : C.BORDER}`,
                                background: isRevealed ? (isCorrect ? C.CORRECT_BG : C.WRONG_BG) : '#FAFBFF',
                                color: C.TEXT, outline: 'none', width: '100%', minWidth: 0
                              }}
                              onFocus={(e) => !isRevealed && (e.target.style.borderColor = C.ACCENT)}
                              onBlur={(e) => e.target.style.borderColor = C.BORDER}
                            />
                          </div>
                        )}

                        {/* Action buttons */}
                        <div style={{ display: 'flex', gap: 8, marginBottom: 12, flexWrap: 'wrap' }}>
                          {!isRevealed && (
                            <button
                              onClick={() => revealAnswer(qi)}
                              style={{
                                padding: '7px 14px', borderRadius: 8, border: `1px solid ${C.BORDER}`,
                                background: '#F9FAFB', color: C.MUTED,
                                fontSize: 12, fontWeight: 600, cursor: 'pointer'
                              }}
                            >Reveal Answer</button>
                          )}
                          {qi < questions.length - 1 && (
                            <button
                              onClick={() => { revealAnswer(qi); setActiveQ(qi + 1); }}
                              style={{
                                padding: '7px 14px', borderRadius: 8, border: 'none',
                                background: C.ACCENT_SOFT, color: C.ACCENT,
                                fontSize: 12, fontWeight: 600, cursor: 'pointer'
                              }}
                            >Next →</button>
                          )}
                        </div>

                        {/* Answer reveal */}
                        {isRevealed && (
                          <div style={{
                            padding: '12px 14px', borderRadius: 10,
                            background: isCorrect ? 'rgba(16,185,129,0.06)' : 'rgba(108,62,232,0.04)',
                            border: `1px solid ${isCorrect ? 'rgba(16,185,129,0.2)' : C.BORDER}`
                          }}>
                            <div style={{ fontSize: 12, fontWeight: 700, color: isCorrect ? C.SUCCESS : C.ACCENT, marginBottom: 5 }}>
                              {isCorrect ? '✓ Correct!' : '💡 Correct Answer'}
                            </div>
                            <div style={{ fontSize: 13, color: C.TEXT, fontWeight: 600, marginBottom: 6 }}>
                              {q.answer}
                            </div>
                            {q.explanation && (
                              <div style={{ fontSize: 12, color: C.MUTED, lineHeight: 1.5 }}>
                                {q.explanation}
                              </div>
                            )}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}

              {/* Submit all button */}
              {!quizDone && (
                <button
                  onClick={submitAll}
                  style={{
                    width: '100%', padding: '14px', borderRadius: 14, border: 'none',
                    background: C.ACCENT_GRAD, color: '#fff',
                    fontSize: 15, fontWeight: 700, cursor: 'pointer',
                    boxShadow: '0 4px 14px rgba(108,62,232,0.35)'
                  }}
                >
                  Submit All & See Score ({Object.keys(answers).length}/{questions.length} answered)
                </button>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
