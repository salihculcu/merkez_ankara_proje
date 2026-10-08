// Lightweight canvas snowfall: independent flakes, depth and gentle lateral drift.
export class Snowfall {
  constructor(canvas) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });
    this.flakes = [];
    this.running = false;
    this.last = 0;
    this.resize = () => {
      this.width = window.innerWidth;
      this.height = window.innerHeight;
      this.canvas.width = this.width;
      this.canvas.height = this.height;
      this.flakes = Array.from({ length: Math.min(155, Math.max(80, Math.round(this.width * this.height / 8500))) }, () => this.createFlake(true));
    };
    this.resize();
    window.addEventListener('resize', this.resize, { passive: true });
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.stopLoop();
      else if (this.running) this.startLoop();
    });
  }

  createFlake(anywhere = false) {
    const depth = .35 + Math.random() * 1.1;
    return {
      x: Math.random() * this.width,
      y: anywhere ? Math.random() * this.height : -12,
      radius: .8 + depth * 1.4,
      speed: 18 + depth * 31,
      drift: 7 + depth * 8,
      phase: Math.random() * Math.PI * 2,
      opacity: .35 + depth * .35,
    };
  }

  setEnabled(value) {
    this.running = value;
    this.canvas.classList.toggle('on', value);
    if (value && !document.hidden) this.startLoop();
    else this.stopLoop();
  }

  startLoop() {
    if (this.raf) return;
    this.last = performance.now();
    this.raf = requestAnimationFrame(this.tick);
  }

  stopLoop() {
    if (this.raf) cancelAnimationFrame(this.raf);
    this.raf = 0;
    this.ctx.clearRect(0, 0, this.width, this.height);
  }

  tick = now => {
    this.raf = 0;
    if (!this.running || document.hidden) return;
    const dt = Math.min((now - this.last) / 1000, .05);
    this.last = now;
    const ctx = this.ctx;
    ctx.clearRect(0, 0, this.width, this.height);
    for (let i = 0; i < this.flakes.length; i++) {
      let flake = this.flakes[i];
      flake.y += flake.speed * dt;
      flake.x += Math.sin(now * .0006 + flake.phase + flake.y * .009) * flake.drift * dt;
      if (flake.y > this.height + 10 || flake.x < -15 || flake.x > this.width + 15) flake = this.flakes[i] = this.createFlake();
      ctx.beginPath();
      ctx.arc(flake.x, flake.y, flake.radius, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(245,249,255,${Math.min(.92,flake.opacity)})`;
      ctx.fill();
    }
    this.raf = requestAnimationFrame(this.tick);
  };
}
