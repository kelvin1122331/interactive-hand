import * as THREE from 'three';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

import { ParticleSystem } from './particles/ParticleSystem.js';
import { SHAPES } from './particles/shapes.js';
import { HandTracker, opennessToT } from './hand/handTracker.js';
import { UIController, DEFAULTS } from './ui/controls.js';

/* ------------------------------------------------------------------ */
/* State                                                               */
/* ------------------------------------------------------------------ */

const isSmallScreen = window.matchMedia('(max-width: 900px)').matches;

const state = {
  ...DEFAULTS,
  count: isSmallScreen ? 9000 : DEFAULTS.count,
  // runtime
  scale: 1,
  targetScale: 1,
  handRotation: 0,
  handTilt: 0,
  handsFree: true
};

const clamp = (v, min, max) => Math.min(max, Math.max(min, v));

/** Low-pass filter yang tidak bergantung pada frame rate. */
const smoothTo = (current, target, tau, dt) => current + (target - current) * (1 - Math.exp(-dt / Math.max(tau, 0.001)));

/* ------------------------------------------------------------------ */
/* Renderer & scene                                                    */
/* ------------------------------------------------------------------ */

const canvas = document.getElementById('scene');

let renderer;
try {
  renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: false,
    alpha: true,
    powerPreference: 'high-performance'
  });
} catch (err) {
  const boot = document.getElementById('boot');
  if (boot) boot.innerHTML = '<span>WebGL tidak tersedia di browser ini.</span>';
  throw err;
}
renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
renderer.setSize(window.innerWidth, window.innerHeight);
renderer.setClearColor(0x000000, 0);
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.NoToneMapping;

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(55, window.innerWidth / window.innerHeight, 0.1, 100);
camera.position.set(0, 0, 6);

const group = new THREE.Group();
scene.add(group);

const particles = new ParticleSystem({
  count: state.count,
  colorA: state.colorA,
  colorB: state.colorB,
  size: state.size
});
group.add(particles.points);

// Bintang latar belakang — memberi kedalaman saat awan partikel menguncup.
{
  const starCount = 900;
  const positions = new Float32Array(starCount * 3);
  for (let i = 0; i < starCount; i++) {
    const r = 14 + Math.random() * 16;
    const theta = Math.random() * Math.PI * 2;
    const phi = Math.acos(2 * Math.random() - 1);
    positions[i * 3] = r * Math.sin(phi) * Math.cos(theta);
    positions[i * 3 + 1] = r * Math.cos(phi);
    positions[i * 3 + 2] = r * Math.sin(phi) * Math.sin(theta);
  }
  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  const stars = new THREE.Points(
    geo,
    new THREE.PointsMaterial({
      size: 0.06,
      color: 0x9fb2ff,
      transparent: true,
      opacity: 0.5,
      depthWrite: false,
      sizeAttenuation: true
    })
  );
  stars.frustumCulled = false;
  scene.add(stars);
}

/* ------------------------------ Post-processing ----------------------- */

const composer = new EffectComposer(renderer);
composer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
composer.setSize(window.innerWidth, window.innerHeight);
composer.addPass(new RenderPass(scene, camera));

const bloomPass = new UnrealBloomPass(
  new THREE.Vector2(window.innerWidth, window.innerHeight),
  0.65, // strength
  0.7, // radius
  0.1 // threshold — di bawah 1 karena partikel sudah additive
);
composer.addPass(bloomPass);
composer.addPass(new OutputPass());

/* ------------------------------------------------------------------ */
/* Pelacakan tangan                                                    */
/* ------------------------------------------------------------------ */

const video = document.getElementById('video');
const overlay = document.getElementById('overlay');

const tracker = new HandTracker({
  video,
  overlay,
  onStatus: (kind, text) => {
    ui.setStatus(kind, text);
    if (kind === 'error') ui.toast(text, 4200);
  }
});

/* ------------------------------------------------------------------ */
/* Antarmuka                                                           */
/* ------------------------------------------------------------------ */

function applyColor(a, b) {
  state.colorA = a;
  state.colorB = b;
  particles.setColors(a, b);
  ui.setColor(a, b);
}

