/**
 * scene.js
 *
 * Fixes applied:
 *  - Removed reference to undefined `under` light in setupLighting return value.
 *  - Ambient particles use soft rose/pink colour (visible on light background).
 *  - Bloom post-processing removed (was breaking transparency on light bg).
 *  - Renderer alpha:true so CSS gradient body background shows through.
 */

import * as THREE from 'three';

export function initScene(canvas) {
  // ── Renderer — transparent so CSS gradient on <body> shows through ─────────
  const renderer = new THREE.WebGLRenderer({
    canvas,
    antialias: true,
    alpha: true,
    preserveDrawingBuffer: true, // required for screenshot / save-as-image
  });
  renderer.setClearColor(0x000000, 0); // fully transparent
  renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.toneMapping         = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.10;
  renderer.outputColorSpace    = THREE.SRGBColorSpace;

  // ── Scene ─────────────────────────────────────────────────────────────────
  const scene = new THREE.Scene();
  // No scene.background — body CSS gradient shows through alpha canvas

  // ── Camera ────────────────────────────────────────────────────────────────
  const camera = new THREE.PerspectiveCamera(
    48,
    window.innerWidth / window.innerHeight,
    0.1,
    200
  );
  camera.position.set(0, 0, 7);
  camera.lookAt(0, 0, 0);

  // ── Ambient particles ─────────────────────────────────────────────────────
  const ambientParticles = createAmbientParticles(scene);

  // ── Lighting ──────────────────────────────────────────────────────────────
  const lights = setupLighting(scene);

  // ── Resize ────────────────────────────────────────────────────────────────
  window.addEventListener('resize', () => {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
  });

  return { scene, camera, renderer, ambientParticles, lights };
}

// ── Lighting ──────────────────────────────────────────────────────────────────
function setupLighting(scene) {
  // Soft daylight hemisphere
  const hemi = new THREE.HemisphereLight(0xffffff, 0xffe4ec, 1.8);
  scene.add(hemi);

  // Key light
  const key = new THREE.DirectionalLight(0xffffff, 2.2);
  key.position.set(-3, 4, 5);
  scene.add(key);

  // Warm fill from front-right
  const fill = new THREE.DirectionalLight(0xffc0cb, 1.4);
  fill.position.set(4, -1, 4);
  scene.add(fill);

  // Gentle rim/back glow
  const rim = new THREE.PointLight(0xff9bb0, 1.6, 16);
  rim.position.set(0, 1, -4);
  scene.add(rim);

  // Centre glow — intensity driven by butterfly colour in main.js
  const centerGlow = new THREE.PointLight(0xffffff, 0.0, 9);
  centerGlow.position.set(0, 0.2, 1.5);
  scene.add(centerGlow);

  // ✅ Only return lights that actually exist — no more `under` reference
  return { hemi, key, fill, rim, centerGlow };
}

// ── Ambient particles ─────────────────────────────────────────────────────────
function createAmbientParticles(scene) {
  const COUNT     = 320;
  const positions = new Float32Array(COUNT * 3);
  const speeds    = new Float32Array(COUNT);
  const phases    = new Float32Array(COUNT);

  for (let i = 0; i < COUNT; i++) {
    positions[i*3+0] = (Math.random() - 0.5) * 22;
    positions[i*3+1] = (Math.random() - 0.5) * 14;
    positions[i*3+2] = (Math.random() - 0.5) * 10 - 2;
    speeds[i] = 0.04 + Math.random() * 0.08;
    phases[i] = Math.random() * Math.PI * 2;
  }

  const geo     = new THREE.BufferGeometry();
  const posAttr = new THREE.BufferAttribute(positions.slice(), 3);
  geo.setAttribute('position', posAttr);

  const mat = new THREE.PointsMaterial({
    color: 0xff8fa3,       // soft rose — visible on light bg, not harsh
    size: 0.028,
    transparent: true,
    opacity: 0.28,
    sizeAttenuation: true,
    blending: THREE.AdditiveBlending,
    depthWrite: false,
  });

  const points = new THREE.Points(geo, mat);
  scene.add(points);

  function update(time, swirl = false, swirlStrength = 0) {
    const arr = posAttr.array;
    for (let i = 0; i < COUNT; i++) {
      const ph = phases[i];
      const sp = speeds[i];
      if (swirl) {
        const x = arr[i*3+0], y = arr[i*3+1];
        const dist = Math.sqrt(x*x + y*y);
        const ang  = Math.atan2(y, x) + sp * swirlStrength;
        const nd   = dist * (1 - sp * swirlStrength * 0.04);
        arr[i*3+0] = Math.cos(ang) * nd;
        arr[i*3+1] = Math.sin(ang) * nd;
        arr[i*3+2] += sp * 0.3;
      } else {
        arr[i*3+1] += sp * 0.008;
        arr[i*3+0] += Math.sin(time * sp + ph) * 0.003;
        if (arr[i*3+1] > 8) {
          arr[i*3+1] = -8;
          arr[i*3+0] = (Math.random() - 0.5) * 22;
        }
      }
    }
    posAttr.needsUpdate = true;
  }

  return { points, mat, update };
}

// ── Camera controller ─────────────────────────────────────────────────────────
export class CameraController {
  constructor(camera) {
    this.camera   = camera;
    this.targetZ  = 7;
    this.currentZ = 7;
    this.time     = 0;
    this.mode     = 'idle';
  }

  dollyIn() { this.mode = 'dolly'; this.targetZ = 5.5; }
  reset()   { this.mode = 'idle';  this.targetZ = 7;   }

  update(delta) {
    this.time += delta;
    this.currentZ         += (this.targetZ - this.currentZ) * delta * 0.75;
    this.camera.position.z = this.currentZ;

    if (this.mode === 'dolly') {
      this.camera.position.x = Math.sin(this.time * 0.18) * 0.12;
      this.camera.position.y = Math.sin(this.time * 0.13) * 0.08;
    } else {
      this.camera.position.x += (0 - this.camera.position.x) * delta * 0.5;
      this.camera.position.y += (0 - this.camera.position.y) * delta * 0.5;
    }
    this.camera.lookAt(0, 0, 0);
  }
}