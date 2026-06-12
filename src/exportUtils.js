// exportUtils.js — PDF (jsPDF) + Word (docx) + Markdown export
import { UNSPLASH_KEY } from './config.js';
import coverTemplateUrl from './images/cover.png';
import endPageUrl from './images/end.png';
import logoUrl from './images/logo.webp';

// ─────────────────────────────────────────────────────────────────
// Image helpers
// ─────────────────────────────────────────────────────────────────
async function imgUrlToBase64(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
    });
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch { return null; }
}

async function imgUrlToPng(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
    });
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          const w = img.naturalWidth || 100; const h = img.naturalHeight || 100;
          c.width = w; c.height = h; c.getContext('2d').drawImage(img, 0, 0);
          resolve({ base64: c.toDataURL('image/png'), w, h });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────
// Text helpers
// NOTE: jsPDF Helvetica uses WinAnsi (CP1252) — only ASCII + Latin-1 renders.
// Unicode chars like → ₄ Δ ≤ ∞ are NOT in CP1252 and will be dropped/corrupted.
// All output must be ASCII-safe.
// ─────────────────────────────────────────────────────────────────
const YEAR = 2026;

function latexToReadable(tex) {
  if (!tex) return '';
  let s = tex;
  for (let i = 0; i < 6; i++) {
    const prev = s;
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
    if (s === prev) break;
  }
  s = s
    // Greek — ASCII spellings (jsPDF cannot render Unicode Greek)
    .replace(/\\alpha/g,'alpha').replace(/\\beta/g,'beta').replace(/\\gamma/g,'gamma')
    .replace(/\\delta/g,'delta').replace(/\\epsilon/g,'epsilon').replace(/\\theta/g,'theta')
    .replace(/\\lambda/g,'lambda').replace(/\\mu/g,'mu').replace(/\\nu/g,'nu')
    .replace(/\\pi/g,'pi').replace(/\\rho/g,'rho').replace(/\\sigma/g,'sigma')
    .replace(/\\tau/g,'tau').replace(/\\phi/g,'phi').replace(/\\omega/g,'omega')
    .replace(/\\Delta/g,'Delta').replace(/\\Sigma/g,'Sigma').replace(/\\Omega/g,'Omega')
    // Math operators — ASCII-safe
    .replace(/\\cdot/g,'*').replace(/\\times/g,'x').replace(/\\pm/g,'+/-')
    .replace(/\\leq/g,'<=').replace(/\\geq/g,'>=').replace(/\\neq/g,'!=')
    .replace(/\\approx/g,'~').replace(/\\infty/g,'inf')
    .replace(/\\rightarrow/g,' -> ').replace(/\\leftarrow/g,' <- ').replace(/\\to\b/g,' -> ')
    .replace(/\\sqrt\{([^{}]+)\}/g,'sqrt($1)')
    .replace(/\\text\{([^{}]+)\}/g,'$1').replace(/\\mathrm\{([^{}]+)\}/g,'$1')
    .replace(/\\ln\b/g,'ln').replace(/\\log\b/g,'log').replace(/\\exp\b/g,'exp')
    .replace(/\\sin\b/g,'sin').replace(/\\cos\b/g,'cos').replace(/\\tan\b/g,'tan')
    .replace(/\\left\s*\(/g,'(').replace(/\\right\s*\)/g,')')
    .replace(/\\left\s*\[/g,'[').replace(/\\right\s*\]/g,']')
    .replace(/\^{([^{}]*)}/g,'^($1)').replace(/_{([^{}]*)}/g,'($1)')
    .replace(/\^(-?[a-zA-Z0-9])/g,'^$1').replace(/_(-?[a-zA-Z0-9])/g,'$1')
    .replace(/\\,/g,' ').replace(/\\!/g,'').replace(/\\:/g,' ').replace(/\\;/g,' ')
    .replace(/\\\\/g,' ').replace(/\\[a-zA-Z]+/g,'')
    .replace(/[{}]/g,'').replace(/\$+/g,'').replace(/\s{2,}/g,' ').trim();
  return s;
}

// Chemistry + Unicode → ASCII-safe (jsPDF Helvetica is WinAnsi — cannot render Unicode math/chemistry)
// ARROWS first, then subscripts, then Unicode cleanup
function fixChemistry(text) {
  let s = text;
  // Arrows: all variants → ASCII ' -> '
  s = s
    .replace(/!'/g, ' -> ')
    .replace(/→/g, ' -> ').replace(/⟶/g, ' -> ').replace(/→/g, ' -> ')
    .replace(/←/g, ' <- ').replace(/↔/g, ' <-> ')
    .replace(/=>/g, ' => ').replace(/⇒/g, ' => ')
    .replace(/(?<![<>])->(?!>)/g, ' -> ');  // bare -> with no context
  // Delta: ΔH → dH, ΔG → dG, etc.
  s = s
    .replace(/"H_f\b/g, 'dHf').replace(/"H\b/g, 'dH')
    .replace(/ΔH/g, 'dH').replace(/ΔG/g, 'dG').replace(/ΔS/g, 'dS')
    .replace(/Δ\s*([A-Za-z])/g, 'd$1').replace(/Delta\s*([A-Za-z])/g, 'd$1')
    .replace(/\\Delta\s*([A-Za-z])/g, 'd$1').replace(/Δ/g, 'd');
  // Unicode subscripts → plain digits
  s = s.replace(/[₀₁₂₃₄₅₆₇₈₉]/g, c => String('₀₁₂₃₄₅₆₇₈₉'.indexOf(c)));
  // _n patterns (chemistry subscripts) → plain digit
  s = s
    .replace(/([A-Za-z])_\((\d+)\)/g, '$1$2')
    .replace(/([A-Za-z])_\{(\d+)\}/g, '$1$2')
    .replace(/([A-Za-z])_(\d+)/g, '$1$2');
  // Other non-CP1252 math symbols → ASCII
  s = s
    .replace(/≤/g, '<=').replace(/≥/g, '>=').replace(/≠/g, '!=').replace(/≈/g, '~')
    .replace(/∞/g, 'inf').replace(/√/g, 'sqrt').replace(/∑/g, 'sum').replace(/∫/g, 'int')
    .replace(/°C/g, 'degC').replace(/°F/g, 'degF').replace(/°/g, 'deg')
    // Greek letters (if still present after latexToReadable)
    .replace(/α/g,'alpha').replace(/β/g,'beta').replace(/γ/g,'gamma').replace(/δ/g,'delta')
    .replace(/ε/g,'epsilon').replace(/θ/g,'theta').replace(/λ/g,'lambda').replace(/μ/g,'mu')
    .replace(/π/g,'pi').replace(/σ/g,'sigma').replace(/φ/g,'phi').replace(/ω/g,'omega')
    .replace(/Σ/g,'Sigma').replace(/Ω/g,'Omega');
  // Normalize spaces around arrows
  s = s.replace(/ {3,}/g, '  ').replace(/ -> /g, ' -> ');
  return s;
}

function cleanText(t) {
  if (!t) return '';
  let s = String(t)
    .replace(/---TOPIC_END---/g, '')
    .replace(/^:::[a-z]*\s*$/gm, '')
    .replace(/^::\s*$/gm, '')
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/\*(.*?)\*/gs, '$1')
    .replace(/__(.*?)__/gs, '$1')
    .replace(/_(.*?)_/gs, '$1')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => latexToReadable(m))
    .replace(/\$(.*?)\$/g, (_, m) => latexToReadable(m));
  if (/\\\w/.test(s)) s = latexToReadable(s);
  s = fixChemistry(s);
  return s.trim();
}

