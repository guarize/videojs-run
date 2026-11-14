/**
 * The skin alone, on one film: the page the end-to-end tests open and the one to look at while building.
 * `?bare` drops the page's padding, `?muted` mutes the film, `?debug` writes its events on the page.
 */
import { mount, runFilm, type Film } from './mount';

const params = new URLSearchParams(location.search);
if (params.has('bare')) document.documentElement.toggleAttribute('data-bare', true);

const FILMS: Record<string, Film> = {
  run: runFilm('./'),
};

const film = FILMS[params.get('film') ?? 'run'] ?? FILMS.run;
// `?muted`: for test devices that play through a room's speakers (the iOS Simulator).
const { player, video } = mount(document.getElementById('player')!, film, { muted: params.has('muted') });
(window as unknown as { __player: HTMLElement }).__player = player;

// `?debug`: the film's own events written on the page, for a device with no inspector at hand.
if (params.has('debug')) {
  const out = document.createElement('pre');
  out.style.cssText = 'position:fixed;left:0;right:0;bottom:0;max-height:45vh;overflow:auto;margin:0;padding:8px;font:11px/1.35 ui-monospace,monospace;color:#cfe;background:#000d;z-index:2147483647;white-space:pre-wrap';
  document.body.append(out);
  const log = (line: string) => {
    out.textContent = `${(performance.now() / 1000).toFixed(2)} ${line}\n${out.textContent}`.slice(0, 6000);
  };
  for (const type of ['loadstart', 'loadedmetadata', 'canplay', 'play', 'playing', 'pause', 'waiting', 'seeking', 'seeked', 'error', 'stalled', 'ended', 'rn-source']) {
    video.addEventListener(type, () => log(`${type} rs=${video.readyState} t=${video.currentTime.toFixed(1)} src=${video.currentSrc.slice(8, 40)} err=${video.error?.code ?? ''}`));
  }
  document.addEventListener('pointerdown', (e) => log(`pointerdown ${(e.target as Element).tagName.toLowerCase()}.${String((e.target as Element).className).slice(0, 30)}`), true);
  document.addEventListener('click', (e) => log(`click ${(e.target as Element).tagName.toLowerCase()}.${String((e.target as Element).className).slice(0, 30)}`), true);
  window.addEventListener('error', (e) => log(`ERROR ${e.message}`));
  window.addEventListener('unhandledrejection', (e) => log(`REJECT ${String(e.reason)}`));
  const play = video.play.bind(video);
  video.play = () => {
    log('play() asked');
    const p = play();
    p.catch((e: unknown) => log(`play() refused: ${String(e)}`));
    return p;
  };
}
