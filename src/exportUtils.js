// exportUtils.js — PDF (jsPDF) + Word (docx) + Markdown export
import { UNSPLASH_KEY } from './config.js';
import coverTemplateUrl from './images/cover.png';
import endPageUrl from './images/end.png';
import logoUrl from './images/logo.webp';

// ─────────────────────────────────────────────────────────────────
// Image helpers
// ─────────────────────────────────────────────────────────────────
async function imgUrlToBase64(url) {
  // Fetch as blob → data: URL so canvas is never tainted by a cross-origin img src
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(4000) });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader();
      fr.onload = () => res(fr.result);
      fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        const canvas = document.createElement('canvas');
        canvas.width = img.naturalWidth;
        canvas.height = img.naturalHeight;
        canvas.getContext('2d').drawImage(img, 0, 0);
        resolve(canvas.toDataURL('image/jpeg', 0.85));
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch {
    return null;
  }
}

// Like imgUrlToBase64 but outputs PNG (preserves transparency for logos)
// Returns { base64, w, h } so callers can maintain aspect ratio
async function imgUrlToPng(url) {
  try {
    const resp = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!resp.ok) return null;
    const blob = await resp.blob();
    const dataUrl = await new Promise((res, rej) => {
      const fr = new FileReader(); fr.onload = () => res(fr.result); fr.onerror = rej;
      fr.readAsDataURL(blob);
    });
    return await new Promise((resolve) => {
      const img = new Image();
      img.onload = () => {
        try {
          const c = document.createElement('canvas');
          const w = img.naturalWidth || 100; const h = img.naturalHeight || 100;
          c.width = w; c.height = h;
          c.getContext('2d').drawImage(img, 0, 0);
          resolve({ base64: c.toDataURL('image/png'), w, h });
        } catch { resolve(null); }
      };
      img.onerror = () => resolve(null);
      img.src = dataUrl;
    });
  } catch { return null; }
}

// Convert LaTeX math to readable Unicode text
function latexToReadable(tex) {
  if (!tex) return '';
  let s = tex;
  // Resolve nested \frac up to 6 levels deep
  for (let i = 0; i < 6; i++) {
    const prev = s;
    s = s.replace(/\\frac\{([^{}]*)\}\{([^{}]*)\}/g, '($1)/($2)');
    if (s === prev) break;
  }
  s = s
    // Greek
    .replace(/\\alpha/g,'α').replace(/\\beta/g,'β').replace(/\\gamma/g,'γ')
    .replace(/\\delta/g,'δ').replace(/\\epsilon/g,'ε').replace(/\\theta/g,'θ')
    .replace(/\\lambda/g,'λ').replace(/\\mu/g,'μ').replace(/\\nu/g,'ν')
    .replace(/\\pi/g,'π').replace(/\\rho/g,'ρ').replace(/\\sigma/g,'σ')
    .replace(/\\tau/g,'τ').replace(/\\phi/g,'φ').replace(/\\omega/g,'ω')
    .replace(/\\Delta/g,'Δ').replace(/\\Sigma/g,'Σ').replace(/\\Omega/g,'Ω')
    // Operators
    .replace(/\\cdot/g,'·').replace(/\\times/g,'×').replace(/\\pm/g,'±')
    .replace(/\\leq/g,'≤').replace(/\\geq/g,'≥').replace(/\\neq/g,'≠')
    .replace(/\\approx/g,'≈').replace(/\\infty/g,'∞')
    .replace(/\\rightarrow/g,'→').replace(/\\leftarrow/g,'←')
    // Functions/text
    .replace(/\\sqrt\{([^{}]+)\}/g,'√($1)')
    .replace(/\\text\{([^{}]+)\}/g,'$1').replace(/\\mathrm\{([^{}]+)\}/g,'$1')
    .replace(/\\ln\b/g,'ln').replace(/\\log\b/g,'log').replace(/\\exp\b/g,'exp')
    .replace(/\\sin\b/g,'sin').replace(/\\cos\b/g,'cos').replace(/\\tan\b/g,'tan')
    // Brackets
    .replace(/\\left\s*\(/g,'(').replace(/\\right\s*\)/g,')')
    .replace(/\\left\s*\[/g,'[').replace(/\\right\s*\]/g,']')
    // Super/subscripts with braces
    .replace(/\^{([^{}]*)}/g,'^($1)').replace(/_{([^{}]*)}/g,'_($1)')
    .replace(/\^(-?[a-zA-Z0-9])/g,'^$1').replace(/_(-?[a-zA-Z0-9])/g,'_$1')
    // Spacing and cleanup
    .replace(/\\,/g,' ').replace(/\\!/g,'').replace(/\\:/g,' ').replace(/\\;/g,' ')
    .replace(/\\\\/g,' ').replace(/\\[a-zA-Z]+/g,'')
    .replace(/[{}]/g,'').replace(/\$+/g,'').replace(/\s{2,}/g,' ').trim();
  return s;
}

