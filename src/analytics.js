// analytics.js — Google Sheets logging (silent, owner-only)
import { SHEETS_WEBHOOK } from './config.js';

async function getCountry() {
  try {
    const r = await fetch('https://ipapi.co/country_name/', { signal: AbortSignal.timeout(3000) });
    if (!r.ok) return 'Unknown';
    return (await r.text()).trim().slice(0, 60);
  } catch { return 'Unknown'; }
}

function getDeviceInfo() {
  const ua = navigator.userAgent || '';
  const isMobile = /Mobi|Android|iPhone|iPad/i.test(ua);
  const browser = /Edg/.test(ua) ? 'Edge'
    : /OPR/.test(ua) ? 'Opera'
    : /Chrome/.test(ua) ? 'Chrome'
    : /Firefox/.test(ua) ? 'Firefox'
    : /Safari/.test(ua) ? 'Safari' : 'Other';
  const os = /Windows NT/.test(ua) ? 'Windows'
    : /Android/.test(ua) ? 'Android'
    : /iPhone|iPad|iPod/.test(ua) ? 'iOS'
    : /Mac OS/.test(ua) ? 'macOS'
    : /Linux/.test(ua) ? 'Linux' : 'Other';
  const device = /iPad/.test(ua) ? 'Tablet' : isMobile ? 'Mobile' : 'Desktop';
  const model = ua.match(/\(([^)]+)\)/)?.[1]?.split(';')?.[0]?.trim() || device;
  return { device, browser, os, model };
}

export async function logToSheets({ topic, outputType, status, error, chapters, topics, pages, duration, stars, feedback }) {
  if (!SHEETS_WEBHOOK) return;
  const now = new Date();
  const { device, browser, os, model } = getDeviceInfo();
  const country = await getCountry();
  try {
    await fetch(SHEETS_WEBHOOK, {
      method: 'POST',
      headers: { 'Content-Type': 'text/plain' },
      body: JSON.stringify({
        topic: topic || '',
        outputType: outputType || '',
        date: now.toLocaleDateString('en-IN'),
        time: now.toLocaleTimeString('en-IN'),
        device: `${model} (${device})`,
        browser, os, country,
        status: status || 'unknown',
        error: error || '',
        chapters: chapters || 0,
        topics: topics || 0,
        pages: pages || 0,
        duration: duration || 0,
        stars: stars || '',
        feedback: feedback || '',
      }),
    });
  } catch { /* silent — never block the user */ }
}
