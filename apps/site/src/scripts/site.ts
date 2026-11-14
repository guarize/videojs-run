/**
 * The page's behaviour: the hero player mounts after the first paint; the side plan marks each section waiting,
 * reading or read as the page scrolls, its reading ring filling with the section; the playground plays a visitor's
 * own Mux film with their own prompt and steps; the code copies.
 */
import { mount, runFilm } from '@preview/run/mount';

// ---- The hero's player, once the page has painted -------------------------------------------------------------
const host = document.getElementById('player');
const start = () => host && mount(host, runFilm('/'));
if ('requestIdleCallback' in window) requestIdleCallback(start, { timeout: 1200 });
else setTimeout(start, 200);

// ---- The side plan ----------------------------------------------------------------------------------------------
const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('.index a[data-step]'));
const sections = links.map((a) => document.getElementById(a.dataset.step!)).filter((s): s is HTMLElement => !!s);
const count = document.querySelector('.index-count');
let frame = 0;
const mark = () => {
  frame = 0;
  const line = innerHeight * 0.4;
  let current = -1;
  sections.forEach((s, i) => {
    if (s.getBoundingClientRect().top <= line) current = i;
  });
  links.forEach((a, i) => {
    const state = i < current ? 'done' : i === current ? 'running' : 'pending';
    if (a.dataset.state !== state) a.dataset.state = state;
    if (state === 'running') {
      a.setAttribute('aria-current', 'step');
      const r = sections[i].getBoundingClientRect();
      const p = Math.min(1, Math.max(0, (line - r.top) / Math.max(1, r.height)));
      a.style.setProperty('--p', p.toFixed(3));
    } else a.removeAttribute('aria-current');
  });
  if (count) count.textContent = `${Math.max(0, current + (current >= 0 ? 1 : 0))}/${links.length}`;
};
addEventListener('scroll', () => (frame ||= requestAnimationFrame(mark)), { passive: true });
addEventListener('resize', () => (frame ||= requestAnimationFrame(mark)));
mark();

// ---- The playground --------------------------------------------------------------------------------------------
const form = document.getElementById('playground-form') as HTMLFormElement | null;
const stage = document.getElementById('playground-player');
let made: string[] = [];

/** "0:12 Connect a source" lines as a WebVTT chapters file: each step runs to the next, the last to a long end. */
export function chaptersOf(text: string): string | null {
  const rows = text
    .split('\n')
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line) => /^(?:(\d+):)?(\d{1,2}):(\d{2})\s+(.+)$/.exec(line));
  if (!rows.length || rows.some((r) => !r)) return null;
  const at = rows.map((r) => Number(r![1] ?? 0) * 3600 + Number(r![2]) * 60 + Number(r![3]));
  const stamp = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${String(h).padStart(2, '0')}:${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}.000`;
  };
  const cues = rows.map((r, i) => `${i + 1}\n${stamp(at[i])} --> ${stamp(at[i + 1] ?? at[i] + 36000)}\n${r![4]}`);
  return `WEBVTT\n\n${cues.join('\n\n')}\n`;
}

form?.addEventListener('submit', (event) => {
  event.preventDefault();
  if (!stage) return;
  const data = new FormData(form);
  const id = String(data.get('id') ?? '').trim();
  const prompt = String(data.get('prompt') ?? '').trim();
  const stepsText = String(data.get('steps') ?? '').trim();
  const idError = document.getElementById('id-error')!;
  const stepsError = document.getElementById('steps-error')!;
  const okId = /^[A-Za-z0-9]{20,80}$/.test(id);
  const vtt = stepsText ? chaptersOf(stepsText) : '';
  idError.hidden = okId;
  stepsError.hidden = vtt !== null;
  form.querySelector<HTMLInputElement>('[name="id"]')!.setAttribute('aria-invalid', String(!okId));
  form.querySelector<HTMLTextAreaElement>('[name="steps"]')!.setAttribute('aria-invalid', String(vtt === null));
  if (!okId) return form.querySelector<HTMLInputElement>('[name="id"]')!.focus();
  if (vtt === null) return form.querySelector<HTMLTextAreaElement>('[name="steps"]')!.focus();
  for (const url of made) URL.revokeObjectURL(url);
  made = [];
  const chapters = vtt ? URL.createObjectURL(new Blob([vtt], { type: 'text/vtt' })) : undefined;
  if (chapters) made.push(chapters);
  stage.hidden = false;
  mount(stage, {
    sources: [`https://stream.mux.com/${id}.m3u8`, `https://stream.mux.com/${id}/highest.mp4`, `https://stream.mux.com/${id}/capped-1080p.mp4`],
    poster: `https://image.mux.com/${id}/thumbnail.webp?time=1`,
    chapters,
    prompt: prompt || undefined,
    mux: id,
  });
  stage.scrollIntoView({ block: 'nearest', behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth' });
});
for (const field of form?.querySelectorAll('input, textarea') ?? []) {
  field.addEventListener('input', () => {
    field.removeAttribute('aria-invalid');
    const error = document.getElementById(field.getAttribute('aria-describedby') ?? '');
    if (error) error.hidden = true;
  });
}

// ---- Copy ------------------------------------------------------------------------------------------------------
for (const button of document.querySelectorAll<HTMLButtonElement>('[data-copy]')) {
  button.addEventListener('click', () => {
    const text = document.getElementById(button.dataset.copy!)?.textContent ?? '';
    void navigator.clipboard?.writeText(text).then(() => {
      button.textContent = 'Copied';
      setTimeout(() => (button.textContent = 'Copy'), 1600);
    });
  });
}
