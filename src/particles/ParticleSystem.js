import * as THREE from 'three';
import { generateShape, SHAPES } from './shapes.js';

const vertexShader = /* glsl */ `
  uniform float uTime;
  uniform float uScale;
  uniform float uSize;
  uniform float uSizeScale;
  uniform float uMorph;
  uniform float uDrift;

  attribute vec3 aTarget;
  attribute float aSize;
  attribute float aRandom;

  varying float vRandom;
  varying float vDepth;

  void main() {
    vRandom = aRandom;

    // Morph bertahap per-partikel (stagger) supaya pergantian bentuk terasa organik.
    float stagger = 0.4;
    float t = clamp((uMorph - aRandom * stagger) / (1.0 - stagger), 0.0, 1.0);
    t = t * t * (3.0 - 2.0 * t);

    vec3 p = mix(position, aTarget, t);

    // Gerakan idle halus agar awan partikel tidak pernah benar-benar statis.
    float f = aRandom * 6.28318;
    vec3 drift = vec3(
      sin(uTime * 0.55 + f),
      cos(uTime * 0.47 + f * 1.7),
      sin(uTime * 0.41 + f * 2.3)
    );
    p += drift * uDrift * (0.35 + aRandom * 0.65);

    // Ekspansi/kontraksi dari gestur tangan.
    p *= uScale;

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    vDepth = -mv.z;

    // Sedikit membesar saat mengembang, lalu dibatasi agar tidak "meledak".
    float size = aSize * uSize * (0.75 + uScale * 0.25);
    gl_PointSize = clamp(size * uSizeScale / max(vDepth, 0.001), 0.6, 96.0);

    gl_Position = projectionMatrix * mv;
  }
`;

const fragmentShader = /* glsl */ `
  uniform vec3 uColorA;
  uniform vec3 uColorB;
  uniform float uGradient;
  uniform float uOpacity;

  varying float vRandom;
  varying float vDepth;

  void main() {
    // Sprite bulat dengan falloff lembut.
    vec2 uv = gl_PointCoord - 0.5;
    float d = length(uv);
    if (d > 0.5) discard;

    // smoothstep dengan edge terbalik tidak terdefinisi di GLSL — dibalik manual.
    float core = 1.0 - smoothstep(0.0, 0.5, d);
    float halo = pow(core, 3.0);

    // Gradien warna: campur warna utama & aksen berdasarkan kedalaman + acak.
    float depthMix = clamp((vDepth - 3.2) * 0.16, 0.0, 1.0);
    float mixFactor = uGradient * clamp(vRandom * 0.55 + depthMix, 0.0, 1.0);
    vec3 color = mix(uColorA, uColorB, mixFactor);

    // Variasi kecerahan antar partikel.
    color *= 0.62 + vRandom * 0.7;

    float alpha = (halo * 0.8 + core * 0.2) * uOpacity;
    gl_FragColor = vec4(color * (0.45 + halo * 0.95), alpha);
  }
`;

