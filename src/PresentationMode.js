const SCENES = [
  { title: 'Merkez Ankara', description: 'Meydan ve mağaza akslarına genel bakış', view: 'home', night: false, winter: false },
  { title: 'Kiosk ve yönlendirme', description: 'Ziyaretçinin başlangıç noktası', view: 'kiosk', night: false, winter: false },
  { title: 'Peyzaj ve sosyal alan', description: 'Açık alanların yaya deneyimi', view: 'landscape', night: false, winter: false },
  { title: 'Gece aydınlatması', description: 'Sıcak yürüyüş ışıkları ve mor asansör vurgusu', view: 'night', night: true, winter: false },
  { title: 'Kış mevsimi', description: 'Peyzajda kar örtüsü ve hafif yağış', view: 'winter', night: false, winter: true },
];

export class PresentationMode {
  constructor(camera, bus, ui) {
    this.camera = camera;
    this.bus = bus;
    this.ui = ui;
    this.index = 0;
    this.active = false;
    this.button = document.getElementById('presentation-toggle');
    this.controls = document.getElementById('presentation-controls');
    this.button.addEventListener('click', () => this.start());
    document.getElementById('presentation-close').addEventListener('click', () => this.stop());
    document.getElementById('presentation-prev').addEventListener('click', () => this.show(this.index - 1));
    document.getElementById('presentation-next').addEventListener('click', () => this.show(this.index + 1));
    document.getElementById('presentation-fullscreen').addEventListener('click', () => {
      if (document.fullscreenElement) document.exitFullscreen();
      else document.documentElement.requestFullscreen?.().catch(() => {});
    });
    window.addEventListener('keydown', event => {
      if (!this.active) return;
      if (event.key === 'Escape') this.stop();
      if (event.key === 'ArrowRight') this.show(this.index + 1);
      if (event.key === 'ArrowLeft') this.show(this.index - 1);
    });
  }

  start() {
    if (this.active) return;
    this.previous = {
      night: document.getElementById('daynight-toggle').getAttribute('aria-pressed') === 'true',
      winter: document.getElementById('winter-toggle').getAttribute('aria-pressed') === 'true',
      rain: document.getElementById('rain-toggle').getAttribute('aria-pressed') === 'true',
    };
    this.active = true;
    this.button.setAttribute('aria-pressed', 'true');
    this.controls.hidden = false;
    document.body.classList.add('presentation-mode');
    document.getElementById('view-menu').open = false;
    const settings = document.getElementById('graphics-dialog');
    if (settings?.open) settings.close();
    this.bus.emit('routeCleared');
    this.ui.hideCard();
    this.ui.closePanel();
    this.show(0);
  }

  show(index) {
    if (!this.active) return;
    this.index = (index + SCENES.length) % SCENES.length;
    const stage = SCENES[this.index];
    document.getElementById('presentation-count').textContent = `${this.index + 1} / ${SCENES.length}`;
    document.getElementById('presentation-title').textContent = stage.title;
    document.getElementById('presentation-description').textContent = stage.description;
    this.setToggle('rain-toggle', false);
    this.setToggle('winter-toggle', stage.winter);
    this.setToggle('daynight-toggle', stage.night);
    if (stage.view === 'home') this.camera.goHome();
    else if (stage.view === 'kiosk') this.camera.focusKiosk();
    else if (stage.view === 'landscape') this.camera.showPresentationAngle([-18, 0, -23], [54, 49, -12]);
    else if (stage.view === 'night') this.camera.showPresentationAngle([-14, 0, -4], [42, 60, -8]);
    else this.camera.showPresentationAngle([-10, 0, -17], [66, 77, -35]);
  }

  setToggle(id, wanted) {
    const button = document.getElementById(id);
    if ((button.getAttribute('aria-pressed') === 'true') !== wanted) button.click();
  }

  stop() {
    if (!this.active) return;
    this.active = false;
    this.button.setAttribute('aria-pressed', 'false');
    this.controls.hidden = true;
    document.body.classList.remove('presentation-mode');
    this.setToggle('winter-toggle', this.previous.winter);
    this.setToggle('rain-toggle', this.previous.rain);
    this.setToggle('daynight-toggle', this.previous.night);
    if (document.fullscreenElement) document.exitFullscreen().catch(() => {});
    this.camera.goHome();
  }
}
