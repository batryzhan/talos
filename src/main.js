import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';

// World is Z-up, metres. Robot forward = +X, left = +Y (right-handed).
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// ───────────────────────── configuration ─────────────────────────
const CFG = {
  maxWheelSpeed: 1.8,      // m/s at the rim at full command
  wheelAccel: 7.0,         // m/s² wheel slew rate (traction limit)
  slowGain: 0.35,          // Shift multiplier
  roller: 0.009,           // roller radius for visual spin (m)
  halfX: 0.216, halfY: 0.2266, // chassis footprint half extents (from CAD)
  field: 3.6576,           // 12 ft square field
  start: { x: 0, y: 0, h: 0 },
};

// ───────────────────────── renderer / scene ─────────────────────────
const canvas = document.getElementById('view');
const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, powerPreference: 'high-performance' });
renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
renderer.setSize(innerWidth, innerHeight);
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = 1.05;

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x0f141b);
scene.fog = new THREE.Fog(0x0f141b, 8, 28);
const pmrem = new THREE.PMREMGenerator(renderer);
scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
scene.environmentRotation = new THREE.Euler(Math.PI / 2, 0, 0); // env is Y-up → our Z-up
scene.environmentIntensity = 0.55;

const camera = new THREE.PerspectiveCamera(50, innerWidth / innerHeight, 0.02, 80);
camera.up.set(0, 0, 1);
camera.position.set(-0.85, -1.0, 0.7);

const controls = new OrbitControls(camera, canvas);
controls.enableDamping = true;
controls.dampingFactor = 0.08;
controls.minDistance = 0.45;
controls.maxDistance = 9;
controls.maxPolarAngle = Math.PI / 2 - 0.02; // don't go under the floor
controls.mouseButtons = { LEFT: THREE.MOUSE.ROTATE, MIDDLE: THREE.MOUSE.DOLLY, RIGHT: THREE.MOUSE.ROTATE };

const sun = new THREE.DirectionalLight(0xfff1dd, 2.6);
sun.castShadow = true;
sun.shadow.mapSize.set(2048, 2048);
const sc = sun.shadow.camera; sc.left = -1.2; sc.right = 1.2; sc.top = 1.2; sc.bottom = -1.2; sc.near = 0.5; sc.far = 14;
sun.shadow.bias = -0.0004; sun.shadow.normalBias = 0.01;
scene.add(sun, sun.target);
scene.add(new THREE.HemisphereLight(0xbcd2ff, 0x2a2f38, 0.5));
const SUN_OFFSET = new THREE.Vector3(2.5, -1.8, 5);

// ───────────────────────── arena ─────────────────────────
const colliders = []; // axis-aligned boxes {x, y, hx, hy}

function makeFloorTexture() {
  const S = 2048, c = document.createElement('canvas'); c.width = c.height = S;
  const g = c.getContext('2d'), n = 6, t = S / n;
  for (let i = 0; i < n; i++) for (let j = 0; j < n; j++) {
    g.fillStyle = (i + j) % 2 ? '#575d66' : '#5f656f';
    g.fillRect(i * t, j * t, t, t);
    // foam grain
    for (let k = 0; k < 500; k++) { g.fillStyle = `rgba(${Math.random() < .5 ? '255,255,255' : '0,0,0'},${Math.random() * .05})`; g.fillRect(i * t + Math.random() * t, j * t + Math.random() * t, 2, 2); }
  }
  g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = 3;
  for (let i = 0; i <= n; i++) { g.beginPath(); g.moveTo(i * t, 0); g.lineTo(i * t, S); g.stroke(); g.beginPath(); g.moveTo(0, i * t); g.lineTo(S, i * t); g.stroke(); }
  // alliance tape lines
  g.lineWidth = 14;
  g.strokeStyle = '#d23b3b'; g.beginPath(); g.moveTo(0, t * 1); g.lineTo(S, t * 1); g.stroke();
  g.strokeStyle = '#3b6fd2'; g.beginPath(); g.moveTo(0, t * 5); g.lineTo(S, t * 5); g.stroke();
  g.strokeStyle = 'rgba(255,255,255,.55)'; g.lineWidth = 6; g.setLineDash([26, 22]);
  g.beginPath(); g.moveTo(S / 2, 0); g.lineTo(S / 2, S); g.stroke();
  const tex = new THREE.CanvasTexture(c);
  tex.colorSpace = THREE.SRGBColorSpace;
  tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  return tex;
}

