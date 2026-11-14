/**
 * What the film plays from, when a page names more than one place: a stream first, then files.
 *
 * `playFrom(video, [stream, mp4, local])` gives the film the first source this browser can play (a `.m3u8` only where
 * the browser plays HLS itself: Safari, and Chrome and Edge since 142; Firefox takes the next, an MP4), and, if that
 * source cannot be opened at all, the next one. No library is fetched: the browser plays each of them itself.
 *
 * Each choice is told on the film as `rn-source` ({ src, index, why }): the Reasoning panel reads it, so what it says
 * about the source is what happened.
 */

const STREAM = /\.m3u8(?:[?#]|$)/i;

/** Why a source was taken. */
export type Why = 'stream' | 'file' | 'no-hls' | 'failed';

export interface SourceChoice {
  src: string;
  index: number;
  why: Why;
}

/** Whether this browser plays a source itself: any file, and a stream where it has HLS of its own. */
export function playsItself(video: HTMLVideoElement, src: string): boolean {
  return !STREAM.test(src) || video.canPlayType('application/vnd.apple.mpegurl') !== '';
}

export function isStream(src: string): boolean {
  return STREAM.test(src);
}

/** The tracks that are out of a film while its source opens, and how they go back. */
const waiting = new WeakMap<HTMLVideoElement, { tracks: { el: HTMLTrackElement; at: number; mode: TextTrackMode | undefined }[]; back: () => void }>();

/**
 * Gives a film its address. Every change of `src` goes through here.
 *
 * Safari 27 on a real iPhone (iOS 27.2.1, measured 12 Nov 2026; not in the iOS 26.5 simulator, not in desktop WebKit)
 * refuses any source with `MEDIA_ERR_SRC_NOT_SUPPORTED` when the element holds a `<track>` that is not `default`
 * (captions, descriptions) at the moment the address is set. `default` tracks (chapters) do no harm. Putting the
 * tracks back once the source has opened (`loadedmetadata`) works. So the tracks that are not `default` step out for
 * the opening and return, each to its place and with its mode. They are the same elements: their cues stay.
 */
export function open(video: HTMLVideoElement, src?: string): void {
  const held = waiting.get(video);
  if (held) video.removeEventListener('loadedmetadata', held.back);
  const tracks = held?.tracks ?? [];
  if (!held) {
    const all = Array.from(video.children).filter((child): child is HTMLTrackElement => child.localName === 'track');
    all.forEach((el, at) => {
      if (!el.default) tracks.push({ el, at, mode: el.track?.mode });
    });
  }
  for (const { el } of tracks) el.remove();
  if (tracks.length) video.setAttribute('data-rn-tracks', [...new Set(tracks.map(({ el }) => el.kind))].join(' '));
  if (src) video.setAttribute('src', src);
  else video.load();
  if (!tracks.length) return;
  const back = () => {
    waiting.delete(video);
    const keep = () => {
      for (const { el, mode } of tracks) if (mode && el.track && el.parentNode === video && el.track.mode !== mode) el.track.mode = mode;
    };
    for (const held of tracks) {
      const now = Array.from(video.children).filter((child) => child.localName === 'track');
      // A track whose file was loading when it stepped out ends in error (readyState 3) and never loads again (seen
      // in Chromium, 14 Nov 2026): a fresh copy of it goes back instead, and loads.
      if (held.el.readyState === HTMLTrackElement.ERROR) held.el = held.el.cloneNode(true) as HTMLTrackElement;
      video.insertBefore(held.el, now[held.at] ?? null);
    }
    keep();
    // A returning track is a new track to the browser, which then decides by itself what shows (Chromium turns
    // captions on a task later; WebKit turns them off when the next track is announced). The mode each had is put
    // back after each of those.
    setTimeout(keep, 0);
    let left = tracks.length;
    const announced = () => {
      keep();
      setTimeout(keep, 0);
      if (--left <= 0) settled();
    };
    const settled = () => {
      video.textTracks.removeEventListener('addtrack', announced);
      clearTimeout(patience);
    };
    const patience = setTimeout(settled, 2000);
    video.textTracks.addEventListener('addtrack', announced);
  };
  waiting.set(video, { tracks, back });
  video.addEventListener('loadedmetadata', back, { once: true });
}

/**
 * A press of the captions key while the film's caption tracks are out for the opening: the choice is kept, and the
 * tracks return with it. False when no caption track is waiting: the press is the player's.
 */
export function captionsAsked(video: HTMLVideoElement): boolean {
  const track = waiting.get(video)?.tracks.find(({ el }) => el.kind === 'captions' || el.kind === 'subtitles');
  if (!track) return false;
  track.mode = track.mode === 'showing' ? 'disabled' : 'showing';
  return true;
}

/** The last choice made for a film, for whoever asks after it was told. */
const chosen = new WeakMap<HTMLVideoElement, SourceChoice>();

export function choiceOf(video: HTMLVideoElement): SourceChoice | undefined {
  return chosen.get(video);
}

function tell(video: HTMLVideoElement, choice: SourceChoice): void {
  chosen.set(video, choice);
  video.dispatchEvent(new CustomEvent<SourceChoice>('rn-source', { detail: choice, bubbles: true }));
}

/**
 * Sets the film's `src` to the first playable source, and moves it on to the next if one never opens. Call it before
 * or after the video joins a player. Returns the source it started with (none if the browser can play none of them).
 */
export function playFrom(video: HTMLVideoElement, sources: readonly string[]): string {
  const given = sources.filter(Boolean);
  const list = given.filter((src) => playsItself(video, src));
  if (!list.length) return '';
  let at = 0;
  const skippedStream = isStream(given[0] ?? '') && !isStream(list[0]);
  open(video, list[0]);
  tell(video, { src: list[0], index: 0, why: isStream(list[0]) ? 'stream' : skippedStream ? 'no-hls' : 'file' });
  video.addEventListener('error', (event) => {
    // An error with nothing left to try, or after the film has opened, is passed on untouched.
    if (video.readyState > 0 || at >= list.length - 1 || video.getAttribute('src') !== list[at]) return;
    event.stopImmediatePropagation();
    const playing = !video.paused;
    at++;
    open(video, list[at]);
    tell(video, { src: list[at], index: at, why: 'failed' });
    if (playing) void video.play().catch(() => undefined);
  }, { capture: true });
  return list[0];
}
