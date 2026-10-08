export const LIGHTING_KEY = 'merkez_ankara_lighting_v1';
export const DEFAULT_LIGHTING = Object.freeze({
  exposure: 100,
  hemi: 100,
  sun: 100,
  env: 100,
  lamps: 100,
});

const RANGES = {
  exposure: [40, 180],
  hemi: [0, 200],
  sun: [0, 200],
  env: [0, 200],
  lamps: [0, 2000],
};

export function normalizeLighting(value) {
  const v = value && typeof value === 'object' ? value : {};
  const out = {};
  for (const [key, [min, max]] of Object.entries(RANGES)) {
    const n = Number(v[key]);
    out[key] = Number.isFinite(n) ? Math.max(min, Math.min(max, Math.round(n))) : DEFAULT_LIGHTING[key];
  }
  return out;
}

export function loadLighting() {
  try { return normalizeLighting(JSON.parse(localStorage.getItem(LIGHTING_KEY))); }
  catch { return { ...DEFAULT_LIGHTING }; }
}

/** Yüzde kaydırıcıları sahne ışık çarpanına çevirir. %100 = 1. */
export function lightingScale(value) {
  const v = normalizeLighting(value);
  return {
    exposure: v.exposure / 100,
    hemi: v.hemi / 100,
    sun: v.sun / 100,
    env: v.env / 100,
    lamps: v.lamps / 100,
  };
}

export class LightingSettings {
  constructor(sceneManager, lampSystem) {
    this.scene = sceneManager;
    this.lamps = lampSystem;
    this.value = loadLighting();
    const form = document.getElementById('lighting-form');
    const status = document.getElementById('graphics-status');
    const sync = () => {
      for (const [key, value] of Object.entries(this.value)) {
        const input = form.elements.namedItem(key);
        input.value = String(value);
        const output = document.getElementById(`light-${key}-value`);
        if (output) output.textContent = `%${value}`;
      }
    };
    const apply = (save = true) => {
      this.value = normalizeLighting(this.value);
      const scale = lightingScale(this.value);
      this.scene.applyLightingSettings(scale);
      this.lamps?.setIntensityScale(scale.lamps);
      sync();
      if (save) {
        try {
          localStorage.setItem(LIGHTING_KEY, JSON.stringify(this.value));
          status.textContent = 'Uygulandı ve bu cihaza kaydedildi.';
        } catch {
          status.textContent = 'Uygulandı. Tarayıcı kaydetmeye izin vermedi; bu oturumda geçerli.';
        }
      }
    };
    form.addEventListener('submit', (e) => e.preventDefault());
    form.addEventListener('input', (e) => {
      const input = e.target;
      if (!(input.name in DEFAULT_LIGHTING)) return;
      this.value[input.name] = Number(input.value);
      apply();
    });
    document.getElementById('graphics-reset').addEventListener('click', () => {
      this.value = { ...DEFAULT_LIGHTING };
      apply();
      status.textContent = 'İlk ayarlara dönüldü.';
    });
    apply(false);
  }
}
