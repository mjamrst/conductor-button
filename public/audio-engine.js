export function configurePlaybackSession(platform) {
  try {
    if (platform.audioSession) platform.audioSession.type = 'playback';
  } catch { /* Audio Session is optional; older browsers still use Web Audio. */ }
}

/** One independent sample per press. A generation token cancels delayed starts. */
export class HoldAudio {
  constructor({ context, loadBuffer, onState = () => {} }) {
    this.context = context;
    this.loadBuffer = loadBuffer;
    this.onState = onState;
    this.generation = 0;
    this.held = false;
    this.source = null;
    this.buffer = null;
    this.loading = null;
    this.pitchSemitones = 0;
  }

  setPitch(semitones) {
    if (!Number.isFinite(semitones)) return;
    this.pitchSemitones = Math.max(-12, Math.min(12, semitones));
    // Smooth live changes without restarting the currently held sample.
    this.source?.detune.setTargetAtTime(this.pitchSemitones * 100, this.context.currentTime, 0.015);
  }

  preload() {
    if (this.buffer) return Promise.resolve(this.buffer);
    if (!this.loading) {
      this.loading = this.loadBuffer().then(buffer => {
        this.buffer = buffer;
        return buffer;
      }).finally(() => { this.loading = null; });
    }
    return this.loading;
  }

  unlock() {
    return this.context.resume();
  }

  async press() {
    this.stopSource();
    const generation = ++this.generation;
    this.held = true;
    this.onState(this.buffer ? 'starting' : 'loading');
    try {
      // Call resume in the original user gesture, before awaiting network work.
      await Promise.all([this.unlock(), this.preload()]);
      if (!this.held || generation !== this.generation) return;
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
      source.detune.setValueAtTime(this.pitchSemitones * 100, this.context.currentTime);
      source.connect(this.context.destination);
      source.onended = () => {
        source.disconnect();
        if (this.source !== source) return;
        this.source = null;
        this.onState('ended');
      };
      this.source = source;
      source.start(0);
      this.onState('playing');
    } catch {
      if (!this.held || generation !== this.generation) return;
      this.stopSource();
      this.onState('error');
    }
  }

  release() {
    this.held = false;
    ++this.generation;
    this.stopSource();
    this.onState('idle');
  }

  stopSource() {
    const source = this.source;
    this.source = null;
    if (source) {
      source.onended = null;
      source.stop();
      source.disconnect();
    }
  }
}
