import { SHAPES } from '../particles/shapes.js';

export const DEFAULTS = {
  shape: 'sphere',
  colorA: '#4fd1ff',
  colorB: '#b46bff',
  gradient: true,
  scaleMin: 0.4,
  scaleMax: 1.9,
  sensitivity: 1,
  smoothing: 0.12,
  manual: 1,
  rotationFollow: true,
  pinchSwitch: true,
  count: 18000,
  size: 1,
  spin: 0.1,
  bloom: true,
  preview: true
};

const PRESETS = [
  ['#4fd1ff', '#b46bff'],
  ['#ff7ac6', '#ffd166'],
  ['#5ef2c0', '#2f80ed'],
  ['#ff8a5c', '#ff2e63'],
  ['#c9d6ff', '#5f6cff'],
  ['#f5f7fa', '#8fd3ff']
];

const $ = (id) => document.getElementById(id);
const fmtCount = (n) => n.toLocaleString('id-ID');
const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

export class UIController {
  /**
   * @param {object} state  objek state yang dibagikan dengan main.js
   * @param {object} handlers
   */
  constructor(state, handlers) {
    this.state = state;
    this.h = handlers;
    this.toastTimer = 0;

    this.#buildShapes();
    this.#buildPresets();
    this.#wireCamera();
    this.#wireColors();
    this.#wireRanges();
    this.#wireSwitches();
    this.#wireButtons();
    this.syncAll();
  }

  /* ------------------------------- Bentuk ------------------------------- */

  #buildShapes() {
    const grid = $('shape-grid');
    grid.innerHTML = '';
    this.shapeButtons = new Map();

