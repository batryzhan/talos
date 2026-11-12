/**
 * Shader billboards on InstancedMesh: wildfire flames (cylindrical, additive, flickering in the
 * vertex shader) and smoke puffs (spherical, soft, translucent). Per-instance data lives in
 * preallocated instanced attributes; per-frame work is a uniform update plus, for smoke, a CPU
 * particle step written straight into the buffers.
 */
import * as T from 'three';

const FLAME_VS = /* glsl */`
uniform float uTime;
attribute float aPhase;
attribute float aHeat;
varying vec2 vUv;
varying float vPhase;
varying float vHeat;
void main() {
  vUv = uv; vPhase = aPhase; vHeat = aHeat;
  vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float sx = length(instanceMatrix[0].xyz), sz = length(instanceMatrix[2].xyz);
  vec3 toCam = cameraPosition - center;
  vec3 right = normalize(vec3(-toCam.y, toCam.x, 0.0) + vec3(1e-4, 0.0, 0.0));
  float flick = 0.82 + 0.18 * sin(uTime * 9.0 + aPhase * 7.0) + 0.08 * sin(uTime * 23.0 + aPhase * 3.0);
  float sway = sin(uTime * 3.1 + aPhase * 5.0 + position.y * 3.0) * 0.18 * position.y;
  vec3 p = center + right * (position.x + sway) * sx + vec3(0.0, 0.0, 1.0) * position.y * sz * flick;
  gl_Position = projectionMatrix * viewMatrix * vec4(p, 1.0);
}`;

const FLAME_FS = /* glsl */`
uniform float uTime;
varying vec2 vUv;
varying float vPhase;
varying float vHeat;
void main() {
  float y = vUv.y;
  float x = (vUv.x - 0.5) * 2.0;
  float n = sin(y * 11.0 - uTime * 8.0 + vPhase * 9.0) * 0.14 + sin(y * 23.0 - uTime * 13.0 + vPhase) * 0.06;
  float width = mix(0.95, 0.08, pow(y, 0.8));
  float shape = smoothstep(width, width * 0.35, abs(x + n * y));
  shape *= smoothstep(1.0, 0.55, y) * smoothstep(0.0, 0.06, y);
  vec3 core = vec3(4.2, 3.0, 1.1);
  vec3 mid = vec3(3.4, 1.0, 0.16);
  vec3 tip = vec3(1.1, 0.14, 0.03);
  vec3 col = mix(core, mid, smoothstep(0.05, 0.5, y + abs(x) * 0.4));
  col = mix(col, tip, smoothstep(0.5, 0.95, y));
  float a = shape * clamp(vHeat, 0.0, 1.0);
  gl_FragColor = vec4(col * a, a);
}`;

const SMOKE_VS = /* glsl */`
attribute float aAlpha;
varying vec2 vUv;
varying float vAlpha;
void main() {
  vUv = uv; vAlpha = aAlpha;
  vec3 center = (instanceMatrix * vec4(0.0, 0.0, 0.0, 1.0)).xyz;
  float s = length(instanceMatrix[0].xyz);
  vec4 mv = viewMatrix * vec4(center, 1.0);
  mv.xy += position.xy * s;
  gl_Position = projectionMatrix * mv;
}`;

const SMOKE_FS = /* glsl */`
uniform vec3 uColor;
varying vec2 vUv;
varying float vAlpha;
void main() {
  float d = length(vUv - 0.5) * 2.0;
  float a = smoothstep(1.0, 0.2, d) * vAlpha;
  gl_FragColor = vec4(uColor, a);
}`;

export class FlameField {
  readonly mesh: T.InstancedMesh;
  readonly uniforms = { uTime: { value: 0 } };
  private readonly heat: T.InstancedBufferAttribute;
  private readonly m = new T.Matrix4();
  count = 0;

