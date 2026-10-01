/**
 * The sign-in world: a living liquid-glass orb with the NUUKE mark glowing inside,
 * the crew of agents orbiting it (refracted through the glass as they pass behind),
 * drifting star dust, and an aurora sky. Everything leans toward the cursor.
 *
 *   orb.ripple()   a keystroke — the surface shivers
 *   orb.charge(on) signing in — it spins up and glows
 *   orb.error()    wrong password — a red flash and a wobble
 *   orb.warp()     signed in — the camera dives into the orb
 */
import * as THREE from 'three';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';

/* -------------------------------------------------- 3D simplex noise (Ashima) */
const NOISE = /* glsl */ `
vec3 nk_mod289(vec3 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 nk_mod289(vec4 x){return x-floor(x*(1.0/289.0))*289.0;}
vec4 nk_perm(vec4 x){return nk_mod289(((x*34.0)+1.0)*x);}
vec4 nk_taylor(vec4 r){return 1.79284291400159-0.85373472095314*r;}
float snoise(vec3 v){
  const vec2 C=vec2(1.0/6.0,1.0/3.0); const vec4 D=vec4(0.0,0.5,1.0,2.0);
  vec3 i=floor(v+dot(v,C.yyy)); vec3 x0=v-i+dot(i,C.xxx);
  vec3 g=step(x0.yzx,x0.xyz); vec3 l=1.0-g; vec3 i1=min(g.xyz,l.zxy); vec3 i2=max(g.xyz,l.zxy);
  vec3 x1=x0-i1+C.xxx; vec3 x2=x0-i2+C.yyy; vec3 x3=x0-D.yyy;
  i=nk_mod289(i);
  vec4 p=nk_perm(nk_perm(nk_perm(i.z+vec4(0.0,i1.z,i2.z,1.0))+i.y+vec4(0.0,i1.y,i2.y,1.0))+i.x+vec4(0.0,i1.x,i2.x,1.0));
  float n_=0.142857142857; vec3 ns=n_*D.wyz-D.xzx;
  vec4 j=p-49.0*floor(p*ns.z*ns.z); vec4 x_=floor(j*ns.z); vec4 y_=floor(j-7.0*x_);
  vec4 x=x_*ns.x+ns.yyyy; vec4 y=y_*ns.x+ns.yyyy; vec4 h=1.0-abs(x)-abs(y);
  vec4 b0=vec4(x.xy,y.xy); vec4 b1=vec4(x.zw,y.zw);
  vec4 s0=floor(b0)*2.0+1.0; vec4 s1=floor(b1)*2.0+1.0; vec4 sh=-step(h,vec4(0.0));
  vec4 a0=b0.xzyw+s0.xzyw*sh.xxyy; vec4 a1=b1.xzyw+s1.xzyw*sh.zzww;
  vec3 p0=vec3(a0.xy,h.x); vec3 p1=vec3(a0.zw,h.y); vec3 p2=vec3(a1.xy,h.z); vec3 p3=vec3(a1.zw,h.w);
  vec4 norm=nk_taylor(vec4(dot(p0,p0),dot(p1,p1),dot(p2,p2),dot(p3,p3)));
  p0*=norm.x; p1*=norm.y; p2*=norm.z; p3*=norm.w;
  vec4 m=max(0.6-vec4(dot(x0,x0),dot(x1,x1),dot(x2,x2),dot(x3,x3)),0.0); m=m*m;
  return 42.0*dot(m*m,vec4(dot(p0,x0),dot(p1,x1),dot(p2,x2),dot(p3,x3)));
}`;

/* ------------------------------------------------------------------ palettes */
const THEMES = {
  light: {
    base: '#f1eefb', c1: '#b9a8ff', c2: '#9fd6ff', c3: '#ffc6a8', c4: '#a8f0d6',
    dust: ['#7c5cff', '#5ab8ff', '#ff9a6b', '#34d3a0', '#ff6b9a'], dustOpacity: 0.55,
    core: ['#7c5cff', '#5ab8ff'], attenuation: '#c9bbff', exposure: 1.05,
  },
  dark: {
    base: '#07060d', c1: '#4b2fd6', c2: '#0d5a9c', c3: '#8a3b5e', c4: '#0f6b56',
    dust: ['#a996ff', '#7cc8ff', '#ffb38f', '#5be3b4', '#ff8fb5'], dustOpacity: 0.9,
    core: ['#8f74ff', '#2fa6ff'], attenuation: '#8f74ff', exposure: 1.0,
  },
};
type ThemeName = keyof typeof THEMES;