// Strip inline markdown so raw **bold** / *italic* / `code` don't appear as literal chars in PDF
// Also converts LaTeX math (with or without $$ delimiters) to readable Unicode
function cleanText(t) {
  if (!t) return '';
  let s = String(t)
    .replace(/\*\*(.*?)\*\*/gs, '$1')
    .replace(/\*(.*?)\*/gs, '$1')
    .replace(/__(.*?)__/gs, '$1')
    .replace(/_(.*?)_/gs, '$1')
    .replace(/`([^`\n]*)`/g, '$1')
    .replace(/~~(.*?)~~/g, '$1')
    .replace(/\[([^\]]+)\]\([^)]+\)/g, '$1')
    .replace(/^#+\s+/gm, '')
    // Convert $$ block math and $ inline math
    .replace(/\$\$([\s\S]*?)\$\$/g, (_, m) => latexToReadable(m))
    .replace(/\$(.*?)\$/g, (_, m) => latexToReadable(m));
  // Convert any remaining bare LaTeX (lines containing \command)
  if (/\\\w/.test(s)) s = latexToReadable(s);
  return s;
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
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Mermaid → base64 PNG
// ─────────────────────────────────────────────────────────────────
async function renderMermaidToBase64(code) {
  try {
    const mermaid = (await import('mermaid')).default;
    // 'base' theme has no external font imports — avoids canvas taint entirely
    mermaid.initialize({ startOnLoad: false, theme: 'base', securityLevel: 'loose',
      themeVariables: { primaryColor: '#EDE9FE', primaryBorderColor: '#6C3EE8',
        primaryTextColor: '#1A1A2E', lineColor: '#6C3EE8', fontFamily: 'helvetica,arial,sans-serif' } });
    const id = 'mmd' + Date.now() + Math.random().toString(36).slice(2, 7);
    const { svg } = await mermaid.render(id, code.trim());

    // Strip any remaining external references
    const cleanSvg = svg
      .replace(/@import\s+url\([^)]*\)[^;]*;/g, '')
      .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, (m) =>
        m.replace(/@import\s+url\([^)]*\)[^;]*;/g, '').replace(/url\(['"]?https?:[^)'"]+['"]?\)/g, ''));

    // Extract SVG pixel dimensions from attributes or viewBox
    // (some browsers return naturalWidth=0 for SVGs without explicit px dimensions)
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

    // Force explicit px dimensions on SVG so Image.naturalWidth is reliable
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
// Wikipedia image fetch — free, CORS-friendly, one image per topic
// ─────────────────────────────────────────────────────────────────
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
    // fetch → data: URL to avoid canvas taint / img-src CSP block
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
  } catch {
    return null;
  }
}

// ─────────────────────────────────────────────────────────────────
// Markdown parser — headings, lists, code, :::blocks, $$equations, tables
// ─────────────────────────────────────────────────────────────────
export function parseMarkdownToSegments(markdown) {
  const lines = markdown.split('\n');
  const segments = [];
  let i = 0;

  while (i < lines.length) {
    const line = lines[i];
    const trimmed = line.trim();

    if (!trimmed) { segments.push({ type: 'spacer' }); i++; continue; }

    // ::: fenced blocks (definition, example, keypoint, warning, theorem, mermaid, note)
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
      const cleanText = rawText
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1');
      segments.push({ type: 'block', blockType, text: cleanText, rawText });
      continue;
    }

    // $$ block equations (on its own line)
    if (trimmed === '$$') {
      const eqLines = [];
      i++;
      while (i < lines.length && lines[i].trim() !== '$$') { eqLines.push(lines[i]); i++; }
      i++;
      segments.push({ type: 'equation', text: eqLines.join('\n').trim() });
      continue;
    }

    // $$ inline (whole line: $$expr$$)
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
      segments.push({ type: 'li', text: trimmed.slice(2).replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1') });
    }

    // Numbered list
    else if (/^\d+\.\s/.test(trimmed)) {
      segments.push({ type: 'oli', text: trimmed.replace(/^\d+\.\s/, '').replace(/\*\*(.*?)\*\*/g, '$1') });
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
          const cells = row.split('|').filter((_, idx, arr) => idx > 0 && idx < arr.length - 1).map(c => c.trim()
            .replace(/\*\*(.*?)\*\*/g, '$1').replace(/\*(.*?)\*/g, '$1'));
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

    // HR
    else if (trimmed.startsWith('---') || trimmed.startsWith('===')) {
      segments.push({ type: 'hr' });
    }

    // Paragraph
    else {
      const clean = trimmed
        .replace(/\*\*(.*?)\*\*/g, '$1')
        .replace(/\*(.*?)\*/g, '$1')
        .replace(/`(.*?)`/g, '$1')
        .replace(/\[(.*?)\]\(.*?\)/g, '$1')
        .replace(/\$\$(.*?)\$\$/g, '$1')
        .replace(/\$(.*?)\$/g, '$1');
      segments.push({ type: 'p', text: clean });
    }

    i++;
  }

  return segments;
}

// ─────────────────────────────────────────────────────────────────
// Block style definitions
// ─────────────────────────────────────────────────────────────────
const BLOCK_STYLES = {
  definition: { bg: [239, 246, 255], border: [59, 130, 246],  label: 'Definition' },
  example:    { bg: [240, 253, 244], border: [16, 185, 129],  label: 'Example' },
  keypoint:   { bg: [255, 251, 235], border: [245, 158, 11],  label: 'Key Point' },
  warning:    { bg: [254, 242, 242], border: [239, 68, 68],   label: 'Common Mistake' },
  theorem:    { bg: [245, 243, 255], border: [109, 40, 217],  label: 'Theorem' },
  note:       { bg: [240, 249, 255], border: [14, 165, 233],  label: 'Note' },
  mermaid:    { bg: [248, 250, 252], border: [100, 116, 139], label: 'Diagram' },
};

// ─────────────────────────────────────────────────────────────────
// Export to PDF using jsPDF
// ─────────────────────────────────────────────────────────────────
export async function exportToPDF(title, outputType, chapters, results, options = {}, onImageLog = null) {
  const { jsPDF } = await import('jspdf');
  await import('jspdf-autotable');

  const doc = new jsPDF({ unit: 'mm', format: 'a4', compress: true });
  const W = 210, H = 297, ML = 20, MR = 20, TW = W - ML - MR;
  const today = new Date().toLocaleDateString('en-US', { year: 'numeric', month: 'long', day: 'numeric' });

  // ── Pre-load cover template, end page (JPEG to compress 1MB+ file), logo ──
  const [coverTemplate, endPageB64, logoObj] = await Promise.all([
    imgUrlToPng(coverTemplateUrl).catch(() => null),
    imgUrlToBase64(endPageUrl).catch(() => null),   // JPEG compression keeps PDF size small
    imgUrlToPng(logoUrl).catch(() => null),
  ]);
  const logoB64 = logoObj?.base64 || null;
  const logoAspect = logoObj ? (logoObj.w / Math.max(logoObj.h, 1)) : 1;
  onImageLog?.({ cover: !!coverTemplate?.base64, wikiLoaded: 0, wikiTotal: 0, mermaid: 0, done: false });

  // ── Pre-render all Mermaid blocks ───────────────────────────
  const mermaidCache = new Map();
  let mermaidCount = 0;
  for (const result of results) {
    for (const seg of parseMarkdownToSegments(result.content || '')) {
      if (seg.type === 'block' && seg.blockType === 'mermaid') {
        const key = seg.rawText || seg.text;
        if (!mermaidCache.has(key)) {
          const r = await renderMermaidToBase64(key).catch(() => null);
          mermaidCache.set(key, r);
          if (r) mermaidCount++;
        }
      }
    }
  }

  // ── Pre-fetch Wikipedia images for all topics (parallel, 5s max total) ────
  const uniqueTopicNames = [...new Set(results.map((r) => r.topicName).filter(Boolean))];
  const wikiImgList = await Promise.race([
    Promise.all(uniqueTopicNames.map((name) => fetchWikipediaImage(name).catch(() => null))),
    new Promise((r) => setTimeout(() => r(uniqueTopicNames.map(() => null)), 5000)),
  ]).catch(() => uniqueTopicNames.map(() => null));
  const wikiLoaded = wikiImgList.filter(Boolean).length;
  onImageLog?.({ cover: !!coverTemplate?.base64, wikiLoaded, wikiTotal: uniqueTopicNames.length, mermaid: mermaidCount, done: false });
  const topicImageCache = new Map(uniqueTopicNames.map((name, i) => [name, wikiImgList[i]]));

  // ── Page header helper ───────────────────────────────────────
  const drawPageHeader = (chName) => {
    doc.setFillColor(248, 249, 255); doc.rect(0, 0, W, H, 'F');
    doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.3); doc.line(ML, 13, W - MR, 13);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
    doc.text((chName || '').slice(0, 50), ML, 10);
    const brandText = 'PlanForge AI';
    if (logoB64) {
      const LOGO_H = 6;
      const logoW = LOGO_H * logoAspect;          // width locked to natural aspect ratio
      const brandW = doc.getTextWidth(brandText);
      const blockW = logoW + 2.5 + brandW;        // logo + 2.5mm gap + text
      const blockX = W - MR - blockW;
      doc.addImage(logoB64, 'PNG', blockX, 6, logoW, LOGO_H);
      doc.text(brandText, blockX + logoW + 1, 10);
    } else {
      doc.text(brandText, W - MR, 10, { align: 'right' });
    }
  };

  // ── Page-break helper ────────────────────────────────────────
  const ensureSpace = (curY, needed, chName) => {
    if (curY + needed > H - 18) {
      doc.addPage();
      drawPageHeader(chName);
      return 22;
    }
    return curY;
  };

  // ── COVER PAGE ───────────────────────────────────────────────
  if (coverTemplate) {
    doc.addImage(coverTemplate.base64, 'PNG', 0, 0, W, H);
  } else {
    // Fallback dark cover
    doc.setFillColor(14, 17, 40); doc.rect(0, 0, W, H, 'F');
    doc.setFillColor(28, 10, 80); doc.rect(0, 0, W, 50, 'F');
    doc.setFillColor(108, 62, 232); doc.circle(W / 2, 24, 11, 'F');
    doc.setTextColor(255, 255, 255); doc.setFontSize(11); doc.setFont('helvetica', 'bold');
    doc.text('PF', W / 2, 28, { align: 'center' });
  }

  // Overlay: Title — white area in template runs ~y=80mm to y=155mm, usable width ~140mm
  const TITLE_MAX_W = 140;
  const TITLE_AREA_TOP = 85;
  const TITLE_AREA_BOT = 152;
  const TITLE_AREA_CY = (TITLE_AREA_TOP + TITLE_AREA_BOT) / 2; // ~118mm
  const titleLines = doc.splitTextToSize(cleanText(title).toUpperCase(), TITLE_MAX_W);
  const titleFontSize = titleLines.length > 4 ? 18 : titleLines.length > 3 ? 20 : titleLines.length > 2 ? 22 : 26;
  const titleLineH = titleFontSize * 0.42;
  const titleBlockH = titleLines.length * titleLineH;
  const titleStartY = Math.min(Math.max(TITLE_AREA_CY - titleBlockH / 2, TITLE_AREA_TOP), TITLE_AREA_BOT - titleBlockH);
  doc.setFontSize(titleFontSize); doc.setFont('helvetica', 'bold');
  doc.setTextColor(26, 26, 46);
  doc.text(titleLines, W / 2, titleStartY, { align: 'center', lineHeightFactor: 1.35 });

  // Overlay: Date  (inside the date badge on the template, ~y=232mm)
  doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
  doc.text(today, W / 2 + 8, 232, { align: 'center' });

  // Overlay: Chapters · Topics (inside the pill badge on the template, ~y=250mm)
  doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(55, 65, 81);
  const statsText = `${chapters.length} Chapters  ·  ${results.length} Topics`;
  const statsLines = doc.splitTextToSize(statsText, TW - 20);
  const statsLineH = 7;
  const statsStartY = 251 - ((statsLines.length - 1) * statsLineH) / 2;
  doc.text(statsLines, W / 2, statsStartY, { align: 'center', lineHeightFactor: statsLineH / 16 * 2.83 });

  // ── TABLE OF CONTENTS ────────────────────────────────────────
  doc.addPage();
  let y = 20;
  drawPageHeader('Table of Contents');
  doc.setFontSize(20); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 46);
  doc.text('Table of Contents', ML, y);
  y += 8;
  doc.setDrawColor(108, 62, 232); doc.setLineWidth(0.3); doc.line(ML, y, W - MR, y);
  y += 10;

  const tocEntries = [];
  let pgCounter = 3;
  chapters.forEach((ch) => {
    tocEntries.push({ name: ch.name, level: 0, page: pgCounter });
    const chRes = results.filter((r) => r.chapterId === ch.id);
    chRes.forEach((r) => tocEntries.push({ name: r.topicName || '', level: 1, page: pgCounter }));
    pgCounter += Math.max(1, Math.ceil(chRes.reduce((a, r) => a + (r.content?.length || 0) / 3000, 0)));
  });

  tocEntries.forEach((entry) => {
    if (y > H - 20) { doc.addPage(); doc.setFillColor(248, 249, 255); doc.rect(0, 0, W, H, 'F'); y = 20; }
    if (entry.level === 0) {
      doc.setFontSize(12); doc.setFont('helvetica', 'bold'); doc.setTextColor(108, 62, 232);
      const n = entry.name.length > 55 ? entry.name.slice(0, 52) + '...' : entry.name;
      doc.text(n, ML, y);
      doc.text(`${entry.page}`, W - MR, y, { align: 'right' });
      const nW = doc.getTextWidth(n);
      const pW = doc.getTextWidth(`${entry.page}`);
      const ds = ML + nW + 3, de = W - MR - pW - 3;
      if (de > ds + 5) {
        doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(200, 200, 210);
        doc.text('.'.repeat(Math.floor((de - ds) / 2.5)), ds, y);
      }
      y += 8;
    } else {
      doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(107, 114, 128);
      doc.text(`  · ${entry.name.length > 65 ? entry.name.slice(0, 62) + '...' : entry.name}`, ML + 5, y);
      y += 6;
    }
  });

  // ── CONTENT PAGES ────────────────────────────────────────────
  const sortedResults = [...results].sort((a, b) => {
    const ai = chapters.findIndex((c) => c.id === a.chapterId);
    const bi = chapters.findIndex((c) => c.id === b.chapterId);
    return ai - bi;
  });

  let currentChapterId = null;

  for (const result of sortedResults) {
    doc.addPage();
    drawPageHeader(result.chapterName);
    y = 22;

    if (result.chapterId !== currentChapterId) {
      currentChapterId = result.chapterId;
      doc.setFontSize(18); doc.setFont('helvetica', 'bold'); doc.setTextColor(108, 62, 232);
      const chl = doc.splitTextToSize(result.chapterName || '', TW);
      doc.text(chl, ML, y);
      y += chl.length * 8 + 4;
      doc.setDrawColor(108, 62, 232); doc.setLineWidth(0.5);
      doc.line(ML, y, ML + 40, y);
      y += 8;
    }

    const segments = parseMarkdownToSegments(result.content || '');
    let topicImgInserted = false;
    const topicWikiImg = topicImageCache.get(result.topicName || '') || null;

    for (const seg of segments) {
      switch (seg.type) {
        case 'spacer': y += 2; break;

        case 'hr':
          y = ensureSpace(y, 6, result.chapterName);
          doc.setDrawColor(229, 231, 235); doc.setLineWidth(0.2);
          doc.line(ML, y, W - MR, y); y += 4; break;

        case 'h1': {
          y = ensureSpace(y, 18, result.chapterName); y += 2;
          doc.setFontSize(16); doc.setFont('helvetica', 'bold'); doc.setTextColor(26, 26, 46);
          const ls = doc.splitTextToSize(cleanText(seg.text), TW); doc.text(ls, ML, y);
          y += ls.length * 9 + 4;
          // Wikipedia image immediately after first topic h1 — maintain aspect ratio
          if (!topicImgInserted && topicWikiImg) {
            topicImgInserted = true;
            const MAX_W = TW, MAX_H = 60;
            const ratio = Math.min(MAX_W / topicWikiImg.w, MAX_H / topicWikiImg.h);
            const imgW = topicWikiImg.w * ratio;
            const imgH = topicWikiImg.h * ratio;
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
          let cy = y + 1;
          cls.forEach((cl) => { const cs = doc.splitTextToSize(cl, TW - 6); doc.text(cs, ML + 3, cy); cy += cs.length * 4.5; });
          y = cy + 4; break;
        }

        case 'equation': {
          const eqText = latexToReadable(seg.text);
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
          const style = BLOCK_STYLES[seg.blockType] || BLOCK_STYLES.note;

          if (seg.blockType === 'mermaid') {
            const key = seg.rawText || seg.text;
            const img = mermaidCache.get(key);
            if (img) {
              // Lock aspect ratio — never stretch width and height independently
              const MAX_DIAG_W = TW - 4;
              const MAX_DIAG_H = 72;
              const diagRatio = Math.min(MAX_DIAG_W / Math.max(img.w, 1), MAX_DIAG_H / Math.max(img.h, 1));
              const diagW = img.w * diagRatio;
              const diagH = img.h * diagRatio;
              const diagX = ML + (TW - diagW) / 2;
              y = ensureSpace(y, diagH + 14, result.chapterName);
              const boxH = diagH + 12;
              doc.setFillColor(...style.bg); doc.setDrawColor(...style.border); doc.setLineWidth(0.3);
              doc.roundedRect(ML, y - 2, TW, boxH, 2, 2, 'FD');
              doc.setFontSize(8); doc.setFont('helvetica', 'bold'); doc.setTextColor(...style.border);
              doc.text('Diagram', ML + 4, y + 4);
              doc.addImage(img.base64, 'PNG', diagX, y + 7, diagW, diagH);
              y += boxH + 4;
            } else {
              // Mermaid failed: show as code
              const fallbackLines = (seg.rawText || seg.text).split('\n');
              const fH = fallbackLines.length * 4.5 + 8;
              y = ensureSpace(y, fH, result.chapterName);
              doc.setFillColor(248, 250, 252); doc.roundedRect(ML, y - 2, TW, fH, 2, 2, 'F');
              doc.setFontSize(8); doc.setFont('courier', 'normal'); doc.setTextColor(100, 116, 139);
              let fy = y + 1;
              fallbackLines.forEach((fl) => { doc.text(doc.splitTextToSize(fl, TW - 6), ML + 3, fy); fy += 4.5; });
              y = fy + 4;
            }
          } else {
            const cleanedBlock = cleanText(seg.text);
            if (!cleanedBlock.trim()) break;
            const textLines = doc.splitTextToSize(cleanedBlock, TW - 12);
            const blockH = textLines.length * 5.5 + 16;
            y = ensureSpace(y, blockH, result.chapterName);
            doc.setFillColor(...style.bg);
            doc.roundedRect(ML, y - 2, TW, blockH, 2, 2, 'F');
            doc.setFillColor(...style.border);
            doc.roundedRect(ML, y - 2, 3.5, blockH, 1, 1, 'F');
            doc.setFontSize(8.5); doc.setFont('helvetica', 'bold'); doc.setTextColor(...style.border);
            doc.text(style.label, ML + 7, y + 5);
            doc.setFontSize(10); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
            doc.text(textLines, ML + 7, y + 12);
            y += blockH + 4;
          }
          break;
        }

        case 'p':
        default: {
          const cleanedP = cleanText(seg.text);
          if (!cleanedP.trim()) break;
          const pl = doc.splitTextToSize(cleanedP, TW);
          y = ensureSpace(y, pl.length * 5.5, result.chapterName);
          doc.setFontSize(10.5); doc.setFont('helvetica', 'normal'); doc.setTextColor(55, 65, 81);
          doc.text(pl, ML, y); y += pl.length * 5.5 + 1; break;
        }
      }
    }
  }

  // ── LAST PAGE — end.png full-bleed ──────────────────────────
  doc.addPage();
  if (endPageB64) {
    doc.addImage(endPageB64, 'JPEG', 0, 0, W, H);
  } else {
    // Fallback if image failed to load
    drawPageHeader('');
    doc.setFontSize(22); doc.setFont('helvetica', 'bold'); doc.setTextColor(108, 62, 232);
    doc.text('Thank You', W / 2, H / 2, { align: 'center' });
  }

  // ── PAGE NUMBERS — single final pass, no duplicates ──────────
  const totalP = doc.internal.getNumberOfPages();
  for (let pg = 2; pg <= totalP; pg++) {
    doc.setPage(pg);
    doc.setFontSize(8); doc.setFont('helvetica', 'normal'); doc.setTextColor(155, 155, 175);
    if (pg === 2) {
      doc.text('Table of Contents', W / 2, H - 8, { align: 'center' });
    } else if (pg === totalP) {
      // disclaimer page — intentionally no page number
    } else {
      doc.text(`${pg - 2}  /  ${totalP - 3}`, W / 2, H - 8, { align: 'center' });
    }
  }

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
    new Paragraph({
      children: [new TextRun({ text: `AI Generated by PlanForge AI · ${today}`, color: '6B7280' })],
      alignment: AlignmentType.CENTER,
    }),
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
      switch (seg.type) {
        case 'h2': children.push(new Paragraph({ text: seg.text, heading: HeadingLevel.HEADING_2 })); break;
        case 'h3': children.push(new Paragraph({ text: seg.text, heading: HeadingLevel.HEADING_3 })); break;
        case 'h4':
        case 'bold': children.push(new Paragraph({ children: [new TextRun({ text: seg.text, bold: true })] })); break;
        case 'li': children.push(new Paragraph({ children: [new TextRun({ text: `• ${seg.text}` })], indent: { left: 360 } })); break;
        case 'oli': children.push(new Paragraph({ children: [new TextRun({ text: `  ${seg.text}` })], indent: { left: 360 } })); break;
        case 'equation': children.push(new Paragraph({ children: [new TextRun({ text: seg.text, font: 'Courier New', color: '6C3EE8', size: 20 })] })); break;
        case 'block':
          children.push(new Paragraph({ children: [new TextRun({ text: `[${(BLOCK_STYLES[seg.blockType] || BLOCK_STYLES.note).label}] ${seg.text}`, italics: true })] }));
          break;
        case 'code': children.push(new Paragraph({ children: [new TextRun({ text: seg.text, font: 'Courier New', size: 18 })], shading: { fill: 'F3F4F6' } })); break;
        case 'p': if (seg.text?.trim()) children.push(new Paragraph({ text: seg.text })); break;
        case 'spacer': children.push(new Paragraph({ text: '' })); break;
        default: break;
      }
    });
  });

  // Disclaimer
  children.push(
    new Paragraph({ text: '' }),
    new Paragraph({ text: 'Thank You', heading: HeadingLevel.HEADING_1, alignment: AlignmentType.CENTER }),
    new Paragraph({ children: [new TextRun({ text: 'This content is AI-generated. Always verify from authoritative sources. Not for commercial redistribution.', italics: true, color: '9CA3AF' })] }),
    new Paragraph({ children: [new TextRun({ text: 'Built by Lohit R · lohitr.vercel.app', color: 'C4C4C4', size: 16 })] })
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
  sortedResults.forEach((r) => { md += r.content + '\n\n---\n\n'; });
  md += `\n---\n*Built by Lohit R · lohitr.vercel.app · Content is AI-generated, verify before use.*\n`;

  const blob = new Blob([md], { type: 'text/markdown;charset=utf-8' });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url; a.download = `${title.replace(/[^a-z0-9]/gi, '_').toLowerCase()}.md`; a.click();
  URL.revokeObjectURL(url);
}
