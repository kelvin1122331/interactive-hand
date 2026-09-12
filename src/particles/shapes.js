/**
 * Generator bentuk partikel.
 *
 * Setiap generator mengisi Float32Array (count * 3) dengan posisi acak yang
 * tersebar mengikuti bentuk tertentu, lalu dinormalisasi agar semua bentuk
 * memiliki skala yang setara di layar.
 */

const TAU = Math.PI * 2;

const rand = (min, max) => min + Math.random() * (max - min);
const gaussian = () => {
  // Box–Muller, dipakai untuk sebaran yang lebih "alami" di bagian tengah.
  let u = 0;
  let v = 0;
  while (u === 0) u = Math.random();
  while (v === 0) v = Math.random();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(TAU * v);
};

/* ------------------------------------------------------------------ */
/* Daftar bentuk                                                       */
/* ------------------------------------------------------------------ */

export const SHAPES = [
  {
    id: 'sphere',
    label: 'Bola',
    icon: '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="8.5" ry="3.4"/><ellipse cx="12" cy="12" rx="3.4" ry="8.5"/>',
    extent: 1.55,
    build: (out, count) => {
      // Fibonacci sphere -> sebaran merata tanpa menggumpal di kutub.
      const golden = Math.PI * (3 - Math.sqrt(5));
      for (let i = 0; i < count; i++) {
        const y = 1 - (i / (count - 1)) * 2;
        const r = Math.sqrt(Math.max(0, 1 - y * y));
        const theta = golden * i;
        const shell = 1 + gaussian() * 0.035;
        const i3 = i * 3;
        out[i3] = Math.cos(theta) * r * shell;
        out[i3 + 1] = y * shell;
        out[i3 + 2] = Math.sin(theta) * r * shell;
      }
    }
  },
  {
    id: 'galaxy',
    label: 'Galaksi',
    icon: '<circle cx="12" cy="12" r="2.2"/><path d="M12 9.8c3.4 0 3.4 4.4 6.4 4.4M12 9.8c-3.4 0-3.4 4.4-6.4 4.4"/>',
    extent: 1.95,
    build: (out, count) => {
      const branches = 4;
      for (let i = 0; i < count; i++) {
        const radius = Math.pow(Math.random(), 0.62) * 1.9;
        const branch = (i % branches) * (TAU / branches);
        const spin = radius * 2.3;
        const scatter = (() => {
          const p = Math.pow(Math.random(), 2.6);
          return p * (Math.random() < 0.5 ? 1 : -1) * 0.32 * (0.4 + radius);
        })();
        const i3 = i * 3;
        const angle = branch + spin;
        out[i3] = Math.cos(angle) * radius + gaussian() * 0.09;
        out[i3 + 1] = gaussian() * 0.055 * (1.4 - radius * 0.4);
        out[i3 + 2] = Math.sin(angle) * radius + gaussian() * 0.09 + scatter * 0.35;
      }
    }
  },
  {
    id: 'torus',
    label: 'Torus',
    icon: '<circle cx="12" cy="12" r="8.5"/><ellipse cx="12" cy="12" rx="4" ry="1.7"/>',
    extent: 1.6,
    build: (out, count) => {
      const R = 1.0;
      const r = 0.42;
      for (let i = 0; i < count; i++) {
        const u = Math.random() * TAU;
        const v = Math.random() * TAU;
        const tube = r * (1 + gaussian() * 0.12);
        const i3 = i * 3;
        out[i3] = (R + tube * Math.cos(v)) * Math.cos(u);
        out[i3 + 1] = tube * Math.sin(v);
        out[i3 + 2] = (R + tube * Math.cos(v)) * Math.sin(u);
      }
    }
  },
  {
    id: 'cube',
    label: 'Kubus',
    icon: '<path d="M12 3.2 20 7.6v8.8L12 20.8 4 16.4V7.6z"/><path d="M4 7.6 12 12l8-4.4M12 12v8.8"/>',
    extent: 1.5,
    build: (out, count) => {
      for (let i = 0; i < count; i++) {
        const face = i % 6;
        const a = rand(-1, 1);
        const b = rand(-1, 1);
        const j = 1 + gaussian() * 0.02; // sedikit tebal agar tidak "paper thin"
        const i3 = i * 3;
        switch (face) {
          case 0: out[i3] = a; out[i3 + 1] = b; out[i3 + 2] = j; break;
          case 1: out[i3] = a; out[i3 + 1] = b; out[i3 + 2] = -j; break;
          case 2: out[i3] = j; out[i3 + 1] = a; out[i3 + 2] = b; break;
          case 3: out[i3] = -j; out[i3 + 1] = a; out[i3 + 2] = b; break;
          case 4: out[i3] = a; out[i3 + 1] = j; out[i3 + 2] = b; break;
          default: out[i3] = a; out[i3 + 1] = -j; out[i3 + 2] = b; break;
        }
      }
    }
  },
  {
    id: 'helix',
    label: 'DNA',
    icon: '<path d="M6 3c0 4 12 6 12 9s-12 5-12 9M18 3c0 4-12 6-12 9s12 5 12 9"/><path d="M7 8h10M7 16h10"/>',
    extent: 1.7,
    build: (out, count) => {
      const radius = 0.62;
      for (let i = 0; i < count; i++) {
        const t = i / count;
        const y = (t - 0.5) * 3.1;
        const angle = t * TAU * 3.2;
        const i3 = i * 3;
        if (Math.random() < 0.22) {
          // "Anak tangga" yang menghubungkan dua untai.
          const k = Math.random();
          const ax = Math.cos(angle) * radius;
          const az = Math.sin(angle) * radius;
          out[i3] = ax * (1 - 2 * k);
          out[i3 + 1] = y;
          out[i3 + 2] = az * (1 - 2 * k);
        } else {
          const strand = Math.random() < 0.5 ? 0 : Math.PI;
          const jitter = 0.07;
          out[i3] = Math.cos(angle + strand) * radius + gaussian() * jitter;
          out[i3 + 1] = y + gaussian() * jitter;
          out[i3 + 2] = Math.sin(angle + strand) * radius + gaussian() * jitter;
        }
      }
    }
  },
  {
    id: 'heart',
    label: 'Hati',
    icon: '<path d="M12 20.5s-7.5-4.6-7.5-9.6A4.4 4.4 0 0 1 12 8.2a4.4 4.4 0 0 1 7.5 2.7c0 5-7.5 9.6-7.5 9.6z"/>',
    extent: 1.55,
    build: (out, count) => {
      // Sampel batas kurva hati klasik, lalu isi bagian dalamnya.
      const SAMPLES = 720;
      const bx = new Float32Array(SAMPLES);
      const by = new Float32Array(SAMPLES);
      let cx = 0;
      let cy = 0;
      for (let s = 0; s < SAMPLES; s++) {
        const t = (s / SAMPLES) * TAU;
        const x = 16 * Math.pow(Math.sin(t), 3);
        const y =
          13 * Math.cos(t) - 5 * Math.cos(2 * t) - 2 * Math.cos(3 * t) - Math.cos(4 * t);
        bx[s] = x;
        by[s] = y;
        cx += x;
        cy += y;
      }
      cx /= SAMPLES;
      cy /= SAMPLES;

      for (let i = 0; i < count; i++) {
        const s = (Math.random() * SAMPLES) | 0;
        const k = Math.sqrt(Math.random()) * 0.97; // sqrt -> sebaran area merata
        const i3 = i * 3;
        const scale = 1 / 17;
        out[i3] = (cx + (bx[s] - cx) * k) * scale;
        out[i3 + 1] = (cy + (by[s] - cy) * k) * scale * -1; // kurva hati terbalik di sumbu Y
        out[i3 + 2] = gaussian() * 0.11 * (1.05 - k * 0.5);
      }
    }
  },
  {
    id: 'wave',
    label: 'Gelombang',
    icon: '<path d="M3 12c2.2 0 2.2-6 4.5-6S9.7 18 12 18s2.3-12 4.5-12S18.8 12 21 12"/>',
    extent: 1.75,
    build: (out, count) => {
      for (let i = 0; i < count; i++) {
        const x = rand(-1.6, 1.6);
        const z = rand(-1.6, 1.6);
        const d = Math.sqrt(x * x + z * z);
        const h = Math.sin(x * 2.1) * 0.24 + Math.cos(z * 1.9) * 0.2 + Math.sin(d * 2.6) * 0.12;
        const i3 = i * 3;
        out[i3] = x;
        out[i3 + 1] = h + gaussian() * 0.035;
        out[i3 + 2] = z;
      }
    }
  },
  {
    id: 'knot',
    label: 'Simpul',
    icon: '<path d="M8.2 8.2C5 5 5 12 8.4 12h7.2c3.4 0 3.4-7 .2-7-3.2 0-3.2 7 0 7h7.2"/>',
    extent: 1.65,
    build: (out, count) => {
      // Simpul torus (p=2, q=3) dengan tabung ber-noise.
      for (let i = 0; i < count; i++) {
        const t = Math.random() * TAU * 2;
        const r = 0.85 + 0.32 * Math.cos(1.5 * t);
        const i3 = i * 3;
        out[i3] = r * Math.cos(t) + gaussian() * 0.09;
        out[i3 + 1] = 0.55 * Math.sin(1.5 * t) + gaussian() * 0.09;
        out[i3 + 2] = r * Math.sin(t) + gaussian() * 0.09;
      }
    }
  }
];

export const SHAPE_IDS = SHAPES.map((s) => s.id);

/** Normalisasi agar 98% partikel berada di dalam radius `extent`. */
function normalize(out, extent) {
  const count = out.length / 3;
  const radii = new Float32Array(count);
  for (let i = 0; i < count; i++) {
    const i3 = i * 3;
    radii[i] = Math.hypot(out[i3], out[i3 + 1], out[i3 + 2]);
  }
  const sorted = Float32Array.from(radii).sort();
  const p98 = sorted[Math.floor(count * 0.98)] || 1;
  const scale = extent / p98;
  for (let i = 0; i < out.length; i++) out[i] *= scale;
}

/**
 * Isi `target` dengan posisi bentuk `shapeId`.
 * @param {string} shapeId
 * @param {Float32Array} target panjang = count * 3
 */
export function generateShape(shapeId, target) {
  const shape = SHAPES.find((s) => s.id === shapeId) ?? SHAPES[0];
  shape.build(target, target.length / 3);
  normalize(target, shape.extent);
  return target;
}
