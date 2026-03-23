/**
 * butterfly.js
 *
 * Fixes applied:
 *  - MODEL_FILES trimmed to exactly the 13 numbered files (butterfly1–13).
 *  - Front-facing orientation corrected (wings face camera, not sideways).
 *  - Slow, elegant wing flapping (sine wave, no cartoonish speed).
 *  - Random model selection works correctly; regenerate always picks a new one.
 *  - _buildProceduralFallback() uses CylinderGeometry (compatible with all r3f versions).
 */

import * as THREE from 'three';
import { GLTFLoader } from 'three/examples/jsm/loaders/GLTFLoader.js';

// ── All 30 butterfly models in /public/models/ ───────────────────────────────
const MODEL_FILES = [
  'butterfly1.glb',  'butterfly2.glb',  'butterfly3.glb',
  'butterfly4.glb',  'butterfly5.glb',  'butterfly6.glb',
  'butterfly7.glb',  'butterfly8.glb',  'butterfly9.glb',
  'butterfly10.glb', 'butterfly11.glb', 'butterfly12.glb',
  'butterfly13.glb', 'butterfly14.glb', 'butterfly15.glb',
  'butterfly16.glb', 'butterfly17.glb', 'butterfly18.glb',
  'butterfly19.glb', 'butterfly20.glb', 'butterfly21.glb',
  'butterfly22.glb', 'butterfly23.glb', 'butterfly24.glb',
  'butterfly25.glb', 'butterfly26.glb', 'butterfly27.glb',
  'butterfly28.glb', 'butterfly29.glb', 'butterfly30.glb',
];

// ── Helpers ───────────────────────────────────────────────────────────────────
function hashString(str) {
  let h = 5381;
  for (let i = 0; i < str.length; i++)
    h = (((h << 5) + h) ^ str.charCodeAt(i)) >>> 0;
  return h;
}