function setShape(id, viaGesture = false) {
  particles.setShape(id);
  ui.setShape(id);
  if (viaGesture) ui.toast(`Bentuk: ${SHAPES.find((s) => s.id === id)?.label ?? id}`, 1400);
}

const ui = new UIController(state, {
  onShape: (id) => setShape(id),

  onColor: (a, b) => applyColor(a, b),

  onGradient: (enabled) => particles.setGradient(enabled),

  onScaleRange: (min, max) => {
    state.scaleMin = min;
    state.scaleMax = Math.max(max, min + 0.05);
  },

  onCount: (count) => particles.setCount(count),

  onSize: (size) => particles.setSize(size),

  onBloom: (enabled) => {
    bloomPass.enabled = enabled;
  },

  onPreview: (visible) => ui.setPreviewVisible(visible),

  onToggleCamera: () => toggleCamera(),

  onFullscreen: () => toggleFullscreen(),

  onReset: () => {
    Object.assign(state, DEFAULTS, { count: state.count });
    applyColor(state.colorA, state.colorB);
    particles.setGradient(state.gradient);
    particles.setSize(state.size);
    bloomPass.enabled = state.bloom;
    ui.syncAll();
    ui.setPreviewVisible(state.preview);
    setShape(state.shape);
    ui.toast('Pengaturan dikembalikan ke default');
  },

  onShuffle: () => {
    const shape = SHAPES[(Math.random() * SHAPES.length) | 0].id;
    const hue = Math.random() * 360;
    const a = new THREE.Color().setHSL(hue / 360, 0.85, 0.62);
    const b = new THREE.Color().setHSL(((hue + 55) % 360) / 360, 0.8, 0.6);
    setShape(shape);
    applyColor(`#${a.getHexString()}`, `#${b.getHexString()}`);
  }
});

bloomPass.enabled = state.bloom;
particles.setGradient(state.gradient);
ui.setPreviewVisible(state.preview);

/* ------------------------------- Kamera ------------------------------- */

async function toggleCamera() {
  if (tracker.isRunning) {
    tracker.stop();
    handLabel = '';
    ui.setCameraActive(false);
    ui.setStatus('idle', 'Kamera dimatikan — pakai slider/drag untuk ekspansi');
    return;
  }
  try {
    ui.setCameraActive(true);
    await tracker.start();
    ui.setStatus('ready', 'Kamera aktif — buka/tutup tangan');
  } catch {
    ui.setCameraActive(false);
  }
}

/* ----------------------------- Layar penuh ---------------------------- */

function toggleFullscreen() {
  if (document.fullscreenElement) {
    document.exitFullscreen?.();
  } else {
    document.documentElement.requestFullscreen?.().catch(() => {
      ui.toast('Browser memblokir mode layar penuh');
    });
  }
}

/* ------------------------------------------------------------------ */
/* Interaksi fallback (tanpa kamera)                                    */
/* ------------------------------------------------------------------ */

let dragging = false;
let dragStartY = 0;
let dragStartManual = 0;

canvas.addEventListener('pointerdown', (e) => {
  dragging = true;
  dragStartY = e.clientY;
  dragStartManual = state.manual;
  canvas.setPointerCapture(e.pointerId);
});
canvas.addEventListener('pointermove', (e) => {
  if (!dragging) return;
  const delta = (dragStartY - e.clientY) / window.innerHeight;
  state.manual = clamp(dragStartManual + delta * 2.4, 0.1, 3);
  ui.setManual(state.manual);
});
const endDrag = () => { dragging = false; };
canvas.addEventListener('pointerup', endDrag);
canvas.addEventListener('pointercancel', endDrag);

canvas.addEventListener(
  'wheel',
  (e) => {
    e.preventDefault();
    state.manual = clamp(state.manual - e.deltaY * 0.0012, 0.1, 3);
    ui.setManual(state.manual);
  },
  { passive: false }
);

/* ----------------------------- Pintasan ------------------------------- */

