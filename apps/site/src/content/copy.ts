/**
 * Every word on the page. Strings typed `Html` carry trusted inline markup (em, kbd, a, code, &nbsp;), written here and
 * never taken from a visitor.
 */
type Html = string;

export interface Title {
  lead: string;
  em?: string;
}

export interface Step {
  id: string;
  /** The step's name in the page's plan (the side index), 1–3 words. */
  name: string;
  kicker: string;
  title: Title;
  body: Html[];
  still: { src: string; alt: string; width: number; height: number };
}

export const site = {
  title: 'Run · a Video.js skin by Gua',
  description:
    'A Video.js 10 skin for AI tools and the sites that sell them. Chapters become the plan, captions become the log, and the player shows its own reasoning.',
  share: 'Every film, played as a run. A Video.js 10 skin for AI tools.',
  image: { path: 'site/share.jpg', width: 1200, height: 630, alt: 'The Run player: a plan of five steps beside a film, a log line typed into its bar.' },
  ink: '#0b0e12',
};

export const masthead = {
  brand: { label: 'Gua, gua.studio', name: 'Gua', href: 'https://gua.studio' },
  nav: 'Elsewhere',
  links: [
    { label: 'Source', href: 'https://github.com/guarize/videojs-run' },
    { label: 'gua.studio', href: 'https://gua.studio' },
  ],
};

export const hero = {
  skip: 'Skip to the player',
  eyebrow: '<span>Run</span> · a skin for Video.js&nbsp;10',
  title: { lead: 'Every film, ', em: 'played as a run.' } satisfies Title,
  lede: 'A player for AI tools. Chapters become the plan, captions the log.',
  try: {
    label: 'Try it.',
    wide: 'Press <kbd>Run</kbd>, then drag along the track. <kbd>⌘K</kbd> opens every command.',
    phone: 'Press Run, then drag along the track.',
  },
};

export const plan = { label: 'Plan', of: 'of' };

export const steps: Step[] = [
  {
    id: 'thinking',
    name: 'Think, then act',
    kicker: 'Before the first frame',
    title: { lead: 'It reads the prompt, ', em: 'then it acts.' },
    body: [
      'The player opens on the run’s prompt. Press <kbd>Run</kbd> and its words become the first layer of a small network; pulses cross it, and each output reaches the step it becomes, as that step arrives.',
      'A second and a half, once, drawn from the page’s own prompt and the film’s own chapters. Under reduced motion the plan simply appears.',
    ],
    still: { src: 'site/think.jpg', alt: 'The plan of five steps on the left; on the right, a network of brass and paper nodes whose inputs are the words of the prompt.', width: 2160, height: 1215 },
  },
  {
    id: 'plan',
    name: 'The plan',
    kicker: 'Chapters',
    title: { lead: 'The chapters ', em: 'are the plan.' },
    body: [
      'Each chapter of the film is a step: waiting, running, done. The running step’s brass ring fills as it goes, and a tick is drawn in when it ends.',
      'Point at a step to see how it opens. Run one step again, as you would regenerate an answer, or compare its first frame with its last.',
    ],
    still: { src: 'site/plan.jpg', alt: 'The plan beside a step’s preview card: its opening frame, the tag Step 04, and the first line of its log.', width: 2160, height: 1215 },
  },
  {
    id: 'log',
    name: 'The log',
    kicker: 'Captions',
    title: { lead: 'The captions ', em: 'are the log.' },
    body: [
      'What the film says is written into the bar a word at a time, on the bar’s own ink, so it reads over the brightest frame.',
      'When the controls rest, the bar keeps only the line: a pill with the step it belongs to and a brass thread of that step’s progress. Captions never leave with the controls.',
    ],
    still: { src: 'site/log.jpg', alt: 'The player at rest: a pill at its foot reading “2/5 Packing the context into a grid of values”, a brass thread along its edge.', width: 2160, height: 1215 },
  },
  {
    id: 'tokens',
    name: 'The track',
    kicker: 'Seeking',
    title: { lead: 'The track ', em: 'is made of words.' },
    body: [
      'Every word of the captions is a mark on the timeline, set at the moment it is said. Point at the track and the marks near you rise, the way attention is drawn; drag and they turn brass.',
      'Above it, the frame you are pointing at, its step and the line said there. While you drag, a brass light traces the picture’s edge.',
    ],
    still: { src: 'site/tokens.jpg', alt: 'The track’s marks rising in brass under the pointer, and above them a preview of the frame, its step and its line.', width: 2160, height: 1215 },
  },
  {
    id: 'reasoning',
    name: 'Reasoning',
    kicker: 'Thought for 0.4 s',
    title: { lead: 'Its reasoning ', em: 'is real.' },
    body: [
      'The key reads “Thought for 0.4 s”: the last time the film was waited for, measured. Open it and the player says what it decided: which source it opened and why, the picture it chose, what is loaded ahead, every wait on a trace.',
      'No model is involved, and the panel says so.',
    ],
    still: { src: 'site/reasoning.jpg', alt: 'The Reasoning panel: a trace of the film with a change from 240p to 1080p, and the lines “Opened the HLS stream from Mux…”.', width: 2160, height: 1215 },
  },
  {
    id: 'commands',
    name: 'Commands',
    kicker: 'Keyboard',
    title: { lead: 'Driven like ', em: 'the tools it’s for.' },
    body: [
      '<kbd>⌘K</kbd> opens a palette: speeds, steps, captions, the plan, picture in picture, a link to this moment. Type a few letters, press <kbd>Enter</kbd>.',
      '<kbd>Space</kbd> and <kbd>Enter</kbd> run and stop from anywhere on the page. Every control is one Tab stop away, with a ring you can see.',
    ],
    still: { src: 'site/commands.jpg', alt: 'The command palette open over the player: “Type a command”, then Stop, Restart the run, and the speeds.', width: 2160, height: 1215 },
  },
  {
    id: 'report',
    name: 'The report',
    kicker: 'The end',
    title: { lead: 'Every run ends ', em: 'with a report.' },
    body: [
      'How long each step took, as a trace you can click back into, and how your own run went: how long it took you, how often you stopped, which steps you ran again.',
    ],
    still: { src: 'site/report.jpg', alt: 'The run report: “Completed in 1:18”, five steps as brass bars on a timeline, and Run again.', width: 2160, height: 1215 },
  },
];

