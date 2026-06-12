// App.jsx — PlanForge AI main UI
import { useState, useRef, useEffect, useCallback } from 'react';
import { useGenerator, WORKFLOW_STEPS } from './useGenerator.js';
import { exportToPDF, exportToWord, exportToMarkdown } from './exportUtils.js';
import { NVIDIA_KEYS } from './config.js';
import { logToSheets } from './analytics.js';
import QASection from './QASection.jsx';
import coverTemplateImg from './images/cover.png';

// ── Design tokens ────────────────────────────────────────────────
const T = {
  BG: '#F8F9FF',
  CARD: '#FFFFFF',
  ACCENT: '#6C3EE8',
  ACCENT_LIGHT: '#8B5CF6',
  ACCENT_SOFT: '#EDE9FE',
  ACCENT_GRAD: 'linear-gradient(135deg, #6C3EE8 0%, #8B5CF6 100%)',
  TEXT: '#1A1A2E',
  MUTED: '#6B7280',
  BORDER: '#E5E7EB',
  SUCCESS: '#10B981',
  WARNING: '#F59E0B',
  DANGER: '#EF4444',
  PREVIEW_BG: '#1E2240',
  PREVIEW_TEXT: '#E8E9F3',
  SHADOW: '0 4px 24px rgba(108,62,232,0.08)',
  SHADOW_LG: '0 8px 40px rgba(108,62,232,0.14)',
};

const OUTPUT_TYPES = [
  { id: 'study',    icon: '🎓', label: 'Study Material',    desc: 'Complete learning material' },
  { id: 'notes',    icon: '📝', label: 'Complete Notes',    desc: 'Detailed & structured notes' },
  { id: 'exam',     icon: '📋', label: 'Exam Notes',        desc: 'Exam focused notes' },
  { id: 'revision', icon: '⚡', label: 'Quick Revision',    desc: 'Concise revision guide' },
  { id: 'cheat',    icon: '📌', label: 'Cheat Sheet',       desc: 'Key points at a glance' },
  { id: 'handbook', icon: '📚', label: 'Topic Handbook',    desc: 'In-depth topic handbook' },
  { id: 'roadmap',  icon: '🗺️',  label: 'Learning Roadmap', desc: 'Step-by-step roadmap' },
  { id: 'custom',   icon: '⚙️',  label: 'Custom PDF',       desc: 'Tailored to your needs' },
];

const DEPTHS = ['Basic', 'Detailed', 'Expert'];
const AUDIENCES = ['Student', 'Professional', 'Teacher', 'Researcher', 'General'];
const LENGTHS = ['Short (~20pp)', 'Medium (~40pp)', 'Long (~60pp)', 'Comprehensive (~100pp)'];

// ── Global CSS ───────────────────────────────────────────────────
const GLOBAL_CSS = `
@import url('https://fonts.googleapis.com/css2?family=Inter:wght@400;500;600;700;800&display=swap');
* { box-sizing: border-box; margin: 0; padding: 0; }
body { font-family: 'Inter', -apple-system, sans-serif; background: ${T.BG}; color: ${T.TEXT}; }
@keyframes spin { to { transform: rotate(360deg); } }
@keyframes pulse { 0%,100% { opacity:1; } 50% { opacity:0.5; } }
@keyframes fadeIn { from { opacity:0; transform:translateY(8px); } to { opacity:1; transform:translateY(0); } }
@keyframes float { 0%,100% { transform:translateY(0px); } 50% { transform:translateY(-12px); } }
@keyframes shimmer { 0% { background-position:-400px 0; } 100% { background-position:400px 0; } }
@keyframes loadbar { from { width: 0 } to { width: 100% } }
@keyframes loaderFade { 0%{opacity:1} 80%{opacity:1} 100%{opacity:0} }
.spin { animation: spin 1s linear infinite; display:inline-block; }
.pulse { animation: pulse 2s ease-in-out infinite; }
.fade-in { animation: fadeIn 0.3s ease; }
.float { animation: float 4s ease-in-out infinite; }
::-webkit-scrollbar { width: 6px; height: 6px; }
::-webkit-scrollbar-track { background: transparent; }
::-webkit-scrollbar-thumb { background: #D1D5DB; border-radius: 3px; }
::-webkit-scrollbar-thumb:hover { background: #9CA3AF; }
input, select, textarea { font-family: inherit; }
button { font-family: inherit; cursor: pointer; }
.preview-scroll { overflow-y: auto; max-height: 420px; }
.preview-scroll::-webkit-scrollbar-thumb { background: rgba(255,255,255,0.2); }
select option { background: #1E2240; color: #E8E9F3; }
@media (max-width: 768px) {
  .main-grid { grid-template-columns: 1fr !important; }
  .input-grid-3 { grid-template-columns: 1fr !important; }
  .output-grid-4 { grid-template-columns: 1fr 1fr !important; }
  .features-grid { grid-template-columns: 1fr 1fr !important; }
  .right-panel-sticky { position: static !important; top: auto !important; }
  .export-grid-3 { grid-template-columns: 1fr !important; }
  .stats-grid { grid-template-columns: repeat(3, 1fr) !important; }
  .hero-pad { padding: 28px 16px 20px !important; }
}
@media (max-width: 480px) {
  .output-grid-4 { grid-template-columns: 1fr !important; }
  .features-grid { grid-template-columns: 1fr !important; }
  .stats-grid { grid-template-columns: repeat(2, 1fr) !important; }
  .agent-grid { flex-direction: column !important; }
}
`;

// ── Small helper components ──────────────────────────────────────
function Badge({ children, color = T.ACCENT_SOFT, textColor = T.ACCENT }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', gap: 4,
      padding: '4px 12px', borderRadius: 20,
      background: color, color: textColor,
      fontSize: 12, fontWeight: 600, letterSpacing: '0.04em'
    }}>{children}</span>
  );
}

function StepCircle({ num }) {
  return (
    <span style={{
      display: 'inline-flex', alignItems: 'center', justifyContent: 'center',
      width: 28, height: 28, borderRadius: '50%',
      background: T.ACCENT_GRAD, color: '#fff',
      fontSize: 13, fontWeight: 700, flexShrink: 0
    }}>{num}</span>
  );
}

function Toggle({ value, onChange, label, note }) {
  return (
    <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
      <button
        onClick={() => onChange(!value)}
        style={{
          width: 44, height: 24, borderRadius: 12, border: 'none',
          background: value ? T.ACCENT : T.BORDER,
          position: 'relative', cursor: 'pointer', flexShrink: 0,
          transition: 'background 0.2s',
        }}
      >
        <span style={{
          position: 'absolute', top: 2, left: value ? 22 : 2,
          width: 20, height: 20, borderRadius: '50%',
          background: '#fff', transition: 'left 0.2s',
          boxShadow: '0 1px 3px rgba(0,0,0,0.2)'
        }} />
      </button>
      <div>
        <div style={{ fontSize: 14, fontWeight: 500, color: T.TEXT }}>{label}</div>
        {note && <div style={{ fontSize: 12, color: T.MUTED, marginTop: 2 }}>{note}</div>}
      </div>
    </div>
  );
}

