export default function EditorIcon({ name }) {
  const shapes = {
    lock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 8 0v3"/><path d="M12 14v3"/></>,
    unlock: <><rect x="5" y="10" width="14" height="11" rx="2"/><path d="M8 10V7a4 4 0 0 1 7.5-2"/></>,
    eye: <><path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12Z"/><circle cx="12" cy="12" r="3"/></>,
    hidden: <><path d="m3 3 18 18M9 5.4c1-.3 2-.4 3-.4 6.5 0 10 7 10 7a19 19 0 0 1-3.2 3.8M6.2 6.2A21 21 0 0 0 2 12s3.5 7 10 7c1.7 0 3.1-.4 4.4-1"/><path d="M10 10a3 3 0 0 0 4 4"/></>,
  };
  return <svg viewBox="0 0 24 24" width="16" height="16" fill="none" stroke="currentColor" strokeWidth="1.7" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">{shapes[name]}</svg>;
}
