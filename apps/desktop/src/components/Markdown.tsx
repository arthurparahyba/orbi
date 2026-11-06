import { Fragment, type ReactNode } from 'react';

/** Small, safe markdown subset: paragraphs, bullet lists, **bold**, `code`, ``` blocks. No HTML injection. */
export function Markdown({ text }: { text: string }) {
  const blocks = text.split(/```/);
  return (
    <div className="md">
      {blocks.map((b, i) =>
        i % 2 === 1 ? (
          <pre key={i} className="code">{b.replace(/^[a-z]*\n/, '')}</pre>
        ) : (
          <Fragment key={i}>{paragraphs(b)}</Fragment>
        ),
      )}
    </div>
  );
}

function paragraphs(src: string): ReactNode[] {
  const out: ReactNode[] = [];
  const chunks = src.split(/\n{2,}/).map((c) => c.trim()).filter(Boolean);
  chunks.forEach((c, i) => {
    const lines = c.split('\n');
    if (lines.every((l) => /^\s*([-*]|\d+\.)\s/.test(l))) {
      const ordered = /^\s*\d+\./.test(lines[0]);
      const items = lines.map((l, j) => <li key={j}>{inline(l.replace(/^\s*([-*]|\d+\.)\s/, ''))}</li>);
      out.push(ordered ? <ol key={i}>{items}</ol> : <ul key={i}>{items}</ul>);
    } else {
      out.push(<p key={i}>{lines.map((l, j) => <Fragment key={j}>{j > 0 && <br />}{inline(l)}</Fragment>)}</p>);
    }
  });
  return out;
}

function inline(s: string): ReactNode[] {
  return s.split(/(`[^`]+`|\*\*[^*]+\*\*)/g).map((t, i) => {
    if (t.startsWith('`') && t.endsWith('`') && t.length > 1) return <code key={i}>{t.slice(1, -1)}</code>;
    if (t.startsWith('**') && t.endsWith('**') && t.length > 3) return <strong key={i}>{t.slice(2, -2)}</strong>;
    return <Fragment key={i}>{t}</Fragment>;
  });
}
