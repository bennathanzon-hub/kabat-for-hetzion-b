import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import fs from 'node:fs';
import path from 'node:path';

// ------------------------------------------------------------------
// כל התחקירים ותיקי הבטיחות נבנים אוטומטית מתוך התיקייה public/files.
// אין צורך לערוך קוד כדי להוסיף קובץ — ראה README.md
// ------------------------------------------------------------------

const FILES_DIR = path.resolve('public/files');
const CATEGORIES = {
  'תחקירים': 'investigation',
  'תיקי בטיחות': 'safety',
};
const ALLOWED = ['.pdf', '.doc', '.docx'];
const MAX_MB = 25; // מגבלת גודל קובץ של Cloudflare Pages
const IGNORE = /^(\.|~\$|Thumbs\.db$|desktop\.ini$)/i;

// "2026-09-20 כותרת" או "20.09.2026 כותרת" (גם עם / או - בין המספרים)
const DATE_PREFIX = /^\s*(?:(\d{4})[-.\/](\d{1,2})[-.\/](\d{1,2})|(\d{1,2})[-.\/](\d{1,2})[-.\/](\d{4}))\s*[-–—_]?\s*/;

function parseName(name) {
  const m = name.match(DATE_PREFIX);
  if (!m) return { date: '', title: name.trim() };
  const [y, mo, d] = m[1] ? [m[1], m[2], m[3]] : [m[6], m[5], m[4]];
  const date = `${y}-${mo.padStart(2, '0')}-${d.padStart(2, '0')}`;
  const valid = !Number.isNaN(Date.parse(date)) && +mo >= 1 && +mo <= 12 && +d >= 1 && +d <= 31;
  const title = name.slice(m[0].length).trim();
  return valid && title ? { date, title } : { date: '', title: name.trim() };
}

const urlFor = (...parts) => '/files/' + parts.map(encodeURIComponent).join('/');
const extOf = (name) => path.extname(name).toLowerCase();
const baseOf = (name) => name.slice(0, name.length - path.extname(name).length);

function scanFiles({ strict }) {
  const records = [];
  const problems = [];

  const toFile = (fullPath, urlParts) => {
    const name = path.basename(fullPath);
    if (IGNORE.test(name)) return null;
    const ext = extOf(name);
    if (!ALLOWED.includes(ext)) {
      problems.push({ fatal: false, msg: `דילוג על "${urlParts.join('/')}" — רק PDF ו-Word נתמכים` });
      return null;
    }
    const size = fs.statSync(fullPath).size;
    if (size > MAX_MB * 1024 * 1024) {
      problems.push({ fatal: true, msg: `הקובץ "${urlParts.join('/')}" גדול מ-${MAX_MB}MB. יש לכווץ או לפצל אותו` });
    }
    return { name: baseOf(name), format: ext === '.pdf' ? 'pdf' : 'word', size, url: urlFor(...urlParts) };
  };

  for (const [folder, type] of Object.entries(CATEGORIES)) {
    const dir = path.join(FILES_DIR, folder);
    if (!fs.existsSync(dir)) continue;

    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (IGNORE.test(entry.name)) continue;
      const full = path.join(dir, entry.name);

      if (entry.isDirectory()) {
        // תיקייה = רשומה עם כמה קבצים
        const files = fs
          .readdirSync(full, { withFileTypes: true })
          .filter((f) => f.isFile())
          .map((f) => toFile(path.join(full, f.name), [folder, entry.name, f.name]))
          .filter(Boolean)
          .sort((a, b) => a.name.localeCompare(b.name, 'he'));
        if (files.length) records.push({ id: `${type}/${entry.name}`, type, ...parseName(entry.name), files });
      } else if (entry.isFile()) {
        // קובץ בודד = רשומה עם קובץ אחד
        const file = toFile(full, [folder, entry.name]);
        // הכותרת כבר מציגה את שם הקובץ, אז על הכפתור מופיע רק סוג הקובץ
        if (file) file.name = file.format === 'pdf' ? 'קובץ PDF' : 'קובץ Word';
        if (file) records.push({ id: `${type}/${entry.name}`, type, ...parseName(baseOf(entry.name)), files: [file] });
      }
    }
  }

  for (const p of problems) console.warn(`[ארכיון] ${p.msg}`);
  const fatal = problems.filter((p) => p.fatal);
  if (strict && fatal.length) throw new Error(fatal.map((p) => p.msg).join('\n'));
  return records;
}

function archiveRecords() {
  const ID = 'virtual:records';
  const RESOLVED = '\0' + ID;
  let strict = true;
  return {
    name: 'archive-records',
    configResolved(config) {
      strict = config.command === 'build';
    },
    resolveId: (id) => (id === ID ? RESOLVED : null),
    load(id) {
      if (id !== RESOLVED) return null;
      return `export default ${JSON.stringify(scanFiles({ strict }))};`;
    },
    // בזמן פיתוח: רענון אוטומטי כשמוסיפים או מוחקים קובץ
    configureServer(server) {
      server.watcher.add(FILES_DIR);
      const refresh = (file) => {
        if (!path.resolve(file).startsWith(FILES_DIR)) return;
        const mod = server.moduleGraph.getModuleById(RESOLVED);
        if (mod) server.moduleGraph.invalidateModule(mod);
        server.ws.send({ type: 'full-reload' });
      };
      for (const evt of ['add', 'unlink', 'addDir', 'unlinkDir']) server.watcher.on(evt, refresh);
    },
  };
}

export default defineConfig({
  plugins: [react(), archiveRecords()],
});
