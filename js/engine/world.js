// Motor 3D del faro: carga de plantas horneadas, exterior (cielo, mar, lluvia, haz), cámara por nodos y postprocesado.
import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { MeshoptDecoder } from 'three/addons/libs/meshopt_decoder.module.js';
import { EffectComposer } from 'three/addons/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/addons/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/addons/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/addons/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/addons/postprocessing/OutputPass.js';

const NM = 1852;
const FLOOR_Y = { f0: 0, f1: 3.4, f2: 6.4, f3: 9.4 };
const ROOM_LAMP = { f0: new THREE.Vector3(1.05, 2.1, -1.82), f1: new THREE.Vector3(2.4, 4.4, -0.4), f2: new THREE.Vector3(0.33, 8.7, -1.87), f3: new THREE.Vector3(0, 11.4, 0) };
const EMIT_COL = {
  lamp_warm: [1.0, 0.78, 0.5, 6.0], lamp_red: [1.0, 0.1, 0.05, 5.0], dial: [1.0, 0.62, 0.28, 2.2], dial_green: [0.45, 1.0, 0.6, 2.0],
  stove_glow: [1.0, 0.38, 0.1, 3.0], screen_dim: [0.3, 0.5, 0.4, 0.8], img_dial_scale: [1.0, 0.75, 0.45, 1.2],
};

export class World {
  constructor(canvas, opts = {}) {
    this.canvas = canvas;
    this.quality = opts.quality || 'auto';
    this.reduceMotion = !!opts.reduceMotion;
    this.base = opts.base || '.';
    this.listeners = {};
    this.state = { lampOn: true, power: { f0: 1, f1: 1, f2: 0, f3: 1 }, keroLit: false, surge: 0, coverOff: false, lidOpen: false, txWarm: 0, sw: null, lamp: 1 };
    this.time = 0;
    this.flash = 0;
    this.nextFlash = 6 + Math.random() * 8;
    this.floor = 'f2';
    this.node = null;
    this.look = { yaw: 0, pitch: 0, tyaw: 0, tpitch: 0 };
    this.binoc = null;
    this.clock = new THREE.Clock();
    this._initRenderer();
  }

  on(ev, fn) { (this.listeners[ev] ||= []).push(fn); }
  emit(ev, d) { (this.listeners[ev] || []).forEach(f => f(d)); }