// Remove duplicate paragraphs across results
function removeDuplicateParagraphs(results) {
  const seen = new Set();
  return results.map(r => {
    const lines = r.content.split('\n');
    const filtered = lines.filter(line => {
      const t = line.trim();
      if (t.length < 55) return true; // keep short lines (headings, list items, etc.)
      if (seen.has(t)) return false;
      seen.add(t);
      return true;
    });
    return { ...r, content: filtered.join('\n') };
  });
}

export async function fetchUnsplashCover(query) {
  try {
    const resp = await fetch(
      `/api/unsplash/search/photos?query=${encodeURIComponent(query)}&per_page=1&orientation=landscape&content_filter=high`,
      { headers: { Authorization: `Client-ID ${UNSPLASH_KEY}` } }
    );
    if (!resp.ok) return null;
    const data = await resp.json();
    const imgUrl = data?.results?.[0]?.urls?.regular;
    return imgUrl ? await imgUrlToBase64(imgUrl) : null;
  } catch { return null; }
}

// PubChem — free, no key, CORS-safe from browser; check Content-Type before base64 to avoid 404 JSON
async function fetchPubChemImage(compoundName) {
  try {
    const url = `https://pubchem.ncbi.nlm.nih.gov/rest/pug/compound/name/${encodeURIComponent(compoundName)}/PNG`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const ct = resp.headers.get('content-type') || '';
    if (!ct.includes('image')) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
    });
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const c = document.createElement('canvas');
        c.width = img.naturalWidth || 200; c.height = img.naturalHeight || 200;
        c.getContext('2d').drawImage(img, 0, 0);
        resolve({ base64: c.toDataURL('image/png'), w: c.width, h: c.height, compound: compoundName });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch { return null; }
}

// Wikipedia thumbnail — free, CORS-safe, one image per topic
async function fetchWikipediaImage(query) {
  try {
    const url = `https://en.wikipedia.org/w/api.php?action=query&titles=${encodeURIComponent(query)}&prop=pageimages&pithumbsize=700&format=json&origin=*`;
    const resp = await fetch(url, { signal: AbortSignal.timeout(6000) });
    if (!resp.ok) return null;
    const data = await resp.json();
    const pages = data?.query?.pages;
    if (!pages) return null;
    const page = Object.values(pages)[0];
    const thumbUrl = page?.thumbnail?.source;
    if (!thumbUrl) return null;
    const resp2 = await fetch(thumbUrl, { signal: AbortSignal.timeout(4000) });
    if (!resp2.ok) return null;
    const blob = await resp2.blob();
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej; fr.readAsDataURL(blob);
    });
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth; canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve({ base64: canvas.toDataURL('image/jpeg', 0.85), w: img.naturalWidth, h: img.naturalHeight, caption: page.title || query });
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch { return null; }
}

// ─────────────────────────────────────────────────────────────────
// Mermaid → base64 PNG (must await all renders before PDF step)
// ─────────────────────────────────────────────────────────────────
let _mermaidInstance = null;
async function getMermaid() {
  if (!_mermaidInstance) {
    const m = (await import('mermaid')).default;
    m.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'loose',
      themeVariables: { primaryColor: '#EDE9FE', primaryBorderColor: '#6C3EE8',
        primaryTextColor: '#1A1A2E', lineColor: '#6C3EE8', fontFamily: 'helvetica,arial,sans-serif' } });
    _mermaidInstance = m;
  }
  return _mermaidInstance;
}

const MERMAID_TYPES = /^\s*(graph|flowchart|sequenceDiagram|classDiagram|stateDiagram|gantt|pie|gitGraph|mindmap|erDiagram|timeline|xychart)/i;