    SHAPES.forEach((shape, index) => {
      const btn = document.createElement('button');
      btn.className = 'shape-btn';
      btn.type = 'button';
      btn.title = `${shape.label} (${index + 1})`;
      btn.innerHTML = `<svg viewBox="0 0 24 24">${shape.icon}</svg><span>${shape.label}</span>`;
      btn.addEventListener('click', () => this.h.onShape(shape.id));
      grid.appendChild(btn);
      this.shapeButtons.set(shape.id, btn);
    });
  }

  #buildPresets() {
    const row = $('preset-row');
    row.innerHTML = '';
    PRESETS.forEach(([a, b]) => {
      const btn = document.createElement('button');
      btn.className = 'preset';
      btn.type = 'button';
      btn.title = `${a} → ${b}`;
      btn.style.background = `linear-gradient(135deg, ${a}, ${b})`;
      btn.addEventListener('click', () => this.h.onColor(a, b));
      row.appendChild(btn);
    });
  }

  /* ------------------------------- Kamera ------------------------------- */

  #wireCamera() {
    $('btn-camera').addEventListener('click', () => this.h.onToggleCamera());
    $('opt-preview').addEventListener('change', (e) => {
      this.state.preview = e.target.checked;
      this.h.onPreview(e.target.checked);
    });
  }

  /* -------------------------------- Warna ------------------------------- */

  #wireColors() {
    $('color-a').addEventListener('input', (e) => this.h.onColor(e.target.value, this.state.colorB));
    $('color-b').addEventListener('input', (e) => this.h.onColor(this.state.colorA, e.target.value));
    $('opt-gradient').addEventListener('change', (e) => {
      this.state.gradient = e.target.checked;
      this.h.onGradient(e.target.checked);
    });
  }

  /* ------------------------------- Slider ------------------------------- */

  #range(id, key, format, handler) {
    const input = $(id);
    const out = $(`${id}-out`);
    const apply = () => {
      const value = Number(input.value);
      this.state[key] = value;
      if (out) out.textContent = format(value);
      handler?.(value);
    };
    input.addEventListener('input', apply);
    return { input, out, apply, format, key };
  }

  #wireRanges() {
    this.ranges = [
      this.#range('range-min', 'scaleMin', (v) => v.toFixed(2), (v) => this.h.onScaleRange(v, this.state.scaleMax)),
      this.#range('range-max', 'scaleMax', (v) => v.toFixed(2), (v) => this.h.onScaleRange(this.state.scaleMin, v)),
      this.#range('range-sens', 'sensitivity', (v) => v.toFixed(2), () => {}),
      this.#range('range-smooth', 'smoothing', (v) => `${v.toFixed(2)} s`, () => {}),
      this.#range('range-manual', 'manual', (v) => v.toFixed(2), () => {}),
      this.#range('range-count', 'count', fmtCount, (v) => this.h.onCount(v)),
      this.#range('range-size', 'size', (v) => v.toFixed(2), (v) => this.h.onSize(v)),
      this.#range('range-spin', 'spin', (v) => v.toFixed(2), () => {})
    ];
  }

  setRange(key, value) {
    const r = this.ranges.find((x) => x.key === key);
    if (!r) return;
    this.state[key] = value;
    r.input.value = String(value);
    r.out.textContent = r.format(value);
  }

  setManual(value) {
    this.setRange('manual', clamp(value, 0.1, 3));
  }

  /* ------------------------------- Switch ------------------------------- */

  #switch(id, key, handler) {
    $(id).addEventListener('change', (e) => {
      this.state[key] = e.target.checked;
      handler?.(e.target.checked);
    });
  }

  #wireSwitches() {
    this.#switch('opt-rotate', 'rotationFollow');
    this.#switch('opt-pinch', 'pinchSwitch');
    this.#switch('opt-bloom', 'bloom', (v) => this.h.onBloom(v));
  }

  /* ------------------------------- Tombol ------------------------------- */

  #wireButtons() {
    $('btn-fullscreen').addEventListener('click', () => this.h.onFullscreen());
    $('btn-hide').addEventListener('click', () => this.toggleUI());
    $('btn-reset').addEventListener('click', () => this.h.onReset());
    $('btn-shuffle').addEventListener('click', () => this.h.onShuffle());
  }

  /* ------------------------------- Sinkron ------------------------------ */

  syncAll() {
    const s = this.state;
    document.documentElement.style.setProperty('--accent', s.colorA);
    document.documentElement.style.setProperty('--accent-2', s.colorB);

    $('color-a').value = s.colorA;
    $('color-b').value = s.colorB;
    $('color-a-hex').textContent = s.colorA.toUpperCase();
    $('color-b-hex').textContent = s.colorB.toUpperCase();
    $('opt-gradient').checked = s.gradient;
    $('opt-preview').checked = s.preview;
    $('opt-rotate').checked = s.rotationFollow;
    $('opt-pinch').checked = s.pinchSwitch;
    $('opt-bloom').checked = s.bloom;

    for (const r of this.ranges) {
      r.input.value = String(s[r.key]);
      r.out.textContent = r.format(Number(r.input.value));
    }

    this.setShape(s.shape);
  }

  setShape(shapeId) {
    this.state.shape = shapeId;
    for (const [id, btn] of this.shapeButtons) {
      btn.classList.toggle('is-active', id === shapeId);
    }
    const shape = SHAPES.find((x) => x.id === shapeId);
    $('shape-value').textContent = shape ? shape.label : '';
  }

  setColor(a, b) {
    this.state.colorA = a;
    this.state.colorB = b;
    document.documentElement.style.setProperty('--accent', a);
    document.documentElement.style.setProperty('--accent-2', b);
    $('color-a').value = a;
    $('color-b').value = b;
    $('color-a-hex').textContent = a.toUpperCase();
    $('color-b-hex').textContent = b.toUpperCase();
  }

  setStatus(state, text) {
    const chip = $('status-chip');
    chip.dataset.state = state;
    $('status-text').textContent = text;
  }

  setCameraActive(active) {
    const btn = $('btn-camera');
    btn.classList.toggle('is-on', active);
    $('btn-camera-label').textContent = active ? 'Matikan Kamera' : 'Aktifkan Kamera';
    $('camera-card').classList.toggle('is-live', active);
  }

  // Kartu kamera hanya digeser keluar layar (bukan display:none) agar browser
  // tetap mengirim frame video saat preview disembunyikan.
  setPreviewVisible(visible) {
    $('camera-card').classList.toggle('is-off', !visible);
  }

  /** Indikator level ekspansi (0..1) pada kartu kamera. */
  setExpansion(t) {
    const pct = Math.round(Math.min(1, Math.max(0, t)) * 100);
    $('meter-fill').style.width = `${pct}%`;
    $('meter-value').textContent = `${pct}%`;
    $('meter-label').textContent = this.state.handsFree ? 'Ekspansi (manual)' : 'Ekspansi';
  }

  toggleUI(force) {
    const hidden = document.body.classList.toggle('ui-hidden', force);
    $('btn-hide').style.opacity = hidden ? '0.55' : '';
    return hidden;
  }

  toast(message, duration = 2600) {
    const el = $('toast');
    el.textContent = message;
    el.classList.add('is-visible');
    clearTimeout(this.toastTimer);
    this.toastTimer = setTimeout(() => el.classList.remove('is-visible'), duration);
  }

  hideBoot() {
    const boot = $('boot');
    boot.classList.add('is-hidden');
    setTimeout(() => boot.remove(), 600);
  }
}