const ease = (t: number) => 1 - Math.pow(1 - t, 3);
const damp = (a: number, b: number, k: number, dt: number) => a + (b - a) * (1 - Math.exp(-k * dt));
const WARP_MS = 900;

export interface OrbOptions {
  canvas: HTMLCanvasElement;
  agents: HTMLImageElement[];
  mark: HTMLImageElement;
  dark: boolean;
  reducedMotion: boolean;
}

export class OrbScene {
  private renderer: THREE.WebGLRenderer;
  private scene = new THREE.Scene();
  private camera = new THREE.PerspectiveCamera(35, 1, 0.1, 200);
  private timer = new THREE.Timer();
  private raf = 0;
  private disposed = false;
  private reduced: boolean;

  private world = new THREE.Group();
  private orb!: THREE.Mesh<THREE.IcosahedronGeometry, THREE.MeshPhysicalMaterial>;
  private orbUniforms = {
    uTime: { value: 0 }, uAmp: { value: 0.1 }, uPulse: { value: 0 },
    uMouseDir: { value: new THREE.Vector3(0, 0, 1) }, uMouseAmt: { value: 0 },
  };
  private core!: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private markSprite!: THREE.Sprite;
  private halo!: THREE.Sprite;
  private sky!: THREE.Mesh<THREE.SphereGeometry, THREE.ShaderMaterial>;
  private dust!: THREE.Points<THREE.BufferGeometry, THREE.ShaderMaterial>;
  private ring = new THREE.Group();
  private crew: { sprite: THREE.Sprite; angle: number; hop: number; scale: number; target: number }[] = [];

  private pointer = new THREE.Vector2(0, 0);
  private pointerSmooth = new THREE.Vector2(0, 0);
  private raycaster = new THREE.Raycaster();
  private hovered = -1;
  private dragging = false;
  private dragX = 0;
  private spin = 0.12;
  private spinBoost = 0;
  private pulse = 0;
  private chargeLevel = 0;
  private charging = false;
  private errorLevel = 0;
  private warpT = -1;
  private warpStart = 0;
  private warpResolve: (() => void) | null = null;
  private intro = 0;
  private layout = { x: 0, y: 0, scale: 1 };

  constructor(private opts: OrbOptions) {
    this.reduced = opts.reducedMotion;
    this.renderer = new THREE.WebGLRenderer({ canvas: opts.canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio, window.innerWidth < 768 ? 1.5 : 1.75));
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;

    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    pmrem.dispose();

    this.camera.position.set(0, 0, 9);
    this.scene.add(this.world);
    this.buildSky();
    this.buildDust();
    this.buildOrb();
    this.buildCrew();
    this.setTheme(opts.dark ? 'dark' : 'light');
    this.resize();

    window.addEventListener('resize', this.resize);
    window.addEventListener('pointermove', this.onPointerMove, { passive: true });
    window.addEventListener('pointerdown', this.onPointerDown);
    window.addEventListener('pointerup', this.onPointerUp);
    document.addEventListener('visibilitychange', this.onVisibility);

    if (this.reduced) {
      this.intro = 1;
      this.renderer.setAnimationLoop(null);
      this.renderStill();
    } else {
      this.loop();
    }
  }

