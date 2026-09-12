import { FilesetResolver, HandLandmarker } from '@mediapipe/tasks-vision';

const BASE = import.meta.env?.BASE_URL ?? '/';
const CDN_WASM = 'https://cdn.jsdelivr.net/npm/@mediapipe/tasks-vision@1.0.1/wasm';
const LOCAL_WASM = `${BASE}mediapipe/wasm`;
const LOCAL_MODEL = `${BASE}mediapipe/models/hand_landmarker.task`;
const CDN_MODEL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Indeks landmark tangan (21 titik, skema MediaPipe).
const WRIST = 0;
const THUMB_TIP = 4;
const INDEX_TIP = 8;
const MIDDLE_MCP = 9;
const FINGER_TIPS = [8, 12, 16, 20];

// Sendi tiap jari: [MCP, PIP, DIP, TIP]
const FINGERS = [
  [5, 6, 7, 8],
  [9, 10, 11, 12],
  [13, 14, 15, 16],
  [17, 18, 19, 20]
];

const CONNECTIONS = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17]
];

const dist2d = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

/**
 * Rentang rasio kelurusan jari.
 *   ~0.2–0.35 : kepalan (jari melipat penuh)
 *   ~0.9–1.0  : telapak terbuka (jari lurus)
 * Berbentuk rasio, sehingga kebal terhadap jarak tangan ke kamera dan cukup
 * kebal terhadap rotasi telapak.
 */
export const OPENNESS_RANGE = { min: 0.35, max: 0.9 };
export const PINCH_THRESHOLD = 0.3;

/** Normalisasi keterbukaan tangan ke 0..1 (dipengaruhi sensitivitas). */
export function opennessToT(openness, sensitivity = 1) {
  const { min, max } = OPENNESS_RANGE;
  const center = (min + max) / 2;
  const half = (max - min) / 2 / Math.min(Math.max(sensitivity, 0.2), 4);
  const t = (openness - center) / (2 * half) + 0.5;
  return Math.min(1, Math.max(0, t));
}

/** Kelurusan satu rantai jari: 1 = lurus sempurna, ~0.1 = melipat penuh. */
function straightness(landmarks, [mcp, pip, dip, tip]) {
  const direct = dist2d(landmarks[mcp], landmarks[tip]);
  const path =
    dist2d(landmarks[mcp], landmarks[pip]) +
    dist2d(landmarks[pip], landmarks[dip]) +
    dist2d(landmarks[dip], landmarks[tip]);
  return path > 1e-5 ? direct / path : 0;
}

/** Metrik mentah satu tangan: kelurusan jari, jarak cubit, titik tengah telapak. */
export function measureHand(landmarks) {
  const wrist = landmarks[WRIST];
  const palm = Math.max(1e-4, dist2d(wrist, landmarks[MIDDLE_MCP]));

  let openness = 0;
  for (const finger of FINGERS) openness += straightness(landmarks, finger);
  openness /= FINGERS.length;

  // Kelurusan jari tengah/manis/kelingking — dipakai untuk membedakan cubitan
  // sungguhan dari kepalan tangan (saat mengepal, semua jari ikut melipat).
  const otherFingers =
    (straightness(landmarks, FINGERS[1]) +
      straightness(landmarks, FINGERS[2]) +
      straightness(landmarks, FINGERS[3])) /
    3;

  const pinchDist = dist2d(landmarks[THUMB_TIP], landmarks[INDEX_TIP]) / palm;
  const cx = landmarks.reduce((sum, p) => sum + p.x, 0) / landmarks.length;
  const cy = landmarks.reduce((sum, p) => sum + p.y, 0) / landmarks.length;

  return { openness, otherFingers, pinchDist, cx, cy };
}

/** Terjemahkan error getUserMedia menjadi pesan yang bisa ditindaklanjuti. */
function describeCameraError(err) {
  const name = err?.name ?? '';
  if (name === 'NotAllowedError' || name === 'SecurityError') {
    return window.isSecureContext
      ? 'Izin kamera ditolak — izinkan akses kamera lalu coba lagi.'
      : 'Akses kamera diblokir — buka halaman lewat HTTPS atau tab baru.';
  }
  if (name === 'NotFoundError' || name === 'DevicesNotFoundError') {
    return 'Tidak ada kamera yang terdeteksi pada perangkat ini.';
  }
  if (name === 'NotReadableError' || name === 'TrackStartError') {
    return 'Kamera sedang dipakai aplikasi lain.';
  }
  if (name === 'OverconstrainedError') {
    return 'Kamera tidak mendukung resolusi yang diminta.';
  }
  return err?.message ?? 'Gagal mengakses kamera.';
}

