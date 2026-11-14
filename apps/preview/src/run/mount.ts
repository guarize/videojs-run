/**
 * Mounts a Run player into a host element: the skin, a film from its sources (a stream first, files after), its
 * chapters as the plan, its captions as the log, and the prompt the run was given. Shared by the test page, the site
 * and the site's playground, so they are one player.
 */
import '@videojs/html/video/player';
import '@/video/skin';
import skin from '@/video/skin.html?raw';
import { playFrom } from '@/video/run/sources';

export interface Film {
  sources: readonly string[];
  poster?: string;
  chapters?: string;
  captions?: string;
  prompt?: string;
  /** A Mux playback ID, when the film is on Mux: its frames come from Mux's thumbnails. */
  mux?: string;
}

/** The run's own film on Mux, its fallback file, its tracks and its prompt. */
export const RUN_FILM_ID = 'UsmJTpl8YMgQ4cUqgV4quA02h88lALtK88k4vAnSyoYY';

export function runFilm(base = './'): Film {
  return {
    // Mux's stream where the browser plays HLS itself, Mux's MP4 where it doesn't (Firefox), this site's copy last.
    sources: [`https://stream.mux.com/${RUN_FILM_ID}.m3u8`, `https://stream.mux.com/${RUN_FILM_ID}/highest.mp4`, `${base}film/film-720.mp4`],
    poster: `${base}film/poster.jpg`,
    chapters: `${base}film/chapters.vtt`,
    captions: `${base}film/captions.vtt`,
    prompt: 'Show how a model thinks, from reading a prompt to folding a protein.',
    mux: RUN_FILM_ID,
  };
}

const escape = (s: string) => s.replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]!);

export function mount(host: Element, film: Film, { muted = false } = {}): { player: HTMLElement; video: HTMLVideoElement } {
  const player = document.createElement('video-player');
  if (film.prompt) player.setAttribute('data-rn-prompt', film.prompt);
  if (film.mux) player.setAttribute('data-rn-mux', film.mux);
  if (film.poster) player.setAttribute('poster', film.poster);
  const tracks = [
    film.chapters ? `<track kind="chapters" label="Steps" srclang="en" src="${escape(film.chapters)}" default>` : '',
    film.captions ? `<track kind="captions" label="English" srclang="en" src="${escape(film.captions)}">` : '',
  ].join('');
  player.innerHTML = skin.replace('<!-- Add a compatible media component here. -->', `<video playsinline crossorigin="anonymous" preload="metadata">${tracks}</video>`);
  host.replaceChildren(player);
  const video = player.querySelector('video')!;
  if (muted) video.muted = true;
  // Captions on from the start: they are the run's log.
  const captions = video.querySelector<HTMLTrackElement>('track[kind="captions"]');
  if (captions) captions.track.mode = 'showing';
  playFrom(video, film.sources);
  return { player, video };
}
