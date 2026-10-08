// Estimate available callback cadence before application FPS limiting.
export class FrameCadence {
  samples = [];
  recentBatches = [];
  fastestMs = Infinity;
  observe(ms) {
    if (ms < 4 || ms > 100) return;
    this.samples.push(ms);
    if (this.samples.length < 60) return;
    const sorted = this.samples.sort((a, b) => a - b);
    this.recentBatches.push(sorted[6]);
    if (this.recentBatches.length > 8) this.recentBatches.shift();
    // A recent fast batch reflects the display cadence; old refresh rates expire.
    this.fastestMs = Math.min(...this.recentBatches);
    this.samples = [];
  }
  targetMs(fps) {
    return Math.max(1000 / fps, Number.isFinite(this.fastestMs) ? this.fastestMs : 1000 / 60);
  }
}