  /* --------------------------------------------------------------- building */
  private buildSky() {
    const mat = new THREE.ShaderMaterial({
      side: THREE.BackSide,
      depthWrite: false,
      uniforms: {
        uTime: { value: 0 },
        uBase: { value: new THREE.Color() }, uC1: { value: new THREE.Color() }, uC2: { value: new THREE.Color() },
        uC3: { value: new THREE.Color() }, uC4: { value: new THREE.Color() },
      },
      vertexShader: /* glsl */ `
        varying vec3 vDir;
        void main(){ vDir = normalize(position); gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uBase, uC1, uC2, uC3, uC4;
        varying vec3 vDir;
        ${NOISE}
        float blob(vec3 d, vec3 c, float r){ return smoothstep(r, 0.0, distance(d, normalize(c))); }
        void main(){
          vec3 d = normalize(vDir);
          float t = uTime * 0.035;
          vec3 col = uBase;
          float w = snoise(d * 1.4 + vec3(t, -t, t * 0.5)) * 0.18;
          col = mix(col, uC1, blob(d, vec3(-0.9 + sin(t) * 0.25, 0.55, -1.0), 1.15 + w) * 0.9);
          col = mix(col, uC2, blob(d, vec3(0.95, 0.35 + cos(t * 0.8) * 0.2, -1.0), 1.05 - w) * 0.85);
          col = mix(col, uC3, blob(d, vec3(0.1 + sin(t * 1.3) * 0.3, -0.85, -1.0), 1.0 + w) * 0.8);
          col = mix(col, uC4, blob(d, vec3(0.9, -0.7, -0.6 + cos(t) * 0.2), 0.9) * 0.75);
          col += (snoise(d * 60.0) * 0.005);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.sky = new THREE.Mesh(new THREE.SphereGeometry(60, 48, 32), mat);
    this.scene.add(this.sky);
  }

  private buildDust() {
    const n = window.innerWidth < 768 ? 900 : 2200;
    const pos = new Float32Array(n * 3);
    const seed = new Float32Array(n);
    const col = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 3.2 + Math.pow(Math.random(), 0.7) * 14;
      const th = Math.random() * Math.PI * 2;
      const ph = Math.acos(2 * Math.random() - 1);
      pos[i * 3] = r * Math.sin(ph) * Math.cos(th);
      pos[i * 3 + 1] = r * Math.cos(ph) * 0.7;
      pos[i * 3 + 2] = r * Math.sin(ph) * Math.sin(th) - 3;
      seed[i] = Math.random();
    }
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    geo.setAttribute('aSeed', new THREE.BufferAttribute(seed, 1));
    geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
    const mat = new THREE.ShaderMaterial({
      transparent: true,
      depthWrite: false,
      vertexColors: true,
      uniforms: { uTime: { value: 0 }, uOpacity: { value: 0.6 }, uPixel: { value: 1 } },
      vertexShader: /* glsl */ `
        attribute float aSeed; uniform float uTime; uniform float uPixel;
        varying vec3 vColor; varying float vTw;
        void main(){
          vColor = color;
          vec3 p = position;
          p.y += sin(uTime * 0.25 + aSeed * 40.0) * 0.12;
          vec4 mv = modelViewMatrix * vec4(p, 1.0);
          vTw = 0.55 + 0.45 * sin(uTime * (0.6 + aSeed * 1.6) + aSeed * 60.0);
          gl_PointSize = (2.2 + aSeed * 3.6) * uPixel * (9.0 / -mv.z);
          gl_Position = projectionMatrix * mv;
        }`,
      fragmentShader: /* glsl */ `
        uniform float uOpacity; varying vec3 vColor; varying float vTw;
        void main(){
          float d = length(gl_PointCoord - 0.5);
          float a = smoothstep(0.5, 0.0, d);
          gl_FragColor = vec4(vColor, a * uOpacity * vTw);
        }`,
    });
    this.dust = new THREE.Points(geo, mat);
    this.world.add(this.dust);
  }

  private buildOrb() {
    const mat = new THREE.MeshPhysicalMaterial({
      color: 0xffffff,
      metalness: 0,
      roughness: 0.02,
      transmission: 1,
      thickness: 0.7,
      ior: 1.28,
      iridescence: 1,
      iridescenceIOR: 1.35,
      iridescenceThicknessRange: [120, 520],
      clearcoat: 1,
      clearcoatRoughness: 0.05,
      envMapIntensity: 1.0,
      specularIntensity: 1,
      attenuationDistance: 4.5,
    });
    const u = this.orbUniforms;
    mat.onBeforeCompile = (shader) => {
      Object.assign(shader.uniforms, u);
      shader.vertexShader = shader.vertexShader
        .replace('#include <common>', /* glsl */ `#include <common>
          uniform float uTime; uniform float uAmp; uniform float uPulse; uniform vec3 uMouseDir; uniform float uMouseAmt;
          ${NOISE}
          float nk_disp(vec3 p){
            vec3 q = normalize(p);
            float n = snoise(q * 0.95 + vec3(0.0, uTime * 0.16, uTime * 0.12)) * 0.75
                    + snoise(q * 1.9 - vec3(uTime * 0.2)) * 0.18;
            float pulse = uPulse * (0.55 + 0.45 * sin(q.y * 14.0 - uTime * 18.0));
            float pull = pow(max(dot(q, uMouseDir), 0.0), 5.0) * uMouseAmt;
            return n * uAmp + pulse * 0.16 + pull * 0.42;
          }
          vec3 nk_displace(vec3 p){ return p + normalize(p) * nk_disp(p); }`)
        .replace('#include <beginnormal_vertex>', /* glsl */ `
          vec3 nkN = normalize(normal);
          vec3 nkT = normalize(cross(nkN, abs(nkN.y) < 0.99 ? vec3(0.0, 1.0, 0.0) : vec3(1.0, 0.0, 0.0)));
          vec3 nkB = normalize(cross(nkN, nkT));
          vec3 nkD = nk_displace(position);
          vec3 nkDT = nk_displace(position + nkT * 0.012);
          vec3 nkDB = nk_displace(position + nkB * 0.012);
          vec3 objectNormal = normalize(cross(nkDT - nkD, nkDB - nkD));
          if (dot(objectNormal, nkN) < 0.0) objectNormal = -objectNormal;
          #ifdef USE_TANGENT
            vec3 objectTangent = vec3(tangent.xyz);
          #endif`)
        .replace('#include <begin_vertex>', 'vec3 transformed = nkD;');
    };
    this.orb = new THREE.Mesh(new THREE.IcosahedronGeometry(1.55, 72), mat);
    this.world.add(this.orb);

    // A soft halo behind the glass.
    const g = document.createElement('canvas');
    g.width = g.height = 256;
    const ctx = g.getContext('2d')!;
    const grad = ctx.createRadialGradient(128, 128, 0, 128, 128, 128);
    grad.addColorStop(0, 'rgba(255,255,255,0.85)');
    grad.addColorStop(0.35, 'rgba(255,255,255,0.35)');
    grad.addColorStop(1, 'rgba(255,255,255,0)');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, 256, 256);
    const haloTex = new THREE.CanvasTexture(g);
    this.halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: haloTex, transparent: true, depthWrite: false, color: 0x9f87ff, opacity: 0.55 }));
    this.halo.position.z = -1.4;
    this.world.add(this.halo);

    // The glowing heart, seen through the glass.
    const coreMat = new THREE.ShaderMaterial({
      uniforms: { uTime: { value: 0 }, uA: { value: new THREE.Color() }, uB: { value: new THREE.Color() }, uGlow: { value: 0 }, uError: { value: 0 } },
      vertexShader: /* glsl */ `
        varying vec3 vN; varying vec3 vP;
        void main(){ vN = normalize(normalMatrix * normal); vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `
        uniform float uTime; uniform vec3 uA, uB; uniform float uGlow; uniform float uError;
        varying vec3 vN; varying vec3 vP;
        ${NOISE}
        void main(){
          float n = snoise(vP * 2.2 + uTime * 0.4) * 0.5 + 0.5;
          vec3 col = mix(uA, uB, n);
          float rim = pow(1.0 - abs(vN.z), 2.0);
          col += rim * 0.45 + uGlow * 0.6;
          col = mix(col, vec3(1.0, 0.25, 0.22), uError);
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    });
    this.core = new THREE.Mesh(new THREE.SphereGeometry(0.62, 48, 32), coreMat);
    this.world.add(this.core);

    const markTex = new THREE.Texture(this.opts.mark);
    markTex.colorSpace = THREE.SRGBColorSpace;
    markTex.needsUpdate = true;
    this.markSprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: markTex, alphaTest: 0.35, transparent: false, color: 0xffffff }));
    this.markSprite.scale.set(0.62, 0.62, 1);
    this.markSprite.position.set(0, 0, 0.66);
    this.world.add(this.markSprite);
  }

  private buildCrew() {
    this.ring.rotation.set(0.38, 0, -0.12);
    this.world.add(this.ring);
    const n = this.opts.agents.length;
    this.opts.agents.forEach((img, i) => {
      const tex = new THREE.Texture(img);
      tex.colorSpace = THREE.SRGBColorSpace;
      tex.anisotropy = 4;
      tex.needsUpdate = true;
      // alphaTest (not transparency) so the agents are drawn into the glass's refraction pass.
      const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, alphaTest: 0.5, transparent: false }));
      sprite.scale.setScalar(0.001);
      this.ring.add(sprite);
      this.crew.push({ sprite, angle: (i / n) * Math.PI * 2, hop: 0, scale: 0.001, target: 0.92 });
    });
  }

  /* ------------------------------------------------------------- the theme */
  setTheme(name: ThemeName) {
    const t = THEMES[name];
    const s = this.sky.material.uniforms;
    s.uBase.value.set(t.base); s.uC1.value.set(t.c1); s.uC2.value.set(t.c2); s.uC3.value.set(t.c3); s.uC4.value.set(t.c4);
    const col = this.dust.geometry.getAttribute('color') as THREE.BufferAttribute;
    const tmp = new THREE.Color();
    for (let i = 0; i < col.count; i++) {
      tmp.set(t.dust[i % t.dust.length]);
      col.setXYZ(i, tmp.r, tmp.g, tmp.b);
    }
    col.needsUpdate = true;
    this.dust.material.uniforms.uOpacity.value = t.dustOpacity;
    this.dust.material.blending = name === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.dust.material.needsUpdate = true;
    this.core.material.uniforms.uA.value.set(t.core[0]);
    this.core.material.uniforms.uB.value.set(t.core[1]);
    this.halo.material.color.set(name === 'dark' ? '#7c5cff' : '#a58fff');
    this.halo.material.blending = name === 'dark' ? THREE.AdditiveBlending : THREE.NormalBlending;
    this.halo.material.opacity = name === 'dark' ? 0.75 : 0.5;
    this.halo.material.needsUpdate = true;
    this.orb.material.attenuationColor = new THREE.Color(t.attenuation);
    this.renderer.toneMappingExposure = t.exposure;
    if (this.reduced) this.renderStill();
  }

  /* ------------------------------------------------------------ reactions */
  ripple() { this.pulse = Math.min(1, this.pulse + 0.35); }
  charge(on: boolean) { this.charging = on; }
  error() { this.errorLevel = 1; this.pulse = 1; this.charging = false; this.spinBoost = -1.2; }
  /** Dive into the orb. Resolves when the screen is covered. */
  warp(): Promise<void> {
    if (this.reduced || this.disposed || document.hidden) return Promise.resolve();
    this.warpT = 0;
    this.warpStart = performance.now();
    return new Promise((r) => {
      this.warpResolve = r;
      // Slow devices still get in on time, even if the dive drops frames.
      window.setTimeout(() => this.finishWarp(), WARP_MS + 250);
    });
  }

  private finishWarp() {
    this.warpResolve?.();
    this.warpResolve = null;
  }

  /* ---------------------------------------------------------------- input */
  private onPointerMove = (e: PointerEvent) => {
    this.pointer.set((e.clientX / window.innerWidth) * 2 - 1, -(e.clientY / window.innerHeight) * 2 + 1);
    if (this.dragging) {
      this.spinBoost += (e.clientX - this.dragX) * 0.012;
      this.dragX = e.clientX;
    }
    if (this.isOverUi(e.target)) { this.setHover(-1); return; }
    this.raycaster.setFromCamera(this.pointer, this.camera);
    const hit = this.raycaster.intersectObjects(this.crew.map((c) => c.sprite))[0];
    this.setHover(hit ? this.crew.findIndex((c) => c.sprite === hit.object) : -1);
  };

  private onPointerDown = (e: PointerEvent) => {
    if (this.isOverUi(e.target)) return;
    if (this.hovered >= 0) {
      this.crew[this.hovered].hop = 1;
      this.ripple();
      return;
    }
    this.dragging = true;
    this.dragX = e.clientX;
    this.opts.canvas.style.cursor = 'grabbing';
  };

  private onPointerUp = () => {
    this.dragging = false;
    this.opts.canvas.style.cursor = '';
    document.body.style.cursor = this.hovered >= 0 ? 'pointer' : '';
  };

  private isOverUi(target: EventTarget | null) {
    return target instanceof Element && !!target.closest('form, a, button, input, [data-ui]');
  }

  private setHover(i: number) {
    if (i === this.hovered) return;
    if (this.hovered >= 0) this.crew[this.hovered].target = 0.92;
    this.hovered = i;
    if (i >= 0) this.crew[i].target = 1.25;
    if (!this.dragging) document.body.style.cursor = i >= 0 ? 'pointer' : '';
  }

  private onVisibility = () => {
    if (document.hidden) cancelAnimationFrame(this.raf);
    else if (!this.reduced && !this.disposed) { this.timer.update(); this.loop(); }
  };

  /* --------------------------------------------------------------- layout */
  private resize = () => {
    const w = window.innerWidth;
    const h = window.innerHeight;
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.fov = w < 768 ? 50 : 35;
    this.camera.updateProjectionMatrix();
    this.dust.material.uniforms.uPixel.value = this.renderer.getPixelRatio();
    // Wide screens: the orb sits left of centre, under the headline. Phones: above the card.
    const halfH = Math.tan(THREE.MathUtils.degToRad(this.camera.fov / 2)) * 9;
    const halfW = halfH * this.camera.aspect;
    if (w >= 1024) this.layout = { x: -halfW * 0.02, y: -0.1, scale: 0.88 };
    else if (w >= 768) this.layout = { x: 0, y: halfH * 0.42, scale: 0.8 };
    else this.layout = { x: 0, y: halfH * 0.64, scale: 0.58 };
    if (this.reduced) this.renderStill();
  };

  /* ---------------------------------------------------------------- frame */
  private loop = () => {
    if (this.disposed) return;
    this.raf = requestAnimationFrame(this.loop);
    this.timer.update();
    const dt = Math.min(this.timer.getDelta(), 1 / 20);
    this.update(dt, this.timer.getElapsed());
    this.renderer.render(this.scene, this.camera);
  };

  private renderStill() {
    this.update(0, 4);
    this.renderer.render(this.scene, this.camera);
  }

  private update(dt: number, time: number) {
    this.intro = Math.min(1, this.intro + dt * 0.55);
    const appear = ease(this.intro);

    // Pointer, smoothed — the whole world leans toward it.
    this.pointerSmooth.x = damp(this.pointerSmooth.x, this.pointer.x, 3, dt);
    this.pointerSmooth.y = damp(this.pointerSmooth.y, this.pointer.y, 3, dt);
    const px = this.pointerSmooth.x;
    const py = this.pointerSmooth.y;

    // Reactions decay.
    this.pulse = damp(this.pulse, 0, 2.2, dt);
    this.errorLevel = damp(this.errorLevel, 0, 2.5, dt);
    this.chargeLevel = damp(this.chargeLevel, this.charging ? 1 : 0, 4, dt);
    this.spinBoost = damp(this.spinBoost, 0, this.dragging ? 0.5 : 1.6, dt);

    // Layout + world.
    const L = this.layout;
    this.world.position.set(L.x, L.y, 0);
    const wob = this.errorLevel * Math.sin(time * 40) * 0.12;
    this.world.rotation.y = damp(this.world.rotation.y, px * 0.35 + wob, 4, dt);
    this.world.rotation.x = damp(this.world.rotation.x, -py * 0.22, 4, dt);

    // Orb.
    const u = this.orbUniforms;
    u.uTime.value = time;
    u.uPulse.value = this.pulse + this.chargeLevel * 0.6 + this.errorLevel;
    u.uAmp.value = 0.1 + this.chargeLevel * 0.08;
    const local = new THREE.Vector3(px * 1.6, py * 1.2, 1.2).normalize();
    u.uMouseDir.value.lerp(local, 0.08);
    u.uMouseAmt.value = damp(u.uMouseAmt.value, Math.min(1, Math.hypot(px, py) + 0.25), 2, dt);
    const s = L.scale * appear * (1 + this.chargeLevel * 0.06 + Math.sin(time * 1.4) * 0.01);
    this.orb.scale.setScalar(Math.max(0.001, s));
    this.orb.rotation.y += dt * (0.08 + this.chargeLevel * 1.2);
    this.orb.rotation.x = Math.sin(time * 0.3) * 0.15;
    this.core.scale.setScalar(Math.max(0.001, s * (1 + Math.sin(time * 2.2) * 0.04 + this.chargeLevel * 0.15)));
    this.core.material.uniforms.uTime.value = time;
    this.core.material.uniforms.uGlow.value = this.chargeLevel + this.pulse * 0.3;
    this.core.material.uniforms.uError.value = this.errorLevel * 0.85;
    this.markSprite.scale.setScalar(Math.max(0.001, 0.66 * s));
    this.halo.scale.setScalar(Math.max(0.001, s * (7.2 + Math.sin(time * 0.9) * 0.25 + this.chargeLevel * 1.5 + this.pulse * 0.6)));
    this.markSprite.position.z = 0.7 * s;
    this.markSprite.material.rotation = Math.sin(time * 0.6) * 0.06;

    // Crew in orbit.
    this.ring.scale.setScalar(L.scale);
    const speed = this.spin + this.spinBoost + this.chargeLevel * 2.5;
    const R = 2.55;
    this.crew.forEach((c, i) => {
      c.angle += dt * speed;
      c.hop = damp(c.hop, 0, 3.2, dt);
      const enter = ease(Math.min(1, Math.max(0, this.intro * 1.6 - i * 0.12)));
      const hop = Math.sin((1 - c.hop) * Math.PI) * c.hop * 0.9;
      c.sprite.position.set(Math.cos(c.angle) * R, Math.sin(time * 1.1 + i * 1.7) * 0.14 + hop, Math.sin(c.angle) * R);
      c.scale = damp(c.scale, c.target * enter, 8, dt);
      c.sprite.scale.setScalar(Math.max(0.001, c.scale));
    });

    // Dust and sky.
    this.dust.rotation.y += dt * 0.012;
    this.dust.material.uniforms.uTime.value = time;
    this.sky.material.uniforms.uTime.value = time;

    // Camera: gentle drift, or the dive.
    let camZ = 9 - (1 - appear) * 2;
    if (this.warpT >= 0) {
      // Wall-clock driven, so a low frame rate never stretches the dive.
      this.warpT = Math.min(1, (performance.now() - this.warpStart) / WARP_MS);
      const k = ease(this.warpT);
      camZ = 9 - k * 8.6;
      this.camera.fov = damp(this.camera.fov, 35 + k * 40, 6, dt);
      this.camera.updateProjectionMatrix();
      if (this.warpT >= 1) this.finishWarp();
    }
    // During the dive the camera slides over to the orb, wherever the layout put it.
    const toOrb = this.warpT > 0 ? ease(this.warpT) : 0;
    this.camera.position.x = damp(this.camera.position.x, px * 0.5 * (1 - toOrb) + L.x * toOrb, 2.5 + toOrb * 6, dt);
    this.camera.position.y = damp(this.camera.position.y, py * 0.35 * (1 - toOrb) + L.y * toOrb, 2.5 + toOrb * 6, dt);
    this.camera.position.z = camZ;
    this.camera.lookAt(this.camera.position.x * 0.6, this.camera.position.y * 0.6, 0);
  }

  /* -------------------------------------------------------------- teardown */
  dispose() {
    this.disposed = true;
    cancelAnimationFrame(this.raf);
    this.finishWarp();
    window.removeEventListener('resize', this.resize);
    window.removeEventListener('pointermove', this.onPointerMove);
    window.removeEventListener('pointerdown', this.onPointerDown);
    window.removeEventListener('pointerup', this.onPointerUp);
    document.removeEventListener('visibilitychange', this.onVisibility);
    document.body.style.cursor = '';
    this.scene.traverse((o) => {
      const m = o as THREE.Mesh;
      m.geometry?.dispose?.();
      const mat = m.material as THREE.Material | THREE.Material[] | undefined;
      (Array.isArray(mat) ? mat : mat ? [mat] : []).forEach((x) => {
        (x as THREE.MeshBasicMaterial).map?.dispose();
        x.dispose();
      });
    });
    this.scene.environment?.dispose();
    this.renderer.dispose();
  }
}
