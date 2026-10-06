import { useMemo, useState } from 'react';
import records from 'virtual:records';

const TYPE_LABELS = { investigation: 'תחקיר', safety: 'תיק בטיחות' };
const TABS = [
  { key: 'all', label: 'הכל' },
  { key: 'investigation', label: 'תחקירים' },
  { key: 'safety', label: 'תיקי בטיחות' },
];

// מאחד גרשיים עבריים ורגילים ורווחים כפולים, כדי שחיפוש "קב"ט" ימצא גם "קב״ט"
const normalize = (s) => s.replace(/[״”“]/g, '"').replace(/[׳’‘]/g, "'").replace(/\s+/g, ' ').toLowerCase();

const formatDate = (iso) => (iso ? iso.split('-').reverse().join('.') : '');
const formatSize = (bytes) =>
  bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))}KB` : `${(bytes / 1024 / 1024).toFixed(1)}MB`;

// נחדש לישן; פריטים בלי תאריך בסוף
const sorted = [...records].sort(
  (a, b) => (b.date || '').localeCompare(a.date || '') || a.title.localeCompare(b.title, 'he')
);

function Highlight({ text, query }) {
  const q = normalize(query.trim());
  if (!q) return text;
  const idx = normalize(text).indexOf(q);
  if (idx === -1) return text;
  return (
    <>
      {text.slice(0, idx)}
      <mark>{text.slice(idx, idx + q.length)}</mark>
      {text.slice(idx + q.length)}
    </>
  );
}

function FileIcon({ format }) {
  return (
    <svg className={`file-icon ${format}`} viewBox="0 0 20 24" aria-hidden="true">
      <path d="M3 1h9l6 6v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2z" fill="currentColor" opacity=".14" />
      <path d="M3 1h9l6 6v14a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V3a2 2 0 0 1 2-2zM12 1v6h6" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
      <text x="9.5" y="18.5" textAnchor="middle" fill="currentColor">{format === 'pdf' ? 'PDF' : 'W'}</text>
    </svg>
  );
}

function FileLink({ file }) {
  const isPdf = file.format === 'pdf';
  return (
    <a
      className="file"
      href={file.url}
      {...(isPdf ? { target: '_blank', rel: 'noreferrer' } : { download: decodeURIComponent(file.url.split('/').pop()) })}
      title={isPdf ? 'פתיחה' : 'הורדה'}
    >
      <FileIcon format={file.format} />
      <span className="file-name">{file.name}</span>
      <span className="file-size">{formatSize(file.size)}</span>
    </a>
  );
}

export default function App() {
  const [tab, setTab] = useState('all');
  const [query, setQuery] = useState('');

  const counts = useMemo(
    () => ({
      all: records.length,
      investigation: records.filter((r) => r.type === 'investigation').length,
      safety: records.filter((r) => r.type === 'safety').length,
    }),
    []
  );

  const visible = useMemo(() => {
    const q = normalize(query.trim());
    return sorted.filter((r) => (tab === 'all' || r.type === tab) && (!q || normalize(r.title).includes(q)));
  }, [tab, query]);

  return (
    <>
      <header className="topbar">
        <div className="topbar-inner">
          <svg className="logo" viewBox="0 0 24 24" aria-hidden="true">
            <path d="M12 2 4 5v6c0 5.2 3.4 9.6 8 11 4.6-1.4 8-5.8 8-11V5z" fill="currentColor" />
            <path d="m8.5 12 2.5 2.5 4.5-5" fill="none" stroke="var(--navy)" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          <div>
            <h1>ארכיון בטיחות</h1>
            <p>תחקירים ותיקי בטיחות</p>
          </div>
        </div>
      </header>

      <main className="content">
        <div className="search">
          <svg viewBox="0 0 24 24" aria-hidden="true">
            <circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" strokeWidth="2" />
            <path d="m20 20-4-4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" />
          </svg>
          <input
            id="search"
            type="search"
            placeholder="חיפוש לפי שם…"
            value={query}
            onChange={(e) => setQuery(e.target.value)}
            aria-label="חיפוש לפי שם"
            autoComplete="off"
          />
        </div>

        <nav className="tabs" aria-label="סינון לפי סוג">
          {TABS.map((t) => (
            <button key={t.key} className={tab === t.key ? 'active' : ''} onClick={() => setTab(t.key)} aria-pressed={tab === t.key}>
              {t.label}
              <span className="count">{counts[t.key]}</span>
            </button>
          ))}
        </nav>

        {records.length === 0 ? (
          <div className="empty">
            <strong>הארכיון ריק</strong>
            <p>עדיין לא נוספו תחקירים או תיקי בטיחות.</p>
          </div>
        ) : visible.length === 0 ? (
          <div className="empty">
            <strong>לא נמצאו תוצאות</strong>
            <p>{query ? `אין פריט שהשם שלו מכיל "${query}".` : 'אין פריטים בקטגוריה הזו.'}</p>
          </div>
        ) : (
          <ul className="list">
            {visible.map((r) => (
              <li key={r.id} className="item">
                <div className="item-head">
                  <span className={`badge ${r.type}`}>{TYPE_LABELS[r.type]}</span>
                  <h2>
                    <Highlight text={r.title} query={query} />
                  </h2>
                  {r.date && <time dateTime={r.date}>{formatDate(r.date)}</time>}
                </div>
                <div className="files">
                  {r.files.map((f) => (
                    <FileLink key={f.url} file={f} />
                  ))}
                </div>
              </li>
            ))}
          </ul>
        )}
      </main>
    </>
  );
}