async function renderMermaidToBase64(code) {
  try {
    const mermaid = await getMermaid();
    // Normalize smart quotes and validate diagram type before rendering
    const cleanCode = code.trim()
      .replace(/[""]/g, '"').replace(/['']/g, "'");
    if (!MERMAID_TYPES.test(cleanCode)) return null;
    const id = 'mmd' + Date.now() + Math.random().toString(36).slice(2, 7);
    const { svg } = await mermaid.render(id, cleanCode);
    const cleanSvg = svg
      .replace(/@import\s+url\([^)]*\)[^;]*;/g, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) =>
        m.replace(/@import\s+url\([^)]*\)[^;]*;/g, '').replace(/url\(['"]?https?:[^)'"]+['"]?\)/g, ''));
    const wAttr = cleanSvg.match(/\bwidth="([\d.]+)"/);
    const hAttr = cleanSvg.match(/\bheight="([\d.]+)"/);
    const vb    = cleanSvg.match(/\bviewBox="([\d.\s,-]+)"/);
    let svgW = wAttr ? parseFloat(wAttr[1]) : 0;
    let svgH = hAttr ? parseFloat(hAttr[1]) : 0;
    if ((!svgW || !svgH) && vb) {
      const parts = vb[1].trim().split(/[\s,]+/).map(parseFloat);
      if (parts.length >= 4) { svgW = svgW || parts[2]; svgH = svgH || parts[3]; }
    }
    const iw = Math.max(svgW || 700, 300);
    const ih = Math.max(svgH || 350, 100);
    const sizedSvg = cleanSvg
      .replace(/(<svg\b[^>]*)\bwidth="[^"]*"/, `$1width="${iw}"`)
      .replace(/(<svg\b[^>]*)\bheight="[^"]*"/, `$1height="${ih}"`);
    const finalSvg = sizedSvg.includes('width=') ? sizedSvg
      : sizedSvg.replace('<svg', `<svg width="${iw}" height="${ih}"`);
    const dataUrl = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(finalSvg)}`;
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const scale = 2;
          const canvas = document.createElement('canvas');
          canvas.width = iw * scale; canvas.height = ih * scale;
          const ctx = canvas.getContext('2d');
          ctx.fillStyle = '#ffffff'; ctx.fillRect(0, 0, canvas.width, canvas.height);
          ctx.scale(scale, scale); ctx.drawImage(img, 0, 0, iw, ih);
          resolve({ base64: canvas.toDataURL('image/png'), w: iw, h: ih });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch (err) {
    console.warn('Mermaid render error:', err?.message);
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Markdown parser — pipeline order: headings → lists → code →
// tables → equations → ::: blocks (sub-parsed) → paragraphs
// ─────────────────────────────────────────────────────────────────
export function parseMarkdownToSegments(markdown) {
  const lines = markdown.split('\n');
  const segments = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    // Strip system tokens
    if (!trimmed || trimmed === '---TOPIC_END---' || trimmed === '---' && i === 0) {
      if (!trimmed) segments.push({ type: 'spacer' });
      i++; continue;
    }

    // ::: fenced blocks — sub-parse content so tables/equations inside blocks work
    if (trimmed.startsWith(':::') && !trimmed.startsWith('::::')) {
      const blockType = trimmed.slice(3).trim().toLowerCase() || 'note';
      const contentLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith(':::')) {
        contentLines.push(lines[i]);
        i++;
      }
      i++; // skip closing :::
      const rawText = contentLines.join('\n').trim();
      // Sub-parse the block content so tables/mermaid/equations inside blocks render correctly
      const subSegments = parseMarkdownToSegments(rawText);
      // Plain text fallback (strip markdown)
      const plainText = rawText
        .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1').replace(/`(.*?)`/g, '$1')
        .replace(/---TOPIC_END---/g, '').replace(/^#+\s*/gm, '').trim();
      segments.push({ type: 'block', blockType, text: plainText, rawText, subSegments });
      continue;
    }

    // $$ block equations
    if (trimmed === '$$') {
      const eqLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '$$') { eqLines.push(lines[i]); i++; }
      i++;
      segments.push({ type: 'equation', text: eqLines.join('\n').trim() });
      continue;
    }
    if (trimmed.startsWith('$$') && trimmed.endsWith('$$') && trimmed.length > 4) {
      segments.push({ type: 'equation', text: trimmed.slice(2, -2).trim() });
      i++; continue;
    }

    // Headings
    if      (trimmed.startsWith('#### ')) { segments.push({ type: 'h4', text: trimmed.slice(5) }); }
    else if (trimmed.startsWith('### '))  { segments.push({ type: 'h3', text: trimmed.slice(4) }); }
    else if (trimmed.startsWith('## '))   { segments.push({ type: 'h2', text: trimmed.slice(3) }); }
    else if (trimmed.startsWith('# '))    { segments.push({ type: 'h1', text: trimmed.slice(2) }); }

    // Bullet list
    else if (trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('• ')) {
      segments.push({ type: 'li', text: trimmed.slice(2).replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1') });
    }

    // Numbered list
    else if (/^\d+\.\s/.test(trimmed)) {
      segments.push({ type: 'oli', text: trimmed.replace(/^\d+\.\s/, '').replace(/\*\*(.*?)\*\*/g,'$1') });
    }

    // Fenced code
    else if (trimmed.startsWith('```')) {
      const codeLines = [];
      i++;
      while (i < lines.length && !lines[i].trim().startsWith('```')) { codeLines.push(lines[i]); i++; }
      segments.push({ type: 'code', text: codeLines.join('\n') });
    }

    // Table
    else if (trimmed.startsWith('|') && trimmed.endsWith('|')) {
      const tableRows = [];
      while (i < lines.length && lines[i].trim().startsWith('|')) {
        const row = lines[i].trim();
        if (!row.match(/^\|[-: |]+\|$/)) {
          const cells = row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1)
            .map(c => c.trim().replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1'));
          if (cells.length > 0) tableRows.push(cells);
        }
        i++;
      }
      if (tableRows.length > 0) segments.push({ type: 'table', rows: tableRows });
      continue;
    }

    // Bold-only line
    else if (trimmed.startsWith('**') && trimmed.endsWith('**') && trimmed.length > 4) {
      segments.push({ type: 'bold', text: trimmed.slice(2, -2) });
    }

    // HR — skip ---TOPIC_END--- already handled above; only real HRs
    else if ((trimmed === '---' || trimmed === '===') && i > 0) {
      segments.push({ type: 'hr' });
    }

    // Skip lone ::: tokens that slipped through
    else if (trimmed === ':::' || trimmed === '::') {
      // skip
    }

    // Paragraph
    else {
      const clean = trimmed
        .replace(/\*\*(.*?)\*\*/g,'$1').replace(/\*(.*?)\*/g,'$1').replace(/`(.*?)`/g,'$1')
        .replace(/\[(.*?)\]\(.*?\)/g,'$1').replace(/\$\$(.*?)\$\$/g,'$1').replace(/\$(.*?)\$/g,'$1')
        .replace(/---TOPIC_END---/g,'');
      if (clean) segments.push({ type: 'p', text: clean });
    }

    i++;
  }
  return segments;
}

// ─────────────────────────────────────────────────────────────────
// Block style definitions — redesigned with colored header (item 12)
// warning blocks are skipped entirely (item 16: remove Common Mistakes)
// ─────────────────────────────────────────────────────────────────
const BLOCK_STYLES = {
  definition: { bg: [239, 246, 255], border: [37, 99, 235],   label: 'Definition',   icon: '[D]' },
  example:    { bg: [240, 253, 244], border: [5,  150, 105],   label: 'Example',      icon: '[E]' },
  keypoint:   { bg: [255, 251, 235], border: [180, 83,  9],    label: 'Key Point',    icon: '[!]' },
  theorem:    { bg: [245, 243, 255], border: [109, 40, 217],   label: 'Theorem',      icon: '[T]' },
  note:       { bg: [240, 253, 244], border: [22, 163,  74],   label: 'Note',         icon: '[i]' },
  mermaid:    { bg: [248, 250, 252], border: [100, 116, 139],  label: 'Diagram',      icon: '[~]' },
};

// Collect all mermaid keys from segments tree (including sub-segments)
function* iterateMermaidKeys(segments) {
  for (const seg of segments) {
    if (seg.type === 'block' && seg.blockType === 'mermaid') yield (seg.rawText || seg.text).trim();
    if (seg.subSegments) yield* iterateMermaidKeys(seg.subSegments);
  }
}

// ─────────────────────────────────────────────────────────────────
// Block content height estimator (for ensureSpace)
// ─────────────────────────────────────────────────────────────────
function estimateBlockContentHeight(doc, subSegs, innerW) {
  let h = 0;
  for (const ss of subSegs) {
    if (ss.type === 'p') {
      doc.setFontSize(10); doc.setFont('helvetica', 'normal');
      const lines = doc.splitTextToSize(cleanText(ss.text || ''), innerW);
      if (!lines[0]?.trim()) continue;
      h += lines.length * 5.5 + 1;
    } else if (ss.type === 'li' || ss.type === 'oli') {
      doc.setFontSize(9.5); doc.setFont('helvetica', 'normal');
      h += Math.max(1, doc.splitTextToSize(cleanText(ss.text || ''), innerW - 5).length) * 5 + 1;
    } else if (ss.type === 'h2') {
      h += 9;
    } else if (ss.type === 'h3') {
      h += 8;
    } else if (ss.type === 'h4' || ss.type === 'bold') {
      h += 7;
    } else if (ss.type === 'equation') {
      doc.setFontSize(9.5); doc.setFont('courier', 'normal');
      h += Math.max(1, doc.splitTextToSize(fixChemistry(latexToReadable(ss.text || '')), innerW - 10).length) * 6 + 10;
    } else if (ss.type === 'table') {
      h += (ss.rows?.length || 0) * 6.5 + 6;
    } else if (ss.type === 'spacer') {
      h += 2;
    }
  }
  return h;
}

