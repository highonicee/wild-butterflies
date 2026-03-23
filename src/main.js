/**
 * main.js
 *
 * Fixes applied:
 *  - total model count corrected to 13 (butterfly1–13).
 *  - waitForReady() fires immediately if butterfly.ready is already true.
 *  - State guard prevents double-clicks during DISSOLVING.
 *  - animate() call moved to after all setup to ensure the loop starts.
 */

import * as THREE from 'three';
import { initScene, CameraController } from './scene.js';
import { Butterfly, ButterflyParticles } from './butterfly.js';
import { UI } from './ui.js';

// ── State ─────────────────────────────────────────────────────────────────────
const State = {
  INTRO:      'INTRO',
  SUSPENSE:   'SUSPENSE',
  BUTTERFLY:  'BUTTERFLY',
  DISSOLVING: 'DISSOLVING',
};
let state     = State.INTRO;
let butterfly = null;
let particles = null;
let nameA = '', nameB = '';
let lastModelIndex = -1;

// ── Scene init ────────────────────────────────────────────────────────────────
const canvas = document.getElementById('canvas');
// preserveDrawingBuffer needed for screenshot
canvas.dataset.preserve = 'true';
const { scene, camera, renderer, ambientParticles, lights } = initScene(canvas);
const camCtrl = new CameraController(camera);

// ── UI ────────────────────────────────────────────────────────────────────────
// ── Background colour transition ────────────────────────────────────────────
// Lightest pink (#fff0f2) → darkest pink (#d63057)
// 13 steps, one per butterfly model index
// 30 pastel shades — one per butterfly model
const BG_PINKS = [
  '#fff9e6', // 1  pastel yellow
  '#e8f8e8', // 2  pastel green
  '#e6f4ff', // 3  pastel sky blue
  '#ede6ff', // 4  pastel lavender
  '#ffe6f2', // 5  pastel pink
  '#e6fff9', // 6  pastel turquoise
  '#fff3e6', // 7  pastel peach
  '#f0e6ff', // 8  pastel violet
  '#e6ffee', // 9  pastel mint
  '#fff0e6', // 10 pastel apricot
  '#e6f0ff', // 11 pastel periwinkle
  '#ffe6ee', // 12 pastel blush
  '#e6fffb', // 13 pastel aqua
  '#fef9e6', // 14 pastel cream
  '#eaf5e6', // 15 pastel sage
  '#e6eeff', // 16 pastel cornflower
  '#f9e6ff', // 17 pastel lilac
  '#ffe6f9', // 18 pastel rose
  '#e6fef5', // 19 pastel seafoam
  '#ffeee6', // 20 pastel salmon
  '#ece6ff', // 21 pastel wisteria
  '#e6ffe9', // 22 pastel honeydew
  '#fde6ff', // 23 pastel orchid
  '#e6f9ff', // 24 pastel powder blue
  '#fffbe6', // 25 pastel lemon
  '#e6fff4', // 26 pastel spearmint
  '#f5e6ff', // 27 pastel mauve
  '#ffe6fa', // 28 pastel petal
  '#e6f7ff', // 29 pastel ice
  '#ffece6', // 30 pastel coral
];

let currentBgIndex  = 0;
let targetBgIndex   = 0;
let bgLerpT         = 1; // 1 = done, starts idle

function hexToRgb(hex) {
  const r = parseInt(hex.slice(1,3),16);
  const g = parseInt(hex.slice(3,5),16);
  const b = parseInt(hex.slice(5,7),16);
  return [r,g,b];
}
function lerpHex(a, b, t) {
  const [r1,g1,b1] = hexToRgb(a);
  const [r2,g2,b2] = hexToRgb(b);
  const r = Math.round(r1 + (r2-r1)*t);
  const g = Math.round(g1 + (g2-g1)*t);
  const bl= Math.round(b1 + (b2-b1)*t);
  return `rgb(${r},${g},${bl})`;
}

function transitionBgToIndex(idx) {
  currentBgIndex = targetBgIndex;
  targetBgIndex  = idx % BG_PINKS.length;
  bgLerpT        = 0;
}

function updateBg(delta) {
  if (bgLerpT >= 1) return;
  bgLerpT = Math.min(1, bgLerpT + delta * 0.5); // ~2s transition
  const col = lerpHex(BG_PINKS[currentBgIndex], BG_PINKS[targetBgIndex], bgLerpT);
  document.body.style.background = col;
}

const ui = new UI({
  onSummon: (a, b) => {
    nameA = a;
    nameB = b;
    enterSuspense();
  },

  onRegenerate: () => {
    if (state !== State.BUTTERFLY) return;
    regenerate();
  },

  onBack: () => {
    if (butterfly) {
      butterfly.dissolve(() => { butterfly = null; });
    }
    if (particles) { particles.dispose(); particles = null; }
    camCtrl.reset();
    state = State.INTRO;
    lights.centerGlow.intensity = 0;
    transitionBgToIndex(0); // back to lightest pink
  },

  onSave: () => {
    saveScreenshot(nameA, nameB);
  },
});

// ── Transitions ───────────────────────────────────────────────────────────────
function enterSuspense() {
  state = State.SUSPENSE;
  ambientParticles.mat.color.setHex(0xffb3be);
  setTimeout(() => createButterfly(nameA, nameB, -1), 1200);
}

