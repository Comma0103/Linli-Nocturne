export class LetterWorker {
  constructor({ letterService, intervalMs = 1_000, leaseMs = 5 * 60 * 1_000 } = {}) {
    if (!letterService || typeof letterService.processNext !== 'function') throw new TypeError('letterService.processNext is required');
    this.letterService = letterService;
    this.intervalMs = Math.max(1, intervalMs);
    this.leaseMs = Math.max(0, leaseMs);
    this.timer = null;
    this.running = false;
    this.inFlight = null;
  }

  async runOnce() {
    if (this.inFlight) return this.inFlight;
    this.inFlight = (async () => {
      this.letterService.recoverStaleProcessing({ leaseMs: this.leaseMs });
      return this.letterService.processNext();
    })().finally(() => { this.inFlight = null; });
    return this.inFlight;
  }

  start() {
    if (this.running) return this;
    this.running = true;
    void this.runOnce().catch(() => {});
    this.timer = setInterval(() => { void this.runOnce().catch(() => {}); }, this.intervalMs);
    return this;
  }

  async stop() {
    this.running = false;
    if (this.timer) clearInterval(this.timer);
    this.timer = null;
    if (this.inFlight) await this.inFlight;
  }
}
