// docProcessor.js — PDF extraction + Image OCR + SimpleRAG

// ─────────────────────────────────────────────────────────────────
// PDF Text Extraction using pdfjs-dist
// ─────────────────────────────────────────────────────────────────
export async function extractPDFText(file, onProgress) {
  try {
    // Dynamically import pdfjs-dist
    const pdfjsLib = await import('pdfjs-dist');
    pdfjsLib.GlobalWorkerOptions.workerSrc =
      'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

    const arrayBuffer = await file.arrayBuffer();
    const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
    const numPages = pdf.numPages;
    let fullText = '';

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      if (onProgress) onProgress(pageNum, numPages);
      const page = await pdf.getPage(pageNum);
      const textContent = await page.getTextContent();
      const pageText = textContent.items
        .map((item) => item.str)
        .join(' ');
      fullText += pageText + '\n\n';
    }
    return fullText.trim();
  } catch (err) {
    console.error('PDF extraction error:', err);
    throw new Error(`Failed to extract PDF text: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// Image OCR using Tesseract.js
// ─────────────────────────────────────────────────────────────────
export async function extractImageText(file, onProgress) {
  try {
    const Tesseract = await import('tesseract.js');
    const result = await Tesseract.recognize(file, 'eng', {
      logger: (m) => {
        if (m.status === 'recognizing text' && onProgress) {
          onProgress(Math.round(m.progress * 100));
        }
      },
    });
    return result.data.text || '';
  } catch (err) {
    console.error('OCR error:', err);
    throw new Error(`Failed to extract image text: ${err.message}`);
  }
}

// ─────────────────────────────────────────────────────────────────
// SimpleRAG — Browser keyword-match retrieval
// ─────────────────────────────────────────────────────────────────
export function chunkText(text, wordsPerChunk = 400) {
  const words = text.split(/\s+/).filter(Boolean);
  const chunks = [];
  for (let i = 0; i < words.length; i += wordsPerChunk) {
    const chunk = words.slice(i, i + wordsPerChunk).join(' ');
    if (chunk.trim()) chunks.push(chunk);
  }
  return chunks;
}

function scoreChunk(chunk, query) {
  const qWords = new Set(
    query
      .toLowerCase()
      .split(/\W+/)
      .filter((w) => w.length > 3)
  );
  const cLower = chunk.toLowerCase();
  let score = 0;
  qWords.forEach((w) => {
    if (cLower.includes(w)) score++;
  });
  return score;
}

export function retrieveChunks(chunks, query, topK = 4) {
  return chunks
    .map((c) => ({ c, s: scoreChunk(c, query) }))
    .filter((x) => x.s > 0)
    .sort((a, b) => b.s - a.s)
    .slice(0, topK)
    .map((x) => x.c);
}

export function buildRAGContext(chunks, topicName, subtopics = []) {
  const query = `${topicName} ${subtopics.join(' ')}`;
  const relevant = retrieveChunks(chunks, query);
  if (!relevant.length) return '';
  return `Context from uploaded documents:\n---\n${relevant.join('\n\n')}\n---\n`;
}

// ─────────────────────────────────────────────────────────────────
// processAllUploads — handle multiple files
// ─────────────────────────────────────────────────────────────────
export async function processAllUploads(files, onProgress) {
  const MAX_SIZE = 5 * 1024 * 1024; // 5MB
  const MAX_FILES = 3;

  const validFiles = files.slice(0, MAX_FILES);
  let allChunks = [];
  let filesSummary = '';
  let pdfsProcessed = 0;
  let imagesProcessed = 0;

  for (let i = 0; i < validFiles.length; i++) {
    const file = validFiles[i];
    if (file.size > MAX_SIZE) {
      onProgress && onProgress({ type: 'warning', message: `${file.name} skipped (>5MB)` });
      continue;
    }

    const isPDF = file.type === 'application/pdf' || file.name.endsWith('.pdf');
    const isImage = file.type.startsWith('image/') ||
      /\.(jpg|jpeg|png|gif|webp|bmp)$/i.test(file.name);

    try {
      if (isPDF) {
        onProgress && onProgress({ type: 'pdf_start', file: file.name, index: i });
        const text = await extractPDFText(file, (page, total) => {
          onProgress && onProgress({ type: 'pdf_page', page, total, file: file.name });
        });
        const chunks = chunkText(text);
        allChunks = [...allChunks, ...chunks];
        filesSummary += `PDF "${file.name}": ${chunks.length} chunks extracted\n`;
        pdfsProcessed++;
      } else if (isImage) {
        onProgress && onProgress({ type: 'ocr_start', file: file.name, index: i });
        const text = await extractImageText(file, (pct) => {
          onProgress && onProgress({ type: 'ocr_progress', pct, file: file.name });
        });
        const chunks = chunkText(text);
        allChunks = [...allChunks, ...chunks];
        const wordCount = text.split(/\s+/).filter(Boolean).length;
        filesSummary += `Image "${file.name}": OCR extracted ${wordCount} words\n`;
        imagesProcessed++;
      }
    } catch (err) {
      onProgress && onProgress({ type: 'error', file: file.name, message: err.message });
    }
  }

  return { chunks: allChunks, filesSummary, pdfsProcessed, imagesProcessed };
}