  _initRenderer() {
    const isMobile = matchMedia('(pointer:coarse)').matches || /Android|iPhone|iPad/i.test(navigator.userAgent);
    this.isMobile = isMobile;
    if (this.quality === 'auto') this.quality = isMobile ? 'media' : 'alta';
    // el antialiasing se hace en el render target multimuestreo del postprocesado (ver _buildPost)
    const r = new THREE.WebGLRenderer({ canvas: this.canvas, antialias: false, powerPreference: 'high-performance', alpha: false });
    r.outputColorSpace = THREE.SRGBColorSpace;
    r.toneMapping = THREE.ACESFilmicToneMapping;
    r.toneMappingExposure = 1.18;
    this.renderer = r;
    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x020306);
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.05, 30000);
    this.camera.position.set(0, 8, 0);
    this.scene.add(this.camera);
    this.dynScale = 1;
    this.fixedRes = /[?&]fixres/.test(location.search);
    this._perf = { acc: 0, n: 0, lastChange: 0 };
    this._resize();
    addEventListener('resize', () => this._resize());
  }

  setQuality(q) {
    this.quality = q;
    this._resize();
    if (this.bloom) this.bloom.enabled = q !== 'baja';
  }

  _pixelRatio() {
    // nitidez: hasta 2× en móvil y escritorio; la resolución dinámica baja sola si el dispositivo no llega
    const dpr = devicePixelRatio || 1;
    const cap = this.quality === 'baja' ? 1.25 : 2;
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    const maxPr = Math.sqrt(4.6e6 / Math.max(1, w * h)); // tope de ~4,6 megapíxeles (pantallas 4K)
    return Math.max(0.75, Math.min(dpr, cap, maxPr) * this.dynScale);
  }

  _resize() {
    const w = this.canvas.clientWidth || innerWidth, h = this.canvas.clientHeight || innerHeight;
    this.renderer.setPixelRatio(this._pixelRatio());
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this._applyFov();
    this.camera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(this._pixelRatio());
      this.composer.setSize(w, h);
    }
    if (this.grade) this.grade.uniforms.px.value.set(1 / Math.max(1, w * this._pixelRatio()), 1 / Math.max(1, h * this._pixelRatio()));
  }

  _applyFov() {
    const base = this.binoc ? this.binoc.fov : (this.node ? this.node.fov : 70);
    // en vertical (móvil) garantizamos un campo horizontal mínimo
    const a = this.camera.aspect;
    let v = base;
    const minH = this.binoc ? this.binoc.fov : 64;
    const hFov = 2 * Math.atan(Math.tan(v * Math.PI / 360) * a) * 180 / Math.PI;
    if (hFov < minH) v = 2 * Math.atan(Math.tan(minH * Math.PI / 360) / a) * 180 / Math.PI;
    this.camera.fov = Math.min(v, 105);
  }

  // ------------------------------------------------------------ carga
  async load(onProgress) {
    const mgr = new THREE.LoadingManager();
    const steps = { total: 0, done: 0 };
    const report = (label) => onProgress && onProgress(steps.done / Math.max(1, steps.total), label);
    this.meta = await (await fetch(`${this.base}/assets/scene_meta.json`)).json();
    const gl = new GLTFLoader(mgr);
    gl.setMeshoptDecoder(MeshoptDecoder);
    const tl = new THREE.TextureLoader(mgr);
    const ext = this.quality === 'baja' ? '_m' : '';
    const aniso = Math.max(4, this.renderer.capabilities.getMaxAnisotropy());
    const floors = ['f2', 'f3', 'f1', 'f0'];
    const tex = (p) => new Promise((res, rej) => tl.load(p, t => { t.flipY = false; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = aniso; steps.done++; report('Texturas'); res(t); }, undefined, rej));
    steps.total = floors.length * 4 + 1;
    this.floors = {};
    this._buildExterior();
    steps.done++; report('Exterior');
    for (const f of floors) {
      const [g, alb, l0, l1] = await Promise.all([
        new Promise((res, rej) => gl.load(`${this.base}/assets/glb/${f}.glb`, (x) => { steps.done++; report(`Planta ${f}`); res(x); }, undefined, rej)),
        tex(`${this.base}/assets/bake/${f}_albedo${ext}.webp`),
        tex(`${this.base}/assets/bake/${f}_L0${ext}.webp`),
        tex(`${this.base}/assets/bake/${f}_L1${ext}.webp`),
      ]);
      this._setupFloor(f, g.scene, alb, l0, l1);
      this.emit('floorLoaded', f);
    }
    this._buildPost();
    this._applyState();
    report('Listo');
  }

  _bakedMat(alb, l0, l1, floor, shiny) {
    const m = new THREE.ShaderMaterial({
      uniforms: {
        tAlb: { value: alb }, tL0: { value: l0 }, tL1: { value: l1 },
        k0: { value: 1.0 }, k1: { value: 1.0 }, flash: { value: 0 }, amb: { value: 0.012 },
        spec: { value: shiny ? 1 : 0 }, lampPos: { value: ROOM_LAMP[floor] }, lampCol: { value: new THREE.Color(1.0, 0.8, 0.55) },
        fogCol: { value: new THREE.Color(0x05080d) }, fogDen: { value: 0.035 }, emberK: { value: 0 },
      },
      vertexShader: /* glsl */`
        varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vD;
        void main(){ vUv = uv; vec4 w = modelMatrix * vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix) * normal);
          vec4 mv = viewMatrix * w; vD = -mv.z; gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tAlb, tL0, tL1; uniform float k0, k1, flash, amb, spec, fogDen, emberK; uniform vec3 lampPos, lampCol, fogCol;
        varying vec2 vUv; varying vec3 vN; varying vec3 vW; varying float vD;
        void main(){
          vec3 a = texture2D(tAlb, vUv).rgb;
          vec3 l0 = texture2D(tL0, vUv).rgb * 2.0;
          vec3 l1 = texture2D(tL1, vUv).rgb * 2.0;
          vec3 cool = vec3(0.55, 0.68, 1.0);
          vec3 light = l0 * k0 * (1.0 + flash * 5.0 * cool) + l1 * k1 + amb + vec3(1.0,0.35,0.1) * emberK * 0.04;
          vec3 c = a * light;
          if (spec > 0.5) {
            vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW); vec3 L = normalize(lampPos - vW);
            vec3 h = normalize(L + v);
            float s = pow(max(dot(n, h), 0.0), 42.0) * k1 * 0.9;
            float fr = pow(1.0 - max(dot(n, v), 0.0), 4.0);
            c += lampCol * s * (0.35 + 0.65 * a) + (l0 * k0 * 0.25 + l1 * k1 * 0.2) * fr * 0.6 + flash * fr * cool * 0.3;
          }
          float f = 1.0 - exp(-fogDen * fogDen * vD * vD);
          c = mix(c, fogCol, f * 0.5);
          gl_FragColor = vec4(c, 1.0);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
    return m;
  }

  _setupFloor(f, root, alb, l0, l1) {
    const group = new THREE.Group();
    group.name = f;
    const matte = this._bakedMat(alb, l0, l1, f, false);
    const shiny = this._bakedMat(alb, l0, l1, f, true);
    const fl = { group, mats: [matte, shiny], objects: {}, emit: [], glass: [], k1: 1, k0: 1 };
    root.traverse((o) => {
      if (!o.isMesh) return;
      fl.objects[o.name] = o;
      const ud = o.userData || {};
      const nm = o.name;
      if (ud.emit_mat || nm.startsWith('lamp_bulb')) {
        const em = EMIT_COL[ud.emit_mat] || EMIT_COL.lamp_warm;
        const mat = new THREE.MeshBasicMaterial({ color: new THREE.Color(em[0] * em[3], em[1] * em[3], em[2] * em[3]), toneMapped: true });
        if (ud.emit_mat === 'img_dial_scale') {
          mat.map = this._dialTex || (this._dialTex = new THREE.TextureLoader().load(`${this.base}/assets/tex/dial_scale.webp`, t => { t.colorSpace = THREE.SRGBColorSpace; }));
          mat.color.setScalar(1.6);
        }
        o.material = mat;
        o.userData.baseColor = mat.color.clone();
        o.userData.emitKind = ud.emit_mat || 'lamp_warm';
        fl.emit.push(o);
      } else if (nm.startsWith('glass_')) {
        o.material = this._glassMat(nm === 'glass_lantern');
        o.renderOrder = 5;
        fl.glass.push(o);
      } else if (nm === 'lens_glass') {
        o.material = this._lensMat();
        o.renderOrder = 4;
        this.lensGlass = o;
      } else if (nm === 'lens_frame') {
        o.material = new THREE.MeshStandardMaterial({ color: 0x8a6a2c, metalness: 0.9, roughness: 0.35, envMapIntensity: 1 });
        this.lensFrame = o;
      } else if (nm.startsWith('gear')) {
        o.material = new THREE.MeshStandardMaterial({ color: 0xa47c34, metalness: 0.85, roughness: 0.35 });
      } else if (nm.startsWith('clock_hand')) {
        o.material = new THREE.MeshBasicMaterial({ color: nm.endsWith('_s') ? 0xb32a20 : 0x111111 });
      } else if (['chart_paper', 'cork_board', 'workorder', 'drawing', 'calendar', 'azimuth_ring'].includes(nm)) {
        o.material = new THREE.MeshBasicMaterial({ color: 0xffffff });
        o.userData.paper = true;
      } else if (nm.startsWith('kero_chimney')) {
        o.material = new THREE.MeshBasicMaterial({ color: 0x99aabb, transparent: true, opacity: 0.25, depthWrite: false });
      } else if (nm === 'kero_mantle') {
        o.material = new THREE.MeshBasicMaterial({ color: 0x332a20 });
        this.mantle = o;
      } else if (Array.isArray(o.material)) {
        o.material = o.material.map((mm) => (mm && mm.name === 'bk_shiny') ? shiny : matte);
      } else {
        o.material = (o.material && o.material.name === 'bk_shiny') ? shiny : matte;
      }
      o.frustumCulled = true;
    });
    group.add(root);
    group.visible = false;
    this.scene.add(group);
    this.floors[f] = fl;
    root.updateMatrixWorld(true);
    if (f === 'f2') this._pivotHands(fl);
    for (const nm of ['chart_paper', 'workorder', 'cork_board', 'calendar', 'drawing']) if (fl.objects[nm]) this._paperPlane(fl.objects[nm], nm === 'chart_paper' || nm === 'workorder');
    if (f === 'f3') { if (fl.objects.azimuth_ring) fl.objects.azimuth_ring.visible = false; this._azimuthRing(group); }
    if (f === 'f3') this._buildBeams();
    if (f === 'f0') this._buildWater();
    this._applyPapers(f);
  }

  _pivotHands(fl) {
    this.hands = {};
    for (const k of ['h', 'm', 's']) {
      const o = fl.objects['clock_hand_' + k];
      if (!o) continue;
      const bb = new THREE.Box3().setFromObject(o);
      const piv = new THREE.Group();
      piv.position.set((bb.min.x + bb.max.x) / 2, bb.min.y + 0.02, (bb.min.z + bb.max.z) / 2 + 0.004 * (k === 's' ? 2 : k === 'm' ? 1 : 0));
      o.parent.add(piv);
      piv.updateMatrixWorld(true);
      piv.attach(o);
      this.hands[k] = piv;
    }
  }

  _paperPlane(o, horizontal) {
    o.geometry.computeBoundingBox();
    const bb = o.geometry.boundingBox;
    const sx = bb.max.x - bb.min.x, sy = bb.max.y - bb.min.y, sz = bb.max.z - bb.min.z;
    let g;
    if (horizontal) { g = new THREE.PlaneGeometry(sx, sz); g.rotateX(-Math.PI / 2); g.translate((bb.min.x + bb.max.x) / 2, bb.max.y + 0.0015, (bb.min.z + bb.max.z) / 2); }
    else { g = new THREE.PlaneGeometry(sx, sy); g.translate((bb.min.x + bb.max.x) / 2, (bb.min.y + bb.max.y) / 2, bb.max.z + 0.0015); }
    const plane = new THREE.Mesh(g, new THREE.MeshBasicMaterial({ color: 0xd8d2c4 }));
    plane.name = o.name + '_face';
    o.add(plane);
    o.userData.face = plane;
  }

  _azimuthRing(group) {
    const c = document.createElement('canvas'); c.width = 4096; c.height = 128;
    const g = c.getContext('2d');
    g.fillStyle = '#6b5226'; g.fillRect(0, 0, 4096, 128);
    g.fillStyle = '#e8d29a'; g.strokeStyle = '#e8d29a';
    for (let b = 0; b < 360; b++) {
      const u = (Math.PI - b * Math.PI / 180) / (2 * Math.PI);
      const x = (((1 - u) % 1) + 1) % 1 * 4096;
      g.lineWidth = b % 10 === 0 ? 5 : 2;
      g.beginPath(); g.moveTo(x, 0); g.lineTo(x, b % 10 === 0 ? 46 : b % 5 === 0 ? 30 : 18); g.stroke();
      if (b % 10 === 0) {
        g.save(); g.translate(x, 92); g.font = 'bold 40px "IBM Plex Mono", monospace'; g.textAlign = 'center';
        g.fillText(String(b).padStart(3, '0'), 0, 12); g.restore();
      }
    }
    const t = new THREE.CanvasTexture(c); t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.wrapS = THREE.RepeatWrapping; t.repeat.x = -1;
    const ring = new THREE.Mesh(new THREE.CylinderGeometry(2.49, 2.49, 0.15, 180, 1, true), new THREE.MeshBasicMaterial({ map: t, side: THREE.BackSide, color: 0xb0a080 }));
    ring.position.y = FLOOR_Y.f3 + 0.875;
    group.add(ring);
  }

  _glassMat(isLantern) {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, flash: { value: 0 }, lantern: { value: isLantern ? 1 : 0 }, glow: { value: 0 } },
      vertexShader: /* glsl */`varying vec2 vUv; varying vec3 vW; void main(){ vUv = uv; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */`
        uniform float time, flash, lantern, glow; varying vec2 vUv; varying vec3 vW;
        float h(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        void main(){
          vec2 p = vec2(atan(vW.x, vW.z) * 6.0 + vW.x * 2.0, vW.y);
          vec2 g = vec2(p.x * 9.0, p.y * 3.0 + time * 1.7);
          vec2 id = floor(g); vec2 f = fract(g);
          float r = h(id);
          float drop = smoothstep(0.08, 0.0, length((f - vec2(0.5, fract(r * 7.0 + time * (0.2 + r)))) * vec2(1.0, 0.35))) * step(0.55, r);
          float streak = smoothstep(0.03, 0.0, abs(f.x - 0.5)) * step(0.82, r) * (0.5 + 0.5 * sin(time * 3.0 + r * 20.0));
          float a = 0.06 + drop * 0.35 + streak * 0.25 + flash * 0.25;
          vec3 col = mix(vec3(0.55, 0.65, 0.8), vec3(1.0, 0.85, 0.6), glow * lantern) * (0.4 + drop + flash);
          gl_FragColor = vec4(col, a * (lantern > 0.5 ? 0.8 : 1.0));
          #include <colorspace_fragment>
        }`,
    });
  }

  _lensMat() {
    return new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, lamp: { value: 1 }, kero: { value: 0 }, rot: { value: 0 } },
      vertexShader: /* glsl */`varying vec3 vN; varying vec3 vW; varying vec3 vL; void main(){ vL = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */`
        uniform float time, lamp, kero, rot; varying vec3 vN; varying vec3 vW; varying vec3 vL;
        void main(){
          vec3 n = normalize(vN); vec3 v = normalize(cameraPosition - vW);
          float fr = pow(1.0 - abs(dot(n, v)), 2.0);
          float ang = atan(vL.x, -vL.z);
          float panel = pow(max(0.0, cos(ang)), 40.0) + pow(max(0.0, cos(ang - 0.36)), 40.0) + pow(max(0.0, cos(ang + 0.36)), 40.0);
          panel = min(1.0, panel + 0.12);
          float rings = 0.5 + 0.5 * sin(vL.y * 62.0);
          float on = max(lamp, kero * 0.55);
          vec3 warm = vec3(1.0, 0.86, 0.62);
          vec3 c = vec3(0.35, 0.45, 0.5) * fr * 0.6 + warm * on * (0.25 + 0.75 * panel) * (0.55 + 0.45 * rings) * 1.6;
          c += vec3(0.6, 0.8, 1.0) * pow(fr, 3.0) * 0.4;
          float a = 0.18 + fr * 0.35 + on * 0.35 * panel;
          gl_FragColor = vec4(c, a);
          #include <tonemapping_fragment>
          #include <colorspace_fragment>
        }`,
    });
  }

  // ------------------------------------------------------------ exterior
  _buildExterior() {
    const ext = new THREE.Group();
    this.ext = ext;
    this.scene.add(ext);
    // cielo de tormenta
    const sky = new THREE.Mesh(new THREE.SphereGeometry(20000, 32, 16), new THREE.ShaderMaterial({
      side: THREE.BackSide, depthWrite: false, fog: false,
      uniforms: { time: { value: 0 }, flash: { value: 0 }, flashDir: { value: new THREE.Vector3(-1, 0.3, 0).normalize() } },
      vertexShader: /* glsl */`varying vec3 vDir; void main(){ vDir = normalize(position); vec4 p = projectionMatrix*modelViewMatrix*vec4(position,1.0); gl_Position = vec4(p.xy, p.w * 0.99995, p.w); }`,
      fragmentShader: /* glsl */`
        uniform float time, flash; uniform vec3 flashDir; varying vec3 vDir;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        float fbm(vec3 p){ float a=0.5, s=0.0; for(int i=0;i<5;i++){ s += a*noise(p); p *= 2.03; a *= 0.5; } return s; }
        void main(){
          vec3 d = normalize(vDir);
          float h = d.y;
          vec2 uv = d.xz / max(0.08, d.y + 0.25);
          float cl = fbm(vec3(uv * 1.2 + vec2(time * 0.035, time * 0.012), time * 0.02));
          float cl2 = fbm(vec3(uv * 3.0 - vec2(time * 0.05, 0.0), 1.7));
          float clouds = smoothstep(0.35, 0.85, cl * 0.75 + cl2 * 0.35);
          // noche de temporal: horizonte algo más claro (luz difusa lejana), nubes bajas con volumen
          vec3 base = mix(vec3(0.032, 0.040, 0.050), vec3(0.016, 0.021, 0.032), smoothstep(0.0, 0.45, h));
          vec3 col = base + vec3(0.045, 0.052, 0.066) * clouds * (0.6 + 0.4 * smoothstep(0.0, 0.3, h));
          float fl = flash * (0.35 + 0.65 * pow(max(0.0, dot(d, flashDir)), 2.0));
          col += vec3(0.55, 0.62, 0.8) * fl * (0.25 + clouds);
          col = mix(col, vec3(0.012, 0.016, 0.024), smoothstep(0.02, -0.1, h));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    sky.renderOrder = -10;
    ext.add(sky);
    this.sky = sky;
    // mar (a 62 m bajo la base de la torre)
    const seaGeo = new THREE.PlaneGeometry(40000, 40000, 1, 1);
    seaGeo.rotateX(-Math.PI / 2);
    const sea = new THREE.Mesh(seaGeo, new THREE.ShaderMaterial({
      uniforms: { time: { value: 0 }, flash: { value: 0 }, beamAng: { value: 0 }, beamOn: { value: 1 } },
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */`
        uniform float time, flash, beamAng, beamOn; varying vec3 vW;
        float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7)))*43758.5453); }
        float noise(vec2 x){ vec2 i = floor(x); vec2 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
        void main(){
          vec2 q = vW.xz;
          vec2 p = q * 0.012;
          // mar de fondo del suroeste + mar de viento + rizos
          float swell = sin(dot(q, vec2(0.016, 0.011)) - time * 0.85) * 0.5 + 0.5;
          float w = noise(p + vec2(time * 0.08, time * 0.05)) * 0.5 + noise(p * 3.1 - vec2(time * 0.2, 0.0)) * 0.3 + noise(p * 9.0 + time * 0.4) * 0.2;
          w = w * 0.78 + swell * 0.22;
          // espuma: crestas que rompen y estelas largas empujadas por el viento
          float foam = smoothstep(0.64, 0.86, w + 0.12 * noise(q * 0.35 + time * 0.9));
          float streak = smoothstep(0.72, 0.95, noise(vec2(q.x * 0.018, q.y * 0.16) + vec2(time * 0.05, time * 0.12))) * 0.6;
          vec3 v = normalize(cameraPosition - vW);
          float fres = pow(1.0 - max(v.y, 0.0), 5.0);
          vec3 col = vec3(0.010, 0.016, 0.022) + vec3(0.03, 0.044, 0.054) * w + vec3(0.15, 0.17, 0.19) * (foam * 0.55 + streak * 0.35);
          col += vec3(0.035, 0.045, 0.06) * fres;
          float a = atan(vW.x, -vW.z);
          for (int i = -1; i <= 1; i++) {
            float b = beamAng + float(i) * 0.36;
            float da = abs(mod(a - b + 3.14159, 6.28318) - 3.14159);
            float dist = length(vW.xz);
            col += vec3(0.9, 0.78, 0.55) * beamOn * smoothstep(0.08, 0.0, da) * exp(-dist * 0.0006) * (0.08 + foam * 0.5 + w * 0.08);
          }
          col += vec3(0.4, 0.45, 0.6) * flash * (0.15 + w * 0.3 + foam);
          float dist = length(vW.xz - cameraPosition.xz);
          col = mix(col, vec3(0.03, 0.038, 0.048), smoothstep(1200.0, 8000.0, dist));
          gl_FragColor = vec4(col, 1.0);
          #include <colorspace_fragment>
        }`,
    }));
    sea.position.y = -62;
    ext.add(sea);
    this.sea = sea;
    // acantilado del cabo bajo la torre y costa lejana
    const cliff = new THREE.Mesh(new THREE.CylinderGeometry(9, 40, 62, 24, 6, true), new THREE.MeshBasicMaterial({ color: 0x07090b }));
    cliff.position.y = -31;
    ext.add(cliff);
    // costa: relieve bajo y lejano (solo silueta contra el cielo; no tapa el horizonte cercano)
    const land = new THREE.Mesh(this._landGeometry(), new THREE.MeshBasicMaterial({ color: 0x07090c, side: THREE.DoubleSide }));
    ext.add(land);
    this.land = land;
    // luces lejanas con su característica
    this.farLights = [];
    const mkLight = (name, x, y, z, color, pattern, size) => {
      const mat = new THREE.SpriteMaterial({ map: this._glowTex(), color, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
      const s = new THREE.Sprite(mat);
      s.position.set(x, y, z);
      s.scale.setScalar(size);
      s.userData = { pattern, color: new THREE.Color(color), name, size };
      ext.add(s);
      this.farLights.push(s);
      return s;
    };
    mkLight('insua', 0.6 * NM, 40, -4.2 * NM, 0xfff2d6, { kind: 'group', n: 2, period: 10, on: 0.35, gap: 1.2 }, 420);
    mkLight('facho', -1.2 * NM, 160, 3.0 * NM, 0xff2a18, { kind: 'fixed' }, 300);
    mkLight('camarinas', 1.5 * NM, 12, 4.5 * NM, 0xff3a26, { kind: 'group', n: 2, period: 7, on: 0.4, gap: 1.0 }, 220);
    this.maree = mkLight('maree', -2.2 * NM, 4, -1.4 * NM, 0xf4f0e6, { kind: 'sway' }, 160);
    // lluvia (líneas instanciadas que siguen a la cámara)
    const N = this.quality === 'baja' ? 500 : 1400;
    const pos = new Float32Array(N * 2 * 3);
    for (let i = 0; i < N; i++) {
      const x = (Math.random() - 0.5) * 40, y = Math.random() * 30 - 10, z = (Math.random() - 0.5) * 40;
      const len = 0.5 + Math.random() * 0.6;
      pos.set([x, y, z, x + 0.18 * len, y - len, z + 0.06 * len], i * 6);
    }
    const rg = new THREE.BufferGeometry();
    rg.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const rain = new THREE.LineSegments(rg, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending,
      uniforms: { time: { value: 0 }, origin: { value: new THREE.Vector3() }, flash: { value: 0 } },
      vertexShader: /* glsl */`
        uniform float time; uniform vec3 origin; varying float vA;
        void main(){ vec3 p = position; float fall = mod(p.y - time * 22.0, 30.0) - 12.0; p.y = fall; p.x += time * 4.0 * 0.0;
          p.x = mod(p.x + time * 3.5 + 20.0, 40.0) - 20.0;
          vec3 w = p + vec3(floor(origin.x / 40.0 + 0.5) * 0.0 + origin.x, origin.y, origin.z);
          vA = 1.0; vec4 mv = viewMatrix * vec4(w, 1.0); vA = smoothstep(60.0, 2.0, -mv.z) * smoothstep(0.4, 3.0, -mv.z); gl_Position = projectionMatrix * mv; }`,
      fragmentShader: /* glsl */`uniform float flash; varying float vA; void main(){ gl_FragColor = vec4(vec3(0.55, 0.62, 0.75) * (0.18 + flash * 1.5), vA * 0.5); }`,
    }));
    rain.frustumCulled = false;
    this.rain = rain;
    this.scene.add(rain);
  }

  _landGeometry() {
    // malla en rejilla: dentro del polígono de tierra (costa → este) el terreno sube con la distancia a la costa;
    // fuera queda bajo el mar. El cabo del faro se queda a la altura del acantilado.
    const C = [[1.1, 6.0], [0.55, 5.0], [0.4, 4.35], [0.62, 3.95], [1.25, 3.45], [1.7, 2.7], [1.45, 1.85], [0.75, 1.15], [0.2, 0.55], [-0.22, 0.12], [-0.12, -0.35], [-0.35, -1.1], [-0.75, -1.9], [-1.1, -2.65], [-1.05, -3.15], [-0.55, -3.55], [0.35, -3.85], [1.15, -4.15], [1.35, -4.45], [1.1, -4.9], [0.6, -5.4], [0.7, -6.4]];
    const poly = [...C, [9, -6.4], [9, 6.0]];
    const inside = (x, y) => { let c = false; for (let i = 0, j = poly.length - 1; i < poly.length; j = i++) { const [xi, yi] = poly[i], [xj, yj] = poly[j]; if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c; } return c; };
    const segD = (x, y) => { let m = 1e9; for (let i = 0; i < C.length - 1; i++) { const [ax, ay] = C[i], [bx, by] = C[i + 1]; const dx = bx - ax, dy = by - ay; const t = Math.max(0, Math.min(1, ((x - ax) * dx + (y - ay) * dy) / (dx * dx + dy * dy))); m = Math.min(m, Math.hypot(x - ax - t * dx, y - ay - t * dy)); } return m; };
    const NX = 130, NY = 200, X0 = -2.5, X1 = 6, Y0 = -7, Y1 = 7;
    const pos = [], idx = [];
    for (let j = 0; j <= NY; j++) for (let i = 0; i <= NX; i++) {
      const x = X0 + (X1 - X0) * i / NX, y = Y0 + (Y1 - Y0) * j / NY;
      let hgt = -30;
      if (inside(x, y)) {
        const d = segD(x, y);
        const k = Math.min(1, d / 1.1);
        hgt = 10 + 125 * k * k * (3 - 2 * k) + 18 * Math.sin(x * 2.1 + y * 1.3) * Math.min(1, d / 0.5);
        hgt += 100 * Math.exp(-((x + 1.0) ** 2 + (y + 3.05) ** 2) / 0.18);   // Monte Facho (la torreta roja queda en lo alto)
      }
      pos.push(x * NM, -62 + hgt, -y * NM);
    }
    for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
      const a = j * (NX + 1) + i, b = a + 1, c = a + NX + 1, d = c + 1;
      idx.push(a, c, b, b, c, d);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  _coastGeometry() {
    const LAND = [[1.1, 6.0], [0.55, 5.0], [0.4, 4.35], [0.62, 3.95], [1.25, 3.45], [1.7, 2.7], [1.45, 1.85], [0.75, 1.15], [0.2, 0.55], [-0.22, 0.12], [-0.12, -0.35], [-0.35, -1.1], [-0.75, -1.9], [-1.1, -2.65], [-1.05, -3.15], [-0.55, -3.55], [0.35, -3.85], [1.15, -4.15], [1.35, -4.45], [1.1, -4.9], [0.6, -5.4], [0.7, -6.4]];
    const pos = [], idx = [];
    LAND.forEach(([x, y], i) => {
      const X = x * NM, Z = -y * NM;
      const hgt = 60 + 90 * Math.abs(Math.sin(i * 1.7)) + (i % 3) * 25;
      pos.push(X, -62, Z, X, -62 + hgt, Z, X + 2500, -62 + hgt * 1.4, Z);
    });
    for (let i = 0; i < LAND.length - 1; i++) {
      const a = i * 3, b = (i + 1) * 3;
      idx.push(a, b, a + 1, b, b + 1, a + 1, a + 1, b + 1, a + 2, b + 1, b + 2, a + 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
    g.setIndex(idx);
    return g;
  }

  _glowTex() {
    if (this._glow) return this._glow;
    const c = document.createElement('canvas'); c.width = c.height = 128;
    const g = c.getContext('2d');
    const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,255,255,1)'); gr.addColorStop(0.12, 'rgba(255,255,255,0.85)'); gr.addColorStop(0.35, 'rgba(255,255,255,0.18)'); gr.addColorStop(1, 'rgba(255,255,255,0)');
    g.fillStyle = gr; g.fillRect(0, 0, 128, 128);
    this._glow = new THREE.CanvasTexture(c);
    return this._glow;
  }

  _buildBeams() {
    const y = FLOOR_Y.f3 + 1.975;
    const grp = new THREE.Group();
    grp.position.set(0, y, 0);
    const len = 1600;
    const geo = new THREE.ConeGeometry(55, len, 24, 1, true);
    geo.translate(0, -len / 2, 0);
    geo.rotateX(Math.PI / 2);
    const mat = new THREE.ShaderMaterial({
      transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide,
      uniforms: { time: { value: 0 }, on: { value: 1 } },
      vertexShader: /* glsl */`varying vec3 vL; varying vec3 vW; varying vec3 vN; void main(){ vL = position; vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; vN = normalize(mat3(modelMatrix)*normal); gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */`
        uniform float time, on; varying vec3 vL; varying vec3 vW; varying vec3 vN;
        float hash(vec3 p){ p = fract(p*0.3183099+.1); p *= 17.0; return fract(p.x*p.y*p.z*(p.x+p.y+p.z)); }
        float noise(vec3 x){ vec3 i = floor(x); vec3 f = fract(x); f = f*f*(3.0-2.0*f);
          return mix(mix(mix(hash(i),hash(i+vec3(1,0,0)),f.x),mix(hash(i+vec3(0,1,0)),hash(i+vec3(1,1,0)),f.x),f.y),
                     mix(mix(hash(i+vec3(0,0,1)),hash(i+vec3(1,0,1)),f.x),mix(hash(i+vec3(0,1,1)),hash(i+vec3(1,1,1)),f.x),f.y),f.z); }
        void main(){
          float d = -vL.z; float t = clamp(d / 1600.0, 0.0, 1.0);
          vec3 v = normalize(cameraPosition - vW);
          float edge = pow(abs(dot(normalize(vN), v)), 1.4);
          float n = noise(vW * 0.035 + vec3(time * 0.7, -time * 2.0, 0.0)) * 0.6 + noise(vW * 0.12 - vec3(0.0, time * 6.0, 0.0)) * 0.4;
          float a = on * edge * (1.0 - t) * (1.0 - t) * (0.08 + 0.18 * n) * smoothstep(0.0, 6.0, d);
          gl_FragColor = vec4(vec3(1.0, 0.9, 0.7) * a, a);
        }`,
    });
    this.beamMat = mat;
    for (let i = -1; i <= 1; i++) {
      const m = new THREE.Mesh(geo, mat);
      m.rotation.y = i * 0.36;
      m.renderOrder = 6;
      m.frustumCulled = false;
      grp.add(m);
    }
    this.beams = grp;
    this.scene.add(grp);
  }

  _buildWater() {
    const g = new THREE.CircleGeometry(3.05, 48);
    g.rotateX(-Math.PI / 2);
    const m = new THREE.Mesh(g, new THREE.ShaderMaterial({
      transparent: true, depthWrite: false,
      uniforms: { time: { value: 0 }, level: { value: 0 }, flash: { value: 0 } },
      vertexShader: /* glsl */`varying vec3 vW; void main(){ vec4 w = modelMatrix*vec4(position,1.0); vW = w.xyz; gl_Position = projectionMatrix*viewMatrix*w; }`,
      fragmentShader: /* glsl */`
        uniform float time, level, flash; varying vec3 vW;
        void main(){
          float r = sin(vW.x * 9.0 + time * 2.3) * sin(vW.z * 8.0 - time * 1.9) * 0.5 + 0.5;
          float edge = smoothstep(1.4, 3.0, length(vW.xz - vec2(0.0, 0.0)));
          vec3 c = vec3(0.02, 0.035, 0.04) + vec3(0.12, 0.14, 0.16) * pow(r, 6.0) + flash * 0.2;
          gl_FragColor = vec4(c, (0.55 + 0.3 * r) * min(1.0, level * 8.0));
          #include <colorspace_fragment>
        }`,
    }));
    m.position.y = 0.01;
    m.visible = false;
    this.water = m;
    this.floors.f0.group.add(m);
  }

  _buildPost() {
    const r = this.renderer;
    // render target HDR con multimuestreo (MSAA 4×) para bordes limpios; el segundo búfer no lo necesita
    const gl2 = r.capabilities.isWebGL2;
    const hdr = gl2 && (r.extensions.has('EXT_color_buffer_float') || r.extensions.has('EXT_color_buffer_half_float'));
    const rt = new THREE.WebGLRenderTarget(1, 1, { type: hdr ? THREE.HalfFloatType : THREE.UnsignedByteType, samples: gl2 && this.quality !== 'baja' ? 4 : 0 });
    const comp = new EffectComposer(r, rt);
    comp.renderTarget2.samples = 0;
    comp.addPass(new RenderPass(this.scene, this.camera));
    const size = new THREE.Vector2(this.canvas.clientWidth || innerWidth, this.canvas.clientHeight || innerHeight);
    this.bloom = new UnrealBloomPass(size.clone().multiplyScalar(0.5), 0.75, 0.55, 0.82);
    this.bloom.enabled = this.quality !== 'baja';
    comp.addPass(this.bloom);
    // la imagen final se gradúa en espacio de pantalla (tras el tonemapping): aura tenebrosa, tensión y nitidez
    comp.addPass(new OutputPass());
    this.grade = new ShaderPass({
      uniforms: {
        tDiffuse: { value: null }, time: { value: 0 }, vig: { value: 1.0 }, grain: { value: 0.06 }, ca: { value: 0.0009 }, fade: { value: 0 }, flash: { value: 0 },
        tint: { value: new THREE.Vector3(1, 1, 1) }, px: { value: new THREE.Vector2(1 / 1024, 1 / 1024) }, sharp: { value: 0.36 },
        tension: { value: 0 }, pulse: { value: 0 }, mood: { value: 1 }, alert: { value: 0 }, blur: { value: 0 },
      },
      vertexShader: /* glsl */`varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix*modelViewMatrix*vec4(position,1.0); }`,
      fragmentShader: /* glsl */`
        uniform sampler2D tDiffuse; uniform float time, vig, grain, ca, fade, flash, sharp, tension, pulse, mood, alert, blur; uniform vec3 tint; uniform vec2 px; varying vec2 vUv;
        float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233)) + time) * 43758.5453); }
        float h2(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
        float vn(vec2 p){ vec2 i = floor(p), f = fract(p); f = f*f*(3.0-2.0*f);
          return mix(mix(h2(i), h2(i+vec2(1,0)), f.x), mix(h2(i+vec2(0,1)), h2(i+vec2(1,1)), f.x), f.y); }
        void main(){
          vec2 c = vUv - 0.5;
          vec3 c0 = texture2D(tDiffuse, vUv).rgb;
          // nitidez adaptativa (realce limitado al rango local: sin halos)
          vec3 n = texture2D(tDiffuse, vUv + vec2(0.0, px.y)).rgb, s2 = texture2D(tDiffuse, vUv - vec2(0.0, px.y)).rgb;
          vec3 e = texture2D(tDiffuse, vUv + vec2(px.x, 0.0)).rgb, w = texture2D(tDiffuse, vUv - vec2(px.x, 0.0)).rgb;
          vec3 mn = min(c0, min(min(n, s2), min(e, w))), mx = max(c0, max(max(n, s2), max(e, w)));
          vec3 col = clamp(c0 + (c0 - (n + s2 + e + w) * 0.25) * sharp * 2.0 * (1.0 - blur), mn, mx);
          // últimos cinco minutos: las dos noches se superponen — la vista se emborrona (más en los bordes) y se desdobla
          if (blur > 0.001) {
            float r2 = dot(c, c) * 4.0;
            float rad = blur * (3.0 + 9.0 * r2) * (1.0 + 0.25 * pulse);
            vec3 acc = col;
            for (int i = 0; i < 8; i++) {
              float a = float(i) * 0.7853982 + time * 0.3;
              float ring = mod(float(i), 2.0) < 0.5 ? 1.0 : 0.5;
              acc += texture2D(tDiffuse, vUv + vec2(cos(a), sin(a)) * px * rad * ring).rgb;
            }
            vec3 bl = acc / 9.0;
            col = mix(col, bl, clamp(blur * (0.55 + 1.2 * r2), 0.0, 1.0));
            // la otra noche, fría y desplazada, asoma por encima
            vec2 go = vec2(sin(time * 0.71), cos(time * 0.53)) * (0.004 + 0.01 * blur) * blur;
            vec3 ghost = texture2D(tDiffuse, vUv + go).rgb * vec3(0.78, 0.93, 1.15);
            col = mix(col, max(col, ghost), 0.42 * blur);
          }
          // aberración cromática leve hacia los bordes (crece con la tensión)
          float k = dot(c, c) * 4.0;
          float cab = ca * (1.0 + tension * 1.5 + alert * 4.0);
          col.r = mix(col.r, texture2D(tDiffuse, vUv + c * cab).r, k);
          col.b = mix(col.b, texture2D(tDiffuse, vUv - c * cab).b, k);
          col *= tint;
          // gradación tenebrosa: menos color, sombras frías verdeazuladas, luces cálidas de lámpara
          float l = dot(col, vec3(0.2126, 0.7152, 0.0722));
          float sat = mix(1.0, 0.74 - 0.16 * tension, mood);
          col = mix(vec3(l), col, sat);
          vec3 cold = vec3(0.80, 0.95, 1.08), warm = vec3(1.08, 1.0, 0.86);
          col *= mix(vec3(1.0), mix(cold, warm, smoothstep(0.12, 0.7, l)), mood);
          // contraste en S y negros densos con un fondo azul muy oscuro
          vec3 sc = col * col * (3.0 - 2.0 * col);
          col = mix(col, sc, 0.35 * mood);
          col = max(col - 0.018 * mood, 0.0) + vec3(0.003, 0.006, 0.010) * mood;
          // viñeta que respira, se cierra con la tensión y late con el corazón al final
          float breath = 0.035 * sin(time * 0.55) + 0.02 * sin(time * 1.3 + 1.7);
          float rr = length(c * vec2(1.0, 1.18)) * (vig + 0.22 * tension + breath + 0.10 * pulse + 0.38 * alert);
          float v = smoothstep(0.92, 0.22, rr);
          // humo oscuro que se mueve en los bordes
          float smoke = vn(vUv * vec2(3.0, 2.2) + vec2(time * 0.035, -time * 0.02)) * 0.6 + vn(vUv * 7.0 - time * 0.05) * 0.4;
          float edge = 1.0 - v;
          col *= mix(0.16, 1.0, v) * (1.0 - 0.28 * smoke * edge * mood);
          // con el tiempo casi agotado, los bordes se tiñen de rojo al ritmo del pulso
          col = mix(col, col * vec3(1.35, 0.62, 0.58), clamp(edge * (0.25 * tension * tension + 0.55 * pulse + 0.9 * alert), 0.0, 0.85) * mood);
          // en las alertas, un golpe de oscuridad y menos color en todo el cuadro
          col *= 1.0 - 0.18 * alert;
          col = mix(col, vec3(dot(col, vec3(0.2126, 0.7152, 0.0722))), 0.35 * alert);
          // grano fino de película
          col *= 1.0 + (h(vUv * 1000.0) - 0.5) * grain;
          col += (h(vUv * 777.0 + 3.1) - 0.5) * 0.004;
          col += flash * vec3(0.5, 0.55, 0.65) * 0.18;
          col = mix(col, vec3(0.0), fade);
          gl_FragColor = vec4(clamp(col, 0.0, 1.0), 1.0);
        }`,
    });
    comp.addPass(this.grade);
    this.composer = comp;
    this._resize();
  }

  // ------------------------------------------------------------ texturas de papel (carta, corcho...)
  setPaper(name, canvas) {
    this._papers = this._papers || {};
    this._papers[name] = canvas;
    for (const f of Object.keys(this.floors || {})) this._applyPapers(f);
  }
  _applyPapers(f) {
    const fl = this.floors && this.floors[f];
    if (!fl || !this._papers) return;
    for (const [name, cv] of Object.entries(this._papers)) {
      const o0 = fl.objects[name];
      if (!o0) continue;
      const o = o0.userData.face || o0;
      const t = o.material.map && o.material.map.image === cv ? o.material.map : new THREE.CanvasTexture(cv);
      t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; t.needsUpdate = true;
      o.material.map = t; o.material.color.setScalar(f === 'f0' || f === 'f1' ? 0.8 : 0.72); o.material.needsUpdate = true;
    }
  }

  // ------------------------------------------------------------ estado del juego → mundo
  setState(patch) {
    Object.assign(this.state, patch);
    this._applyState();
  }

  _applyState() {
    if (!this.floors) return;
    const st = this.state;
    for (const [f, fl] of Object.entries(this.floors)) {
      let k1 = st.power[f] ? 1 : 0;
      if (f === 'f3') k1 = st.lampOn ? 1 : (st.keroLit ? 0.32 : 0);
      if (f === 'f0' && st.surge > 0.6 && !st.lampOn && !st.keroLit) k1 *= 0.2;
      fl.targetK1 = k1;
      for (const o of fl.emit) {
        let on = 1;
        if (o.userData.emitKind === 'lamp_warm') on = (f === 'f3' ? (st.lampOn ? 1 : 0) : (st.power[f] ? 1 : 0));
        if (o.userData.emitKind === 'dial' || o.userData.emitKind === 'img_dial_scale') on = st.power.f2 ? 1 : 0.35;
        if (o.userData.emitKind === 'dial_green') on = st.power.f2 ? 1 : 0;
        o.userData.on = on;
      }
    }
    const f2 = this.floors.f2;
    if (f2) {
      for (let k = 0; k < 4; k++) { const b = f2.objects['breaker' + k]; if (b) b.rotation.x = (k === 0 ? (st.power.f2 ? -0.5 : 0.5) : -0.5); }
      for (let i = 0; i < 4; i++) { const v = f2.objects['tx_valve' + i]; if (v) v.material = this._valveMat(st.txWarm); }
    }
    const f0 = this.floors.f0;
    if (f0) {
      const cover = f0.objects.panel_cover;
      if (cover) cover.visible = !st.coverOff;
      for (let i = 0; i < 4; i++) { const s = f0.objects['cover_screw' + i]; if (s) s.visible = !st.coverOff; }
      const lever = f0.objects.switch_lever, handle = f0.objects.switch_handle;
      if (lever && !lever.userData.r0) { lever.userData.r0 = lever.rotation.clone(); if (handle) handle.userData.p0 = handle.position.clone(); }
    }
    const f3 = this.floors.f3;
    if (f3) {
      const lid = f3.objects.kbox_lid;
      if (lid) { lid.userData.p0 ||= lid.position.clone(); lid.position.y = lid.userData.p0.y + (st.lidOpen ? 0.25 : 0); lid.rotation.z = st.lidOpen ? 0.6 : 0; }
      const sw = f3.objects.lamp_switch;
      if (sw) { sw.userData.r0 ||= sw.rotation.x; sw.rotation.x = sw.userData.r0 + (st.lampOn ? 0 : 0.7); }
    }
  }

  _valveMat(warm) {
    const k = warm ? Math.min(1, warm) : 0;
    this._vm ||= {};
    const key = Math.round(k * 10);
    return this._vm[key] ||= new THREE.MeshBasicMaterial({ color: new THREE.Color(0.15 + 1.6 * k, 0.12 + 0.65 * k, 0.1 + 0.15 * k) });
  }

  // ------------------------------------------------------------ cámara y navegación
  goNode(name, instant = false) {
    const nd = this.meta.nodes[name];
    if (!nd) return;
    const prevFloor = this.floor;
    this.node = { name, ...nd, pos: new THREE.Vector3(...nd.pos), target: new THREE.Vector3(...nd.target) };
    this.floor = nd.floor;
    this.look.tyaw = 0; this.look.tpitch = 0;
    if (instant || !this._camFrom) {
      this.look.yaw = 0; this.look.pitch = 0;
      this.camera.position.copy(this.node.pos);
      this._camTarget = this.node.target.clone();
      this._tween = null;
    } else {
      this._tween = { t: 0, dur: prevFloor !== this.floor ? 0.01 : (this.reduceMotion ? 0.01 : 0.85), fromPos: this.camera.position.clone(), fromTarget: this._camTarget.clone() };
    }
    this._camFrom = true;
    for (const [f, fl] of Object.entries(this.floors || {})) fl.group.visible = (f === this.floor);
    if (this.beams) this.beams.visible = true;
    this._applyFov();
    this.camera.updateProjectionMatrix();
    this.emit('node', this.node);
  }

  dragLook(dx, dy) {
    if (this.binoc) {
      this.binoc.yaw -= dx * 0.0016 * this.binoc.fov / 20;
      this.binoc.pitch = Math.max(-0.5, Math.min(0.35, this.binoc.pitch - dy * 0.0016 * this.binoc.fov / 20));
      return;
    }
    this.look.tyaw = Math.max(-0.75, Math.min(0.75, this.look.tyaw - dx * 0.0035));
    this.look.tpitch = Math.max(-0.5, Math.min(0.4, this.look.tpitch - dy * 0.0035));
  }

  setBinoculars(on, yawDeg = 270) {
    if (on) {
      this.binoc = { yaw: (yawDeg) * Math.PI / 180, pitch: -0.04, fov: 18 };
    } else this.binoc = null;
    this._applyFov();
    this.camera.updateProjectionMatrix();
  }
  binocAzimuth() {
    if (!this.binoc) return 0;
    let d = (this.binoc.yaw * 180 / Math.PI) % 360;
    if (d < 0) d += 360;
    return d;
  }

  fade(v) { if (this.grade) this.grade.uniforms.fade.value = v; }
  // golpe de alerta (cuentas atrás, inundación…): se desvanece solo
  alert(k = 1) { this._alert = Math.max(this._alert || 0, k); if (!this.reduceMotion) this._shake = Math.max(this._shake || 0, k * 0.6); }
  // 0..1: cuánto aprieta el reloj; pulse: latido (0..1) en el último minuto; mood 0 = sin gradación (menús)
  setTension(t, pulse = 0, mood = 1, blur = 0) {
    if (!this.grade) return;
    const u = this.grade.uniforms;
    u.blur.value = Math.max(0, Math.min(1, blur)) * (this.reduceMotion ? 0.6 : 1);
    u.tension.value = Math.max(0, Math.min(1, t));
    u.pulse.value = this.reduceMotion ? 0 : pulse;
    u.mood.value = mood;
  }

  // proyección de puntos interactivos (para la capa HTML)
  project(posArr, out) {
    const v = this._pv ||= new THREE.Vector3();
    v.set(posArr[0], posArr[1], posArr[2]);
    const camDir = this._cd ||= new THREE.Vector3();
    this.camera.getWorldDirection(camDir);
    const toP = this._tp ||= new THREE.Vector3();
    toP.copy(v).sub(this.camera.position);
    const dist = toP.length();
    const facing = toP.normalize().dot(camDir);
    v.project(this.camera);
    out.x = (v.x * 0.5 + 0.5);
    out.y = (-v.y * 0.5 + 0.5);
    out.visible = facing > 0.2 && Math.abs(v.x) < 1.05 && Math.abs(v.y) < 1.05;
    out.dist = dist;
    return out;
  }

  // ------------------------------------------------------------ bucle
  frame() {
    // tiempo real para todo lo periódico (el haz y sus 15 s son parte del enigma); dt acotado para animaciones
    const rdt = Math.min(1, this.clock.getDelta());
    const dt = Math.min(0.1, rdt);
    this.time += rdt;
    // resolución dinámica: si el dispositivo no llega a ~40 fps, baja un poco la resolución; si sobra, la recupera
    const P = this._perf;
    if (!this.fixedRes && rdt < 0.25) { P.acc += rdt; P.n++; }
    if (P.acc >= 2) {
      const fps = P.n / P.acc; P.acc = 0; P.n = 0;
      if (fps < 40 && this.dynScale > 0.5 && this.time - P.lastChange > 2) { this.dynScale = Math.max(0.5, Math.round((this.dynScale - (fps < 25 ? 0.2 : 0.1)) * 100) / 100); P.lastChange = this.time; this._resize(); }
      else if (fps > 56 && this.dynScale < 1 && this.time - P.lastChange > 6) { this.dynScale = Math.min(1, Math.round((this.dynScale + 0.1) * 100) / 100); P.lastChange = this.time; this._resize(); }
    }
    const t = this.time;
    const st = this.state;
    // relámpagos
    this.nextFlash -= dt;
    if (this.nextFlash <= 0) {
      this._flashSeq = [0, 0.09, 0.22, 0.31].map(x => t + x);
      this.nextFlash = 7 + Math.random() * 16;
      this.flashDir = new THREE.Vector3(-0.6 - Math.random() * 0.4, 0.25 + Math.random() * 0.3, (Math.random() - 0.5) * 1.6).normalize();
      if (this.sky) this.sky.material.uniforms.flashDir.value.copy(this.flashDir);
      this.emit('lightning', { delay: 1.2 + Math.random() * 3.5, strength: 0.6 + Math.random() * 0.4 });
    }
    let fl = 0;
    if (this._flashSeq) for (const s0 of this._flashSeq) { const d = t - s0; if (d >= 0 && d < 0.12) fl = Math.max(fl, 1 - d / 0.12); }
    if (this.reduceMotion) fl *= 0.35;
    this.flash = fl;
    // haz giratorio: 1 vuelta / 15 s
    const rot = (t * Math.PI * 2 / 15) % (Math.PI * 2);
    const lampOn = st.lampOn || st.keroLit;
    if (this.beams) {
      this.beams.rotation.y = -rot;
      this.beamMat.uniforms.time.value = t;
      this.beamMat.uniforms.on.value = st.lampOn ? 1 : (st.keroLit ? 0.45 : 0);
    }
    if (this.lensGlass) {
      this.lensGlass.rotation.y = -rot;
      const u = this.lensGlass.material.uniforms; u.time.value = t; u.lamp.value = st.lampOn ? 1 : 0; u.kero.value = st.keroLit ? 1 : 0; u.rot.value = 0;
    }
    if (this.lensFrame) this.lensFrame.rotation.y = -rot;
    if (this.sea) { const u = this.sea.material.uniforms; u.time.value = t; u.flash.value = fl; u.beamAng.value = rot; u.beamOn.value = lampOn ? (st.lampOn ? 1 : 0.45) : 0; }
    if (this.sky) { const u = this.sky.material.uniforms; u.time.value = t; u.flash.value = fl; }
    if (this.rain) { const u = this.rain.material.uniforms; u.time.value = t; u.origin.value.copy(this.camera.position); u.flash.value = fl; }
    if (this.water) {
      this.water.visible = st.surge > 0;
      this.water.position.y = 0.01 + st.surge * 0.32;
      const u = this.water.material.uniforms; u.time.value = t; u.level.value = st.surge; u.flash.value = fl;
    }
    // luces lejanas
    for (const s of this.farLights || []) {
      const p = s.userData.pattern;
      let k = 1;
      if (p.kind === 'group') {
        const ph = t % p.period;
        k = 0;
        for (let i = 0; i < p.n; i++) { const c = i * p.gap; if (ph >= c && ph < c + p.on) k = 1; }
      } else if (p.kind === 'sway') {
        k = 0.7 + 0.3 * Math.sin(t * 2.1) * Math.sin(t * 0.7);
        s.position.y = 4 + Math.sin(t * 1.3) * 3;
      }
      s.material.opacity = k;
      const sc = s.userData.size * (this.binoc ? 0.35 : 1);
      s.scale.setScalar(sc);
    }
    // materiales horneados: intensidades con suavizado
    for (const [f, fll] of Object.entries(this.floors || {})) {
      fll.k1 = THREE.MathUtils.damp(fll.k1 ?? 1, fll.targetK1 ?? 1, 6, dt);
      let flick = 1;
      if (f === 'f0' && st.surge > 0.4) flick = 0.85 + 0.15 * Math.sin(t * 37) * Math.sin(t * 11);
      const beamWash = (f === 'f3' && st.lampOn) ? 0.08 * Math.max(0, Math.cos(rot * 3)) : 0;
      for (const m of fll.mats) {
        m.uniforms.k1.value = fll.k1 * flick;
        m.uniforms.k0.value = 1 + beamWash;
        m.uniforms.flash.value = fl * (f === 'f3' ? 1.4 : 0.8);
        m.uniforms.emberK.value = (f === 'f3' && st.keroLit) ? (0.8 + 0.2 * Math.sin(t * 13) * Math.sin(t * 7)) : 0;
      }
      for (const o of fll.emit) {
        const on = o.userData.on ?? 1;
        o.material.color.copy(o.userData.baseColor).multiplyScalar(on * (o.userData.emitKind === 'lamp_red' ? (0.75 + 0.25 * Math.sin(t * 3)) : 1));
      }
      for (const g of fll.glass) { g.material.uniforms.time.value = t; g.material.uniforms.flash.value = fl; g.material.uniforms.glow.value = st.lampOn ? 1 : 0; }
    }
    if (this.mantle) this.mantle.material.color.setRGB(st.keroLit ? 3.2 : 0.2, st.keroLit ? 2.4 : 0.16, st.keroLit ? 1.4 : 0.12);
    // palanca del conmutador
    const f0 = this.floors && this.floors.f0;
    if (f0 && f0.objects.switch_lever && f0.objects.switch_lever.userData.r0) {
      const lv = f0.objects.switch_lever;
      const target = st.sw === 'luz' ? -1.0 : st.sw === 'voz' ? 1.0 : 0;
      lv.userData.k = THREE.MathUtils.damp(lv.userData.k || 0, target, 5, dt);
      lv.rotation.x = lv.userData.r0.x + lv.userData.k * 0.9;
    }
    // reloj de pared
    const f2 = this.floors && this.floors.f2;
    if (f2 && this.clockTime && this.hands) {
      const c = this.clockTime;
      const sec = c.s, min = c.m + sec / 60, hr = (c.h % 12) + min / 60;
      if (this.hands.h) this.hands.h.rotation.z = -hr / 12 * Math.PI * 2;
      if (this.hands.m) this.hands.m.rotation.z = -min / 60 * Math.PI * 2;
      if (this.hands.s) this.hands.s.rotation.z = -sec / 60 * Math.PI * 2;
    }
    // cámara
    if (this.node) {
      if (this.binoc) {
        const eye = new THREE.Vector3(...this.meta.nodes.f3_sea.pos);
        this.camera.position.copy(eye);
        const b = this.binoc;
        const dir = new THREE.Vector3(Math.sin(b.yaw) * Math.cos(b.pitch), Math.sin(b.pitch), -Math.cos(b.yaw) * Math.cos(b.pitch));
        this.camera.lookAt(eye.clone().add(dir));
      } else {
        const L = this.look;
        L.yaw = THREE.MathUtils.damp(L.yaw, L.tyaw, 8, dt);
        L.pitch = THREE.MathUtils.damp(L.pitch, L.tpitch, 8, dt);
        let pos = this.node.pos, target = this.node.target;
        if (this._tween) {
          const tw = this._tween;
          tw.t = Math.min(1, tw.t + dt / tw.dur);
          const e = tw.t < 0.5 ? 2 * tw.t * tw.t : 1 - Math.pow(-2 * tw.t + 2, 2) / 2;
          pos = tw.fromPos.clone().lerp(this.node.pos, e);
          target = tw.fromTarget.clone().lerp(this.node.target, e);
          if (tw.t >= 1) this._tween = null;
        }
        this._camTarget = target.clone();
        const dir = target.clone().sub(pos).normalize();
        const yaw0 = Math.atan2(dir.x, -dir.z), pitch0 = Math.asin(THREE.MathUtils.clamp(dir.y, -1, 1));
        const sway = this.reduceMotion ? 0 : 1;
        const yaw = yaw0 + L.yaw + Math.sin(t * 0.31) * 0.006 * sway;
        const pitch = pitch0 + L.pitch + Math.sin(t * 0.47) * 0.004 * sway;
        const d = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), -Math.cos(yaw) * Math.cos(pitch));
        this.camera.position.copy(pos);
        this.camera.position.y += Math.sin(t * 0.9) * 0.006 * sway;
        this.camera.lookAt(pos.clone().add(d));
      }
    }
    this._alert = Math.max(0, (this._alert || 0) - dt * 0.55);
    this._shake = Math.max(0, (this._shake || 0) - dt * 1.4);
    if (this._shake > 0 && !this.binoc) {
      const k = this._shake * 0.012;
      this.camera.rotation.x += Math.sin(t * 37.0) * k; this.camera.rotation.y += Math.sin(t * 29.0 + 1.3) * k;
    }
    if (this.grade) {
      const u = this.grade.uniforms; u.time.value = t; u.flash.value = fl; u.alert.value = this._alert;
      u.tint.value.set(1.0, 0.98, 0.96);
    }
    if (this.composer) this.composer.render(dt); else this.renderer.render(this.scene, this.camera);
  }
}
