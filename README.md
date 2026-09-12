# Interactive Hand

Sistem partikel **3D real-time** berbasis [three.js](https://threejs.org) yang dikendalikan
**gestur buka/tutup tangan** melalui kamera web. Buka telapak → awan partikel mengembang;
kepalkan tangan → partikel menguncup. Semua berjalan di browser, tanpa backend.

![stack](https://img.shields.io/badge/three.js-0.186-black) ![stack](https://img.shields.io/badge/MediaPipe-HandLandmarker-0077b6) ![stack](https://img.shields.io/badge/Vite-8-646cff)

## Fitur

| # | Kebutuhan | Implementasi |
|---|-----------|--------------|
| 1 | Deteksi gestur buka/tutup tangan untuk mengontrol skala ekspansi | MediaPipe **HandLandmarker** (21 landmark). Metrik *kelurusan jari* → skala partikel, dihaluskan dengan low-pass filter |
| 2 | Partikel dengan `Points` + `BufferGeometry` | `ParticleSystem` memakai `THREE.Points` + `BufferGeometry` dan `ShaderMaterial` khusus (sprite bulat, additive blending, per-particle size) |
| 3 | Panel UI untuk mengganti bentuk | 8 bentuk (Bola, Galaksi, Torus, Kubus, DNA, Hati, Gelombang, Simpul) dengan **morphing** bertahap di GPU |
| 4 | Color picker real-time | Dua picker (Utama + Aksen) + 6 preset, warna merambat ke seluruh UI lewat CSS variable |
| 5 | Interaksi gestur mulus & responsif | Inferensi hanya pada frame kamera baru, filter *frame-rate independent*, morf antar-bentuk tidak pernah "putus" |
| 6 | UI bersih & modern + tombol full screen | Panel kaca (glassmorphism), indikator status, meter ekspansi, preview kamera PiP, tombol layar penuh |

### Ekstra

- **Rotasi mengikuti tangan** — gerakkan tangan ke kiri/kanan untuk memutar awan partikel.
- **Cubit (pinch)** — rapatkan jempol & telunjuk untuk pindah ke bentuk berikutnya.
- **Fallback tanpa kamera** — drag vertikal / scroll pada layar atau slider *Ekspansi manual*.
- **Post-processing bloom** yang bisa dimatikan untuk performa.
- Pintasan keyboard: `1`–`8` bentuk, `Space` bentuk berikutnya, `C` kamera, `H` sembunyikan UI, `F` layar penuh, `R` reset.

## Menjalankan

```bash
npm install     # sekaligus menjalankan scripts/setup.mjs
npm run dev     # http://localhost:5173
```

Build produksi:

```bash
npm run build
npm run preview
```

### Aset MediaPipe

`npm install` otomatis menjalankan `scripts/setup.mjs` yang:

1. **Menyalin WASM** MediaPipe dari `node_modules` ke `public/mediapipe/wasm` (offline, selalu berhasil).
2. **Mengunduh model** `hand_landmarker.task` (~7,5 MB) ke `public/mediapipe/models`.
   Bila unduhan gagal (tanpa internet), aplikasi otomatis mengambil model dari CDN saat runtime.

Folder `public/mediapipe` tidak masuk ke Git — jalankan `npm run setup` kapan saja untuk
membuatnya ulang.

> **Catatan kamera:** `getUserMedia` hanya berjalan di ** HTTPS** atau `localhost`.
> Jika preview berjalan di dalam iframe yang tidak mengizinkan kamera, buka di tab baru
> atau gunakan mode fallback (drag/slider).

## Struktur

```
├─ index.html                 markup antarmuka
├─ scripts/setup.mjs          penyiapan aset MediaPipe
├─ public/mediapipe/          WASM + model (dibuat skrip, tidak di-commit)
└─ src
   ├─ main.js                 renderer, post-processing, loop utama, pemetaan gestur
   ├─ particles
   │  ├─ ParticleSystem.js    Points + BufferGeometry + ShaderMaterial
   │  └─ shapes.js            8 generator bentuk (Float32Array) + ikon SVG
   ├─ hand
   │  └─ handTracker.js       HandLandmarker, metrik gestur, overlay kerangka tangan
   └─ ui
      ├─ controls.js          panel kontrol & state
      └─ style.css            tema glassmorphism
```

## Cara kerja gestur

1. **Landmark** — MediaPipe menghasilkan 21 titik tangan per frame (hanya saat ada frame baru).
2. **Metrik** — untuk tiap jari dihitung *kelurusan*:
   `|MCP→TIP| / (|MCP→PIP| + |PIP→DIP| + |DIP→TIP|)` → `1` lurus, `~0.2` mengepal.
   Rasio ini kebal terhadap jarak tangan ke kamera dan cukup kebal terhadap rotasi telapak.
3. **Normalisasi** — rentang `0.35 … 0.9` dipetakan ke `0 … 1`, bisa diperlebar dengan slider *Sensitivitas*.
4. **Pemulusan** — `scale += (target − scale) · (1 − e^(−dt/τ))` dengan τ dari slider *Kehalusan* (default 0,12 s),
   sehingga terasa responsif tanpa bergetar dan tidak bergantung pada frame rate.
5. **Ekspansi** — skala akhir = `skalaKecil + t · (skalaBesar − skalaKecil)`, diaplikasikan sebagai
   `p *= uScale` di vertex shader (seluruh awan mengembang/menguncup dari pusat).

Cubitan divalidasi ganda: jarak jempol–telunjuk < 0,3 × panjang telapak **dan** jari
tengah/manis/kelingking tidak ikut mengepal — supaya kepalan tangan tidak memicu ganti bentuk.

## Performa

- Partikel: 18.000 (desktop) / 9.000 (layar kecil), bisa diatur 2.000–60.000.
- Pixel ratio dibatasi ke 2; ukuran `gl_PointSize` dibatasi agar tidak "meledak" saat partikel dekat kamera.
- Pergantian bentuk memakai dua atribut posisi (`position` + `aTarget`) dan di-morph di GPU,
  sehingga 60k partikel tetap mulus tanpa mengirim ulang buffer setiap frame.
- Matikan *Efek glow* bila perangkat menurun drastis.