const ground = new THREE.Mesh(new THREE.PlaneGeometry(80, 80), new THREE.MeshStandardMaterial({ color: 0x1b2129, roughness: 1 }));
ground.position.z = -0.002; ground.receiveShadow = true; scene.add(ground);
const floor = new THREE.Mesh(new THREE.PlaneGeometry(CFG.field, CFG.field), new THREE.MeshStandardMaterial({ map: makeFloorTexture(), roughness: 0.92 }));
floor.receiveShadow = true; scene.add(floor);

function addBox(x, y, sx, sy, h, color, opts = {}) {
  const m = new THREE.Mesh(new THREE.BoxGeometry(sx, sy, h), new THREE.MeshStandardMaterial({ color, roughness: opts.rough ?? 0.6, metalness: opts.metal ?? 0.05, transparent: !!opts.alpha, opacity: opts.alpha ?? 1 }));
  m.position.set(x, y, h / 2); m.castShadow = true; m.receiveShadow = true; scene.add(m);
  colliders.push({ x, y, hx: sx / 2, hy: sy / 2 });
  return m;
}
{ // perimeter walls
  const f = CFG.field / 2, th = 0.06, h = 0.32, o = f + th / 2;
  addBox(0, o, CFG.field + th * 2, th, h, 0x3a4350);
  addBox(0, -o, CFG.field + th * 2, th, h, 0x3a4350);
  addBox(o, 0, th, CFG.field, h, 0x3a4350);
  addBox(-o, 0, th, CFG.field, h, 0x3a4350);
}
addBox(1.0, 0.7, 0.4, 0.4, 0.3, 0xe8892b);
addBox(-0.9, -0.9, 0.7, 0.3, 0.2, 0x2f7de1);
addBox(0.5, -1.1, 0.3, 0.3, 0.3, 0xd64545);
addBox(-1.1, 0.9, 0.25, 0.25, 0.6, 0x7a58d6);
addBox(1.3, -0.2, 0.15, 0.9, 0.12, 0x3fb97a);

// ───────────────────────── robot model ─────────────────────────
const robot = new THREE.Group(); // pose root: footprint centre on the floor
scene.add(robot);
const wheels = []; // {id, node, R, k, x, y, theta, u, rollers[]}

const loadbar = document.getElementById('loadbar');
const loadtext = document.getElementById('loadtext');
const gltf = await new Promise((res, rej) => new GLTFLoader().load('/robot.glb', res, e => {
  if (e.total) { const p = e.loaded / e.total; loadbar.style.width = (p * 100).toFixed(0) + '%'; loadtext.textContent = `Загрузка модели… ${(e.loaded / 1e6).toFixed(1)} / ${(e.total / 1e6).toFixed(1)} МБ`; }
}, rej));

const model = gltf.scene;
model.traverse(o => { if (o.isMesh) { o.castShadow = true; o.receiveShadow = true; } });
robot.add(model);
const wheelNodes = []; model.traverse(o => { if (o.name.startsWith('wheel_')) wheelNodes.push(o); });
wheelNodes.forEach(n => {
  if (!n.name.startsWith('wheel_')) return;
  const ex = n.userData;
  const ax = Math.sign(ex.axisXY[0]) * Math.SQRT1_2, ay = Math.SQRT1_2; // CAD rollers are exactly 45°
  const w = {
    id: ex.id, node: n, R: ex.radius,
    k: ay / ax,                           // contact-roller axis slope → mecanum constraint
    a: new THREE.Vector2(ax, ay),
    f: new THREE.Vector2(-ay, ax),        // free rolling direction of the contact roller
    x: n.position.x, y: n.position.y,
    theta: 0, u: 0, rollers: [],
  };
  n.children.forEach(r => {
    if (!r.name.startsWith('roller_')) return;
    const axis = new THREE.Vector3(...r.userData.axis); if (axis.y < 0) axis.negate();
    w.rollers.push({ node: r, axis, phi0: Math.atan2(r.position.z, r.position.x), angle: 0 });
  });
  wheels.push(w);
});
const ORDER = ['FL', 'FR', 'RL', 'RR'];
wheels.sort((p, q) => ORDER.indexOf(p.id) - ORDER.indexOf(q.id));
console.log('wheels', wheels.map(w => `${w.id} k=${w.k.toFixed(3)} rollers=${w.rollers.length}`).join(' | '));

