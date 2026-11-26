import { HoldAudio, configurePlaybackSession } from './audio-engine.js?v=3';

const panel = document.querySelector('.intercom');
const button = document.querySelector('.talk-button');
const status = document.querySelector('.status');
const speaker = document.querySelector('.speaker');
const pitch = document.querySelector('#pitch');
const pitchValue = document.querySelector('#pitch-value');

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
  // On iPhone the default Web Audio session obeys the ring/silent switch.
  // This app's only purpose is explicitly requested media playback.
  configurePlaybackSession(navigator);
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
  engine.setPitch(Number(pitch.value));
  return engine;
}

pitch.addEventListener('input', () => {
  const semitones = Number(pitch.value);
  engine?.setPitch(semitones);
  pitchValue.textContent = semitones === 0 ? 'Normal' : `${semitones > 0 ? '+' : '−'}${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? '' : 's'}`;
  pitch.setAttribute('aria-valuetext', semitones === 0 ? 'Normal pitch' : `${Math.abs(semitones)} semitone${Math.abs(semitones) === 1 ? '' : 's'} ${semitones > 0 ? 'higher' : 'lower'}`);
});

function haptic(duration) {
  try { navigator.vibrate?.(duration); } catch { /* Optional device feedback. */ }
}

function press(input) {
  if (activeInput !== null) return;
  activeInput = input;
  button.classList.add('is-held');
  button.setAttribute('aria-pressed', 'true');
  haptic(18);
  try {
    configurePlaybackSession(navigator);
    void getEngine().press();
  } catch { showState('error'); }
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
  // Safari's touch gesture must reach touchstart, rather than being consumed
  // by preventDefault on the preceding pointer event.
  if (event.pointerType === 'touch') return;
  if (!event.isPrimary || event.button !== 0 || activeInput !== null) return;
  event.preventDefault();
  button.focus({ preventScroll: true });
  button.setPointerCapture(event.pointerId);
  press(event.pointerId);
});

button.addEventListener('touchstart', event => {
  event.preventDefault();
  if (activeInput !== null) return;
  const touch = event.changedTouches[0];
  if (touch) press(`touch:${touch.identifier}`);
}, { passive: false });

button.addEventListener('touchend', event => {
  event.preventDefault();
  if (!Array.from(event.changedTouches).some(touch => activeInput === `touch:${touch.identifier}`)) return;
  release();
  // Some Safari versions only grant activation on touchend. Unlock for the
  // next hold without ever playing the released sample after the finger lifts.
  try { void getEngine().unlock().catch(() => {}); } catch { /* Retry on next press. */ }
}, { passive: false });

button.addEventListener('touchcancel', event => {
  if (Array.from(event.changedTouches).some(touch => activeInput === `touch:${touch.identifier}`)) release();
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