/**
 * Pelacak tangan berbasis MediaPipe HandLandmarker.
 *
 * Menghasilkan metrik yang sudah "bersih":
 *  - openness : 0 (kepalan) .. 1 (telapak terbuka)
 *  - pinch    : true saat ujung jempol & telunjuk rapat
 *  - x, y     : posisi telapak ternormalisasi (untuk rotasi awan partikel)
 */
export class HandTracker {
  constructor({ video, overlay, onStatus }) {
    this.video = video;
    this.overlay = overlay;
    this.onStatus = onStatus ?? (() => {});
    this.ctx = overlay?.getContext('2d') ?? null;

    this.landmarker = null;
    this.stream = null;
    this.running = false;
    this.loading = false;
    this.lastVideoTime = -1;
    this.lastResult = null;
    this.lastDetectAt = 0;
    this.fps = 0;
    this.accent = '#4fd1ff';
    this.accentCheckedAt = 0;

    this.state = {
      active: false,
      detected: false,
      openness: 0.5,
      pinch: false,
      pinchDist: 1,
      x: 0.5,
      y: 0.5,
      hands: 0
    };
  }

  get isRunning() {
    return this.running;
  }

  async #resolveFileset() {
    try {
      const head = await fetch(`${LOCAL_WASM}/vision_wasm_internal.wasm`, { method: 'HEAD' });
      if (head.ok) return FilesetResolver.forVisionTasks(LOCAL_WASM);
    } catch {
      /* jatuh ke CDN */
    }
    return FilesetResolver.forVisionTasks(CDN_WASM);
  }

  async #resolveModelOptions() {
    try {
      const res = await fetch(LOCAL_MODEL, { method: 'HEAD' });
      if (res.ok) return { modelAssetPath: LOCAL_MODEL };
    } catch {
      /* jatuh ke CDN */
    }
    return { modelAssetPath: CDN_MODEL };
  }

  async #createLandmarker() {
    if (this.landmarker) return this.landmarker;
    this.onStatus('loading', 'Memuat model tangan…');

    const [fileset, modelOptions] = await Promise.all([
      this.#resolveFileset(),
      this.#resolveModelOptions()
    ]);

    const options = {
      baseOptions: { ...modelOptions, delegate: 'GPU' },
      numHands: 2,
      runningMode: 'VIDEO',
      minHandDetectionConfidence: 0.5,
      minHandPresenceConfidence: 0.5,
      minTrackingConfidence: 0.5
    };

    try {
      this.landmarker = await HandLandmarker.createFromOptions(fileset, options);
    } catch (err) {
      // Sebagian perangkat/browser tidak mendukung delegate GPU.
      console.warn('[hand] delegate GPU gagal, mencoba CPU', err);
      this.landmarker = await HandLandmarker.createFromOptions(fileset, {
        ...options,
        baseOptions: { ...modelOptions, delegate: 'CPU' }
      });
    }
    return this.landmarker;
  }

  async start() {
    if (this.running || this.loading) return;
    this.loading = true;
    try {
      if (!navigator.mediaDevices?.getUserMedia) {
        throw new Error('Browser tidak mendukung getUserMedia — buka halaman lewat HTTPS.');
      }
      this.onStatus('camera', 'Meminta izin kamera…');
      try {
        this.stream = await navigator.mediaDevices.getUserMedia({
          video: { width: { ideal: 640 }, height: { ideal: 480 }, facingMode: 'user' },
          audio: false
        });
      } catch (err) {
        throw new Error(describeCameraError(err));
      }
      this.video.srcObject = this.stream;
      await this.video.play();

      await this.#createLandmarker();

      this.running = true;
      this.state.active = true;
      this.onStatus('ready', 'Kamera aktif — buka/tutup tangan');
    } catch (err) {
      this.stop();
      this.onStatus('error', err?.message ?? 'Gagal mengakses kamera');
      throw err;
    } finally {
      this.loading = false;
    }
  }

  stop() {
    this.running = false;
    this.state.active = false;
    this.state.detected = false;
    this.state.hands = 0;
    this.lastResult = null;
    if (this.stream) {
      this.stream.getTracks().forEach((t) => t.stop());
      this.stream = null;
    }
    if (this.video) this.video.srcObject = null;
    if (this.ctx && this.overlay) {
      this.ctx.clearRect(0, 0, this.overlay.width, this.overlay.height);
    }
  }

  /** Panggil sekali per frame dari render loop. */
  update(nowMs) {
    if (!this.running || !this.landmarker) return this.state;

    const video = this.video;
    if (!video || video.readyState < 2) return this.state;

    // Samakan resolusi kanvas overlay dengan video agar kerangka tangan presisi.
    if (video.videoWidth && (this.overlay?.width !== video.videoWidth)) {
      this.overlay.width = video.videoWidth;
      this.overlay.height = video.videoHeight;
    }

    // Hanya jalankan inferensi bila ada frame baru dari kamera.
    if (video.currentTime === this.lastVideoTime) {
      this.#draw();
      return this.state;
    }
    this.lastVideoTime = video.currentTime;

    try {
      const result = this.landmarker.detectForVideo(video, nowMs);
      this.lastResult = result;

      const hands = result?.landmarks ?? [];
      this.state.hands = hands.length;
      this.state.detected = hands.length > 0;

      if (hands.length > 0) {
        let openness = 0;
        let cx = 0;
        let cy = 0;
        let minPinch = Infinity;
        let relaxed = 0;
        for (const lm of hands) {
          const m = measureHand(lm);
          openness = Math.max(openness, m.openness); // tangan yang paling terbuka
          relaxed = Math.max(relaxed, m.otherFingers);
          minPinch = Math.min(minPinch, m.pinchDist);
          cx += m.cx / hands.length;
          cy += m.cy / hands.length;
        }
        this.state.openness = openness;
        this.state.pinchDist = minPinch;
        // Cubitan valid: jempol & telunjuk rapat, tapi jari lain tidak ikut mengepal.
        this.state.pinch = minPinch < PINCH_THRESHOLD && relaxed > 0.45;
        this.state.x = cx;
        this.state.y = cy;
      }

      if (this.lastDetectAt > 0 && nowMs > this.lastDetectAt) {
        this.fps = this.fps * 0.9 + (1000 / (nowMs - this.lastDetectAt)) * 0.1;
      }
      this.lastDetectAt = nowMs;
    } catch (err) {
      // Inferensi yang gagal sesekali tidak boleh mematikan aplikasi.
      console.warn('[hand] detect error', err);
    }

    this.#draw();
    return this.state;
  }

  /** Gambar kerangka tangan di atas preview kamera. */
  #draw() {
    const ctx = this.ctx;
    if (!ctx || !this.overlay) return;

    const w = this.overlay.width;
    const h = this.overlay.height;
    ctx.clearRect(0, 0, w, h);

    const hands = this.lastResult?.landmarks ?? [];
    if (!hands.length) return;

    // Warna aksen mengikuti color picker; cukup dibaca sesekali.
    const now = performance.now();
    if (now - this.accentCheckedAt > 400) {
      this.accentCheckedAt = now;
      this.accent =
        getComputedStyle(document.documentElement).getPropertyValue('--accent').trim() || this.accent;
    }
    const accent = this.accent;

    for (const lm of hands) {
      ctx.lineWidth = Math.max(1.5, w / 220);
      ctx.strokeStyle = accent;
      ctx.globalAlpha = 0.75;
      ctx.beginPath();
      for (const [a, b] of CONNECTIONS) {
        ctx.moveTo(lm[a].x * w, lm[a].y * h);
        ctx.lineTo(lm[b].x * w, lm[b].y * h);
      }
      ctx.stroke();

      ctx.globalAlpha = 1;
      ctx.fillStyle = '#ffffff';
      for (let i = 0; i < lm.length; i++) {
        const isTip = FINGER_TIPS.includes(i) || i === THUMB_TIP;
        ctx.beginPath();
        ctx.arc(lm[i].x * w, lm[i].y * h, isTip ? w / 90 : w / 190, 0, Math.PI * 2);
        ctx.fill();
      }
    }

    // Bar indikator ekspansi di bawah preview.
    const openness = opennessToT(this.state.openness, 1);
    ctx.globalAlpha = 0.9;
    ctx.fillStyle = 'rgba(255,255,255,0.18)';
    ctx.fillRect(w * 0.08, h - 14, w * 0.84, 5);
    ctx.fillStyle = this.state.pinch ? '#ffd166' : accent;
    ctx.fillRect(w * 0.08, h - 14, w * 0.84 * openness, 5);
    ctx.globalAlpha = 1;
  }
}
