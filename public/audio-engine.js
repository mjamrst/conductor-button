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

  async press() {
    this.stopSource();
    const generation = ++this.generation;
    this.held = true;
    this.onState(this.buffer ? 'starting' : 'loading');
    try {
      // Call resume in the original user gesture, before awaiting network work.
      await Promise.all([this.context.resume(), this.preload()]);
      if (!this.held || generation !== this.generation) return;
      const source = this.context.createBufferSource();
      source.buffer = this.buffer;
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