window.addEventListener('keydown', (e) => {
  if (e.target instanceof HTMLInputElement) return;
  const key = e.key.toLowerCase();

  if (key >= '1' && key <= '8') {
    const shape = SHAPES[Number(key) - 1];
    if (shape) setShape(shape.id);
    return;
  }
  switch (key) {
    case ' ':
      e.preventDefault();
      setShape(particles.nextShape());
      break;
    case 'c':
      toggleCamera();
      break;
    case 'f':
      toggleFullscreen();
      break;
    case 'h':
      ui.toggleUI();
      break;
    case 'r':
      ui.h.onReset();
      break;
    default:
      break;
  }
});

/* ------------------------------------------------------------------ */
/* Resize                                                              */
/* ------------------------------------------------------------------ */

function resize() {
  const w = window.innerWidth;
  const h = window.innerHeight;
  const dpr = Math.min(window.devicePixelRatio, 2);

  renderer.setPixelRatio(dpr);
  renderer.setSize(w, h);
  composer.setPixelRatio(dpr);
  composer.setSize(w, h); // sudah meneruskan ukuran ke bloomPass

  camera.aspect = w / h;
  camera.updateProjectionMatrix();

  particles.setViewportScale(renderer.domElement.height);
}

window.addEventListener('resize', resize);
resize();

/* ------------------------------------------------------------------ */
/* Loop utama                                                          */
/* ------------------------------------------------------------------ */

const clock = new THREE.Clock();
let elapsed = 0;
let autoRotation = 0;
let pinchArmed = true;
let lastPinchAt = 0;
let booted = false;
let handLabel = '';

function frame() {
  requestAnimationFrame(frame);

  const dt = Math.min(clock.getDelta(), 0.05);
  elapsed += dt;

  const hand = tracker.update(performance.now());
  const detected = hand.detected && hand.active;
  state.handsFree = !detected;

  // Umpan balik status saat kamera menyala (hanya saat keadaan berubah).
  if (tracker.isRunning) {
    const label = detected ? 'Tangan terdeteksi' : 'Arahkan tangan ke kamera';
    if (label !== handLabel) {
      handLabel = label;
      ui.setStatus('ready', label);
    }
  }

  // --- target skala dari gestur (atau fallback manual) ---
  let targetT;
  if (detected) {
    targetT = opennessToT(hand.openness, state.sensitivity);
    state.targetScale = state.scaleMin + (state.scaleMax - state.scaleMin) * targetT;
  } else {
    state.targetScale = state.manual;
    targetT = (state.manual - state.scaleMin) / Math.max(0.001, state.scaleMax - state.scaleMin);
  }

  state.scale = smoothTo(state.scale, clamp(state.targetScale, 0.05, 4), state.smoothing, dt);
  particles.setScale(state.scale);

  // --- rotasi ---
  autoRotation += state.spin * dt * 0.55;
  if (detected && state.rotationFollow) {
    const mirroredX = 1 - hand.x; // preview kamera di-mirror
    state.handRotation = smoothTo(state.handRotation, (mirroredX - 0.5) * 3.0, 0.22, dt);
    state.handTilt = smoothTo(state.handTilt, (hand.y - 0.5) * 0.9, 0.28, dt);
  } else {
    state.handRotation = smoothTo(state.handRotation, 0, 0.5, dt);
    state.handTilt = smoothTo(state.handTilt, 0, 0.5, dt);
  }
  group.rotation.y = autoRotation + state.handRotation;
  group.rotation.x = state.handTilt;

  // --- cubit untuk ganti bentuk ---
  if (state.pinchSwitch && detected) {
    const now = performance.now();
    if (hand.pinch && pinchArmed && now - lastPinchAt > 900) {
      setShape(particles.nextShape(), true);
      pinchArmed = false;
      lastPinchAt = now;
    }
    if (!hand.pinch) pinchArmed = true;
  } else if (!hand.pinch) {
    pinchArmed = true;
  }

  particles.update(dt, elapsed);
  ui.setExpansion(targetT);

  if (state.bloom) composer.render();
  else renderer.render(scene, camera);

  if (!booted) {
    booted = true;
    ui.hideBoot();
  }
}

frame();
