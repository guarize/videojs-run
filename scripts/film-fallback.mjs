/**
 * The film's MP4 for browsers with no HLS of their own (Firefox): a 720p copy of Mux's highest static rendition, or of
 * a local master given as an argument, written to apps/preview/public/film/film-720.mp4 (git-ignored). Needs ffmpeg.
 *
 *   pnpm film:fallback                      # from Mux
 *   pnpm film:fallback path/to/master.mp4   # from a local file
 */
import { execFileSync } from 'node:child_process';

const ID = 'z4nhqMYV9VxUXiRIAQkuLrSE19PiaQ02YR73QI26y8YQ';
const input = process.argv[2] ?? `https://stream.mux.com/${ID}/highest.mp4`;
execFileSync('ffmpeg', ['-y', '-loglevel', 'error', '-i', input, '-vf', 'scale=-2:720', '-c:v', 'libx264', '-preset', 'slow', '-crf', '23', '-pix_fmt', 'yuv420p', '-color_primaries', 'bt709', '-color_trc', 'bt709', '-colorspace', 'bt709', '-movflags', '+faststart', '-c:a', 'aac', '-b:a', '128k', 'apps/preview/public/film/film-720.mp4'], { stdio: 'inherit' });
console.log('apps/preview/public/film/film-720.mp4');
