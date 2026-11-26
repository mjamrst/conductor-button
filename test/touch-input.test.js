import test from 'node:test';
import assert from 'node:assert/strict';

test('native touch starts once, ignores extra fingers, and stops on release/cancel', async () => {
  class Element extends EventTarget {
    attributes = new Map();
    classes = new Set();
    classList = {
      add: name => this.classes.add(name),
      remove: name => this.classes.delete(name),
      toggle: (name, enabled) => enabled ? this.classes.add(name) : this.classes.delete(name),
    };
    setAttribute(name, value) { this.attributes.set(name, value); }
    append() {}
    focus() {}
    setPointerCapture() {}
    matches() { return false; }
  }

  const button = new Element(), panel = new Element(), status = new Element();
  const pitch = new Element(), pitchValue = new Element();
  pitch.value = '0';
  const document = new EventTarget();
  document.querySelector = selector => ({
    '.talk-button': button, '.intercom': panel, '.status': status, '.speaker': new Element(),
    '#pitch': pitch, '#pitch-value': pitchValue,
  })[selector];
  document.createElement = () => new Element();
  const window = new EventTarget();
  const sources = [];
  const platform = { audioSession: { type: 'auto' } };
  window.AudioContext = class {
    destination = {};
    constructor() { assert.equal(platform.audioSession.type, 'playback'); }
    resume() { return Promise.resolve(); }
    decodeAudioData() { return Promise.resolve({ duration: 8 }); }
    createBufferSource() {
      const source = {
        connect() {}, disconnect() {},
        start() { this.started = true; }, stop() { this.stopped = true; },
        detune: { value: 0, setValueAtTime(value) { this.value = value; }, setTargetAtTime(value) { this.value = value; } },
      };
      sources.push(source);
      return source;
    }
  };
  const replacements = {
    window, document, navigator: platform, HTMLElement: Element,
    fetch: async () => ({ ok: true, arrayBuffer: async () => new ArrayBuffer(0) }),
  };
  const originals = new Map(Object.keys(replacements).map(key => [key, Object.getOwnPropertyDescriptor(globalThis, key)]));
  const tick = () => new Promise(resolve => setImmediate(resolve));
  const send = (type, fields) => {
    const event = new Event(type, { cancelable: true });
    Object.assign(event, fields);
    button.dispatchEvent(event);
    return event;
  };

  try {
    for (const [key, value] of Object.entries(replacements)) {
      Object.defineProperty(globalThis, key, { value, configurable: true, writable: true });
    }
    await import('../public/app.js');
    await tick();
    const pointer = send('pointerdown', { pointerType: 'touch', isPrimary: true, button: 0, pointerId: 1 });
    assert.equal(pointer.defaultPrevented, false, 'touchstart must receive the native gesture');
    assert.equal(sources.length, 0);

    send('touchstart', { changedTouches: [{ identifier: 1 }] });
    await tick();
    assert.equal(sources.length, 1);
    assert.equal(status.textContent, 'Line open');
    assert.equal(button.attributes.get('aria-pressed'), 'true');

    send('touchstart', { changedTouches: [{ identifier: 2 }] });
    send('touchend', { changedTouches: [{ identifier: 2 }] });
    await tick();
    assert.equal(sources.length, 1);
    assert.equal(sources[0].stopped, undefined);

    pitch.value = '-5';
    pitch.dispatchEvent(new Event('input'));
    assert.equal(sources[0].detune.value, -500);
    assert.equal(pitchValue.textContent, '−5 semitones');
    assert.equal(pitch.attributes.get('aria-valuetext'), '5 semitones lower');
    assert.equal(button.attributes.get('aria-pressed'), 'true');

    send('touchend', { changedTouches: [{ identifier: 1 }] });
    await tick();
    assert.equal(sources[0].stopped, true);
    assert.equal(status.textContent, 'Stand by');
    assert.equal(button.attributes.get('aria-pressed'), 'false');
    assert.equal(sources.length, 1, 'touchend unlock must not replay the clip');

    send('touchstart', { changedTouches: [{ identifier: 3 }] });
    await tick();
    assert.equal(sources.length, 2);
    send('touchcancel', { changedTouches: [{ identifier: 3 }] });
    assert.equal(sources[1].stopped, true);
    assert.equal(button.attributes.get('aria-pressed'), 'false');
  } finally {
    for (const [key, descriptor] of originals) {
      if (descriptor) Object.defineProperty(globalThis, key, descriptor);
      else delete globalThis[key];
    }
  }
});