function hasVisibleContent(subSegs, plainText) {
  if (subSegs && subSegs.length > 0) {
    return subSegs.some(ss => {
      const t = cleanText(ss.text || '');
      if (['p','li','oli','bold','h2','h3','h4'].includes(ss.type)) return t.length > 0;
      if (ss.type === 'equation') return (ss.text || '').trim().length > 0;
      if (ss.type === 'table') return (ss.rows?.length || 0) > 0;
      return false;
    });
  }
  return cleanText(plainText || '').trim().length > 0;
}

// Render sub-segments inside a block box (no page breaks — block renders as unit)
function renderBlockSubSegs(doc, subSegs, x, startY, innerW) {
  let cy = startY;
  for (const ss of subSegs) {
    switch (ss.type) {
      case 'p': {
        const lines = doc.splitTextToSize(cleanText(ss.text), innerW);
        if (!lines[0]?.trim()) break;
        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
        doc.text(lines, x, cy); cy += lines.length * 5.5 + 1; break;
      }
      case 'li': case 'oli': {
        const lines = doc.splitTextToSize(`•  ${cleanText(ss.text)}`, innerW - 5);
        doc.setFontSize(9.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
        doc.text(lines, x + 2, cy); cy += lines.length * 5 + 1; break;
      }
      case 'h2': {
        const lines = doc.splitTextToSize(cleanText(ss.text), innerW);
        doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(40, 40, 80);
        doc.text(lines, x, cy); cy += lines.length * 6 + 3; break;
      }
      case 'h3': case 'h4': case 'bold': {
        const lines = doc.splitTextToSize(cleanText(ss.text), innerW);
        doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81);
        doc.text(lines, x, cy); cy += lines.length * 5.5 + 2; break;
      }
      case 'equation': {
        const eqText = fixChemistry(latexToReadable(ss.text || ''));
        const eqLines = doc.splitTextToSize(eqText, innerW - 10);
        const eqH = eqLines.length * 6 + 6;
        doc.setFillColor(245, 243, 255); doc.roundedRect(x, cy - 1, innerW, eqH, 1, 1, 'F');
        doc.setFontSize(9.5); doc.setFont('courier', 'normal'); doc.setTextColor(108, 62, 232);
        doc.text(eqLines, x + 5, cy + 4); cy += eqH + 3; break;
      }
      case 'table': {
        if (!ss.rows?.length) break;
        const colN = ss.rows[0].length;
        const cw = innerW / colN;
        ss.rows.forEach((row, ri) => {
          const rY = cy + ri * 6.5;
          doc.setFillColor(ri === 0 ? 190 : ri % 2 === 0 ? 240 : 232,
                           ri === 0 ? 195 : ri % 2 === 0 ? 242 : 235,
                           ri === 0 ? 230 : ri % 2 === 0 ? 255 : 252);
          doc.rect(x, rY, innerW, 6.5, 'F');
          row.forEach((cell, ci) => {
            doc.setFontSize(8); doc.setFont('helvetica', ri === 0 ? 'bold' : 'normal');
            doc.setTextColor(40, 40, 60);
            const ct = doc.splitTextToSize(cleanText(String(cell || '')), cw - 3);
            doc.text(ct[0] || '', x + ci * cw + 2, rY + 4.5);
          });
        });
        cy += ss.rows.length * 6.5 + 4; break;
      }
      case 'code': {
        const cls = ss.text.split('\n');
        doc.setFillColor(240, 240, 248); doc.roundedRect(x, cy - 1, innerW, cls.length * 4 + 5, 1, 1, 'F');
        doc.setFontSize(8); doc.setFont('courier', 'normal'); doc.setTextColor(55, 65, 81);
        cls.forEach((cl, li) => doc.text(doc.splitTextToSize(cl, innerW - 4), x + 2, cy + 3 + li * 4));
        cy += cls.length * 4 + 7; break;
      }
      case 'spacer': cy += 2; break;
      default: break;
    }
  }
  return cy;
}

// ─────────────────────────────────────────────────────────────────
// Formula Reference Sheet — 2-column grid of all equations (item 13)
// ─────────────────────────────────────────────────────────────────
function addFormulaSheet(doc, sortedResults, W, H, ML, MR, TW, drawPageHeader) {
  const allEqs = [];
  const seenEq = new Set();
  for (const result of sortedResults) {
    const segs = parseMarkdownToSegments(result.content || '');
    for (const seg of segs) {
      if (seg.type === 'equation' && seg.text && !seenEq.has(seg.text)) {
        seenEq.add(seg.text);
        allEqs.push({ text: latexToReadable(seg.text), chapter: result.chapterName || '' });
      }
    }
  }
  if (allEqs.length === 0) return;

  doc.addPage();
  drawPageHeader('Formula Reference Sheet');
  let y = 22;
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 46);
  doc.text('Formula Reference Sheet', ML, y); y += 7;
  doc.setDrawColor(108, 62, 232); doc.setLineWidth(0.3); doc.line(ML, y, W - MR, y); y += 6;

  const colW = (TW - 5) / 2;
  let col = 0;
  let rowY = y;

  allEqs.forEach((eq) => {
    const x = col === 0 ? ML : ML + colW + 5;
    const eqLines = doc.splitTextToSize(eq.text, colW - 10);
    const boxH = eqLines.length * 5.5 + 13;
    if (rowY + boxH > H - 16) {
      if (col === 1) { col = 0; rowY += boxH + 4; }
      doc.addPage(); drawPageHeader('Formula Reference Sheet');
      rowY = 22; col = 0;
    }
    doc.setFillColor(245, 243, 255); doc.setDrawColor(108, 62, 232); doc.setLineWidth(0.25);
    doc.roundedRect(x, rowY, colW, boxH, 2, 2, 'FD');
    doc.setFontSize(8.5); doc.setFont('courier', 'bold'); doc.setTextColor(108, 62, 232);
    doc.text(eqLines, x + 5, rowY + 7);
    doc.setFontSize(6.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(150, 150, 180);
    doc.text(eq.chapter.slice(0, 28), x + 5, rowY + boxH - 3);
    if (col === 0) { col = 1; }
    else { col = 0; rowY += boxH + 4; }
  });
}