// mecanum kinematics.  wheel rim speed u = vx − ω·y + k·(vy + ω·x)
const IK = wheels.map(w => [1, w.k, -w.y + w.k * w.x]);
function inv3(m) {
  const [a, b, c, d, e, f, g, h, i] = m.flat();
  const A = e * i - f * h, B = -(d * i - f * g), C = d * h - e * g;
  const det = a * A + b * B + c * C;
  return [[A, -(b * i - c * h), b * f - c * e], [B, a * i - c * g, -(a * f - c * d)], [C, -(a * h - b * g), a * e - b * d]].map(r => r.map(v => v / det));
}
const MtM = [0, 1, 2].map(i => [0, 1, 2].map(j => IK.reduce((s, r) => s + r[i] * r[j], 0)));
const MtMinv = inv3(MtM);
function forwardKin(u) { // least squares: wheel speeds → body twist
  const b = [0, 1, 2].map(i => IK.reduce((s, r, wi) => s + r[i] * u[wi], 0));
  return MtMinv.map(r => r[0] * b[0] + r[1] * b[1] + r[2] * b[2]);
}

// ───────────────────────── input ─────────────────────────
const keys = new Set();
const state = { swapAD: false, cam: 0 };
const toast = document.getElementById('toast'); let toastT = 0;
function say(msg) { toast.textContent = msg; toast.classList.add('show'); clearTimeout(toastT); toastT = setTimeout(() => toast.classList.remove('show'), 1400); }
const CAMS = ['орбита', 'за роботом', 'сверху'];