  constructor(readonly capacity: number) {
    const g = new T.PlaneGeometry(1, 1, 1, 6).translate(0, 0.5, 0);
    const phase = new Float32Array(capacity);
    for (let i = 0; i < capacity; i++) phase[i] = (i * 0.618034) % 1 * 6.283;
    g.setAttribute('aPhase', new T.InstancedBufferAttribute(phase, 1));
    this.heat = new T.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.heat.setUsage(T.DynamicDrawUsage);
    g.setAttribute('aHeat', this.heat);
    const mat = new T.ShaderMaterial({ vertexShader: FLAME_VS, fragmentShader: FLAME_FS, uniforms: this.uniforms, transparent: true, depthWrite: false, blending: T.AdditiveBlending, side: T.DoubleSide });
    this.mesh = new T.InstancedMesh(g, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.raycast = () => {};
  }

  begin(): void { this.count = 0; }

  /** Flame at (x, y, z), width w, height h, heat ∈ [0, 1]. */
  add(x: number, y: number, z: number, w: number, h: number, heat: number): void {
    if (this.count >= this.capacity) return;
    this.m.makeScale(w, 1, h);
    this.m.setPosition(x, y, z);
    this.mesh.setMatrixAt(this.count, this.m);
    (this.heat.array as Float32Array)[this.count] = heat;
    this.count++;
  }

  end(): void {
    this.mesh.count = this.count;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.heat.needsUpdate = true;
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as T.Material).dispose(); }
}

export class SmokeField {
  readonly mesh: T.InstancedMesh;
  private readonly alpha: T.InstancedBufferAttribute;
  private readonly p: Float32Array;
  private readonly v: Float32Array;
  private readonly life: Float32Array;
  private readonly max: Float32Array;
  private readonly size: Float32Array;
  private next = 0;
  private readonly m = new T.Matrix4();

  constructor(readonly capacity: number, color = new T.Color(0.18, 0.17, 0.16), private readonly peakAlpha = 0.42) {
    const g = new T.PlaneGeometry(1, 1);
    this.alpha = new T.InstancedBufferAttribute(new Float32Array(capacity), 1);
    this.alpha.setUsage(T.DynamicDrawUsage);
    g.setAttribute('aAlpha', this.alpha);
    const mat = new T.ShaderMaterial({ vertexShader: SMOKE_VS, fragmentShader: SMOKE_FS, uniforms: { uColor: { value: color } }, transparent: true, depthWrite: false });
    this.mesh = new T.InstancedMesh(g, mat, capacity);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
    this.mesh.raycast = () => {};
    this.p = new Float32Array(capacity * 3); this.v = new Float32Array(capacity * 3);
    this.life = new Float32Array(capacity); this.max = new Float32Array(capacity); this.size = new Float32Array(capacity);
  }

  emit(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number, size: number): void {
    const i = this.next;
    this.next = (this.next + 1) % this.capacity;
    this.p[i * 3] = x; this.p[i * 3 + 1] = y; this.p[i * 3 + 2] = z;
    this.v[i * 3] = vx; this.v[i * 3 + 1] = vy; this.v[i * 3 + 2] = vz;
    this.life[i] = life; this.max[i] = life; this.size[i] = size;
  }

  update(dt: number): void {
    let n = 0;
    const a = this.alpha.array as Float32Array;
    for (let i = 0; i < this.capacity; i++) {
      if (this.life[i] <= 0) continue;
      this.life[i] -= dt;
      if (this.life[i] <= 0) continue;
      const k = i * 3;
      this.p[k] += this.v[k] * dt; this.p[k + 1] += this.v[k + 1] * dt; this.p[k + 2] += this.v[k + 2] * dt;
      const f = this.life[i] / this.max[i];
      const s = this.size[i] * (1 + (1 - f) * 2.5);
      this.m.makeScale(s, s, s);
      this.m.setPosition(this.p[k], this.p[k + 1], this.p[k + 2]);
      this.mesh.setMatrixAt(n, this.m);
      a[n] = this.peakAlpha * Math.min(1, (1 - f) * 6) * f;
      n++;
    }
    this.mesh.count = n;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.alpha.needsUpdate = true;
  }

  dispose(): void { this.mesh.geometry.dispose(); (this.mesh.material as T.Material).dispose(); }
}