function createRng(seed) {
  let s = (seed >>> 0) || 1;
  return () => {
    s += 0x6d2b79f5;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t ^= t + Math.imul(t ^ (t >>> 7), 61 | t);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// ── Particle burst ────────────────────────────────────────────────────────────
export class ButterflyParticles {
  constructor(scene, targetPositions, color, count = 260) {
    this.scene   = scene;
    this.count   = count;
    this.done    = false;
    this.elapsed = 0;

    const positions = new Float32Array(count * 3);
    this.targets    = new Float32Array(count * 3);

    for (let i = 0; i < count; i++) {
      const s = 5;
      positions[i*3+0] = (Math.random() - 0.5) * s;
      positions[i*3+1] = (Math.random() - 0.5) * s;
      positions[i*3+2] = (Math.random() - 0.5) * s * 0.5;
    }
    const tLen = targetPositions.length / 3;
    for (let i = 0; i < count; i++) {
      const ti = Math.floor(Math.random() * tLen);
      this.targets[i*3+0] = targetPositions[ti*3+0];
      this.targets[i*3+1] = targetPositions[ti*3+1];
      this.targets[i*3+2] = targetPositions[ti*3+2];
    }

    const geo    = new THREE.BufferGeometry();
    this.posAttr = new THREE.BufferAttribute(positions, 3);
    geo.setAttribute('position', this.posAttr);
    this.mat = new THREE.PointsMaterial({
      color, size: 0.045, transparent: true, opacity: 1.0,
      sizeAttenuation: true, blending: THREE.AdditiveBlending, depthWrite: false,
    });
    this.points = new THREE.Points(geo, this.mat);
    scene.add(this.points);
  }

  update(delta) {
    if (this.done) return;
    this.elapsed += delta;
    const t   = Math.min(this.elapsed / 2.0, 1.0);
    const pos = this.posAttr.array;
    for (let i = 0; i < this.count; i++) {
      pos[i*3+0] += (this.targets[i*3+0] - pos[i*3+0]) * delta * 3.2;
      pos[i*3+1] += (this.targets[i*3+1] - pos[i*3+1]) * delta * 3.2;
      pos[i*3+2] += (this.targets[i*3+2] - pos[i*3+2]) * delta * 3.2;
    }
    this.posAttr.needsUpdate = true;
    if (t > 0.82) this.mat.opacity = 1 - (t - 0.82) / 0.18;
    if (t >= 1.0) { this.dispose(); this.done = true; }
  }

  dispose() {
    this.scene.remove(this.points);
    this.points.geometry.dispose();
    this.mat.dispose();
  }
}

// ── Butterfly ─────────────────────────────────────────────────────────────────
export class Butterfly {
  /**
   * @param {THREE.Scene} scene
   * @param {string} nameA
   * @param {string} nameB
   * @param {number} [forceIndex]  — -1 = derive from names; ≥0 = explicit index
   */
  constructor(scene, nameA, nameB, forceIndex = -1) {
    this.scene      = scene;
    this.group      = new THREE.Group();
    this.time       = 0;
    this.alive      = true;
    this.ready      = false;
    this.mixer      = null;
    this.hasClips   = false;
    this.wingMeshes = [];
    this.leftPivot  = null;
    this.rightPivot = null;
    this.isFallback = false;
    this.opacityProgress = 0;
    this.unfoldProgress  = 0;
    this.unfolding       = false;

    const seed  = hashString((nameA + nameB).toLowerCase());
    this.rng    = createRng(seed);
    this._deriveColor(this.rng);

    // ── Pick model index ────────────────────────────────────────────────────
    // forceIndex = -1 → deterministic from names (first summon)
    // forceIndex ≥  0 → explicit (regenerate always passes a different one)
    this.modelIndex = forceIndex >= 0
      ? forceIndex % MODEL_FILES.length
      : Math.floor(this.rng() * MODEL_FILES.length);

    this.group.visible = false;
    scene.add(this.group);

    this.targetPositions = this._defaultTargets(120);
    this._load();
  }

  // ── Colour from names ───────────────────────────────────────────────────────
  _deriveColor(rng) {
    const hue        = rng() * 360;
    this.tintColor   = new THREE.Color().setHSL(hue / 360, 0.45 + rng() * 0.35, 0.50 + rng() * 0.22);
    this.primaryHex  = this.tintColor.getHex();
    this.emissiveCol = new THREE.Color().setHSL(hue / 360, 0.35, 0.10);
  }

  _defaultTargets(n) {
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const side = Math.random() > 0.5 ? 1 : -1;
      pts[i*3+0] = side * (0.1 + Math.random() * 1.8);
      pts[i*3+1] = (Math.random() - 0.4) * 1.6;
      pts[i*3+2] = (Math.random() - 0.5) * 0.3;
    }
    return pts;
  }

  // ── Loading chain ────────────────────────────────────────────────────────────
  _load() {
    const loader = new GLTFLoader();
    // Start with the chosen model, fall through to others if it fails
    const ordered = [
      MODEL_FILES[this.modelIndex],
      ...MODEL_FILES.filter((_, i) => i !== this.modelIndex),
    ];
    this._tryNext(loader, ordered, 0);
  }

  _tryNext(loader, files, idx) {
    if (idx >= files.length) {
      console.warn('All butterfly GLBs failed — using procedural fallback.');
      this._buildProceduralFallback();
      return;
    }
    // Store so _onLoaded can skip bad models
    this._loader = loader;
    this._files  = files;
    this._idx    = idx;
    loader.load(
      `/models/${files[idx]}`,
      (gltf) => {
        console.log(`Loaded: /models/${files[idx]}`);
        this._onLoaded(gltf);
      },
      undefined,
      (err) => {
        console.warn(`Failed /models/${files[idx]}:`, err);
        this._tryNext(loader, files, idx + 1);
      }
    );
  }

  // ── Model loaded ─────────────────────────────────────────────────────────────
  _onLoaded(gltf) {
    if (!this.alive) return;

    const currentFile = this._files[this._idx];
    const root = gltf.scene;

    // 1. Initial scale to normalise before checks
    const box0 = new THREE.Box3().setFromObject(root);
    const sz0  = new THREE.Vector3();
    box0.getSize(sz0);
    const maxDim0 = Math.max(sz0.x, sz0.y, sz0.z) || 1;
    root.scale.setScalar(2.4 / maxDim0);
    root.updateMatrixWorld(true);

    // 2. Try all 8 orientations first, then validate.
    //    We test AFTER orienting because a sideways model might pass the
    //    raw dimension check but still look wrong.
    const candidates = [
      [Math.PI / 2,   0,       0],
      [-Math.PI / 2,  0,       0],
      [Math.PI / 2,   Math.PI, 0],
      [-Math.PI / 2,  Math.PI, 0],
      [0,             0,       0],
      [Math.PI,       0,       0],
      [0,             Math.PI, 0],
      [Math.PI,       Math.PI, 0],
    ];

    let bestRot   = candidates[0];
    let bestScore = -Infinity;

    for (const rot of candidates) {
      root.rotation.set(rot[0], rot[1], rot[2]);
      root.updateMatrixWorld(true);
      const b         = new THREE.Box3().setFromObject(root);
      const wingspan  = b.max.x - b.min.x;  // wide = facing camera
      const height    = b.max.y - b.min.y;
      const depth     = b.max.z - b.min.z;
      // Butterfly facing camera: wingspan >> depth, wingspan >= height
      // Score: reward wide wingspan, penalise if taller than wide (sideways),
      //        heavily penalise upside-down (max.y negative after centering)
      const landscapeBonus = wingspan > height ? wingspan * 0.6 : -wingspan * 0.8;
      const depthPenalty   = depth > wingspan  ? -depth  * 0.5 : 0;
      const uprightBias    = b.max.y > 0       ? b.max.y * 1.2 : b.max.y * 3.0;
      const score = wingspan + landscapeBonus + depthPenalty + uprightBias;
      if (score > bestScore) { bestScore = score; bestRot = rot; }
    }

    root.rotation.set(bestRot[0], bestRot[1], bestRot[2]);
    root.updateMatrixWorld(true);

    // 3. Re-centre after rotation
    const centrePost = new THREE.Vector3();
    new THREE.Box3().setFromObject(root).getCenter(centrePost);
    root.position.sub(centrePost);
    root.updateMatrixWorld(true);

    // 4. Sanity check AFTER orienting — reject non-butterfly models.
    //    Check the best orientation: wingspan should be >= height (landscape),
    //    and the model should have real 3D depth (not a flat card).
    {
      const ck   = new THREE.Box3().setFromObject(root);
      const ckSz = new THREE.Vector3();
      ck.getSize(ckSz);
      const minDim   = Math.min(ckSz.x, ckSz.y, ckSz.z);
      const maxDim   = Math.max(ckSz.x, ckSz.y, ckSz.z);
      const midDim   = ckSz.x + ckSz.y + ckSz.z - minDim - maxDim;
      // Reject if: completely flat (one axis < 1.5% of max)
      //         OR: extremely thin & long like a needle/fish (mid < 8% of max)
      const isFlat   = minDim / maxDim < 0.015;
      const isNeedle = midDim / maxDim < 0.08;
      if (isFlat || isNeedle) {
        console.warn('⚠ Skipping non-butterfly model: ' + currentFile + ' (flat/needle shape). Delete this file from /public/models/.');
        this._tryNext(this._loader, this._files, this._idx + 1);
        return;
      }
      console.log('✓ ' + currentFile + ' looks good (wingspan ratio: ' + (ckSz.x/ckSz.y).toFixed(2) + ')');
    }

    this.group.add(root);
    this.modelRoot = root;

    // 4. Tint materials; start fully transparent (fade in on startUnfold)
    root.traverse((child) => {
      if (!child.isMesh) return;
      child.castShadow = true;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => {
        if (!m) return;
        if (m.color) m.color.lerp(this.tintColor, 0.18);
        m.emissive          = this.emissiveCol.clone();
        m.emissiveIntensity = 0.30;
        m.transparent       = true;
        m.opacity           = 0;
        m.needsUpdate       = true;
      });
    });

    // 5. Detect wings and build pivot groups for manual flapping
    this._detectWings(root);

    // 6. Built-in animation clips — disabled (no wing movement wanted)
    // If clips exist we leave mixer null so nothing plays.
    this.hasClips = false;

    // 7. Sample particle targets from actual model bounds
    this.targetPositions = this._sampleBox(root, 120);

    this.group.visible = false;
    this.ready = true;
  }

  // ── Wing detection by name, then spatial X split ─────────────────────────────
  // IMPORTANT: we only re-parent confirmed WING meshes into pivots.
  // Non-wing meshes (body, antennae, etc.) stay in the root so they don't float.
  _detectWings(root) {
    this.wingMeshes = [];
    const wingHints = ['wing', 'fore', 'hind', 'aile', 'flap', 'petal'];
    const bodyHints = ['body', 'torso', 'abdomen', 'thorax', 'head', 'antenna', 'eye'];

    // First pass: find meshes with wing-like names
    root.traverse(child => {
      if (!child.isMesh) return;
      const n = (child.name || '').toLowerCase();
      const isBody = bodyHints.some(h => n.includes(h));
      if (isBody) return; // never re-parent body parts
      if (wingHints.some(h => n.includes(h))) this.wingMeshes.push(child);
    });

    // Second pass: if no named wings found, use spatial heuristic.
    // Collect all meshes, exclude the single most-centred one (likely body),
    // use the rest as wings.
    if (this.wingMeshes.length === 0) {
      const allMeshes = [];
      root.traverse(c => { if (c.isMesh) allMeshes.push(c); });

      if (allMeshes.length <= 1) {
        // Only one mesh — use it as a wing anyway
        this.wingMeshes = [...allMeshes];
      } else {
        // Find the mesh whose world X position is closest to 0 (= body/spine)
        const withAbs = allMeshes.map(m => {
          const wp = new THREE.Vector3();
          m.getWorldPosition(wp);
          return { mesh: m, absX: Math.abs(wp.x) };
        });
        withAbs.sort((a, b) => a.absX - b.absX);
        // Keep the most-central mesh in root (body); re-parent the rest
        this.wingMeshes = withAbs.slice(1).map(d => d.mesh);
      }
    }

    // Build pivot groups
    this.leftPivot  = new THREE.Group();
    this.rightPivot = new THREE.Group();
    root.add(this.leftPivot, this.rightPivot);

    if (this.wingMeshes.length === 0) return;

    // Split wings into left (negative X) and right (positive X) by world position
    const withX = this.wingMeshes.map(m => {
      const wp = new THREE.Vector3();
      m.getWorldPosition(wp);
      return { mesh: m, x: wp.x };
    });

    withX.forEach(({ mesh, x }) => {
      (x <= 0 ? this.leftPivot : this.rightPivot).attach(mesh);
    });

    // If all wings ended up on one side, split by median instead
    if (this.leftPivot.children.length === 0 || this.rightPivot.children.length === 0) {
      // Re-attach everything, then split by median X
      const all = [...this.leftPivot.children, ...this.rightPivot.children];
      all.forEach(m => root.attach(m));
      this.leftPivot  = new THREE.Group();
      this.rightPivot = new THREE.Group();
      root.add(this.leftPivot, this.rightPivot);
      const sorted = this.wingMeshes.map(m => {
        const wp = new THREE.Vector3();
        m.getWorldPosition(wp);
        return { mesh: m, x: wp.x };
      }).sort((a, b) => a.x - b.x);
      const half = Math.ceil(sorted.length / 2);
      sorted.forEach(({ mesh }, i) => {
        (i < half ? this.leftPivot : this.rightPivot).attach(mesh);
      });
    }
  }

  _sampleBox(obj, n) {
    const box = new THREE.Box3().setFromObject(obj);
    const pts = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      pts[i*3+0] = box.min.x + Math.random() * (box.max.x - box.min.x);
      pts[i*3+1] = box.min.y + Math.random() * (box.max.y - box.min.y);
      pts[i*3+2] = box.min.z + Math.random() * (box.max.z - box.min.z);
    }
    return pts;
  }

  _setOpacity(v) {
    if (!this.modelRoot && !this.isFallback) return;
    const root = this.isFallback ? this.group : this.modelRoot;
    root.traverse(child => {
      if (!child.isMesh) return;
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => { if (m) { m.transparent = true; m.opacity = v; } });
    });
  }

  // ── Procedural fallback (no CapsuleGeometry — use Cylinder + Sphere) ─────────
  _buildProceduralFallback() {
    if (!this.alive) return;
    this.isFallback = true;

    const makeWing = (flipX) => {
      const shape = new THREE.Shape();
      shape.moveTo(0, 0);
      shape.bezierCurveTo( 0.2,  1.2,  1.0,  1.6,  1.8,  1.2);
      shape.bezierCurveTo( 2.2,  0.6,  2.0, -0.4,  1.2, -0.8);
      shape.bezierCurveTo( 0.5, -0.4,  0.1, -0.1,  0,    0);
      const mesh = new THREE.Mesh(
        new THREE.ShapeGeometry(shape, 12),
        new THREE.MeshStandardMaterial({
          color: this.tintColor, emissive: this.emissiveCol,
          emissiveIntensity: 0.4, transparent: true, opacity: 0.0,
          side: THREE.DoubleSide, roughness: 0.3,
        })
      );
      if (flipX) mesh.scale.x = -1;
      return mesh;
    };

    this.leftPivot  = new THREE.Group();
    this.rightPivot = new THREE.Group();
    this.leftPivot.add(makeWing(true));
    this.rightPivot.add(makeWing(false));
    this.leftPivot.rotation.y  = -Math.PI * 0.85;
    this.rightPivot.rotation.y =  Math.PI * 0.85;

    // Body: cylinder (works across all Three.js versions)
    const body = new THREE.Mesh(
      new THREE.CylinderGeometry(0.06, 0.04, 1.1, 10),
      new THREE.MeshStandardMaterial({ color: 0x2a1530, roughness: 0.7 })
    );
    this.group.add(this.leftPivot, this.rightPivot, body);
    this.group.scale.setScalar(0.9);
    this.ready = true;
    this.group.visible = false;
  }

  // ── Called by main.js once loading is confirmed ───────────────────────────────
  startUnfold() {
    this.unfolding       = true;
    this.unfoldProgress  = 0;
    this.opacityProgress = 0;
    this.group.visible   = true;
  }

  // ── Per-frame update ─────────────────────────────────────────────────────────
  update(delta) {
    if (!this.alive || !this.ready) return;
    this.time += delta;
    const t = this.time;

    if (this.mixer) this.mixer.update(delta);
    if (!this.unfolding) return;

    // Fade in
    if (this.opacityProgress < 1) {
      this.opacityProgress = Math.min(1, this.opacityProgress + delta * 0.45);
      this._setOpacity(this.opacityProgress);
    }

    // Procedural fallback: just unfold, no flap
    if (this.isFallback) {
      if (this.unfoldProgress < 1) {
        this.unfoldProgress = Math.min(1, this.unfoldProgress + delta * 0.38);
        const a = (1 - this._easeOutElastic(this.unfoldProgress)) * Math.PI * 0.85;
        this.leftPivot.rotation.y  = -a;
        this.rightPivot.rotation.y =  a;
      }
      // No flapping after unfold
    }

    // No wing flutter for GLB models either — wings stay still

    // Gentle floating drift — centred on y=0, very subtle
    this.group.position.y = Math.sin(t * 0.48) * 0.08;
    this.group.position.x = Math.sin(t * 0.27) * 0.04;
    this.group.rotation.z = Math.sin(t * 0.31) * 0.015;
  }

  _easeOutElastic(t) {
    if (t === 0) return 0;
    if (t === 1) return 1;
    return Math.pow(2, -10 * t) * Math.sin((t * 10 - 0.75) * (2 * Math.PI) / 4.5) + 1;
  }

  // ── Dissolve out then dispose ─────────────────────────────────────────────────
  dissolve(onDone) {
    this.alive = false;
    if (this.mixer) this.mixer.stopAllAction();
    const startOp = this.opacityProgress || 1;
    const t0 = performance.now();
    const tick = () => {
      const p = Math.min((performance.now() - t0) / 900, 1);
      this._setOpacity(startOp * (1 - p));
      this.group.scale.setScalar(Math.max(0.001, 1 - p * 0.22));
      p < 1 ? requestAnimationFrame(tick) : (this.dispose(), onDone?.());
    };
    requestAnimationFrame(tick);
  }

  dispose() {
    if (this.mixer) this.mixer.stopAllAction();
    this.scene.remove(this.group);
    this.group.traverse(child => {
      if (!child.isMesh) return;
      child.geometry?.dispose();
      const mats = Array.isArray(child.material) ? child.material : [child.material];
      mats.forEach(m => m?.dispose());
    });
  }
}