// ─────────────────────────────────────────────────────────────────
// Concept Mind Map — radial diagram (item 14)
// ─────────────────────────────────────────────────────────────────
function addMindMap(doc, title, chapters, W, H, ML, drawPageHeader) {
  doc.addPage();
  drawPageHeader('Concept Mind Map');
  doc.setFillColor(248, 249, 255); doc.rect(0, 14, W, H - 14, 'F');
  doc.setFontSize(15); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 46);
  doc.text('Concept Mind Map', W / 2, 22, { align: 'center' });

  const cx = W / 2, cy = H / 2 + 5;
  const n = Math.max(chapters.length, 1);
  const R = Math.min(70, 85 - n * 1.5); // radius for chapter nodes

  // Center node
  doc.setFillColor(108, 62, 232); doc.setDrawColor(108, 62, 232); doc.setLineWidth(0.5);
  doc.ellipse(cx, cy, 22, 10, 'FD');
  doc.setFontSize(7.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
  const centerLabel = title.slice(0, 22);
  doc.text(centerLabel, cx, cy + 2.5, { align: 'center' });

  const palette = [
    [37,99,235],[5,150,105],[180,83,9],[109,40,217],
    [220,38,38],[14,165,233],[22,163,74],[217,70,239],
  ];

  chapters.forEach((ch, i) => {
    const angle = (2 * Math.PI * i / n) - Math.PI / 2;
    const nx = cx + R * Math.cos(angle);
    const ny = cy + R * Math.sin(angle);
    const color = palette[i % palette.length];

    // Connector
    doc.setDrawColor(...color); doc.setLineWidth(0.6);
    doc.line(cx + 22 * Math.cos(angle), cy + 10 * Math.sin(angle), nx, ny);

    // Chapter node
    const label = ch.name.slice(0, 20);
    doc.setFontSize(7); doc.setFont('helvetica', 'bold');
    const bw = Math.min(38, doc.getTextWidth(label) + 8);
    doc.setFillColor(...color); doc.setDrawColor(...color);
    doc.roundedRect(nx - bw / 2, ny - 6.5, bw, 11, 2, 2, 'FD');
    doc.setTextColor(255, 255, 255);
    doc.text(label, nx, ny + 1.5, { align: 'center' });

    // Topic dots around each chapter
    const topics = ch.topics || [];
    const maxDots = Math.min(topics.length, 5);
    for (let ti = 0; ti < maxDots; ti++) {
      const spread = maxDots > 1 ? (ti / (maxDots - 1) - 0.5) * 0.8 : 0;
      const ta = angle + spread;
      const tr = 24;
      const tx = nx + tr * Math.cos(ta);
      const ty = ny + tr * Math.sin(ta);
      if (tx > 10 && tx < W - 10 && ty > 26 && ty < H - 10) {
        doc.setFillColor(...color.map(c => Math.min(255, c + 70)));
        doc.setDrawColor(...color); doc.setLineWidth(0.3);
        doc.circle(tx, ty, 3.5, 'FD');
        doc.setFontSize(5.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
        const tl = topics[ti].name.slice(0, 16);
        doc.text(tl, tx, ty + 8, { align: 'center' });
      }
    }
  });
}

// ─────────────────────────────────────────────────────────────────
// Export to PDF using jsPDF
// ─────────────────────────────────────────────────────────────────
export async function exportToPDF(title, outputType, chapters, results, options = {}, onImageLog = null) {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, H = 297, ML = 20, MR = 20, TW = W - ML - MR;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });
  const YEAR = new Date().getFullYear(); // will be 2026

  // ── Pre-load assets ──────────────────────────────────────────────
  const [coverTemplate, endPageB64, logoObj] = await Promise.all([
    imgUrlToPng(coverTemplateUrl).catch(() => null),
    imgUrlToBase64(endPageUrl).catch(() => null),
    imgUrlToPng(logoUrl).catch(() => null),
  ]);
  const logoB64 = logoObj?.base64 || null;
  const logoAspect = logoObj ? (logoObj.w / Math.max(logoObj.h, 1)) : 1;
  onImageLog?.({ cover: !!coverTemplate?.base64, wikiLoaded: 0, wikiTotal: 0, mermaid: 0, done: false });

  // ── Remove duplicate paragraphs ──────────────────────────────────
  const dedupedResults = removeDuplicateParagraphs(results);

  // ── Sort results by chapter order ────────────────────────────────
  const sortedResults = [...dedupedResults].sort((a, b) => {
    const ai = chapters.findIndex((c) => c.id === a.chapterId);
    const bi = chapters.findIndex((c) => c.id === b.chapterId);
    return ai - bi;
  });

  // ── Pre-render ALL mermaid blocks (must await all before PDF) ────
  const mermaidCache = new Map();
  let mermaidCount = 0;
  const mermaidRenders = [];
  for (const result of sortedResults) {
    const segs = parseMarkdownToSegments(result.content || '');
    for (const key of iterateMermaidKeys(segs)) {
      if (!mermaidCache.has(key)) {
        mermaidCache.set(key, null); // reserve slot
        mermaidRenders.push(
          renderMermaidToBase64(key).then(r => {
            mermaidCache.set(key, r);
            if (r) mermaidCount++;
          }).catch(() => {})
        );
      }
    }
  }
  await Promise.all(mermaidRenders);

  // ── Pre-fetch Wikipedia images ───────────────────────────────────
  const uniqueTopicNames = [...new Set(sortedResults.map((r) => r.topicName).filter(Boolean))];
  const wikiImgList = await Promise.race([
    Promise.all(uniqueTopicNames.map((name) => fetchWikipediaImage(name).catch(() => null))),
    new Promise((r) => setTimeout(() => r(uniqueTopicNames.map(() => null)), 5000)),
  ]).catch(() => uniqueTopicNames.map(() => null));
  const wikiLoaded = wikiImgList.filter(Boolean).length;
  onImageLog?.({ cover: !!coverTemplate?.base64, wikiLoaded, wikiTotal: uniqueTopicNames.length, mermaid: mermaidCount, done: false });
  const topicImageCache = new Map(uniqueTopicNames.map((name, i) => [name, wikiImgList[i]]));

  // ── Page header helper ───────────────────────────────────────────
  const drawPageHeader = (chName) => {
    doc.setFillColor(248, 249, 255); doc.rect(0, 0, W, H, 'F');
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3); doc.line(ML, 13, W - MR, 13);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    doc.text((chName || '').slice(0, 50), ML, 10);
    const brandText = 'PlanForge AI';
    if (logoB64) {
      const LOGO_H = 6;
      const logoW = LOGO_H * logoAspect;
      const brandW = doc.getTextWidth(brandText);
      const blockW = logoW + 2.5 + brandW;
      const blockX = W - MR - blockW;
      doc.addImage(logoB64, 'PNG', blockX, 6, logoW, LOGO_H);
      doc.text(brandText, blockX + logoW + 1, 10);
    } else {
      doc.text(brandText, W - MR, 10, { align: 'right' });
    }
  };

  // ── Page-break helper ────────────────────────────────────────────
  const ensureSpace = (curY, needed, chName) => {
    if (curY + needed > H - 18) {
      doc.addPage();
      drawPageHeader(chName);
      return 22;
    }
    return curY;
  };

  // ── COVER PAGE ───────────────────────────────────────────────────
  if (coverTemplate) {
    doc.addImage(coverTemplate.base64, 'PNG', 0, 0, W, H);
  } else {
    doc.setFillColor(14, 17, 40); doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(28, 10, 80); doc.rect(0, 0, W, 50, 'F');
    doc.setFillColor(108, 62, 232); doc.circle(W / 2, 24, 11, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('PF', W / 2, 28, { align: 'center' });
  }

  // Title overlay
  const TITLE_MAX_W = 140, TITLE_AREA_TOP = 85, TITLE_AREA_BOT = 152;
  const TITLE_AREA_CY = (TITLE_AREA_TOP + TITLE_AREA_BOT) / 2;
  const titleLines = doc.splitTextToSize(cleanText(title).toUpperCase(), TITLE_MAX_W);
  const titleFontSize = titleLines.length > 4 ? 18 : titleLines.length > 3 ? 20 : titleLines.length > 2 ? 22 : 26;
  const titleLineH = titleFontSize * 0.42;
  const titleBlockH = titleLines.length * titleLineH;
  const titleStartY = Math.min(Math.max(TITLE_AREA_CY - titleBlockH / 2, TITLE_AREA_TOP), TITLE_AREA_BOT - titleBlockH);
  doc.setFontSize(titleFontSize); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 46);
  doc.text(titleLines, W / 2, titleStartY, { align: 'center', lineHeightFactor: 1.35 });

  // Date overlay
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
  doc.text(today, W / 2 + 8, 232, { align: 'center' });

  // Stats overlay
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81);
  const statsText = `${chapters.length} Chapters  ·  ${sortedResults.length} Topics`;
  const statsLines = doc.splitTextToSize(statsText, TW - 20);
  const statsLineH = 7;
  const statsStartY = 251 - ((statsLines.length - 1) * statsLineH) / 2;
  doc.text(statsLines, W / 2, statsStartY, { align: 'center', lineHeightFactor: statsLineH / 16 * 2.83 });

  // ── TABLE OF CONTENTS ────────────────────────────────────────────
  doc.addPage();
  let y = 20;
  drawPageHeader('Table of Contents');
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 46);
  doc.text('Table of Contents', ML, y); y += 8;
  doc.setDrawColor(108, 62, 232); doc.setLineWidth(0.3); doc.line(ML, y, W - MR, y); y += 10;

  // Real topic + chapter counts; page estimates based on actual segment counts
  const tocEntries = [];
  let pgCounter = 3;
  chapters.forEach((ch) => {
    tocEntries.push({ name: ch.name, level: 0, page: pgCounter });
    const chRes = sortedResults.filter((r) => r.chapterId === ch.id);
    chRes.forEach((r) => tocEntries.push({ name: r.topicName || '', level: 1, page: pgCounter }));
    // Estimate pages from segment count (more accurate than char-count)
    const segCount = chRes.reduce((a, r) => a + parseMarkdownToSegments(r.content || '').length, 0);
    pgCounter += Math.max(1, Math.ceil(segCount / 20));
  });

  tocEntries.forEach((entry) => {
    if (y > H - 20) { doc.addPage(); doc.setFillColor(248, 249, 255); doc.rect(0, 0, W, H, 'F'); y = 20; }
    if (entry.level === 0) {
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(108, 62, 232);
      const n = entry.name.length > 55 ? entry.name.slice(0, 52) + '...' : entry.name;
      doc.text(n, ML, y);
      doc.text(`${entry.page}`, W - MR, y, { align: 'right' });
      const nW = doc.getTextWidth(n), pW = doc.getTextWidth(`${entry.page}`);
      const ds = ML + nW + 3, de = W - MR - pW - 3;
      if (de > ds + 5) {
        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 200, 210);
        doc.text('.'.repeat(Math.floor((de - ds) / 2.5)), ds, y);
      }
      y += 8;
    } else {
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      const tname = entry.name.length > 65 ? entry.name.slice(0, 62) + '...' : entry.name;
      doc.text(`  · ${tname}`, ML + 5, y); y += 6;
    }
  });

  // ── CONTENT PAGES ────────────────────────────────────────────────
  let currentChapterId = null;

  for (const result of sortedResults) {
    doc.addPage();
    drawPageHeader(result.chapterName);
    y = 22;

    if (result.chapterId !== currentChapterId) {
      currentChapterId = result.chapterId;
      doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(108, 62, 232);
      const chl = doc.splitTextToSize(result.chapterName || '', TW);
      doc.text(chl, ML, y); y += chl.length * 8 + 4;
      doc.setDrawColor(108, 62, 232); doc.setLineWidth(0.5);
      doc.line(ML, y, ML + 40, y); y += 8;
    }

    const segments = parseMarkdownToSegments(result.content || '');
    let topicImgInserted = false;
    const topicWikiImg = topicImageCache.get(result.topicName || '') || null;

    for (const seg of segments) {
      switch (seg.type) {
        case 'spacer': y += 2; break;

        case 'hr': {
          y = ensureSpace(y, 6, result.chapterName);
          doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2);
          doc.line(ML, y, W - MR, y); y += 4; break;
        }

        case 'h1': {
          y = ensureSpace(y, 18, result.chapterName); y += 2;
          doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 46);
          const ls = doc.splitTextToSize(cleanText(seg.text), TW); doc.text(ls, ML, y);
          y += ls.length * 9 + 4;
          if (!topicImgInserted && topicWikiImg) {
            topicImgInserted = true;
            const MAX_W = TW, MAX_H = 60;
            const ratio = Math.min(MAX_W / topicWikiImg.w, MAX_H / topicWikiImg.h);
            const imgW = topicWikiImg.w * ratio, imgH = topicWikiImg.h * ratio;
            const imgX = ML + (TW - imgW) / 2;
            y = ensureSpace(y, imgH + 14, result.chapterName);
            doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2);
            doc.rect(imgX - 0.5, y - 0.5, imgW + 1, imgH + 1, 'S');
            doc.addImage(topicWikiImg.base64, 'JPEG', imgX, y, imgW, imgH);
            y += imgH + 3;
            doc.setFontSize(7.5); doc.setFont('helvetica', 'italic'); doc.setTextColor(150, 150, 170);
            doc.text(`Source: Wikipedia — ${topicWikiImg.caption}`, W / 2, y, { align: 'center' });
            y += 8;
          }
          break;
        }

        case 'h2': {
          y = ensureSpace(y, 14, result.chapterName); y += 2;
          doc.setFontSize(14); doc.setFont('helvetica', 'bold'); doc.setTextColor(108, 62, 232);
          const ls = doc.splitTextToSize(cleanText(seg.text), TW); doc.text(ls, ML, y);
          y += ls.length * 7 + 3; break;
        }

        case 'h3': {
          y = ensureSpace(y, 12, result.chapterName); y += 2;
          doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 46);
          const ls = doc.splitTextToSize(cleanText(seg.text), TW); doc.text(ls, ML, y);
          y += ls.length * 6 + 2; break;
        }

        case 'h4':
        case 'bold': {
          y = ensureSpace(y, 10, result.chapterName);
          doc.setFontSize(10.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81);
          const ls = doc.splitTextToSize(cleanText(seg.text), TW); doc.text(ls, ML, y);
          y += ls.length * 5.5 + 2; break;
        }

        case 'li':
        case 'oli': {
          y = ensureSpace(y, 8, result.chapterName);
          doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
          const ls = doc.splitTextToSize(`•  ${cleanText(seg.text)}`, TW - 8); doc.text(ls, ML + 5, y);
          y += ls.length * 5 + 1; break;
        }

        case 'code': {
          const cls = seg.text.split('\n');
          const cH = cls.length * 4.5 + 8;
          y = ensureSpace(y, cH, result.chapterName);
          doc.setFillColor(245, 245, 250); doc.setDrawColor(200, 200, 220); doc.setLineWidth(0.2);
          doc.roundedRect(ML, y - 3, TW, cH, 2, 2, 'FD');
          doc.setFontSize(8.5); doc.setFont('courier', 'normal'); doc.setTextColor(55, 65, 81);
          let cy2 = y + 1;
          cls.forEach((cl) => { const cs = doc.splitTextToSize(cl, TW - 6); doc.text(cs, ML + 3, cy2); cy2 += cs.length * 4.5; });
          y = cy2 + 4; break;
        }

        case 'equation': {
          const eqText = fixChemistry(latexToReadable(seg.text || ''));
          const eqLs = doc.splitTextToSize(eqText, TW - 20);
          const eqH = eqLs.length * 6 + 12;
          y = ensureSpace(y, eqH, result.chapterName);
          doc.setFillColor(245, 243, 255); doc.setDrawColor(108, 62, 232); doc.setLineWidth(0.4);
          doc.roundedRect(ML + 10, y - 3, TW - 20, eqH, 2, 2, 'FD');
          doc.setFontSize(10.5); doc.setFont('courier', 'normal'); doc.setTextColor(108, 62, 232);
          doc.text(eqLs, W / 2, y + 4, { align: 'center' });
          y += eqH + 4; break;
        }

        case 'table': {
          if (!seg.rows?.length) break;
          const cols = seg.rows[0].length;
          const colW = TW / cols;
          const rowH = 7;
          const tH = seg.rows.length * rowH + 2;
          y = ensureSpace(y, tH, result.chapterName);
          seg.rows.forEach((row, ri) => {
            const rY = y + ri * rowH;
            if (ri === 0) { doc.setFillColor(108, 62, 232); }
            else { doc.setFillColor(ri % 2 === 0 ? 248 : 240, ri % 2 === 0 ? 249 : 242, ri % 2 === 0 ? 255 : 250); }
            doc.rect(ML, rY, TW, rowH, 'F');
            row.forEach((cell, ci) => {
              doc.setFontSize(9); doc.setFont('helvetica', ri === 0 ? 'bold' : 'normal');
              doc.setTextColor(ri === 0 ? 255 : 55, ri === 0 ? 255 : 65, ri === 0 ? 255 : 81);
              const ct = doc.splitTextToSize(cleanText(String(cell || '')), colW - 4);
              doc.text(ct[0] || '', ML + ci * colW + 2, rY + 5);
            });
          });
          doc.setDrawColor(200, 200, 220); doc.setLineWidth(0.15);
          doc.rect(ML, y, TW, seg.rows.length * rowH, 'S');
          y += tH + 6; break;
        }

        case 'block': {
          // Item 16: skip Common Mistakes entirely
          if (seg.blockType === 'warning') break;

          const style = BLOCK_STYLES[seg.blockType] || BLOCK_STYLES.note;

          // Mermaid block
          if (seg.blockType === 'mermaid') {
            const key = (seg.rawText || seg.text).trim();
            const img = mermaidCache.get(key);
            if (img) {
              const MAX_DIAG_W = TW - 4, MAX_DIAG_H = 72;
              const diagRatio = Math.min(MAX_DIAG_W / Math.max(img.w, 1), MAX_DIAG_H / Math.max(img.h, 1));
              const diagW = img.w * diagRatio, diagH = img.h * diagRatio;
              const diagX = ML + (TW - diagW) / 2;
              const boxH = diagH + 18;
              y = ensureSpace(y, boxH, result.chapterName);
              doc.setFillColor(...style.bg);
              doc.roundedRect(ML, y - 2, TW, boxH, 2, 2, 'F');
              // Colored header
              doc.setFillColor(...style.border);
              doc.roundedRect(ML, y - 2, TW, 11, 2, 2, 'F');
              doc.rect(ML, y + 3, TW, 6, 'F');
              doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
              doc.text(`${style.icon}  ${style.label}`, ML + 5, y + 5);
              doc.addImage(img.base64, 'PNG', diagX, y + 10, diagW, diagH);
              y += boxH + 4;
            } else {
              // Mermaid failed — show as code fallback
              const fallbackLines = (seg.rawText || seg.text).split('\n');
              const fH = fallbackLines.length * 4.5 + 8;
              y = ensureSpace(y, fH, result.chapterName);
              doc.setFillColor(248, 250, 252); doc.roundedRect(ML, y - 2, TW, fH, 2, 2, 'F');
              doc.setFontSize(8); doc.setFont('courier', 'normal'); doc.setTextColor(100, 116, 139);
              let fy = y + 1;
              fallbackLines.forEach((fl) => { const s = doc.splitTextToSize(fl, TW - 6); doc.text(s, ML + 3, fy); fy += 4.5; });
              y = fy + 4;
            }
            break;
          }

          // Standard callout block — render sub-segments if available
          const subSegs = seg.subSegments || [];
          if (!hasVisibleContent(subSegs, seg.text)) break;
          const innerW = TW - 14;
          const contentH = subSegs.length > 0
            ? estimateBlockContentHeight(doc, subSegs, innerW)
            : doc.splitTextToSize(cleanText(seg.text || ''), innerW).length * 5.5;
          if (contentH <= 0) break;
          const blockH = contentH + 22;

          y = ensureSpace(y, Math.min(blockH, H - 50), result.chapterName);

          // Background
          doc.setFillColor(...style.bg);
          doc.roundedRect(ML, y - 2, TW, blockH, 2, 2, 'F');

          // Colored header bar (item 12)
          doc.setFillColor(...style.border);
          doc.roundedRect(ML, y - 2, TW, 11, 2, 2, 'F');
          doc.rect(ML, y + 3, TW, 6, 'F'); // square off bottom corners of header

          doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(255, 255, 255);
          doc.text(`${style.icon}  ${style.label}`, ML + 5, y + 5);

          const contentStartY = y + 13;

          if (subSegs.length > 0) {
            renderBlockSubSegs(doc, subSegs, ML + 7, contentStartY, innerW);
          } else {
            const textLines = doc.splitTextToSize(cleanText(seg.text || ''), innerW);
            doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
            doc.text(textLines, ML + 7, contentStartY);
          }

          y += blockH + 4;
          break;
        }

        case 'p':
        default: {
          const cleanedP = cleanText(seg.text || '');
          if (!cleanedP.trim()) break;
          const pl = doc.splitTextToSize(cleanedP, TW);
          y = ensureSpace(y, pl.length * 5.5, result.chapterName);
          doc.setFontSize(10.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
          doc.text(pl, ML, y); y += pl.length * 5.5 + 1; break;
        }
      }
    }
  }

  // ── FORMULA SHEET (item 13) ──────────────────────────────────────
  addFormulaSheet(doc, sortedResults, W, H, ML, MR, TW, drawPageHeader);

  // ── MIND MAP (item 14) ───────────────────────────────────────────
  addMindMap(doc, title, chapters, W, H, ML, drawPageHeader);

  // ── LAST PAGE — end.png full-bleed ──────────────────────────────
  doc.addPage();
  if (endPageB64) {
    doc.addImage(endPageB64, 'JPEG', 0, 0, W, H);
  } else {
    drawPageHeader('');
    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(108, 62, 232);
    doc.text('Thank You', W / 2, H / 2, { align: 'center' });
  }

  // ── PAGE NUMBERS — single final pass (item 10) ──────────────────
  // Page 1 = cover (no number), last page = end (no number)
  // All others: "N / Total" where N starts at 1 for TOC page
  const totalP = doc.internal.getNumberOfPages();
  const numberedCount = totalP - 2; // exclude cover + end page
  for (let pg = 2; pg < totalP; pg++) {
    doc.setPage(pg);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(155, 155, 175);
    doc.text(`${pg - 1}  /  ${numberedCount}`, W / 2, H - 8, { align: 'center' });
  }

  // ── Footer year (item 8) — update cover year line if needed ─────
  // (cover overlay date already uses current year via `today`)

  const safeTitle = title.replace(/[^a-z0-9]/gi, '_').toLowerCase();
  doc.save(`${safeTitle}.pdf`);
  onImageLog?.({ cover: !!coverTemplate?.base64, wikiLoaded, wikiTotal: uniqueTopicNames.length, mermaid: mermaidCount, done: true });
}

