import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';
import { RoomEnvironment } from 'three/addons/environments/RoomEnvironment.js';
import { TalosRobotAgent, loadStraferModel } from './robot/TalosRobotAgent.ts';
import { SwarmManager } from './swarm/SwarmManager.ts';
import { runM0 } from './swarm/consensus.ts';

// World is Z-up, metres. Robot forward = +X, left = +Y (right-handed).
THREE.Object3D.DEFAULT_UP.set(0, 0, 1);

// ───────────────────────── configuration ─────────────────────────
const CFG = {
  maxWheelSpeed: 1.8,      // m/s at the rim at full command
  turnRate: 3.2,           // rad/s at full turn command (before saturation)
  slowGain: 0.35,          // Shift multiplier
  liftSpeed: 0.08,         // m/s manual lift command (Z / X)
  field: 3.6576,           // 12 ft square field
  start: { x: 0, y: 0, theta: 0 },
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

// ───────────────────────── robot (src/robot/TalosRobotAgent) ─────────────────────────
const loadbar = document.getElementById('loadbar');
const loadtext = document.getElementById('loadtext');
const strafer = await loadStraferModel('/robot.glb', (loaded, total) => {
  loadbar.style.width = (loaded / total * 100).toFixed(0) + '%';
  loadtext.textContent = `Загрузка модели… ${(loaded / 1e6).toFixed(1)} / ${(total / 1e6).toFixed(1)} МБ`;
});

const agent = new TalosRobotAgent({ id: 1, model: strafer, pose: CFG.start });
scene.add(agent.root);
const OMEGA_MAX = agent.geometry.omegaMax;
const ORDER = ['FL', 'FR', 'RL', 'RR'];

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
  return { f: f * g, s: strafe * g, t: turn * g, gain: g, lift: axis('KeyZ', 'KeyX') };
}

// ───────────────────────── physics ─────────────────────────
function resetRobot() {
  agent.reset(CFG.start);
}

function collide(pose, fp) {
  const c = Math.cos(pose.theta), s = Math.sin(pose.theta);
  for (let it = 0; it < 4; it++) {
    let hit = false;
    for (const b of colliders) {
      const dx = pose.x - b.x, dy = pose.y - b.y;
      // SAT over world axes and robot axes
      const axes = [[1, 0], [0, 1], [c, s], [-s, c]];
      let best = Infinity, nx = 0, ny = 0, sep = false;
      for (const [ax, ay] of axes) {
        const rr = fp.halfX * Math.abs(c * ax + s * ay) + fp.halfY * Math.abs(-s * ax + c * ay);
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

function applyInput(inp) {
  // formula 14 + uniform saturation inside the agent; Shift scales ω_max (same as the old prototype)
  agent.setTwistCommand({ vx: inp.f * CFG.maxWheelSpeed, vy: inp.s * CFG.maxWheelSpeed, omega: inp.t * CFG.turnRate }, inp.gain);
  agent.setLiftCommand(inp.lift * CFG.liftSpeed * inp.gain);
}

// ───────────────────────── camera ─────────────────────────
const camTarget = new THREE.Vector3();
let lastHeading = 0;
function setCam(i, silent) {
  state.cam = i;
  const off = camera.position.clone().sub(controls.target);
  if (i === 1) { // behind the robot
    const d = Math.max(1.3, off.length()), az = agent.pose.theta + Math.PI;
    camera.position.set(controls.target.x + Math.cos(az) * d * 0.85, controls.target.y + Math.sin(az) * d * 0.85, controls.target.z + d * 0.5);
  } else if (i === 2) { // top down
    const d = Math.max(2.4, off.length());
    camera.position.set(controls.target.x + 0.001, controls.target.y - 0.001, controls.target.z + d);
  }
  document.getElementById('t-cam').textContent = CAMS[i];
  if (!silent) say('Камера: ' + CAMS[i]);
}

function updateCamera() {
  const pose = agent.pose;
  camTarget.set(pose.x, pose.y, 0.12);
  const delta = camTarget.clone().sub(controls.target);
  controls.target.add(delta); camera.position.add(delta);
  if (state.cam === 1) { // rotate with the robot around the vertical axis
    const dh = pose.theta - lastHeading;
    const rel = camera.position.clone().sub(controls.target);
    const c = Math.cos(dh), s = Math.sin(dh);
    camera.position.set(controls.target.x + rel.x * c - rel.y * s, controls.target.y + rel.x * s + rel.y * c, camera.position.z);
  }
  lastHeading = pose.theta;
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
  const { pose, twist } = agent;
  const sp = Math.hypot(twist.vx, twist.vy);
  el('t-speed').textContent = sp.toFixed(2) + ' м/с';
  el('t-head').textContent = ((((pose.theta * 180 / Math.PI) % 360) + 360) % 360).toFixed(0) + '°';
  el('t-pos').textContent = pose.x.toFixed(2) + ', ' + pose.y.toFixed(2) + ' м';
  el('t-gain').textContent = (inp.gain * 100).toFixed(0) + '%';
  const tl = el('t-lift'); if (tl) tl.textContent = (agent.lift.h * 1000).toFixed(0) + ' мм · ' + agent.lift.current.toFixed(1) + ' А';
  const rpm = agent.wheelRpm();
  agent.wheelRates.forEach((w, i) => {
    const p = THREE.MathUtils.clamp(w / OMEGA_MAX, -1, 1);
    const c = wcells[ORDER[i]]; c.span.textContent = rpm[i].toFixed(0) + ' об/мин';
    c.bar.style.left = p >= 0 ? '50%' : (50 + p * 50) + '%'; c.bar.style.width = Math.abs(p) * 50 + '%';
    c.bar.style.background = p >= 0 ? 'var(--pos)' : 'var(--neg)';
  });
}

// ───────────────────────── main loop ─────────────────────────
addEventListener('resize', () => { camera.aspect = innerWidth / innerHeight; camera.updateProjectionMatrix(); renderer.setSize(innerWidth, innerHeight); });
resetRobot(); updateHelp(); agent.syncVisuals();
camTarget.set(agent.pose.x, agent.pose.y, 0.12); controls.target.copy(camTarget);
setCam(0, true);
loadtext.textContent = 'Готово'; el('loader').classList.add('done');
canvas.focus();

let prev = performance.now();
renderer.setAnimationLoop(now => {
  const frame = THREE.MathUtils.clamp((now - prev) / 1000, 0, 0.05); prev = now;
  const inp = readInput();
  applyInput(inp);
  const n = Math.max(1, Math.ceil(frame / (1 / 240)));
  for (let i = 0; i < n; i++) agent.step(frame / n, collide);
  agent.syncVisuals();
  updateCamera();
  sun.position.copy(agent.root.position).add(SUN_OFFSET); sun.target.position.copy(agent.root.position);
  updateHud(inp);
  renderer.render(scene, camera);
});

// debug / test hook (console): window.__sim.agent, window.__talos.SwarmManager, …
window.__sim = { agent, resetRobot, model: strafer, scene, pose: agent.pose, twist: agent.twist, keys, camera, controls, setCam, state };
window.__talos = { THREE, scene, strafer, agent, TalosRobotAgent, SwarmManager, runM0, collide };