// ── Save screenshot with names overlay ───────────────────────────────────────
function saveScreenshot(a, b) {
  // We need to render one frame then grab the canvas
  renderer.render(scene, camera);

  // Create a composite canvas: bg colour + three.js canvas + names text
  const w = canvas.width;
  const h = canvas.height;
  const out = document.createElement('canvas');
  out.width  = w;
  out.height = h;
  const ctx2 = out.getContext('2d');

  // 1. Fill background colour
  ctx2.fillStyle = document.body.style.background || '#ffe4e8';
  ctx2.fillRect(0, 0, w, h);

  // 2. Draw the three.js canvas on top
  ctx2.drawImage(canvas, 0, 0);

  // 3. Names text — centred at the bottom third
  const label = `${a}  ·  ${b}`;
  ctx2.font = `${Math.round(h * 0.032)}px "Cormorant Garamond", Georgia, serif`;
  ctx2.textAlign = 'center';
  ctx2.fillStyle = 'rgba(80, 20, 35, 0.72)';
  ctx2.letterSpacing = '0.18em';
  ctx2.fillText(label, w / 2, h * 0.84);

  // 4. Tiny watermark
  ctx2.font = `${Math.round(h * 0.014)}px "Lato", sans-serif`;
  ctx2.fillStyle = 'rgba(80,20,35,0.35)';
  ctx2.fillText('Wild Butterflies', w / 2, h * 0.90);

  // 5. Download
  const link = document.createElement('a');
  link.download = `butterfly_${a}_${b}.png`.replace(/\s+/g,'_');
  link.href = out.toDataURL('image/png');
  link.click();
}

/**
 * @param {string}  a          — first name
 * @param {string}  b          — second name
 * @param {number}  forceIndex — -1 = derive from names; ≥0 = use this index
 */
function createButterfly(a, b, forceIndex = -1) {
  if (butterfly) { butterfly.dispose(); butterfly = null; }
  if (particles)  { particles.dispose();  particles  = null; }

  ui.showLoading();

  butterfly = new Butterfly(scene, a, b, forceIndex);
  lastModelIndex = butterfly.modelIndex;

  particles = new ButterflyParticles(
    scene,
    butterfly.targetPositions,
    butterfly.primaryHex,
    260
  );

  lights.centerGlow.color.setHex(butterfly.primaryHex);
  lights.centerGlow.intensity = 0;
  camCtrl.dollyIn();
  state = State.BUTTERFLY;

  waitForReady(butterfly, () => {
    ui.hideLoading();

    if (particles && !particles.done) {
      particles.targets = butterfly.targetPositions;
    }

    butterfly.startUnfold();
    ui.showButterflyScreen();
    transitionBgToIndex(butterfly.modelIndex);

    // Fade up centre glow
    let g = 0;
    const fadeGlow = () => {
      g += 0.016;
      lights.centerGlow.intensity = Math.min(g * 0.55, 0.55);
      if (g < 2.0) requestAnimationFrame(fadeGlow);
    };
    fadeGlow();
  });
}

/** Poll butterfly.ready every 80 ms; fire callback once true (max 15 s). */
function waitForReady(b, onReady) {
  // Already ready (model cached or procedural fallback)
  if (b.ready) { onReady(); return; }

  let elapsed = 0;
  const id = setInterval(() => {
    elapsed += 80;
    if (!b || !b.alive) { clearInterval(id); return; }
    if (b.ready || elapsed > 15000) {
      clearInterval(id);
      onReady();
    }
  }, 80);
}

/**
 * Dissolve current butterfly then load a DIFFERENT random model.
 */
function regenerate() {
  if (state !== State.BUTTERFLY || !butterfly) return;

  state = State.DISSOLVING;
  ui.showLoading();

  const btnRegen = document.getElementById('btn-regen');
  if (btnRegen) btnRegen.style.pointerEvents = 'none';

  butterfly.dissolve(() => {
    butterfly = null;
    lights.centerGlow.intensity = 0;

    // Pick a new model index, guaranteed different from the last one
    const total = 30; // butterfly1.glb … butterfly30.glb
    let newIndex;
    do {
      newIndex = Math.floor(Math.random() * total);
    } while (newIndex === lastModelIndex && total > 1);

    setTimeout(() => {
      if (btnRegen) btnRegen.style.pointerEvents = '';
      createButterfly(nameA, nameB, newIndex);
    }, 300);
  });
}

// ── Render loop ───────────────────────────────────────────────────────────────
const clock = new THREE.Clock();
let swirlStrength = 0;

function animate() {
  requestAnimationFrame(animate);

  const delta   = Math.min(clock.getDelta(), 0.05);
  const elapsed = clock.elapsedTime;

  const swirling = state === State.SUSPENSE;
  swirlStrength  = swirling
    ? Math.min(swirlStrength + delta * 0.8, 2.0)
    : Math.max(swirlStrength - delta * 1.5, 0);

  ambientParticles.update(elapsed, swirling, swirlStrength);
  updateBg(delta);

  if (butterfly)                    butterfly.update(delta);
  if (particles && !particles.done) particles.update(delta);

  camCtrl.update(delta);

  renderer.render(scene, camera);
}

// Start the loop
animate();