function DropZone({ label, accept, files, onFiles, icon = '⬆️' }) {
  const inputRef = useRef(null);
  const [drag, setDrag] = useState(false);

  const handleDrop = (e) => {
    e.preventDefault(); setDrag(false);
    const dropped = Array.from(e.dataTransfer.files).filter(f => {
      if (accept === 'pdf') return f.type === 'application/pdf' || f.name.endsWith('.pdf');
      if (accept === 'image') return f.type.startsWith('image/');
      return true;
    });
    onFiles(dropped);
  };

  const handleInput = (e) => {
    onFiles(Array.from(e.target.files));
    e.target.value = '';
  };

  const removeFile = (i) => {
    const next = files.filter((_, idx) => idx !== i);
    onFiles(next);
  };

  return (
    <div>
      <div
        onClick={() => inputRef.current?.click()}
        onDragOver={(e) => { e.preventDefault(); setDrag(true); }}
        onDragLeave={() => setDrag(false)}
        onDrop={handleDrop}
        style={{
          border: `2px dashed ${drag ? T.ACCENT : T.BORDER}`,
          borderRadius: 12, padding: '20px 12px',
          textAlign: 'center', cursor: 'pointer',
          background: drag ? T.ACCENT_SOFT : '#FAFBFF',
          transition: 'all 0.2s',
          minHeight: 90,
          display: 'flex', flexDirection: 'column',
          alignItems: 'center', justifyContent: 'center', gap: 6
        }}
      >
        <div style={{ fontSize: 22 }}>{icon}</div>
        <div style={{ fontSize: 12, color: T.MUTED, lineHeight: 1.4 }}>
          Drag & drop {label} here<br />
          <span style={{ color: T.ACCENT }}>or click to browse</span>
        </div>
        <input
          ref={inputRef}
          type="file"
          accept={accept === 'pdf' ? '.pdf,application/pdf' : 'image/*'}
          multiple
          style={{ display: 'none' }}
          onChange={handleInput}
        />
      </div>
      {files.length > 0 && (
        <div style={{ marginTop: 8, display: 'flex', flexWrap: 'wrap', gap: 6 }}>
          {files.map((f, i) => (
            <span key={i} style={{
              display: 'inline-flex', alignItems: 'center', gap: 4,
              padding: '3px 10px', borderRadius: 20,
              background: T.ACCENT_SOFT, color: T.ACCENT,
              fontSize: 12, fontWeight: 500
            }}>
              {f.name.slice(0, 20)}{f.name.length > 20 ? '…' : ''}
              <button onClick={(e) => { e.stopPropagation(); removeFile(i); }}
                style={{ background: 'none', border: 'none', color: T.ACCENT, cursor: 'pointer', fontSize: 14, lineHeight: 1, padding: 0 }}>×</button>
            </span>
          ))}
        </div>
      )}
    </div>
  );
}

// ── Site Loader ──────────────────────────────────────────────────
function SiteLoader({ onDone }) {
  useEffect(() => {
    const t = setTimeout(onDone, 4000);
    return () => clearTimeout(t);
  }, [onDone]);
  return (
    <div style={{
      position: 'fixed', inset: 0, zIndex: 9999,
      background: 'linear-gradient(135deg, #0F1020 0%, #1A0845 100%)',
      display: 'flex', flexDirection: 'column',
      alignItems: 'center', justifyContent: 'center', gap: 20,
      animation: 'loaderFade 4.2s ease forwards',
    }}>
      <div className="float" style={{
        width: 64, height: 64, borderRadius: 16,
        background: T.ACCENT_GRAD,
        display: 'flex', alignItems: 'center', justifyContent: 'center',
        color: '#fff', fontSize: 30, fontWeight: 800,
      }}>✦</div>
      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: 24, fontWeight: 800, color: '#fff', letterSpacing: '-0.02em' }}>PlanForge AI</div>
        <div style={{ fontSize: 13, color: 'rgba(255,255,255,0.45)', marginTop: 4 }}>AI-powered educational PDF generator</div>
      </div>
      <div style={{ width: 160, height: 3, background: 'rgba(255,255,255,0.1)', borderRadius: 2, overflow: 'hidden' }}>
        <div style={{ height: '100%', borderRadius: 2, background: T.ACCENT_GRAD, animation: 'loadbar 3.8s linear forwards' }} />
      </div>
    </div>
  );
}

// ── Generation Toast ─────────────────────────────────────────────
function GenerationToast({ onDismiss }) {
  const [sec, setSec] = useState(15);
  useEffect(() => {
    if (sec <= 0) { onDismiss(); return; }
    const t = setTimeout(() => setSec((s) => s - 1), 1000);
    return () => clearTimeout(t);
  }, [sec, onDismiss]);
  return (
    <div className="fade-in" style={{
      position: 'fixed', top: 70, right: 16, zIndex: 500,
      maxWidth: 300, background: '#1E2240',
      border: '1px solid rgba(108,62,232,0.5)',
      borderRadius: 14, padding: '14px 16px',
      boxShadow: '0 8px 32px rgba(0,0,0,0.35)',
    }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', gap: 10 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>⏳</span>
        <div style={{ flex: 1 }}>
          <div style={{ fontSize: 13, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Generation in progress</div>
          <div style={{ fontSize: 11, color: 'rgba(255,255,255,0.55)', lineHeight: 1.5 }}>
            This takes a few minutes — keep this tab open in the background. Use another tab or your phone meanwhile.
          </div>
        </div>
        <button onClick={onDismiss} style={{ background: 'none', border: 'none', color: 'rgba(255,255,255,0.35)', cursor: 'pointer', fontSize: 18, padding: 0, lineHeight: 1, flexShrink: 0 }}>×</button>
      </div>
      <div style={{ marginTop: 10, height: 2, background: 'rgba(255,255,255,0.1)', borderRadius: 1 }}>
        <div style={{ height: '100%', borderRadius: 1, background: T.ACCENT_GRAD, width: `${(sec / 15) * 100}%`, transition: 'width 1s linear' }} />
      </div>
      <div style={{ marginTop: 5, fontSize: 10, color: 'rgba(255,255,255,0.25)', textAlign: 'right' }}>auto-dismiss in {sec}s</div>
    </div>
  );
}

// ── Feedback Widget ──────────────────────────────────────────────
function FeedbackWidget({ docTitle, outputType, stats, onClose }) {
  const [stars, setStars] = useState(0);
  const [hover, setHover] = useState(0);
  const [msg, setMsg] = useState('');
  const [sent, setSent] = useState(false);

  const submit = () => {
    logToSheets({ topic: docTitle, outputType, status: 'feedback', stars, feedback: msg, topics: stats?.topicsWritten, pages: stats?.pagesGenerated });
    setSent(true);
    setTimeout(onClose, 1500);
  };

  if (sent) return (
    <div style={{ padding: '12px 0', textAlign: 'center', color: T.SUCCESS, fontSize: 13 }}>✓ Thanks for your feedback!</div>
  );

  return (
    <div style={{ marginTop: 12, padding: 14, borderRadius: 12, background: T.ACCENT_SOFT, border: `1px solid ${T.BORDER}` }}>
      <div style={{ fontSize: 13, fontWeight: 600, color: T.TEXT, marginBottom: 8 }}>Rate your generated PDF</div>
      <div style={{ display: 'flex', gap: 4, marginBottom: 8 }}>
        {[1, 2, 3, 4, 5].map((n) => (
          <button key={n}
            onMouseEnter={() => setHover(n)} onMouseLeave={() => setHover(0)}
            onClick={() => setStars(n)}
            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 24, color: n <= (hover || stars) ? T.WARNING : T.BORDER, padding: '0 2px', lineHeight: 1 }}
          >★</button>
        ))}
      </div>
      <textarea
        placeholder="Optional — tell us what you liked or what can be better"
        value={msg} onChange={(e) => setMsg(e.target.value)} rows={2}
        style={{ width: '100%', padding: '8px 10px', borderRadius: 8, border: `1.5px solid ${T.BORDER}`, fontSize: 12, color: T.TEXT, background: '#FAFBFF', resize: 'none', outline: 'none', fontFamily: 'inherit' }}
      />
      <div style={{ display: 'flex', gap: 8, marginTop: 8 }}>
        <button onClick={submit} disabled={!stars} style={{ flex: 1, padding: '8px', borderRadius: 8, border: 'none', background: stars ? T.ACCENT_GRAD : T.BORDER, color: '#fff', fontSize: 12, fontWeight: 600, cursor: stars ? 'pointer' : 'default' }}>Submit Rating</button>
        <button onClick={onClose} style={{ padding: '8px 14px', borderRadius: 8, border: `1px solid ${T.BORDER}`, background: 'none', color: T.MUTED, fontSize: 12, cursor: 'pointer' }}>Skip</button>
      </div>
    </div>
  );
}

function AgentStatusBar({ apiKeys }) {
  const [statuses, setStatuses] = useState(
    apiKeys.map((k) => (k && k.startsWith('nvapi-') ? 'ready' : 'invalid'))
  );

  useEffect(() => {
    apiKeys.forEach((key, i) => {
      if (!key || !key.startsWith('nvapi-')) return;
      fetch('/api/nvidia/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: 'meta/llama-3.3-70b-instruct', messages: [{ role: 'user', content: 'hi' }], max_tokens: 1 }),
      }).then((r) => {
        setStatuses((prev) => { const n = [...prev]; n[i] = r.ok ? 'ready' : 'error'; return n; });
      }).catch(() => {/* keep as ready if network err */});
    });
  }, []);

  return (
    <div style={{ marginTop: 14, borderTop: `1px solid ${T.BORDER}`, paddingTop: 14 }}>
      <div style={{ fontSize: 12, fontWeight: 600, color: T.MUTED, marginBottom: 8 }}>
        AI Agents
      </div>
      <div className="agent-grid" style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
        {apiKeys.map((_, i) => {
          const s = statuses[i];
          const color = s === 'ready' ? T.SUCCESS : s === 'invalid' ? T.WARNING : T.DANGER;
          const bg = s === 'ready' ? 'rgba(16,185,129,0.08)' : s === 'invalid' ? 'rgba(245,158,11,0.08)' : 'rgba(239,68,68,0.08)';
          const label = s === 'ready' ? 'Ready' : s === 'invalid' ? 'Not set' : 'Error';
          return (
            <div key={i} style={{
              display: 'flex', alignItems: 'center', gap: 5,
              padding: '5px 12px', borderRadius: 20, fontSize: 12, fontWeight: 600,
              background: bg, color, border: `1px solid ${color}22`
            }}>
              <span style={{ width: 6, height: 6, borderRadius: '50%', background: color, display: 'inline-block' }} />
              Agent {i + 1} — {label}
            </div>
          );
        })}
      </div>
    </div>
  );
}

