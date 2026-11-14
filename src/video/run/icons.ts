/**
 * Run's icons: one set, drawn for it on an 18-unit grid at the size it renders. Fine 1.5 strokes with round ends,
 * like an engraved instrument; only the two keys pressed most, Run and Stop, are solid. Every name the skin's markup
 * asks for under `family="run"` is here.
 */
import { registerIcons } from '@videojs/html/icons';

const line = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${body}</svg>`;
const solid = (body: string) =>
  `<svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 18 18" fill="currentColor" aria-hidden="true">${body}</svg>`;

const speaker = '<path d="M3 7.1v3.8h2.6L9 13.6V4.4L5.6 7.1z"/>';
const screen = '<rect x="2.25" y="3.25" width="13.5" height="10" rx="1.75"/>';

export const RUN_ICONS: Record<string, string> = {
  play: solid('<path d="M5.2 3.9a.9.9 0 0 1 1.37-.77l7.6 4.6a.9.9 0 0 1 0 1.54l-7.6 4.6a.9.9 0 0 1-1.37-.77z"/>'),
  pause: solid('<rect x="4.5" y="4.5" width="9" height="9" rx="1.6"/>'),
  restart: line('<path d="M3.75 9a5.25 5.25 0 1 0 1.6-3.78"/><path d="M3.75 3.25v2.5h2.5"/>'),
  seek: line('<path d="M14.25 9a5.25 5.25 0 1 1-1.6-3.78"/><path d="M14.25 3.25v2.5h-2.5"/>'),
  'volume-high': line(`${speaker}<path d="M11.5 6.6a3.4 3.4 0 0 1 0 4.8"/><path d="M13.6 4.6a6.2 6.2 0 0 1 0 8.8"/>`),
  'volume-low': line(`${speaker}<path d="M11.5 6.6a3.4 3.4 0 0 1 0 4.8"/>`),
  'volume-off': line(`${speaker}<path d="M12 7.25l3.5 3.5M15.5 7.25l-3.5 3.5"/>`),
  'captions-on': line('<rect x="2.25" y="3.75" width="13.5" height="10.5" rx="1.75"/><path d="M5.25 8.25h4.5M11.25 8.25h1.5M5.25 10.75h1.5M8.25 10.75h4.5"/>'),
  'captions-off': line('<rect x="2.25" y="3.75" width="13.5" height="10.5" rx="1.75"/><path d="M5.25 8.25h1.5M8.25 10.75h1.5"/><path d="M3 15l12-12"/>'),
  'fullscreen-enter': line('<path d="M3 6.5V4a1 1 0 0 1 1-1h2.5M11.5 3H14a1 1 0 0 1 1 1v2.5M15 11.5V14a1 1 0 0 1-1 1h-2.5M6.5 15H4a1 1 0 0 1-1-1v-2.5"/>'),
  'fullscreen-exit': line('<path d="M6.5 3v2.5a1 1 0 0 1-1 1H3M15 6.5h-2.5a1 1 0 0 1-1-1V3M11.5 15v-2.5a1 1 0 0 1 1-1H15M3 11.5h2.5a1 1 0 0 1 1 1V15"/>'),
  'pip-enter': line(`${screen}<rect x="9.25" y="8.25" width="4.5" height="3.25" rx=".75" fill="currentColor" stroke="none"/>`),
  'pip-exit': line(`${screen}<path d="M6 10.5l3.5-3.5M6.5 7h3v3"/>`),
  gear: line('<path d="M3 5.5h6.5M12.5 5.5H15M3 12.5h2.5M8.5 12.5H15"/><circle cx="11" cy="5.5" r="1.5"/><circle cx="7" cy="12.5" r="1.5"/>'),
  chevron: line('<path d="M7 4.5L11.5 9 7 13.5"/>'),
  check: line('<path d="M4 9.4l3.1 3.1L14 5.5"/>'),
  spinner: line('<path d="M9 2.75a6.25 6.25 0 1 1-6.25 6.25" />'),
  speech: line('<path d="M4.75 4h8.5a1.75 1.75 0 0 1 1.75 1.75v4.5A1.75 1.75 0 0 1 13.25 12H9l-3.25 2.5V12h-1A1.75 1.75 0 0 1 3 10.25v-4.5A1.75 1.75 0 0 1 4.75 4z"/>'),
  speed: line('<path d="M3.2 12.5a6 6 0 1 1 11.6 0"/><path d="M9 10.25l3-3.25"/><circle cx="9" cy="10.5" r=".9" fill="currentColor" stroke="none"/>'),
  switches: line('<path d="M4 13.5v-2M7.33 13.5V9M10.67 13.5V6.5M14 13.5V4"/>'),
  'airplay-enter': line('<path d="M5.25 12.25h-1.5a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5h10.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-1.5"/><path d="M9 11l3.25 4h-6.5z" fill="currentColor"/>'),
  'airplay-exit': line('<path d="M5.25 12.25h-1.5a1.5 1.5 0 0 1-1.5-1.5v-6a1.5 1.5 0 0 1 1.5-1.5h10.5a1.5 1.5 0 0 1 1.5 1.5v6a1.5 1.5 0 0 1-1.5 1.5h-1.5"/><path d="M9 11l3.25 4h-6.5z" fill="currentColor"/><path d="M7 6.5h4"/>'),
  'cast-enter': line('<path d="M2.25 6V4.75a1.5 1.5 0 0 1 1.5-1.5h10.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-4.5"/><path d="M2.25 9.25a5.5 5.5 0 0 1 5.5 5.5M2.25 12a2.75 2.75 0 0 1 2.75 2.75"/><circle cx="2.6" cy="14.4" r=".6" fill="currentColor"/>'),
  'cast-exit': line('<path d="M2.25 6V4.75a1.5 1.5 0 0 1 1.5-1.5h10.5a1.5 1.5 0 0 1 1.5 1.5v8.5a1.5 1.5 0 0 1-1.5 1.5h-4.5"/><path d="M2.25 9.25a5.5 5.5 0 0 1 5.5 5.5M2.25 12a2.75 2.75 0 0 1 2.75 2.75"/><path d="M5.25 6.25h7.5v5.5H10"/>'),
};

registerIcons('run', RUN_ICONS);
