/**
 * Menyiapkan aset MediaPipe (WASM + model HandLandmarker) ke folder `public/mediapipe`.
 *
 * - WASM  : disalin dari node_modules/@mediapipe/tasks-vision (selalu berhasil, offline).
 * - Model : diunduh dari CDN Google (butuh internet). Gagal = tidak apa-apa,
 *           aplikasi akan mengambil model langsung dari CDN saat runtime.
 *
 * Folder ini tidak masuk ke Git (lihat .gitignore).
 */
import { mkdir, copyFile, access, writeFile } from 'node:fs/promises';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = resolve(dirname(fileURLToPath(import.meta.url)), '..');
const wasmSrc = resolve(root, 'node_modules/@mediapipe/tasks-vision/wasm');
const publicDir = resolve(root, 'public/mediapipe');
const wasmDst = resolve(publicDir, 'wasm');
const modelDst = resolve(publicDir, 'models/hand_landmarker.task');

const MODEL_URL =
  'https://storage.googleapis.com/mediapipe-models/hand_landmarker/hand_landmarker/float16/1/hand_landmarker.task';

// Varian "module" tidak dipakai karena kita memanggil forVisionTasks(path, false).
const WASM_FILES = [
  'vision_wasm_internal.js',
  'vision_wasm_internal.wasm',
  'vision_wasm_nosimd_internal.js',
  'vision_wasm_nosimd_internal.wasm'
];

const log = (msg) => console.log(`[setup] ${msg}`);

async function exists(p) {
  try {
    await access(p);
    return true;
  } catch {
    return false;
  }
}

async function copyWasm() {
  if (!(await exists(wasmSrc))) {
    log('@mediapipe/tasks-vision belum terpasang — lewati penyalinan WASM.');
    return;
  }
  await mkdir(wasmDst, { recursive: true });
  let copied = 0;
  for (const file of WASM_FILES) {
    const to = resolve(wasmDst, file);
    if (await exists(to)) continue;
    await copyFile(resolve(wasmSrc, file), to);
    copied++;
  }
  log(copied ? `WASM MediaPipe disalin (${copied} file) -> public/mediapipe/wasm` : 'WASM MediaPipe sudah ada.');
}

async function fetchModel() {
  if (await exists(modelDst)) {
    log('Model hand_landmarker.task sudah ada.');
    return;
  }
  try {
    const res = await fetch(MODEL_URL, { signal: AbortSignal.timeout(60_000) });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const buf = Buffer.from(await res.arrayBuffer());
    if (buf.byteLength < 1_000_000) throw new Error('ukuran model mencurigakan');
    await mkdir(dirname(modelDst), { recursive: true });
    await writeFile(modelDst, buf);
    log(`Model hand_landmarker.task diunduh (${(buf.byteLength / 1e6).toFixed(1)} MB).`);
  } catch (err) {
    log(`Model tidak bisa diunduh (${err.message}). Aplikasi akan memakai CDN saat runtime.`);
  }
}

await copyWasm().catch((e) => log(`Gagal menyalin WASM: ${e.message}`));
await fetchModel();