export class ParticleSystem {
  constructor({ count = 18000, colorA = '#4fd1ff', colorB = '#b46bff', size = 1 } = {}) {
    this.count = count;
    this.shapeId = SHAPES[0].id;
    this.morph = 1;
    this.morphDuration = 1.15;

    this.posA = new Float32Array(count * 3);
    this.posB = new Float32Array(count * 3);

    generateShape(this.shapeId, this.posA);
    this.posB.set(this.posA);

    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      const r = Math.random();
      // Bias ke partikel kecil, dengan sedikit partikel besar sebagai aksen.
      sizes[i] = 0.35 + Math.pow(r, 3) * 1.65;
      randoms[i] = Math.random();
    }

    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.posA, 3));
    this.geometry.setAttribute('aTarget', new THREE.BufferAttribute(this.posB, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);

    this.uniforms = {
      uTime: { value: 0 },
      uScale: { value: 1 },
      uSize: { value: size },
      // Skala point yang bergantung tinggi buffer (ukuran konsisten di semua DPR).
      uSizeScale: { value: window.innerHeight * 0.03 },
      uMorph: { value: 1 },
      uDrift: { value: 0.045 },
      uColorA: { value: new THREE.Color(colorA) },
      uColorB: { value: new THREE.Color(colorB) },
      uGradient: { value: 1 },
      uOpacity: { value: 1 }
    };

    this.material = new THREE.ShaderMaterial({
      uniforms: this.uniforms,
      vertexShader,
      fragmentShader,
      transparent: true,
      depthWrite: false,
      depthTest: true,
      blending: THREE.AdditiveBlending
    });

    this.points = new THREE.Points(this.geometry, this.material);
    this.points.frustumCulled = false;
  }

  /** Posisi efektif saat ini (dipakai sebagai titik awal morph berikutnya). */
  #bakeCurrent() {
    const stagger = 0.4;
    const m = this.morph;
    for (let i = 0; i < this.count; i++) {
      let t = (m - this.randoms[i] * stagger) / (1 - stagger);
      t = Math.min(1, Math.max(0, t));
      t = t * t * (3 - 2 * t);
      const i3 = i * 3;
      this.posA[i3] += (this.posB[i3] - this.posA[i3]) * t;
      this.posA[i3 + 1] += (this.posB[i3 + 1] - this.posA[i3 + 1]) * t;
      this.posA[i3 + 2] += (this.posB[i3 + 2] - this.posA[i3 + 2]) * t;
    }
  }

  get randoms() {
    return this.geometry.getAttribute('aRandom').array;
  }

  /** Ganti bentuk — selalu mulus, bahkan jika morph sebelumnya belum selesai. */
  setShape(shapeId, { animate = true } = {}) {
    if (!SHAPES.some((s) => s.id === shapeId)) return;
    this.shapeId = shapeId;

    if (!animate) {
      generateShape(shapeId, this.posA);
      this.posB.set(this.posA);
      this.morph = 1;
    } else {
      this.#bakeCurrent();
      generateShape(shapeId, this.posB);
      this.morph = 0;
    }

    this.geometry.getAttribute('position').needsUpdate = true;
    this.geometry.getAttribute('aTarget').needsUpdate = true;
    this.uniforms.uMorph.value = this.morph;
  }

  nextShape() {
    const index = SHAPES.findIndex((s) => s.id === this.shapeId);
    this.setShape(SHAPES[(index + 1) % SHAPES.length].id);
    return this.shapeId;
  }

  setCount(count) {
    if (count === this.count) return;
    this.count = count;

    this.posA = new Float32Array(count * 3);
    this.posB = new Float32Array(count * 3);
    generateShape(this.shapeId, this.posA);
    this.posB.set(this.posA);

    const sizes = new Float32Array(count);
    const randoms = new Float32Array(count);
    for (let i = 0; i < count; i++) {
      sizes[i] = 0.35 + Math.pow(Math.random(), 3) * 1.65;
      randoms[i] = Math.random();
    }

    this.geometry.dispose();
    this.geometry = new THREE.BufferGeometry();
    this.geometry.setAttribute('position', new THREE.BufferAttribute(this.posA, 3));
    this.geometry.setAttribute('aTarget', new THREE.BufferAttribute(this.posB, 3));
    this.geometry.setAttribute('aSize', new THREE.BufferAttribute(sizes, 1));
    this.geometry.setAttribute('aRandom', new THREE.BufferAttribute(randoms, 1));
    this.geometry.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 4);
    this.points.geometry = this.geometry;
    this.morph = 1;
    this.uniforms.uMorph.value = 1;
  }

  setColors(colorA, colorB) {
    this.uniforms.uColorA.value.set(colorA);
    this.uniforms.uColorB.value.set(colorB);
  }

  setGradient(enabled) {
    this.uniforms.uGradient.value = enabled ? 1 : 0;
  }

  setSize(size) {
    this.uniforms.uSize.value = size;
  }

  setOpacity(value) {
    this.uniforms.uOpacity.value = value;
  }

  /** Skala ekspansi global (digerakkan gestur tangan). */
  setScale(scale) {
    this.uniforms.uScale.value = scale;
  }

  /** Dipanggil saat resize: `drawingBufferHeight` (sudah termasuk pixel ratio). */
  setViewportScale(drawingBufferHeight) {
    this.uniforms.uSizeScale.value = drawingBufferHeight * 0.03;
  }

  update(dt, elapsed) {
    this.uniforms.uTime.value = elapsed;
    if (this.morph < 1) {
      this.morph = Math.min(1, this.morph + dt / this.morphDuration);
      this.uniforms.uMorph.value = this.morph;
    }
  }

  dispose() {
    this.geometry.dispose();
    this.material.dispose();
  }
}