const WORKER_IDX = { worker_a: 0, worker_b: 1, worker_c: 2, worker_d: 3 };

function WorkflowVisualizer({ stepStatuses, stats, workerStats }) {
  const getIcon = (status) => {
    if (status === 'done') return <span style={{ color: T.SUCCESS, fontSize: 16 }}>✓</span>;
    if (status === 'error') return <span style={{ color: T.DANGER, fontSize: 16 }}>✗</span>;
    if (status === 'active') return <span className="spin" style={{ color: T.ACCENT, fontSize: 16, display: 'inline-block' }}>⟳</span>;
    return <span style={{ color: T.BORDER, fontSize: 16 }}>○</span>;
  };

  const workerIds = ['worker_a', 'worker_b', 'worker_c', 'worker_d'];

  return (
    <div style={{ background: T.CARD, borderRadius: 16, padding: 20, border: `1px solid ${T.BORDER}`, boxShadow: T.SHADOW }}>
      <div style={{ fontSize: 15, fontWeight: 700, color: T.TEXT, marginBottom: 14, display: 'flex', alignItems: 'center', gap: 8 }}>
        <span className="spin" style={{ color: T.ACCENT }}>⟳</span>
        Processing Your Content
      </div>

      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        {WORKFLOW_STEPS.map((step) => {
          const status = stepStatuses[step.id];
          const isActive = status === 'active';
          const isDone = status === 'done';
          const isWorker = workerIds.includes(step.id);
          if (isWorker && status === 'pending' && stepStatuses['split'] === 'pending') return null;
          const ws = isWorker ? workerStats?.[WORKER_IDX[step.id]] : null;
          return (
            <div key={step.id} style={{ display: 'flex', alignItems: 'flex-start', gap: 10, opacity: status === 'pending' ? 0.4 : 1, transition: 'opacity 0.3s' }}>
              <div style={{ marginTop: 1, flexShrink: 0 }}>{getIcon(status)}</div>
              <div style={{ flex: 1 }}>
                <div style={{ fontSize: 13, fontWeight: isActive ? 600 : isDone ? 500 : 400, color: isActive ? T.ACCENT : isDone ? T.SUCCESS : T.TEXT }}>
                  {step.label}
                </div>
                {isActive && isWorker && ws && ws.total > 0 && (
                  <div style={{ fontSize: 11, color: T.MUTED, marginTop: 1 }}>
                    {ws.done}/{ws.total} topics · writing…
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <div className="stats-grid" style={{ marginTop: 16, padding: '12px 14px', background: T.ACCENT_SOFT, borderRadius: 12, display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: 10 }}>
        {[
          { icon: '📄', label: 'Pages', val: `${stats.pagesGenerated}` },
          { icon: '📚', label: 'Chapters', val: `${stats.chaptersComplete}` },
          { icon: '📝', label: 'Topics', val: `${stats.topicsWritten}/${stats.totalTopics}` },
          { icon: '🤖', label: 'Agents', val: `${stats.workersActive}` },
          { icon: '⚡', label: 'Speed', val: stats.topicsWritten > 0 ? `${stats.workersActive}×` : '—' },
          { icon: '⏱️', label: 'ETA', val: stats.estCompletionSec > 0 ? `${Math.ceil(stats.estCompletionSec / 60)}m ${stats.estCompletionSec % 60}s` : '…' },
        ].map((s) => (
          <div key={s.label} style={{ textAlign: 'center' }}>
            <div style={{ fontSize: 16 }}>{s.icon}</div>
            <div style={{ fontSize: 14, fontWeight: 700, color: T.ACCENT }}>{s.val}</div>
            <div style={{ fontSize: 10, color: T.MUTED }}>{s.label}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

function TopicReviewPanel({ chapters, setChapters, onGenerate, splitMode, setSplitMode, webSearch, setWebSearch }) {
  const totalTopics = chapters.reduce((a, c) => a + (c.topics?.length || 0), 0);
  const estSeconds = Math.round(totalTopics * 30 / 4); // 4 parallel agents, ~30s per topic

  const [expandedChapters, setExpandedChapters] = useState(() => {
    const s = {};
    chapters.forEach((_, i) => { s[i] = i < 3; });
    return s;
  });

  const toggleChapter = (i) => {
    setExpandedChapters(prev => ({ ...prev, [i]: !prev[i] }));
  };

  const updateChapterName = (ci, name) => {
    setChapters(prev => prev.map((c, i) => i === ci ? { ...c, name } : c));
  };

  const updateTopicName = (ci, ti, name) => {
    setChapters(prev => prev.map((c, i) => i === ci
      ? { ...c, topics: c.topics.map((t, j) => j === ti ? { ...t, name } : t) }
      : c
    ));
  };

  const addTopic = (ci) => {
    setChapters(prev => prev.map((c, i) => i === ci
      ? { ...c, topics: [...(c.topics || []), { id: `${c.id}.${(c.topics?.length || 0) + 1}`, name: 'New Topic', subtopics: [] }] }
      : c
    ));
  };

  const removeTopic = (ci, ti) => {
    setChapters(prev => prev.map((c, i) => i === ci
      ? { ...c, topics: c.topics.filter((_, j) => j !== ti) }
      : c
    ));
  };

  return (
    <div className="fade-in" style={{
      background: T.CARD, borderRadius: 16, padding: 20,
      border: `1px solid ${T.BORDER}`, boxShadow: T.SHADOW
    }}>
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 16, fontWeight: 700, color: T.TEXT, marginBottom: 4 }}>
          📋 Content Plan — Review & Edit
        </div>
        <div style={{ fontSize: 13, color: T.MUTED }}>
          Click chapter/topic names to edit. Remove unwanted topics. Confirm to generate.
        </div>
      </div>

      <div style={{ maxHeight: 360, overflowY: 'auto', marginBottom: 14 }}>
        {chapters.map((ch, ci) => (
          <div key={ch.id} style={{ marginBottom: 8 }}>
            <div
              style={{
                display: 'flex', alignItems: 'center', gap: 8, padding: '8px 10px',
                background: T.ACCENT_SOFT, borderRadius: 8, cursor: 'pointer'
              }}
              onClick={() => toggleChapter(ci)}
            >
              <span style={{ color: T.ACCENT, fontSize: 12, transition: 'transform 0.2s', transform: expandedChapters[ci] ? 'rotate(90deg)' : 'rotate(0)' }}>▶</span>
              <input
                value={ch.name}
                onChange={(e) => { e.stopPropagation(); updateChapterName(ci, e.target.value); }}
                onClick={(e) => e.stopPropagation()}
                style={{
                  flex: 1, border: 'none', background: 'transparent',
                  fontSize: 13, fontWeight: 600, color: T.TEXT,
                  cursor: 'text', outline: 'none'
                }}
              />
              <span style={{ fontSize: 11, color: T.MUTED, flexShrink: 0 }}>
                {ch.topics?.length || 0} topics
              </span>
            </div>

            {expandedChapters[ci] && (
              <div style={{ paddingLeft: 20, paddingTop: 4 }}>
                {(ch.topics || []).map((t, ti) => (
                  <div key={t.id} style={{
                    display: 'flex', alignItems: 'center', gap: 6,
                    padding: '5px 8px', borderRadius: 6,
                    marginBottom: 2, background: '#FAFBFF',
                    border: `1px solid ${T.BORDER}`
                  }}>
                    <span style={{ fontSize: 10, color: T.MUTED }}>•</span>
                    <input
                      value={t.name}
                      onChange={(e) => updateTopicName(ci, ti, e.target.value)}
                      style={{
                        flex: 1, border: 'none', background: 'transparent',
                        fontSize: 12, color: T.TEXT, outline: 'none'
                      }}
                    />
                    {t.needs_web_search && (
                      <span title="Web search enabled" style={{ fontSize: 12 }}>🌐</span>
                    )}
                    <button
                      onClick={() => removeTopic(ci, ti)}
                      style={{
                        border: 'none', background: 'none', color: T.MUTED,
                        cursor: 'pointer', fontSize: 14, padding: '0 2px', lineHeight: 1
                      }}
                    >×</button>
                  </div>
                ))}
                <button
                  onClick={() => addTopic(ci)}
                  style={{
                    marginTop: 4, padding: '4px 10px', borderRadius: 6,
                    border: `1px dashed ${T.ACCENT}`, background: 'none',
                    color: T.ACCENT, fontSize: 12, cursor: 'pointer'
                  }}
                >+ Add topic</button>
              </div>
            )}
          </div>
        ))}
      </div>

      {/* Split mode */}
      <div style={{ marginBottom: 12 }}>
        <div style={{ fontSize: 13, fontWeight: 600, color: T.TEXT, marginBottom: 6 }}>Split Mode</div>
        <div style={{ display: 'flex', gap: 12 }}>
          {['chapter', 'content_type'].map((m) => (
            <label key={m} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13 }}>
              <input type="radio" name="splitmode" value={m} checked={splitMode === m} onChange={() => setSplitMode(m)}
                style={{ accentColor: T.ACCENT }} />
              {m === 'chapter' ? '● Chapter-based (faster)' : '○ Content-type (higher quality)'}
            </label>
          ))}
        </div>
      </div>

      <div style={{ marginBottom: 16 }}>
        <Toggle
          value={webSearch}
          onChange={setWebSearch}
          label="Enhance with web search (Jina)"
          note="Only used for topics flagged as needing current/recent info"
        />
      </div>

      <div style={{ borderTop: `1px solid ${T.BORDER}`, paddingTop: 12, marginBottom: 12 }}>
        <div style={{ fontSize: 12, color: T.MUTED, marginBottom: 10 }}>
          {chapters.length} chapters · {totalTopics} topics · Est. ~{Math.ceil(estSeconds / 60)}m {estSeconds % 60}s with 4 parallel agents
        </div>
      </div>

      <button
        onClick={onGenerate}
        style={{
          width: '100%', padding: '14px 24px',
          background: T.ACCENT_GRAD, color: '#fff',
          border: 'none', borderRadius: 12, fontSize: 15,
          fontWeight: 700, cursor: 'pointer',
          boxShadow: '0 4px 16px rgba(108,62,232,0.4)',
          display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
        }}
      >
        ✦ Generate Content
      </button>
    </div>
  );
}

function ExportSection({ results, chapters, title, outputType, stats, genStartTime }) {
  const [exporting, setExporting] = useState(null);
  const [showFeedback, setShowFeedback] = useState(false);
  const [imgLog, setImgLog] = useState(null);

  const handlePDF = async () => {
    setExporting('pdf');
    setImgLog(null);
    try {
      await exportToPDF(
        title || 'Document', outputType || 'Study Material', chapters, results,
        {},
        (log) => setImgLog(log),
      );
      logToSheets({
        topic: title, outputType, status: 'downloaded_pdf',
        chapters: chapters.length, topics: results.length,
        pages: stats?.pagesGenerated || 0,
        duration: genStartTime ? Math.round((Date.now() - genStartTime) / 1000) : 0,
      });
      setShowFeedback(true);
    } catch (e) { alert('PDF export failed: ' + e.message); }
    setExporting(null);
  };
  const handleWord = async () => {
    setExporting('word');
    try {
      await exportToWord(title || 'Document', outputType || 'Study Material', chapters, results);
      logToSheets({ topic: title, outputType, status: 'downloaded_word', chapters: chapters.length, topics: results.length });
      setShowFeedback(true);
    } catch (e) { alert('Word export failed: ' + e.message); }
    setExporting(null);
  };
  const handleMD = () => {
    exportToMarkdown(title || 'Document', outputType || 'Study Material', results, chapters);
    logToSheets({ topic: title, outputType, status: 'downloaded_md' });
  };

  return (
    <div className="fade-in" style={{ background: T.CARD, borderRadius: 16, padding: 20, border: `1px solid ${T.SUCCESS}`, boxShadow: `0 4px 24px rgba(16,185,129,0.08)` }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 8, marginBottom: 14 }}>
        <span style={{ fontSize: 18 }}>✅</span>
        <div>
          <div style={{ fontSize: 15, fontWeight: 700, color: T.TEXT }}>Generation Complete!</div>
          <div style={{ fontSize: 12, color: T.MUTED }}>{results.length} topics generated · Ready to export</div>
        </div>
      </div>

      <div className="export-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 10, marginBottom: 14 }}>
        <button onClick={handlePDF} disabled={!!exporting} style={{ padding: '12px 8px', borderRadius: 10, border: 'none', background: exporting === 'pdf' ? '#9CA3AF' : T.ACCENT_GRAD, color: '#fff', fontSize: 13, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          {exporting === 'pdf' ? '⟳ Building…' : '📄 Download PDF'}
        </button>
        <button onClick={handleWord} disabled={!!exporting} style={{ padding: '12px 8px', borderRadius: 10, border: `2px solid #3B82F6`, background: '#EFF6FF', color: '#1D4ED8', fontSize: 13, fontWeight: 600, cursor: exporting ? 'wait' : 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          {exporting === 'word' ? '⟳ Building…' : '📝 Download Word'}
        </button>
        <button onClick={handleMD} style={{ padding: '12px 8px', borderRadius: 10, border: `2px solid ${T.BORDER}`, background: '#F9FAFB', color: T.MUTED, fontSize: 13, fontWeight: 600, cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
          📋 Markdown
        </button>
      </div>

      {imgLog && (
        <div style={{
          fontSize: 12, color: T.MUTED, background: 'rgba(0,0,0,0.03)',
          border: `1px solid ${T.BORDER}`, borderRadius: 8, padding: '8px 12px',
          marginBottom: 12, display: 'flex', flexWrap: 'wrap', gap: '6px 16px', alignItems: 'center',
        }}>
          <span style={{ fontWeight: 600, color: T.TEXT }}>Images in PDF:</span>
          <span>{imgLog.cover ? '✅ Cover photo' : '— No cover photo'}</span>
          <span>
            {imgLog.wikiTotal > 0
              ? `${imgLog.wikiLoaded} / ${imgLog.wikiTotal} topic images`
              : 'No topic images'}
            {imgLog.wikiLoaded > 0 ? ' ✅' : ''}
          </span>
          {imgLog.mermaid > 0 && <span>{imgLog.mermaid} diagram{imgLog.mermaid > 1 ? 's' : ''} ✅</span>}
          {!imgLog.done && <span style={{ color: T.ACCENT }}>⟳ loading…</span>}
        </div>
      )}

      {showFeedback && (
        <FeedbackWidget
          docTitle={title} outputType={outputType} stats={stats}
          onClose={() => setShowFeedback(false)}
        />
      )}
    </div>
  );
}

// ── Main App ─────────────────────────────────────────────────────
export default function App() {
  const [loaded, setLoaded] = useState(false);
  const [isDark, setIsDark] = useState(false);
  const [topic, setTopic] = useState('');
  const [customTopics, setCustomTopics] = useState('');
  const [outputType, setOutputType] = useState('Study Material');
  const [outputTypeId, setOutputTypeId] = useState('study');
  const [depth, setDepth] = useState('Detailed');
  const [audience, setAudience] = useState('Student');
  const [length, setLength] = useState('Medium (~40pp)');
  const [addExamples, setAddExamples] = useState(true);
  const [addQuestions, setAddQuestions] = useState(true);
  const [addDiagrams, setAddDiagrams] = useState(true);
  const [addTakeaways, setAddTakeaways] = useState(true);
  const [pdfFiles, setPdfFiles] = useState([]);
  const [imageFiles, setImageFiles] = useState([]);
  const [apiKeys, setApiKeys] = useState(() => {
    // If env vars provide valid keys (deployed on Vercel), always use them —
    // prevents stale sessionStorage from a prior keyless deployment overriding.
    const envKeysValid = NVIDIA_KEYS.some((k) => k && k.startsWith('nvapi-'));
    if (!envKeysValid) {
      try {
        const stored = sessionStorage.getItem('pf_keys');
        if (stored) return JSON.parse(stored);
      } catch {}
    }
    return [...NVIDIA_KEYS];
  });
  const [webSearch, setWebSearch] = useState(false);
  const [splitMode, setSplitMode] = useState('chapter');
  const [docTitle, setDocTitle] = useState('');
  const [lastGenTime, setLastGenTime] = useState(0);
  const [cooldown, setCooldown] = useState(0);
  const [uploadStatus, setUploadStatus] = useState('');
  const [showToast, setShowToast] = useState(false);
  const [retryCountdown, setRetryCountdown] = useState(null);
  const retryParamsRef = useRef(null);
  const genStartRef = useRef(null);

  const gen = useGenerator();

  // Colors based on dark mode
  const bg = isDark ? '#0F1020' : T.BG;
  const card = isDark ? '#1E2240' : T.CARD;
  const text = isDark ? '#E8E9F3' : T.TEXT;
  const border = isDark ? '#2D3060' : T.BORDER;
  const muted = isDark ? '#9CA3AF' : T.MUTED;

  // Retry countdown — fires orchestrate again when it hits 0
  useEffect(() => {
    if (retryCountdown === null) return;
    if (retryCountdown <= 0) {
      setRetryCountdown(null);
      const p = retryParamsRef.current;
      if (p) {
        gen.resetForRetry();
        gen.orchestrate(p.topic, p.outputType, p.options, p.chunks, p.customTopics)
          .catch((err) => {
            if (err.message?.includes('no topics') || err.message?.includes('retrying')) {
              retryParamsRef.current = p;
              setRetryCountdown(10);
            }
          });
      }
      return;
    }
    const t = setTimeout(() => setRetryCountdown((c) => c - 1), 1000);
    return () => clearTimeout(t);
  }, [retryCountdown]);

  // Cooldown timer
  useEffect(() => {
    if (cooldown <= 0) return;
    const t = setInterval(() => {
      setCooldown((c) => Math.max(0, c - 1));
    }, 1000);
    return () => clearInterval(t);
  }, [cooldown]);

  const handleKeyChange = (i, val) => {
    const next = [...apiKeys];
    next[i] = val;
    setApiKeys(next);
    sessionStorage.setItem('pf_keys', JSON.stringify(next));
    gen.resetKeys(next);
  };

  const handleOrchestrate = async () => {
    if (!topic.trim() && pdfFiles.length === 0 && imageFiles.length === 0) {
      alert('Please enter a topic or upload files.');
      return;
    }
    if (Date.now() - lastGenTime < 30000) {
      alert(`Please wait ${Math.ceil((30000 - (Date.now() - lastGenTime)) / 1000)}s before starting again.`);
      return;
    }

    let chunks = [];

    // Process uploads
    if (pdfFiles.length > 0 || imageFiles.length > 0) {
      const allFiles = [...pdfFiles, ...imageFiles];
      try {
        setUploadStatus('Processing uploads…');
        const result = await gen.processUploads(allFiles);
        chunks = result.chunks || [];
        setUploadStatus(`✓ ${result.pdfsProcessed} PDF(s), ${result.imagesProcessed} image(s) processed`);
      } catch (e) {
        setUploadStatus('⚠ Some files could not be processed');
      }
    }

    const orchParams = {
      topic: topic || 'General Document',
      outputType,
      options: { depth, audience, length },
      chunks,
      customTopics,
    };
    try {
      await gen.orchestrate(orchParams.topic, orchParams.outputType, orchParams.options, orchParams.chunks, orchParams.customTopics);
    } catch (err) {
      if (err.message?.includes('no topics') || err.message?.includes('retrying')) {
        retryParamsRef.current = orchParams;
        setRetryCountdown(10);
      }
    }
  };

  const handleGenerate = async () => {
    setLastGenTime(Date.now());
    genStartRef.current = Date.now();
    setCooldown(30);
    setShowToast(true);
    logToSheets({ topic: topic || 'General Document', outputType, status: 'started', chapters: gen.chapters.length });
    await gen.generate(splitMode, webSearch, {
      depth, audience, length, outputType,
      addExamples, addQuestions, addDiagrams, addTakeaways
    }).catch((err) => {
      logToSheets({ topic: topic || 'General Document', outputType, status: 'interrupted', error: err?.message || 'unknown' });
    });
  };

  // Set doc title from orchestrator result
  useEffect(() => {
    if (gen.phase >= 2 && gen.chapters.length > 0 && !docTitle) {
      setDocTitle(topic || 'Generated Document');
    }
  }, [gen.phase, gen.chapters]);

  const safeCleanTopic = (val) => {
    return val.replace(/[<>{}]/g, '').slice(0, 500);
  };

  return (
    <>
      <style>{GLOBAL_CSS}</style>
      {!loaded && <SiteLoader onDone={() => setLoaded(true)} />}
      {showToast && <GenerationToast onDismiss={() => setShowToast(false)} />}
      <div style={{ background: bg, minHeight: '100vh', color: text, transition: 'background 0.3s, color 0.3s' }}>

        {/* ── HEADER ── */}
        <header style={{
          position: 'sticky', top: 0, zIndex: 100,
          background: isDark ? 'rgba(15,16,32,0.95)' : 'rgba(248,249,255,0.95)',
          backdropFilter: 'blur(12px)',
          borderBottom: `1px solid ${border}`,
          padding: '0 24px',
          display: 'flex', alignItems: 'center', justifyContent: 'space-between',
          height: 60
        }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: 10 }}>
            <div style={{
              width: 32, height: 32, borderRadius: 8,
              background: T.ACCENT_GRAD,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: '#fff', fontSize: 16, fontWeight: 700
            }}>✦</div>
            <span style={{ fontSize: 16, fontWeight: 700, color: text }}>PlanForge AI</span>
          </div>
          <button
            onClick={() => setIsDark(!isDark)}
            style={{
              width: 36, height: 36, borderRadius: 10,
              border: `1px solid ${border}`, background: isDark ? '#1E2240' : '#fff',
              cursor: 'pointer', fontSize: 16,
              display: 'flex', alignItems: 'center', justifyContent: 'center',
              color: muted
            }}
          >{isDark ? '☀️' : '🌙'}</button>
        </header>

        {/* ── HERO ── */}
        <div className="hero-pad" style={{
          textAlign: 'center', padding: '48px 24px 32px',
          maxWidth: 680, margin: '0 auto'
        }}>
          <Badge>✦ AI PDF GENERATOR</Badge>
          <h1 style={{
            marginTop: 16, fontSize: 'clamp(32px,5vw,52px)',
            fontWeight: 800, lineHeight: 1.1, letterSpacing: '-0.02em', color: text
          }}>
            Turn Anything Into<br />
            <span style={{
              background: T.ACCENT_GRAD, WebkitBackgroundClip: 'text',
              WebkitTextFillColor: 'transparent', backgroundClip: 'text'
            }}>Perfect PDF</span>
          </h1>
          <p style={{ marginTop: 14, fontSize: 16, color: muted, lineHeight: 1.6 }}>
            Combine topics, PDFs, and images. AI enhances,<br />
            structures, and generates professional PDFs in seconds.
          </p>
          <div style={{
            marginTop: 20, display: 'flex', flexWrap: 'wrap',
            gap: 10, justifyContent: 'center'
          }}>
            {['AI Enhanced', 'Smart Processing', 'Well Structured', 'Instant Download'].map((f, i) => (
              <span key={f} style={{
                display: 'flex', alignItems: 'center', gap: 6,
                fontSize: 13, color: muted, padding: '5px 12px',
                borderRadius: 20, border: `1px solid ${border}`,
                background: card
              }}>
                {['✦', '⚙', '📄', '⬇'][i]} {f}
              </span>
            ))}
          </div>
        </div>

        {/* ── MAIN GRID ── */}
        <div className="main-grid" style={{
          maxWidth: 1200, margin: '0 auto',
          padding: '0 20px 60px',
          display: 'grid',
          gridTemplateColumns: 'minmax(0,3fr) minmax(0,2fr)',
          gap: 24,
          alignItems: 'start'
        }}>

          {/* ── LEFT PANEL ── */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 16 }}>

            {/* Main inputs card */}
            <div style={{
              background: card, borderRadius: 16, padding: 24,
              boxShadow: T.SHADOW, border: `1px solid ${border}`
            }}>

              {/* Step 1 */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <StepCircle num={1} />
                <span style={{ fontSize: 15, fontWeight: 700, color: text }}>Add Your Inputs</span>
              </div>

              <div className="input-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 14, marginBottom: 14 }}>
                {/* Topic */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 6 }}>
                    ✏️ Topic <span style={{ fontWeight: 400 }}>(Optional)</span>
                  </div>
                  <input
                    value={topic}
                    onChange={(e) => setTopic(safeCleanTopic(e.target.value))}
                    placeholder="e.g. Machine Learning"
                    style={{
                      width: '100%', padding: '10px 12px',
                      borderRadius: 10, border: `1.5px solid ${border}`,
                      background: isDark ? '#0F1020' : '#FAFBFF',
                      color: text, fontSize: 13,
                      outline: 'none', transition: 'border 0.2s'
                    }}
                    onFocus={(e) => e.target.style.borderColor = T.ACCENT}
                    onBlur={(e) => e.target.style.borderColor = border}
                  />
                </div>

                {/* Upload PDFs */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 6 }}>
                    📄 Upload PDFs <span style={{ fontWeight: 400 }}>(Optional)</span>
                  </div>
                  <DropZone label="PDFs" accept="pdf" files={pdfFiles} onFiles={setPdfFiles} icon="📄" />
                </div>

                {/* Upload Images */}
                <div>
                  <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 6 }}>
                    🖼️ Upload Images <span style={{ fontWeight: 400 }}>(Optional)</span>
                  </div>
                  <DropZone label="images" accept="image" files={imageFiles} onFiles={setImageFiles} icon="🖼️" />
                </div>
              </div>

              {uploadStatus && (
                <div style={{ fontSize: 12, color: T.SUCCESS, marginBottom: 10 }}>
                  ✓ {uploadStatus}
                </div>
              )}

              <div style={{ fontSize: 12, color: muted, display: 'flex', alignItems: 'center', gap: 5 }}>
                <span>🛡️</span> You can use any combination of topic, PDFs and images
              </div>

              {/* Custom topics */}
              <div style={{ marginTop: 14 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 5 }}>
                  📋 Your Own Topic List{' '}
                  <span style={{ fontWeight: 400, color: T.ACCENT }}>(Optional)</span>
                  <span style={{ fontWeight: 400 }}> — AI will organize content around exactly these topics</span>
                </div>
                <textarea
                  value={customTopics}
                  onChange={(e) => setCustomTopics(e.target.value)}
                  placeholder={'e.g.\nNeural Networks & Perceptrons\nBackpropagation Explained\nCNNs and Pooling\n(one topic per line)'}
                  rows={3}
                  style={{
                    width: '100%', padding: '10px 12px',
                    borderRadius: 10, border: `1.5px solid ${border}`,
                    background: isDark ? '#0F1020' : '#FAFBFF',
                    color: text, fontSize: 12, resize: 'vertical',
                    outline: 'none', fontFamily: 'inherit', lineHeight: 1.5,
                    transition: 'border 0.2s',
                  }}
                  onFocus={(e) => e.target.style.borderColor = T.ACCENT}
                  onBlur={(e) => e.target.style.borderColor = border}
                />
              </div>

              {/* Agent status */}
              <AgentStatusBar apiKeys={apiKeys} />

              {/* Web Search */}
              <div style={{ marginTop: 14, borderTop: `1px solid ${border}`, paddingTop: 14 }}>
                <Toggle
                  value={webSearch}
                  onChange={setWebSearch}
                  label="Enhance with web search (Jina, free)"
                  note="Only used for recent/current topics. Standard educational content: skipped."
                />
              </div>
            </div>

            {/* Step 2 — Output Type */}
            <div style={{
              background: card, borderRadius: 16, padding: 24,
              boxShadow: T.SHADOW, border: `1px solid ${border}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <StepCircle num={2} />
                <span style={{ fontSize: 15, fontWeight: 700, color: text }}>Choose Output Type</span>
              </div>

              <div className="output-grid-4" style={{
                display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 10
              }}>
                {OUTPUT_TYPES.map((ot) => {
                  const active = outputTypeId === ot.id;
                  return (
                    <button
                      key={ot.id}
                      onClick={() => { setOutputTypeId(ot.id); setOutputType(ot.label); }}
                      style={{
                        padding: '12px 8px', borderRadius: 12, cursor: 'pointer',
                        border: `2px solid ${active ? T.ACCENT : border}`,
                        background: active ? T.ACCENT_SOFT : isDark ? '#0F1020' : '#FAFBFF',
                        textAlign: 'center', transition: 'all 0.2s'
                      }}
                    >
                      <div style={{ fontSize: 20, marginBottom: 4 }}>{ot.icon}</div>
                      <div style={{ fontSize: 12, fontWeight: 600, color: active ? T.ACCENT : text }}>{ot.label}</div>
                      <div style={{ fontSize: 10, color: muted, marginTop: 2 }}>{ot.desc}</div>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Step 3 — Customize */}
            <div style={{
              background: card, borderRadius: 16, padding: 24,
              boxShadow: T.SHADOW, border: `1px solid ${border}`
            }}>
              <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 16 }}>
                <StepCircle num={3} />
                <span style={{ fontSize: 15, fontWeight: 700, color: text }}>Customize Your PDF</span>
              </div>

              <div className="input-grid-3" style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 12, marginBottom: 14 }}>
                {[
                  { label: 'Depth & Detail', options: DEPTHS, value: depth, set: setDepth },
                  { label: 'Target Audience', options: AUDIENCES, value: audience, set: setAudience },
                  { label: 'PDF Length', options: LENGTHS, value: length, set: setLength },
                ].map((d) => (
                  <div key={d.label}>
                    <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 6 }}>{d.label}</div>
                    <select
                      value={d.value}
                      onChange={(e) => d.set(e.target.value)}
                      style={{
                        width: '100%', padding: '10px 12px',
                        borderRadius: 10, border: `1.5px solid ${border}`,
                        background: isDark ? '#0F1020' : '#FAFBFF',
                        color: text, fontSize: 13, cursor: 'pointer',
                        outline: 'none', appearance: 'none', transition: 'border 0.2s',
                        backgroundImage: `url("data:image/svg+xml,%3Csvg width='12' height='8' viewBox='0 0 12 8' fill='none' xmlns='http://www.w3.org/2000/svg'%3E%3Cpath d='M1 1L6 7L11 1' stroke='%236B7280' stroke-width='2' stroke-linecap='round'/%3E%3C/svg%3E")`,
                        backgroundRepeat: 'no-repeat', backgroundPosition: 'right 12px center'
                      }}
                      onFocus={(e) => e.target.style.borderColor = T.ACCENT}
                      onBlur={(e) => e.target.style.borderColor = border}
                    >
                      {d.options.map((o) => <option key={o}>{o}</option>)}
                    </select>
                  </div>
                ))}
              </div>

              <div style={{ marginBottom: 16 }}>
                <div style={{ fontSize: 12, fontWeight: 600, color: muted, marginBottom: 8 }}>Additional Preferences <span style={{ fontWeight: 400 }}>(Optional)</span></div>
                <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
                  {[
                    ['addExamples', addExamples, setAddExamples, 'Add Examples'],
                    ['addQuestions', addQuestions, setAddQuestions, 'Practice Questions'],
                    ['addDiagrams', addDiagrams, setAddDiagrams, 'Diagrams & Charts'],
                    ['addTakeaways', addTakeaways, setAddTakeaways, 'Key Takeaways'],
                  ].map(([key, val, setter, label]) => (
                    <label key={key} style={{ display: 'flex', alignItems: 'center', gap: 6, cursor: 'pointer', fontSize: 13, color: text }}>
                      <input type="checkbox" checked={val} onChange={(e) => setter(e.target.checked)}
                        style={{ accentColor: T.ACCENT, width: 14, height: 14 }} />
                      {label}
                    </label>
                  ))}
                </div>
              </div>

              {/* Generate button */}
              {gen.phase === 0 && (
                <button
                  onClick={handleOrchestrate}
                  disabled={gen.phase === 1}
                  style={{
                    width: '100%', padding: '16px 24px',
                    background: gen.phase === 1 ? '#9CA3AF' : T.ACCENT_GRAD,
                    color: '#fff', border: 'none', borderRadius: 14,
                    fontSize: 16, fontWeight: 700, cursor: gen.phase === 1 ? 'wait' : 'pointer',
                    boxShadow: '0 6px 20px rgba(108,62,232,0.35)',
                    display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
                    transition: 'transform 0.1s, box-shadow 0.1s'
                  }}
                  onMouseEnter={(e) => {
                    if (gen.phase === 0) {
                      e.target.style.transform = 'translateY(-1px)';
                      e.target.style.boxShadow = '0 8px 28px rgba(108,62,232,0.45)';
                    }
                  }}
                  onMouseLeave={(e) => {
                    e.target.style.transform = 'translateY(0)';
                    e.target.style.boxShadow = '0 6px 20px rgba(108,62,232,0.35)';
                  }}
                >
                  ✦ Generate PDF
                  <div style={{ fontSize: 12, fontWeight: 400, opacity: 0.8 }}>Takes less than 60 seconds</div>
                </button>
              )}

              {gen.phase === 1 && (
                <button disabled style={{
                  width: '100%', padding: '16px 24px',
                  background: '#9CA3AF', color: '#fff', border: 'none', borderRadius: 14,
                  fontSize: 16, fontWeight: 700, cursor: 'wait',
                  display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8
                }}>
                  <span className="spin">⟳</span> Analyzing your content…
                </button>
              )}

              <div style={{ textAlign: 'center', marginTop: 10, fontSize: 12, color: muted, display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 5 }}>
                <span>🔒</span> Your files are secure and private. We never store your data.
              </div>
            </div>

            {/* Topic Review (phase 2) */}
            {gen.phase === 2 && (
              <TopicReviewPanel
                chapters={gen.chapters}
                setChapters={gen.setChapters}
                onGenerate={handleGenerate}
                splitMode={splitMode}
                setSplitMode={setSplitMode}
                webSearch={webSearch}
                setWebSearch={setWebSearch}
              />
            )}

            {/* Workflow Visualizer (phase 3-4) */}
            {(gen.phase === 3 || gen.phase === 4) && (
              <WorkflowVisualizer
                stepStatuses={gen.stepStatuses}
                stats={gen.stats}
                workerStats={gen.workerStats}
              />
            )}

            {/* Error display */}
            {gen.error && (
              <div style={{
                padding: '12px 16px', borderRadius: 12,
                background: 'rgba(239,68,68,0.08)', border: `1px solid ${T.DANGER}`,
                color: T.DANGER, fontSize: 13
              }}>
                ⚠️ {gen.error}
                {retryCountdown !== null && (
                  <span style={{ marginLeft: 10, fontWeight: 700 }}>
                    — Retrying in {retryCountdown}s...
                  </span>
                )}
              </div>
            )}

            {/* Export (phase 6) */}
            {gen.phase === 6 && (
              <ExportSection
                results={gen.results}
                chapters={gen.chapters}
                title={docTitle || topic}
                outputType={outputType}
                stats={gen.stats}
                genStartTime={genStartRef.current}
              />
            )}
          </div>

          {/* ── RIGHT PANEL — Preview ── */}
          <div className="right-panel-sticky" style={{ position: 'sticky', top: 80 }}>
            <div style={{
              background: card, borderRadius: 16, padding: 20,
              boxShadow: T.SHADOW_LG, border: `1px solid ${border}`
            }}>
              {/* Preview header */}
              <div style={{
                display: 'flex', alignItems: 'center', justifyContent: 'space-between',
                marginBottom: 14
              }}>
                <span style={{ fontSize: 15, fontWeight: 700, color: text }}>PDF Preview</span>
                <span style={{
                  display: 'flex', alignItems: 'center', gap: 5, fontSize: 12,
                  padding: '4px 10px', borderRadius: 20,
                  background: 'rgba(16,185,129,0.08)', color: T.SUCCESS,
                  border: `1px solid rgba(16,185,129,0.2)`
                }}>
                  <span style={{ width: 6, height: 6, borderRadius: '50%', background: T.SUCCESS, display: 'inline-block' }} />
                  Live Preview
                </span>
              </div>

              {/* Mock cover / live preview */}
              <div style={{
                borderRadius: 12, overflow: 'hidden',
                background: T.PREVIEW_BG,
                minHeight: 360
              }}>
                {gen.phase === 0 || gen.phase === 1 || gen.phase === 2 ? (
                  /* Cover preview using the real template */
                  <div style={{
                    position: 'relative', minHeight: 360, borderRadius: 12, overflow: 'hidden',
                    backgroundImage: `url(${coverTemplateImg})`,
                    backgroundSize: 'cover', backgroundPosition: 'center top',
                  }}>
                    {/* Dynamic overlay — title + status */}
                    <div style={{
                      position: 'absolute', inset: 0,
                      display: 'flex', flexDirection: 'column',
                      alignItems: 'center', justifyContent: 'center',
                      padding: '0 18px', textAlign: 'center', gap: 8,
                    }}>
                      <div style={{
                        fontSize: topic ? Math.max(11, 18 - Math.floor(topic.length / 14)) : 14,
                        fontWeight: 800, color: '#1A1A2E',
                        letterSpacing: '-0.01em', lineHeight: 1.25,
                        maxWidth: '90%',
                      }}>
                        {topic ? topic.toUpperCase() : 'YOUR DOCUMENT TITLE'}
                      </div>
                      {gen.phase === 1 && (
                        <div style={{ fontSize: 11, color: '#6C3EE8', display: 'flex', alignItems: 'center', gap: 5, marginTop: 4 }}>
                          <span className="spin">⟳</span> Planning structure…
                        </div>
                      )}
                      {gen.phase === 2 && (
                        <div style={{ fontSize: 11, color: '#6C3EE8', marginTop: 4 }}>
                          ✓ {gen.chapters.length} chapters ready
                        </div>
                      )}
                    </div>
                  </div>
                ) : (
                  /* Generating / Done — 4-agent live view */
                  <div style={{ padding: 12, minHeight: 360 }}>
                    {gen.phase === 6
                      ? <div style={{ textAlign: 'center', padding: '60px 20px' }}>
                          <div style={{ fontSize: 32, marginBottom: 8 }}>✅</div>
                          <div style={{ fontSize: 14, fontWeight: 600, color: '#fff', marginBottom: 4 }}>Generation Complete!</div>
                          <div style={{ fontSize: 12, color: 'rgba(255,255,255,0.5)' }}>
                            {gen.results.length} topics · {gen.stats.pagesGenerated} pages ready
                          </div>
                          <div style={{ marginTop: 12, display: 'flex', flexWrap: 'wrap', gap: 6, justifyContent: 'center' }}>
                            {gen.chapters.slice(0, 5).map((ch) => (
                              <span key={ch.id} style={{
                                fontSize: 10, padding: '3px 8px', borderRadius: 8,
                                background: 'rgba(108,62,232,0.3)', color: T.ACCENT_LIGHT
                              }}>{ch.name}</span>
                            ))}
                            {gen.chapters.length > 5 && (
                              <span style={{ fontSize: 10, color: 'rgba(255,255,255,0.4)' }}>+{gen.chapters.length - 5} more</span>
                            )}
                          </div>
                        </div>
                          /* Generating phase — 4-agent grid */
                        : <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
                            {gen.workerPreviews.map((content, idx) => {
                              const active = content && !content.startsWith('✓');
                              return (
                                <div key={idx} style={{
                                  background: active ? 'rgba(108,62,232,0.12)' : 'rgba(255,255,255,0.04)',
                                  border: `1px solid ${active ? 'rgba(108,62,232,0.3)' : 'rgba(255,255,255,0.06)'}`,
                                  borderRadius: 8, padding: 8,
                                  minHeight: 160, maxHeight: 160, overflowY: 'auto',
                                  transition: 'border 0.3s, background 0.3s'
                                }}>
                                  <div style={{
                                    fontSize: 10, fontWeight: 700, marginBottom: 5,
                                    color: active ? T.ACCENT_LIGHT : 'rgba(255,255,255,0.3)',
                                    fontFamily: 'monospace', display: 'flex', alignItems: 'center', gap: 4
                                  }}>
                                    {active
                                      ? <span className="spin" style={{ display: 'inline-block' }}>⟳</span>
                                      : <span>○</span>}
                                    Agent {idx + 1}
                                  </div>
                                  <div style={{
                                    fontFamily: 'monospace', fontSize: 10, lineHeight: 1.5,
                                    color: content ? T.PREVIEW_TEXT : 'rgba(255,255,255,0.2)',
                                    whiteSpace: 'pre-wrap', wordBreak: 'break-word'
                                  }}>
                                    {content
                                      ? content.slice(-500)
                                      : 'waiting for work…'}
                                  </div>
                                </div>
                              );
                            })}
                          </div>
                    }
                  </div>
                )}
              </div>
            </div>
          </div>
        </div>

        {/* ── Q&A SECTION ── */}
        <div style={{
          maxWidth: 1200, margin: '0 auto',
          padding: '0 20px 48px'
        }}>
          <div style={{
            background: isDark ? '#1E2240' : T.CARD,
            borderRadius: 20, padding: '28px 32px',
            boxShadow: T.SHADOW_LG,
            border: `1px solid ${isDark ? '#2D3060' : T.BORDER}`
          }}>
            <QASection
              generatedResults={gen.results}
              generatedTitle={docTitle || topic}
            />
          </div>
        </div>

        {/* ── FEATURES FOOTER ── */}
        <div style={{ background: isDark ? '#0A0B18' : '#fff', borderTop: `1px solid ${border}`, padding: '40px 24px 0' }}>
          <div className="features-grid" style={{ maxWidth: 1200, margin: '0 auto', display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: 24 }}>
            {[
              { icon: '✦', title: 'AI Powered', desc: 'Advanced AI models for accurate results' },
              { icon: '⚙', title: 'Smart Processing', desc: 'Improves content and fills knowledge gaps' },
              { icon: '📄', title: 'Professional Output', desc: 'Beautiful, well-structured PDFs every time' },
              { icon: '⚡', title: 'Parallel Generation', desc: '4 AI agents working simultaneously' },
            ].map((f) => (
              <div key={f.title} style={{ display: 'flex', gap: 12, alignItems: 'flex-start' }}>
                <div style={{ width: 40, height: 40, borderRadius: 10, flexShrink: 0, background: T.ACCENT_SOFT, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 18, color: T.ACCENT }}>{f.icon}</div>
                <div>
                  <div style={{ fontSize: 14, fontWeight: 600, color: text, marginBottom: 3 }}>{f.title}</div>
                  <div style={{ fontSize: 13, color: muted, lineHeight: 1.5 }}>{f.desc}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Developer footer */}
          <div style={{ maxWidth: 1200, margin: '32px auto 0', borderTop: `1px solid ${border}`, padding: '16px 0 20px', display: 'flex', alignItems: 'center', justifyContent: 'space-between', flexWrap: 'wrap', gap: 8 }}>
            <div style={{ fontSize: 12, color: muted }}>
              © {new Date().getFullYear()} PlanForge AI · AI-generated content may contain inaccuracies. Verify important information from authoritative sources.
            </div>
            <div style={{ fontSize: 12, color: muted }}>
              Built by{' '}
              <a href="https://lohitr.vercel.app" target="_blank" rel="noopener noreferrer" style={{ color: T.ACCENT, textDecoration: 'none', fontWeight: 500 }}>Lohit R</a>
            </div>
          </div>
        </div>
      </div>
    </>
  );
}
