import { HoldAudio } from './audio-engine.js';

const panel = document.querySelector('.intercom');
const button = document.querySelector('.talk-button');
const status = document.querySelector('.status');
const speaker = document.querySelector('.speaker');

for (let y = -4; y <= 4; y++) {
  for (let x = -4; x <= 4; x++) {
    const hole = document.createElement('i');
    if (x * x + y * y > 20) hole.className = 'empty';
    speaker.append(hole);
  }
}

let engine;
let activeInput = null;
let lastState = 'idle';

function showState(state) {
  lastState = state;
  panel.classList.toggle('is-playing', state === 'playing');
  if (state === 'ended' && activeInput === 'assistive') {
    activeInput = null;
    button.classList.remove('is-held');
    button.setAttribute('aria-pressed', 'false');
  }
  status.textContent = {
    idle: 'Stand by', starting: 'Connecting', loading: 'Connecting',
    playing: 'Line open', ended: 'Message received', error: 'Try again',
  }[state];
}

function getEngine() {
  if (engine) return engine;
  const AudioContext = window.AudioContext || window.webkitAudioContext;
  if (!AudioContext) throw new Error('Web Audio is unavailable');
  const context = new AudioContext({ latencyHint: 'interactive' });
  engine = new HoldAudio({
    context,
    onState: showState,
    loadBuffer: async () => {
      const response = await fetch('/audio/conductor.wav');
      if (!response.ok) throw new Error('Audio could not be loaded');
      return context.decodeAudioData(await response.arrayBuffer());
    },
  });
  return engine;
}

function haptic(duration) {
  try { navigator.vibrate?.(duration); } catch { /* Optional device feedback. */ }
}

function press(input) {
  if (activeInput !== null) return;
  activeInput = input;
  button.classList.add('is-held');
  button.setAttribute('aria-pressed', 'true');
  haptic(18);
  try { void getEngine().press(); } catch { showState('error'); }
}

function release() {
  if (activeInput === null) return;
  activeInput = null;
  button.classList.remove('is-held');
  button.setAttribute('aria-pressed', 'false');
  const failed = lastState === 'error';
  engine?.release();
  if (failed) showState('error');
  haptic(8);
}

button.addEventListener('pointerdown', event => {
  if (!event.isPrimary || event.button !== 0 || activeInput !== null) return;
  event.preventDefault();
  button.focus({ preventScroll: true });
  button.setPointerCapture(event.pointerId);
  press(event.pointerId);
});

for (const type of ['pointerup', 'pointercancel', 'lostpointercapture']) {
  button.addEventListener(type, event => {
    if (activeInput === event.pointerId) release();
  });
}

button.addEventListener('contextmenu', event => event.preventDefault());
button.addEventListener('dragstart', event => event.preventDefault());

function isPlaybackKey(event) {
  return event.code === 'Space' || (event.code === 'Enter' && event.target === button);
}
document.addEventListener('keydown', event => {
  if (!isPlaybackKey(event) || event.altKey || event.ctrlKey || event.metaKey) return;
  if (event.target instanceof HTMLElement && event.target.matches('input, textarea, select, [contenteditable="true"]')) return;
  event.preventDefault();
  if (!event.repeat) press(event.code);
});
document.addEventListener('keyup', event => {
  if (event.code === activeInput) { event.preventDefault(); release(); }
});

// Assistive technology can activate a button without pointer/key down events.
// In that case a second activation ends the hold, or the sample ends naturally.
button.addEventListener('click', event => {
  if (event.detail !== 0) return;
  if (activeInput === 'assistive') release();
  else if (activeInput === null) press('assistive');
});

window.addEventListener('blur', release);
window.addEventListener('pagehide', release);
document.addEventListener('visibilitychange', () => { if (document.hidden) release(); });

// Decode before the first press. Playback itself remains gesture-activated.
try { void getEngine().preload().catch(() => {}); } catch { showState('error'); }