addEventListener('keydown', e => {
  if (e.metaKey || e.ctrlKey || e.altKey) return;
  if (['KeyW', 'KeyA', 'KeyS', 'KeyD', 'KeyQ', 'KeyE', 'Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(e.code)) e.preventDefault();
  if (e.repeat) return;
  keys.add(e.code);
  if (e.code === 'KeyR') { resetRobot(); say('Сброс'); }
  if (e.code === 'KeyH') document.body.classList.toggle('nohud');
  if (e.code === 'KeyM') { state.swapAD = !state.swapAD; say(state.swapAD ? 'A/D — поворот, Q/E — стрейф' : 'A/D — стрейф, Q/E — поворот'); updateHelp(); }
  if (e.code === 'KeyC') setCam((state.cam + 1) % 3);
});
addEventListener('keyup', e => keys.delete(e.code));
addEventListener('blur', () => keys.clear());
const down = c => keys.has(c);
const axis = (pos, neg) => (down(pos) ? 1 : 0) - (down(neg) ? 1 : 0);

function readInput() {
  const fwd = axis('KeyW', 'KeyS') + axis('ArrowUp', 'ArrowDown');
  const adv = axis('KeyA', 'KeyD'), qev = axis('KeyQ', 'KeyE');
  let strafe = state.swapAD ? qev : adv;
  let turn = (state.swapAD ? adv : qev) + axis('ArrowLeft', 'ArrowRight');
  let f = THREE.MathUtils.clamp(fwd, -1, 1);
  strafe = THREE.MathUtils.clamp(strafe, -1, 1); turn = THREE.MathUtils.clamp(turn, -1, 1);
  const m = Math.hypot(f, strafe); if (m > 1) { f /= m; strafe /= m; }
  const g = down('ShiftLeft') || down('ShiftRight') ? CFG.slowGain : 1;
  return { f: f * g, s: strafe * g, t: turn * g, gain: g };
}

// ───────────────────────── physics ─────────────────────────
const pose = { x: 0, y: 0, h: 0 };
const twist = { vx: 0, vy: 0, w: 0 };
const WMAX = CFG.maxWheelSpeed;
const TURN_RATE = 3.2;   // rad/s at full turn command (before saturation)

function resetRobot() {
  Object.assign(pose, { x: CFG.start.x, y: CFG.start.y, h: CFG.start.h });
  Object.assign(twist, { vx: 0, vy: 0, w: 0 });
  wheels.forEach(w => { w.u = 0; });
}

function collide() {
  const c = Math.cos(pose.h), s = Math.sin(pose.h);
  for (let it = 0; it < 4; it++) {
    let hit = false;
    for (const b of colliders) {
      const dx = pose.x - b.x, dy = pose.y - b.y;
      // SAT over world axes and robot axes
      const axes = [[1, 0], [0, 1], [c, s], [-s, c]];
      let best = Infinity, nx = 0, ny = 0, sep = false;
      for (const [ax, ay] of axes) {
        const rr = CFG.halfX * Math.abs(c * ax + s * ay) + CFG.halfY * Math.abs(-s * ax + c * ay);
        const rb = b.hx * Math.abs(ax) + b.hy * Math.abs(ay);
        const d = dx * ax + dy * ay;
        const ov = rr + rb - Math.abs(d);
        if (ov <= 0) { sep = true; break; }
        if (ov < best) { best = ov; const sg = d >= 0 ? 1 : -1; nx = ax * sg; ny = ay * sg; }
      }
      if (!sep) { pose.x += nx * best; pose.y += ny * best; hit = true; }
    }
    if (!hit) break;
  }
}

function step(dt, inp) {
  // desired body twist → wheel targets (with saturation scaling)
  const cmd = [inp.f * WMAX, inp.s * WMAX, inp.t * TURN_RATE];
  let tgt = IK.map(r => r[0] * cmd[0] + r[1] * cmd[1] + r[2] * cmd[2]);
  const peak = Math.max(...tgt.map(Math.abs));
  const lim = WMAX * inp.gain;
  if (peak > lim) tgt = tgt.map(v => v * lim / peak);
  // wheel acceleration limit
  wheels.forEach((w, i) => {
    const d = tgt[i] - w.u, m = CFG.wheelAccel * dt;
    w.u += Math.abs(d) <= m ? d : Math.sign(d) * m;
  });
  const [vx, vy, om] = forwardKin(wheels.map(w => w.u));
  twist.vx = vx; twist.vy = vy; twist.w = om;
  const c = Math.cos(pose.h), s = Math.sin(pose.h);
  pose.x += (vx * c - vy * s) * dt;
  pose.y += (vx * s + vy * c) * dt;
  pose.h += om * dt;
  collide();

  // wheel + roller animation
  for (const w of wheels) {
    w.theta += (w.u / w.R) * dt;
    const vcx = vx - om * w.y, vcy = vy + om * w.x;       // chassis velocity at wheel
    const slip = -(w.u - vcx) * w.a.y - vcy * w.a.x;      // free-roller surface speed (m/s)
    const spin = slip / CFG.roller;
    for (const r of w.rollers) {
      let off = r.phi0 - w.theta + Math.PI / 2;           // angular distance from the floor contact
      off = Math.atan2(Math.sin(off), Math.cos(off));
      if (Math.abs(off) < 0.33) r.angle += spin * dt;     // only the roller touching the ground turns
    }
  }
}

function applyPose() {
  robot.position.set(pose.x, pose.y, 0);
  robot.rotation.set(0, 0, pose.h);
  for (const w of wheels) {
    w.node.rotation.set(0, w.theta, 0);
    for (const r of w.rollers) r.node.quaternion.setFromAxisAngle(r.axis, r.angle);
  }
}

// ───────────────────────── camera ─────────────────────────
const camTarget = new THREE.Vector3();
let lastHeading = 0;
function setCam(i, silent) {
  state.cam = i;
  const off = camera.position.clone().sub(controls.target);
  if (i === 1) { // behind the robot
    const d = Math.max(1.3, off.length()), az = pose.h + Math.PI;
    camera.position.set(controls.target.x + Math.cos(az) * d * 0.85, controls.target.y + Math.sin(az) * d * 0.85, controls.target.z + d * 0.5);
  } else if (i === 2) { // top down
    const d = Math.max(2.4, off.length());
    camera.position.set(controls.target.x + 0.001, controls.target.y - 0.001, controls.target.z + d);
  }
  document.getElementById('t-cam').textContent = CAMS[i];
  if (!silent) say('Камера: ' + CAMS[i]);
}

function updateCamera() {
  camTarget.set(pose.x, pose.y, 0.08);
  const delta = camTarget.clone().sub(controls.target);
  controls.target.add(delta); camera.position.add(delta);
  if (state.cam === 1) { // rotate with the robot around the vertical axis
    const dh = pose.h - lastHeading;
    const rel = camera.position.clone().sub(controls.target);
    const c = Math.cos(dh), s = Math.sin(dh);
    camera.position.set(controls.target.x + rel.x * c - rel.y * s, controls.target.y + rel.x * s + rel.y * c, camera.position.z);
  }
  lastHeading = pose.h;
  if (state.cam === 2) { controls.minPolarAngle = controls.maxPolarAngle = 0.0001; }
  else { controls.minPolarAngle = 0; controls.maxPolarAngle = Math.PI / 2 - 0.02; }
  controls.update();
}

// ───────────────────────── HUD ─────────────────────────
const el = id => document.getElementById(id);
const wgrid = el('wgrid');
const wcells = {};
for (const id of ORDER) {
  const d = document.createElement('div'); d.className = 'wcell';
  d.innerHTML = `<b>${id}</b><span>0 об/мин</span><div class="bar"><i></i></div>`;
  wgrid.appendChild(d); wcells[id] = { span: d.querySelector('span'), bar: d.querySelector('i') };
}
function updateHelp() {
  el('h-ad').textContent = state.swapAD ? 'поворот' : 'влево / вправо (стрейф)';
  el('h-qe').textContent = state.swapAD ? 'стрейф' : 'поворот';
  el('t-mode').textContent = state.swapAD ? 'поворот' : 'стрейф';
}
let hudT = 0;
function updateHud(inp) {
  document.querySelectorAll('kbd[data-k]').forEach(k => {
    const code = k.dataset.k; k.classList.toggle('on', code === 'ShiftLeft' ? (down('ShiftLeft') || down('ShiftRight')) : down(code));
  });
  const now = performance.now(); if (now - hudT < 66) return; hudT = now;
  const sp = Math.hypot(twist.vx, twist.vy);
  el('t-speed').textContent = sp.toFixed(2) + ' м/с';
  el('t-head').textContent = ((((pose.h * 180 / Math.PI) % 360) + 360) % 360).toFixed(0) + '°';
  el('t-pos').textContent = pose.x.toFixed(2) + ', ' + pose.y.toFixed(2) + ' м';
  el('t-gain').textContent = (inp.gain * 100).toFixed(0) + '%';
  for (const w of wheels) {
    const rpm = w.u / w.R * 60 / (2 * Math.PI), p = THREE.MathUtils.clamp(w.u / WMAX, -1, 1);
    const c = wcells[w.id]; c.span.textContent = rpm.toFixed(0) + ' об/мин';
    c.bar.style.left = p >= 0 ? '50%' : (50 + p * 50) + '%'; c.bar.style.width = Math.abs(p) * 50 + '%';
    c.bar.style.background = p >= 0 ? 'var(--pos)' : 'var(--neg)';
  }
}

// ───────────────────────── main loop ─────────────────────────
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
resetRobot(); updateHelp(); applyPose();
camTarget.set(pose.x, pose.y, 0.08); controls.target.copy(camTarget);
setCam(0, true);
loadtext.textContent = 'Готово'; el('loader').classList.add('done');
canvas.focus();

let prev = performance.now();
renderer.setAnimationLoop(now => {
  const frame = Math.min((now - prev) / 1000, 0.05); prev = now;
  const inp = readInput();
  const n = Math.max(1, Math.ceil(frame / (1 / 240)));
  for (let i = 0; i < n; i++) step(frame / n, inp);
  applyPose();
  updateCamera();
  sun.position.copy(robot.position).add(SUN_OFFSET); sun.target.position.copy(robot.position);
  updateHud(inp);
  renderer.render(scene, camera);
});

// debug / test hook
window.__sim = { step, resetRobot, model, scene, pose, twist, wheels, keys, camera, controls, setCam, state };