export const playground = {
  name: 'Your film',
  kicker: 'Playground',
  title: { lead: 'Try it on ', em: 'your own film.' } satisfies Title,
  body: 'Paste a Mux playback ID, write the prompt and the steps, and Run plays it. Nothing leaves this page.',
  fields: {
    id: { label: 'Mux playback ID', placeholder: 'z4nhqMYV9VxUXiRIAQkuLrSE19PiaQ02YR73QI26y8YQ' },
    prompt: { label: 'Prompt', placeholder: 'Walk through the new dashboard' },
    steps: { label: 'Steps, one per line', placeholder: '0:00 Open the app\n0:12 Connect a source\n0:40 Ask a question' },
  },
  submit: 'Run it',
  errors: {
    id: 'A playback ID is letters and digits, about 40 of them. Copy it from the asset’s page on Mux.',
    steps: 'Write each step as a time and a name, like “0:12 Connect a source”.',
  },
};

export const use = {
  name: 'Use it',
  kicker: 'Install',
  title: { lead: 'Your film, ', em: 'your run.' } satisfies Title,
  body: [
    'Run is HTML and CSS around Video.js 10. Give the video its chapters and captions, the player a prompt, and, if you like, your own signal colour.',
  ],
  code: `<video-player data-rn-prompt="Walk through the new dashboard">
  <!-- Run's skin (src/video/skin.html) -->
  <video playsinline crossorigin="anonymous">
    <track kind="chapters" src="steps.vtt" default>
    <track kind="captions" src="log.vtt" srclang="en">
  </video>
</video-player>

<style>
  video-player { --rn-signal: #c9ae78; }
</style>`,
};

export const evidence = {
  name: 'Measured',
  kicker: 'Measured',
  title: { lead: 'Checked, ', em: 'not claimed.' } satisfies Title,
};

export const credits = {
  film: 'Film: <cite>Visualising AI</cite> by Google DeepMind (Wes Cockx, Zünc Studio, Twistedpoly, Martina Stiftinger), via Pexels. Captions and chapters written for this page. Music: <a href="https://www.scottbuckley.com.au/library/shadows-and-dust/"><cite>Shadows and Dust</cite></a> by Scott Buckley, released under <a href="https://creativecommons.org/licenses/by/4.0/">CC BY 4.0</a>.',
  made: 'Made by <a href="https://gua.studio">Gua</a> for the Video.js Skins Design Challenge, November 2026. Apache 2.0.',
};