// ─────────────────────────────────────────────────────────────────
// Export to Word (.docx)
// ─────────────────────────────────────────────────────────────────
export async function exportToWord(title, outputType, chapters, results) {
  const { Document, Packer, Paragraph, TextRun, HeadingLevel, AlignmentType } = await import('docx');
  const { saveAs } = await import('file-saver');

  const today = new Date().toLocaleDateString();
  const children = [];

  children.push(
    new Paragraph({ text: title, heading: HeadingLevel.TITLE, alignment: AlignmentType.CENTER }),
    new Paragraph({ text: outputType, heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: `AI Generated by PlanForge AI · ${today}`, color: '6B7280' })], alignment: AlignmentType.CENTER }),
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Table of Contents', heading: HeadingLevel.HEADING_1 })
  );
  chapters.forEach((ch, i) => {
    children.push(new Paragraph({ children: [new TextRun({ text: `${i + 1}. ${ch.name}`, bold: true })] }));
  });
  children.push(new Paragraph({ text: '' }));

  const sortedResults = [...results].sort((a, b) => {
    const ai = chapters.findIndex((c) => c.id === a.chapterId);
    const bi = chapters.findIndex((c) => c.id === b.chapterId);
    return ai - bi;
  });

  let currentChapterId = null;
  sortedResults.forEach((result) => {
    if (result.chapterId !== currentChapterId) {
      currentChapterId = result.chapterId;
      children.push(new Paragraph({ text: result.chapterName || '', heading: HeadingLevel.HEADING_1 }));
    }
    const segments = parseMarkdownToSegments(result.content || '');
    segments.forEach((seg) => {
      if (seg.blockType === 'warning') return; // skip common mistakes
      switch (seg.type) {
        case 'h2': children.push(new Paragraph({ text: cleanText(seg.text), heading: HeadingLevel.HEADING_2 })); break;
        case 'h3': children.push(new Paragraph({ text: cleanText(seg.text), heading: HeadingLevel.HEADING_3 })); break;
        case 'h4':
        case 'bold': children.push(new Paragraph({ children: [new TextRun({ text: cleanText(seg.text), bold: true })] })); break;
        case 'li': children.push(new Paragraph({ children: [new TextRun({ text: `• ${cleanText(seg.text)}` })], indent: { left: 360 } })); break;
        case 'oli': children.push(new Paragraph({ children: [new TextRun({ text: `  ${cleanText(seg.text)}` })], indent: { left: 360 } })); break;
        case 'equation': children.push(new Paragraph({ children: [new TextRun({ text: latexToReadable(seg.text), font: 'Courier New', color: '6C3EE8', size: 20 })] })); break;
        case 'block': {
          const style = BLOCK_STYLES[seg.blockType] || BLOCK_STYLES.note;
          children.push(new Paragraph({ children: [new TextRun({ text: `[${style.label}] ${cleanText(seg.text)}`, italics: true })] }));
          break;
        }
        case 'code': children.push(new Paragraph({ children: [new TextRun({ text: seg.text, font: 'Courier New', size: 18 })], shading: { fill: 'F3F4F6' } })); break;
        case 'p': if (cleanText(seg.text)?.trim()) children.push(new Paragraph({ text: cleanText(seg.text) })); break;
        case 'spacer': children.push(new Paragraph({ text: '' })); break;
        default: break;
      }
    });
  });

  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Thank You', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: 'This content is AI-generated. Always verify from authoritative sources.', italics: true, color: '9CA3AF' })] }),
    new Paragraph({ children: [new TextRun({ text: `Built by Lohit R · lohitr.vercel.app · © ${new Date().getFullYear()}`, color: 'C4C4C4', size: 16 })] })
  );

  const docx = new Document({ sections: [{ children }] });
  const blob = await Packer.toBlob(docx);
  saveAs(blob, `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.docx`);
}

// ─────────────────────────────────────────────────────────────────
// Export to Markdown (.md)
// ─────────────────────────────────────────────────────────────────
export function exportToMarkdown(title, outputType, results, chapters) {
  const sortedResults = [...results].sort((a, b) => {
    const ai = chapters.findIndex((c) => c.id === a.chapterId);
    const bi = chapters.findIndex((c) => c.id === b.chapterId);
    return ai - bi;
  });

  const today = new Date().toLocaleDateString();
  let md = `# ${title}\n\n`;
  md += `> **${outputType}** · AI Generated by PlanForge AI · ${today}\n\n---\n\n`;
  sortedResults.forEach((r) => {
    md += r.content.replace(/---TOPIC_END---/g, '') + '\n\n---\n\n';
  });
  md += `\n---\n*Built by Lohit R · lohitr.vercel.app · © ${new Date().getFullYear()} · Content is AI-generated, verify before use.*\n`;

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`; a.click();
  URL.revokeObjectURL(url);
}
