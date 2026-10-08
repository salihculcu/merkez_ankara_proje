import { t } from './I18n.js';
export const GRAPHICS_KEY = 'merkez_ankara_graphics_v1';
export const DEFAULT_GRAPHICS = Object.freeze({ scale: 100, adaptive: true, target: 30, glass: true, reflections: true, fpsLimit: 0, showFps: true });
export const GRAPHICS_PRESETS = {
  performance: { ...DEFAULT_GRAPHICS, scale: 70, target: 144, glass: false, reflections: false },
  balanced: { ...DEFAULT_GRAPHICS, scale: 85, target: 60, glass: false },
  quality: { ...DEFAULT_GRAPHICS, adaptive: false },
};
export function normalizeGraphics(value) {
  const v = value && typeof value === 'object' ? value : {};
  const number = (key, min, max) => Number.isFinite(v[key]) ? Math.max(min, Math.min(max, v[key])) : DEFAULT_GRAPHICS[key];
  const bool = key => typeof v[key] === 'boolean' ? v[key] : DEFAULT_GRAPHICS[key];
  return { scale: Math.round(number('scale', 50, 100)), adaptive: bool('adaptive'),
    target: [30,60,90,120,144].includes(v.target) ? v.target : DEFAULT_GRAPHICS.target,
    glass: bool('glass'), reflections: bool('reflections'),
    fpsLimit: [0,30,60,90,120,144].includes(v.fpsLimit) ? v.fpsLimit : 0, showFps: bool('showFps') };
}
export function loadGraphics() {
  try { return normalizeGraphics(JSON.parse(localStorage.getItem(GRAPHICS_KEY))); }
  catch { return { ...DEFAULT_GRAPHICS }; }
}

export class GraphicsSettings {
  constructor(sceneManager) {
    this.scene = sceneManager;
    this.value = loadGraphics();
    const dialog = document.getElementById('graphics-dialog');
    const open = document.getElementById('settings-open');
    const form = document.getElementById('graphics-form');
    const status = document.getElementById('graphics-status');
    const preset = document.getElementById('graphics-preset');
    const sync = () => {
      for (const [key, value] of Object.entries(this.value)) {
        const input = form.elements.namedItem(key);
        if (input.type === 'checkbox') input.checked = value;
        else input.value = String(value);
      }
      document.getElementById('graphics-scale-value').textContent = `%${this.value.scale}`;
      form.elements.namedItem('target').disabled = !this.value.adaptive;
      preset.value = Object.keys(GRAPHICS_PRESETS).find(key => Object.keys(this.value).every(k => this.value[k] === GRAPHICS_PRESETS[key][k])) ?? 'custom';
    };
    const apply = (save = true) => {
      this.value = normalizeGraphics(this.value);
      this.scene.applyGraphicsSettings(this.value);
      sync();
      if (save) {
        try { localStorage.setItem(GRAPHICS_KEY, JSON.stringify(this.value)); status.textContent = 'Uygulandı ve bu cihaza kaydedildi.'; }
        catch { status.textContent = 'Uygulandı. Tarayıcı kaydetmeye izin vermedi; bu oturumda geçerli.'; }
      }
    };
    open.disabled = false;
    open.addEventListener('click', () => { dialog.showModal(); open.setAttribute('aria-expanded', 'true'); });
    document.getElementById('graphics-close').addEventListener('click', () => dialog.close());
    dialog.addEventListener('close', () => { open.setAttribute('aria-expanded', 'false'); open.focus(); });
    dialog.addEventListener('click', e => { if (e.target === dialog) { const r = dialog.getBoundingClientRect(); if(e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) dialog.close(); } });
    form.addEventListener('submit', e => e.preventDefault());
    form.addEventListener('input', e => {
      const input = e.target;
      if (!(input.name in DEFAULT_GRAPHICS)) return;
      this.value[input.name] = input.type === 'checkbox' ? input.checked : Number(input.value);
      apply();
    });
    preset.addEventListener('change', () => {
      if (!GRAPHICS_PRESETS[preset.value]) return;
      this.value = { ...GRAPHICS_PRESETS[preset.value] }; apply();
    });
    document.getElementById('graphics-reset').addEventListener('click', () => { this.value = { ...DEFAULT_GRAPHICS }; apply(); status.textContent = 'İlk ayarlara dönüldü.'; });
    apply(false);
    let last = 0;
    this.scene.onUpdate((dt, elapsed) => {
      if (!dialog.open || elapsed - last < 0.5) return;
      last = elapsed;
      document.getElementById('graphics-live-fps').textContent = this.scene.fpsText || 'Ölçülüyor…';
      document.getElementById('graphics-resolution').textContent = `${this.scene.canvas.width} × ${this.scene.canvas.height} · ${t('Gerçek çizim çözünürlüğü')}`;
    });
  }
}
