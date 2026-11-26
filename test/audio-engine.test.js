import test from 'node:test';
import assert from 'node:assert/strict';
import { HoldAudio, configurePlaybackSession } from '../public/audio-engine.js';

function fixture(loadBuffer = async () => ({ duration: 8 })) {
  const sources = [], states = [];
  const context = {
    destination: {}, resume: async () => {},
    createBufferSource() {
      const source = { connect() {}, disconnect() {}, start(at) { this.startedAt = at; }, stop() { this.stopped = true; } };
      sources.push(source);
      return source;
    },
  };
  return { engine: new HoldAudio({ context, loadBuffer, onState: state => states.push(state) }), context, sources, states };
}

test('release immediately stops the clip; every subsequent press starts at zero', async () => {
  const { engine, sources } = fixture();
  for (let i = 0; i < 12; i++) {
    await engine.press();
    assert.equal(sources[i].startedAt, 0);
    assert.equal(sources.filter(s => !s.stopped).length, 1);
    engine.release();
    assert.equal(sources[i].stopped, true);
  }
});

test('release before loading finishes never plays delayed audio', async () => {
  let resolve;
  const { engine, sources } = fixture(() => new Promise(r => { resolve = r; }));
  const pending = engine.press();
  engine.release();
  resolve({ duration: 8 });
  await pending;
  assert.equal(sources.length, 0);
});

test('rapid presses while loading leave only the latest held press playing', async () => {
  let resolve;
  const { engine, sources } = fixture(() => new Promise(r => { resolve = r; }));
  const first = engine.press();
  engine.release();
  const second = engine.press();
  resolve({ duration: 8 });
  await Promise.all([first, second]);
  assert.equal(sources.length, 1);
  assert.equal(sources[0].startedAt, 0);
});

test('holding allows natural completion, without looping or another start', async () => {
  const { engine, sources, states } = fixture();
  await engine.press();
  assert.equal(engine.held, true);
  assert.equal(sources[0].stopped, undefined);
  sources[0].onended();
  assert.equal(engine.source, null);
  assert.equal(states.at(-1), 'ended');
  assert.equal(sources.length, 1);
  engine.release();
  await engine.press();
  assert.equal(sources.length, 2);
});

test('a failed load is recoverable on the next press', async () => {
  let calls = 0;
  const { engine, sources, states } = fixture(async () => {
    if (++calls === 1) throw new Error('Offline');
    return { duration: 8 };
  });
  await engine.press();
  assert.equal(states.at(-1), 'error');
  engine.release();
  await engine.press();
  assert.equal(states.at(-1), 'playing');
  assert.equal(sources.length, 1);
});

test('a superseded resume never starts or stops the newer playback', async () => {
  const { engine, context, sources } = fixture();
  let resolveFirst;
  context.resume = () => new Promise(r => { resolveFirst = r; });
  const first = engine.press();
  engine.release();
  context.resume = async () => {};
  await engine.press();
  resolveFirst();
  await first;
  assert.equal(sources.length, 1);
  assert.equal(sources[0].stopped, undefined);
});

test('iPhone audio uses the media playback session, with safe optional API support', () => {
  const platform = { audioSession: { type: 'auto' } };
  configurePlaybackSession(platform);
  assert.equal(platform.audioSession.type, 'playback');
  assert.doesNotThrow(() => configurePlaybackSession({}));
  assert.doesNotThrow(() => configurePlaybackSession({
    audioSession: { set type(value) { throw new Error('Unsupported'); } },
  }));
});

test('touchend unlocks a suspended context without playing the released clip', async () => {
  const { engine, context, sources } = fixture();
  let resolveFirst;
  context.resume = () => new Promise(r => { resolveFirst = r; });
  const pending = engine.press();
  engine.release();
  context.resume = async () => { resolveFirst(); };
  await engine.unlock();
  await pending;
  assert.equal(sources.length, 0);
  await engine.press();
  assert.equal(sources.length, 1);
});
