// Ampara · experiência VR (Eureka 2026)
// Cena compartilhada entre o vídeo 360° (render) e a versão interativa (WebXR).
// Tudo é desenhado aqui mesmo (sem modelos externos) para carregar rápido no óculos.

export async function createExperience(THREE, { base = './', TL, xr = false } = {}) {
  const A = n => base + 'assets/' + n;

  // ---------- fontes e imagens ----------
  const fonts = [['LS', 'league-spartan-latin-700-normal.woff2', '700', 'normal'],
                 ['LS', 'league-spartan-latin-500-normal.woff2', '500', 'normal'],
                 ['LO', 'lora-latin-400-italic.woff2', '400', 'italic']];
  await Promise.all(fonts.map(async ([f, u, w, s]) => { const ff = new FontFace(f, `url(${A(u)})`, { weight: w, style: s }); await ff.load(); document.fonts.add(ff); }));
  const loadImg = src => new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = src; });
  const IM = {};
  await Promise.all(['logo_navy'].map(async n => IM[n] = await loadImg(A(n + '.png'))));

  // ---------- utilidades ----------
  const clamp = (x, a = 0, b = 1) => Math.max(a, Math.min(b, x));
  const sm = x => { x = clamp(x); return x * x * (3 - 2 * x); };
  const ramp = (t, a, b) => sm((t - a) / (b - a));
  const lerpKeys = (keys, t) => { if (t <= keys[0][0]) return keys[0][1];
    for (let i = 1; i < keys.length; i++) { const [t1, v1] = keys[i], [t0, v0] = keys[i - 1]; if (t <= t1) return v0 + (v1 - v0) * ((t - t0) / (t1 - t0)); }
    return keys[keys.length - 1][1]; };
  let seed = 11; const rnd = () => (seed = (seed * 16807) % 2147483647) / 2147483647;
  const canvasTex = (c, srgb = true, rep) => { const t = new THREE.CanvasTexture(c); if (srgb) t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8;
    if (rep) { t.wrapS = t.wrapT = THREE.RepeatWrapping; t.repeat.set(rep[0], rep[1]); } return t; };
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return [c, c.getContext('2d')]; };

  const walkZ = t => lerpKeys(TL.walk, t);
  const walkSpeed = t => Math.abs(walkZ(t + 0.05) - walkZ(t - 0.05)) / 0.1;

  // ---------- cena ----------
  const scene = new THREE.Scene();
  const NIGHT = new THREE.Color(0x070a16), NAVY = new THREE.Color(0x16224a), CREAM = new THREE.Color(0xF4EEE4);
  scene.background = NIGHT.clone();
  scene.fog = new THREE.FogExp2(NIGHT.clone(), 0.022);
  const street = new THREE.Group(); scene.add(street);
  const fadeables = []; // materiais que somem na transição para a sala clara
  const fm = m => { const keep = m.blending === THREE.AdditiveBlending || m.isSpriteMaterial; m.userData.keepT = keep; m.transparent = keep; m.userData.base = m.opacity; fadeables.push(m); return m; };

  // céu: gradiente + estrelas + brilho da cidade no horizonte
  { const [c, g] = mkCanvas(2048, 1024);
    const gr = g.createLinearGradient(0, 0, 0, 1024);
    gr.addColorStop(0, '#03050c'); gr.addColorStop(0.42, '#0a1024'); gr.addColorStop(0.5, '#2a2436'); gr.addColorStop(0.53, '#0b0e18'); gr.addColorStop(1, '#05060a');
    g.fillStyle = gr; g.fillRect(0, 0, 2048, 1024);
    for (let i = 0; i < 700; i++) { const y = Math.pow(rnd(), 1.6) * 470; g.fillStyle = `rgba(255,255,255,${0.15 + rnd() * 0.6})`; const r = rnd() < 0.08 ? 1.6 : 0.8; g.fillRect(rnd() * 2048, y, r, r); }
    const sky = new THREE.Mesh(new THREE.SphereGeometry(400, 48, 24), fm(new THREE.MeshBasicMaterial({ map: canvasTex(c), side: THREE.BackSide, fog: false, depthWrite: false })));
    sky.renderOrder = -10; scene.add(sky); street.userData.sky = sky;
    // lua
    const [mc, mg] = mkCanvas(256, 256); const rg = mg.createRadialGradient(128, 128, 30, 128, 128, 128);
    rg.addColorStop(0, 'rgba(250,244,230,1)'); rg.addColorStop(0.36, 'rgba(250,244,230,1)'); rg.addColorStop(0.4, 'rgba(200,210,255,.25)'); rg.addColorStop(1, 'rgba(200,210,255,0)');
    mg.fillStyle = rg; mg.fillRect(0, 0, 256, 256);
    const moon = new THREE.Sprite(fm(new THREE.SpriteMaterial({ map: canvasTex(mc), fog: false, depthWrite: false })));
    moon.scale.set(40, 40, 1); moon.position.set(-140, 150, -260); scene.add(moon); street.userData.moon = moon; }

  // asfalto
  const asphalt = (() => { const [c, g] = mkCanvas(512, 512); g.fillStyle = '#16181d'; g.fillRect(0, 0, 512, 512);
    for (let i = 0; i < 9000; i++) { const v = 18 + rnd() * 30; g.fillStyle = `rgb(${v},${v},${v + 4})`; g.fillRect(rnd() * 512, rnd() * 512, 1.5, 1.5); }
    g.strokeStyle = 'rgba(8,8,10,.8)'; g.lineWidth = 1.2; for (let k = 0; k < 6; k++) { g.beginPath(); let x = rnd() * 512, y = rnd() * 512; g.moveTo(x, y); for (let j = 0; j < 8; j++) { x += (rnd() - .5) * 60; y += (rnd() - .5) * 60; g.lineTo(x, y); } g.stroke(); }
    for (let k = 0; k < 3; k++) { g.fillStyle = 'rgba(30,32,38,.9)'; g.fillRect(rnd() * 400, rnd() * 400, 60 + rnd() * 80, 40 + rnd() * 60); }
    return c; })();
  const puddles = (() => { const [c, g] = mkCanvas(512, 512); g.fillStyle = '#d0d0d0'; g.fillRect(0, 0, 512, 512);
    for (let k = 0; k < 7; k++) { const x = rnd() * 512, y = rnd() * 512, r = 30 + rnd() * 70; const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, '#5a5a5a'); gr.addColorStop(0.7, '#707070'); gr.addColorStop(1, 'rgba(208,208,208,0)'); g.fillStyle = gr; g.beginPath(); g.ellipse(x, y, r, r * 0.6, rnd() * 3, 0, 7); g.fill(); }
    return c; })();
  const ROAD_X = -5, ROAD_W = 7; // pista à esquerda de quem anda
  { const road = new THREE.Mesh(new THREE.PlaneGeometry(ROAD_W, 320), new THREE.MeshStandardMaterial({ map: canvasTex(asphalt, true, [2, 90]), roughnessMap: canvasTex(puddles, false, [1, 30]), roughness: 1, metalness: 0.12, color: 0xb8bcc8 }));
    fm(road.material); road.rotation.x = -Math.PI / 2; road.position.set(ROAD_X, 0, -40); street.add(road);
    // faixas
    const dash = fm(new THREE.MeshStandardMaterial({ color: 0xd9d2b0, roughness: 0.6, emissive: 0x111008 }));
    const dg = new THREE.PlaneGeometry(0.14, 2.6); for (let z = 115; z > -200; z -= 7) { const d = new THREE.Mesh(dg, dash); d.rotation.x = -Math.PI / 2; d.position.set(ROAD_X, 0.012, z); street.add(d); }
    const edge = new THREE.PlaneGeometry(0.12, 320); for (const ex of [ROAD_X - ROAD_W / 2 + 0.3, ROAD_X + ROAD_W / 2 - 0.3]) { const e = new THREE.Mesh(edge, dash); e.rotation.x = -Math.PI / 2; e.position.set(ex, 0.012, -40); street.add(e); }
    // faixa de pedestre à frente
    for (let i = 0; i < 9; i++) { const s = new THREE.Mesh(new THREE.PlaneGeometry(0.55, 3.2), dash); s.rotation.x = -Math.PI / 2; s.rotation.z = Math.PI / 2; s.position.set(ROAD_X - 3 + i * 0.75, 0.013, -96); street.add(s); }
  }
  // calçadas com piso + guia
  const sidewalkTex = (() => { const [c, g] = mkCanvas(256, 256); g.fillStyle = '#2a2b30'; g.fillRect(0, 0, 256, 256);
    for (let i = 0; i < 2500; i++) { const v = 34 + rnd() * 22; g.fillStyle = `rgb(${v},${v},${v + 3})`; g.fillRect(rnd() * 256, rnd() * 256, 2, 2); }
    g.strokeStyle = '#17181c'; g.lineWidth = 3; for (let k = 0; k <= 256; k += 64) { g.beginPath(); g.moveTo(k, 0); g.lineTo(k, 256); g.stroke(); g.beginPath(); g.moveTo(0, k); g.lineTo(256, k); g.stroke(); }
    return c; })();
  const SW_R = [ROAD_X + ROAD_W / 2, 3.6], SW_L = [-14.5, ROAD_X - ROAD_W / 2];
  for (const [a, b] of [SW_R, SW_L]) {
    const w = b - a; const s = new THREE.Mesh(new THREE.BoxGeometry(w, 0.16, 320), fm(new THREE.MeshStandardMaterial({ map: canvasTex(sidewalkTex, true, [w / 1.2, 320 / 1.2]), roughness: 0.92, color: 0xc8c8cc })));
    s.position.set((a + b) / 2, 0.08, -40); street.add(s);
    const curbX = a === SW_R[0] ? a + 0.1 : b - 0.1;
    const curb = new THREE.Mesh(new THREE.BoxGeometry(0.2, 0.18, 320), fm(new THREE.MeshStandardMaterial({ color: 0x55565c, roughness: 0.8 }))); curb.position.set(curbX, 0.09, -40); street.add(curb);
  }

  // fachadas com janelas (algumas acesas, luz de TV), portas de aço e pichação
  function facade(wM, hM, kind) {
    const S = 64; const W = Math.round(wM * S), H = Math.round(hM * S);
    const [c, g] = mkCanvas(W, H); const [e, ge] = mkCanvas(W, H);
    const tones = [['#1c1f27', '#24272f'], ['#2a2120', '#332724'], ['#20262a', '#283035'], ['#26252b', '#2e2d33']][kind % 4];
    g.fillStyle = tones[0]; g.fillRect(0, 0, W, H); ge.fillStyle = '#000'; ge.fillRect(0, 0, W, H);
    for (let i = 0; i < W * H / 40; i++) { g.fillStyle = rnd() < .5 ? tones[1] : 'rgba(0,0,0,.25)'; g.fillRect(rnd() * W, rnd() * H, 2, 2); }
    if (kind % 4 === 1) { g.strokeStyle = 'rgba(0,0,0,.25)'; g.lineWidth = 1; for (let y = 0; y < H; y += 8) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y); g.stroke(); } }
    const floorH = 3.1 * S, groundH = 3.6 * S;
    // térreo: porta de aço / portão
    const nDoors = Math.max(1, Math.floor(wM / 4.5));
    for (let d = 0; d < nDoors; d++) { const dw = (wM / nDoors) * S * 0.72, dx = d * (W / nDoors) + (W / nDoors - dw) / 2, dy = H - groundH + 0.5 * S, dh = groundH - 0.5 * S;
      g.fillStyle = '#3a3c42'; g.fillRect(dx, dy, dw, dh); g.fillStyle = '#2b2d32'; for (let y = dy; y < dy + dh; y += 5) g.fillRect(dx, y, dw, 2);
      if (rnd() < 0.55) { g.save(); g.strokeStyle = ['#b94b6a', '#4b8ab9', '#d9d2b0', '#7bb96a'][Math.floor(rnd() * 4)]; g.globalAlpha = 0.55; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); let x = dx + 10, y = dy + dh * 0.45; g.moveTo(x, y); for (let j = 0; j < 14; j++) { x += 6 + rnd() * 10; y += (rnd() - .5) * 26; g.quadraticCurveTo(x - 4, y - 12, x, y); } g.stroke(); g.restore(); } }
    // andares
    const cols = Math.max(2, Math.floor(wM / 2.2));
    for (let y = H - groundH - floorH; y > 0.3 * S; y -= floorH) for (let i = 0; i < cols; i++) {
      const cw = W / cols, wx = i * cw + cw * 0.22, ww = cw * 0.56, wy = y + floorH * 0.22, wh = floorH * 0.5;
      g.fillStyle = '#0c0e14'; g.fillRect(wx, wy, ww, wh); g.fillStyle = 'rgba(255,255,255,.05)'; g.fillRect(wx, wy, ww, 3);
      g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(wx - 3, wy + wh, ww + 6, 5);
      const r = rnd();
      if (r < 0.22) { const warm = rnd() < 0.8; const col = warm ? `rgb(255,${190 + rnd() * 40 | 0},${120 + rnd() * 50 | 0})` : 'rgb(120,160,255)';
        ge.fillStyle = col; ge.globalAlpha = 0.5 + rnd() * 0.5; ge.fillRect(wx, wy, ww, wh); ge.globalAlpha = 1;
        ge.fillStyle = 'rgba(0,0,0,.6)'; if (rnd() < .6) ge.fillRect(wx + ww * (0.2 + rnd() * .4), wy, ww * 0.25, wh); // cortina
        g.fillStyle = col; g.globalAlpha = 0.6; g.fillRect(wx, wy, ww, wh); g.globalAlpha = 1; }
    }
    // marquise / fios
    g.fillStyle = 'rgba(0,0,0,.4)'; g.fillRect(0, H - groundH - 6, W, 6);
    return { map: canvasTex(c), emissiveMap: canvasTex(e) };
  }
  const predios = []; // usado para abrir o beco dos dois rapazes (ver abaixo)
  function building(side, z0, w) {
    const h = 6 + rnd() * 20, d = 10; const kind = Math.floor(rnd() * 4); const t = facade(w, h, kind);
    const mFront = fm(new THREE.MeshStandardMaterial({ map: t.map, emissiveMap: t.emissiveMap, emissive: 0xffffff, emissiveIntensity: 1, roughness: 0.95 }));
    const mSide = fm(new THREE.MeshStandardMaterial({ color: 0x15171d, roughness: 1 }));
    const geo = new THREE.BoxGeometry(d, h, w);
    const mats = side > 0 ? [mSide, mFront, mSide, mSide, mSide, mSide] : [mFront, mSide, mSide, mSide, mSide, mSide];
    const b = new THREE.Mesh(geo, mats); const fx = side > 0 ? SW_R[1] : SW_L[0];
    b.position.set(fx + side * d / 2, h / 2, z0 - w / 2); street.add(b);
    predios.push({ side, z0, w, h, b });
  }
  for (const side of [1, -1]) for (let z = 120; z > -190;) { const w = 6 + rnd() * 9; building(side, z, w); z -= w + (rnd() < .25 ? 3 + rnd() * 4 : 0.2); }


  // árvores
  const trunkM = fm(new THREE.MeshStandardMaterial({ color: 0x1b1612, roughness: 1 }));
  const leafM = fm(new THREE.MeshStandardMaterial({ color: 0x0f1a14, roughness: 1 }));
  for (let z = 100; z > -170; z -= 22 + rnd() * 10) for (const x of [SW_L[1] - 0.8, SW_L[1] - 0.8]) { if (rnd() < .5) continue;
    const tr = new THREE.Group(); const tk = new THREE.Mesh(new THREE.CylinderGeometry(0.12, 0.18, 3.2, 7), trunkM); tk.position.y = 1.6; tr.add(tk);
    for (let k = 0; k < 5; k++) { const s = new THREE.Mesh(new THREE.IcosahedronGeometry(1 + rnd() * 0.7, 1), leafM); s.position.set((rnd() - .5) * 1.6, 3.4 + rnd() * 1.2, (rnd() - .5) * 1.6); tr.add(s); }
    tr.position.set(x, 0.16, z + (rnd() - .5) * 4); street.add(tr); }

  // postes (luz alaranjada), cones de luz e fiação
  const glowTex = (() => { const [c, g] = mkCanvas(128, 128); const gr = g.createRadialGradient(64, 64, 0, 64, 64, 64);
    gr.addColorStop(0, 'rgba(255,236,200,1)'); gr.addColorStop(0.2, 'rgba(255,205,140,.6)'); gr.addColorStop(1, 'rgba(255,190,120,0)'); g.fillStyle = gr; g.fillRect(0, 0, 128, 128); return canvasTex(c); })();
  const coneTex = (() => { const [c, g] = mkCanvas(64, 256); const gr = g.createLinearGradient(0, 0, 0, 256); gr.addColorStop(0, 'rgba(255,210,150,.32)'); gr.addColorStop(1, 'rgba(255,210,150,0)'); g.fillStyle = gr; g.fillRect(0, 0, 64, 256); return canvasTex(c); })();
  const poleM = fm(new THREE.MeshStandardMaterial({ color: 0x3b3d44, roughness: 0.7, metalness: 0.3 }));
  const lamps = []; const tops = [];
  for (let i = 0; i < 18; i++) for (const side of [1, -1]) {
    const z = 100 - i * 16 + (side < 0 ? 8 : 0); const px = side > 0 ? SW_R[0] + 0.35 : SW_L[1] - 0.35; const armDir = side > 0 ? -1 : 1;
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.09, 0.13, 8, 8), poleM); pole.position.set(px, 4, z); street.add(pole);
    const arm = new THREE.Mesh(new THREE.BoxGeometry(1.8, 0.09, 0.09), poleM); arm.position.set(px + armDir * 0.9, 7.6, z); street.add(arm);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.7, 0.14, 0.32), poleM); head.position.set(px + armDir * 1.7, 7.52, z); street.add(head);
    const lp = new THREE.Vector3(px + armDir * 1.7, 7.4, z);
    const glow = new THREE.Sprite(fm(new THREE.SpriteMaterial({ map: glowTex, depthWrite: false, blending: THREE.AdditiveBlending }))); glow.scale.set(2.6, 2.6, 1); glow.position.copy(lp); street.add(glow);
    const cone = new THREE.Mesh(new THREE.ConeGeometry(3.2, 7.3, 24, 1, true), fm(new THREE.MeshBasicMaterial({ map: coneTex, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide, fog: true })));
    cone.position.set(lp.x, lp.y - 3.65, z); street.add(cone);
    lamps.push({ pos: lp, glow, cone, z, flick: (i === 9 && side > 0) || (i === 11 && side > 0), base: 1 });
    tops.push(new THREE.Vector3(px, 7.9, z));
  }
  // fios entre postes (catenária)
  { const wm = fm(new THREE.LineBasicMaterial({ color: 0x050608 }));
    for (const side of [1, -1]) { const tp = tops.filter(p => (side > 0 ? p.x > ROAD_X : p.x < ROAD_X)).sort((a, b) => b.z - a.z);
      for (let k = 0; k < tp.length - 1; k++) for (const dy of [0, -0.35, -0.7]) { const a = tp[k], b = tp[k + 1]; const pts = [];
        for (let s = 0; s <= 12; s++) { const f = s / 12; pts.push(new THREE.Vector3(a.x, a.y + dy - Math.sin(f * Math.PI) * 0.8, a.z + (b.z - a.z) * f)); }
        street.add(new THREE.Line(new THREE.BufferGeometry().setFromPoints(pts), wm)); } } }
  const POOL = [0, 1, 2, 3].map(() => { const l = new THREE.PointLight(0xffb870, 0, 30, 1.6); scene.add(l); return l; });
  const hemi = new THREE.HemisphereLight(0x2c3a70, 0x08090e, 0.55); scene.add(hemi);

  // carros estacionados
  function carModel(color, lights) {
    const g = new THREE.Group();
    const prof = new THREE.Shape(); // perfil lateral (x = comprimento, y = altura)
    prof.moveTo(-2.25, 0.32); prof.lineTo(2.25, 0.32); prof.lineTo(2.3, 0.75); prof.lineTo(2.1, 0.92); prof.lineTo(1.0, 1.0);
    prof.lineTo(0.45, 1.5); prof.lineTo(-1.2, 1.52); prof.lineTo(-1.95, 1.05); prof.lineTo(-2.3, 0.95); prof.lineTo(-2.3, 0.4); prof.closePath();
    const geo = new THREE.ExtrudeGeometry(prof, { depth: 1.8, bevelEnabled: true, bevelThickness: 0.06, bevelSize: 0.06, bevelSegments: 2 });
    geo.translate(0, 0, -0.9); geo.rotateY(Math.PI / 2); // frente para -z
    const body = new THREE.Mesh(geo, fm(new THREE.MeshStandardMaterial({ color, roughness: 0.32, metalness: 0.75 }))); g.add(body);
    const glass = fm(new THREE.MeshStandardMaterial({ color: 0x05070c, roughness: 0.05, metalness: 0.9 }));
    const ws = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.62), glass); ws.position.set(0, 1.26, -0.73); ws.rotation.x = -0.75; g.add(ws);
    for (const sx of [-1, 1]) { const sw = new THREE.Mesh(new THREE.PlaneGeometry(1.55, 0.4), glass); sw.position.set(sx * 0.97, 1.24, 0.32); sw.rotation.y = sx * Math.PI / 2; g.add(sw); }
    const wheelG = new THREE.CylinderGeometry(0.36, 0.36, 0.26, 18); wheelG.rotateZ(Math.PI / 2);
    const tyre = fm(new THREE.MeshStandardMaterial({ color: 0x0a0a0a, roughness: 0.9 }));
    for (const [wx, wz] of [[-0.86, -1.4], [0.86, -1.4], [-0.86, 1.45], [0.86, 1.45]]) { const w = new THREE.Mesh(wheelG, tyre); w.position.set(wx, 0.36, wz); g.add(w); }
    const tail = fm(new THREE.MeshBasicMaterial({ color: 0x5a0a0e }));
    for (const sx of [-0.7, 0.7]) { const tl = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.12, 0.04), tail); tl.position.set(sx, 0.85, 2.33); g.add(tl); }
    if (lights) { const hl = fm(new THREE.MeshBasicMaterial({ color: 0xf6f8ff })); for (const sx of [-0.68, 0.68]) { const h = new THREE.Mesh(new THREE.BoxGeometry(0.42, 0.13, 0.04), hl); h.position.set(sx, 0.8, -2.33); g.add(h); } }
    return g;
  }
  for (let z = 70; z > -160; z -= 9 + rnd() * 14) { if (rnd() < .4) continue; const c = carModel([0x2a2f3a, 0x4a1c22, 0x1d2a24, 0x777a80, 0x1a1a1e][Math.floor(rnd() * 5)], false);
    const left = rnd() < .5; c.position.set(left ? ROAD_X - ROAD_W / 2 + 1.25 : ROAD_X + ROAD_W / 2 - 1.15, 0, z); if (rnd() < .5) c.rotation.y = Math.PI;
    if (!left && z < 20 && z > -80) continue; // deixa a faixa do carro que segue livre perto dela
    street.add(c); }

  // ---------- beco à direita com dois rapazes ----------
  // Mais um fator de risco: numa rua lateral à direita, duas sombras escuras paradas, que
  // viram a cabeça e o corpo para acompanhar você enquanto passa. Usa o vão entre prédios
  // mais perto de z = -49 (ela passa por volta dos 50 s, já olhando para a frente). Ficam escuras,
  // sem rosto, recortadas contra uma luz fraca no fundo do beco. Nada aqui usa rnd(), para
  // não mudar o resto da rua.
  const BECO_ALVO = -49;
  const beco = (() => { const dir = predios.filter(p => p.side > 0).sort((a, b) => b.z0 - a.z0); let melhor = null;
    for (let i = 0; i < dir.length - 1; i++) { const ini = dir[i].z0 - dir[i].w, fim = dir[i + 1].z0, larg = ini - fim;
      if (larg >= 2.5) { const c = (ini + fim) / 2; if (!melhor || Math.abs(c - BECO_ALVO) < Math.abs(melhor.c - BECO_ALVO)) melhor = { c, larg }; } }
    return melhor ?? { c: BECO_ALVO, larg: 4 }; })();
  const rapazes = [];
  {
    const x0 = SW_R[1], fundo = x0 + 10; // os prédios têm 10 m de profundidade
    const chao = new THREE.Mesh(new THREE.PlaneGeometry(fundo - x0 + 0.4, beco.larg + 0.4), fm(new THREE.MeshStandardMaterial({ color: 0x1a1b20, roughness: 1 })));
    chao.rotation.x = -Math.PI / 2; chao.position.set((x0 + fundo) / 2, 0.02, beco.c); street.add(chao);
    // parede do fundo com uma luz amarelada fraca: é ela que recorta as sombras
    const [pc, pg] = mkCanvas(256, 256); const gr = pg.createRadialGradient(128, 150, 6, 128, 160, 300);
    gr.addColorStop(0, '#b98a52'); gr.addColorStop(0.25, '#6a5036'); gr.addColorStop(0.7, '#2e251d'); gr.addColorStop(1, '#0c0c0e'); pg.fillStyle = gr; pg.fillRect(0, 0, 256, 256);
    const parede = new THREE.Mesh(new THREE.PlaneGeometry(beco.larg + 0.4, 7), fm(new THREE.MeshBasicMaterial({ map: canvasTex(pc) })));
    parede.position.set(fundo, 3.5, beco.c); parede.rotation.y = -Math.PI / 2; street.add(parede);
    const luz = new THREE.Sprite(fm(new THREE.SpriteMaterial({ map: glowTex, color: 0xffc27a, depthWrite: false, blending: THREE.AdditiveBlending, transparent: true, opacity: 0.55 })));
    luz.scale.set(3.4, 3.4, 1); luz.position.set(fundo - 0.3, 3.0, beco.c); street.add(luz);
    // os dois rapazes: corpo humano com roupas escuras, rosto na sombra do capuz e do boné.
    // Ficam na boca do beco, colados à calçada, iluminados pelo poste mais próximo.
    const mat = c => fm(new THREE.MeshStandardMaterial({ color: c, roughness: 0.95 }));
    const olhoM = fm(new THREE.MeshBasicMaterial({ color: 0x5e5852, fog: false }));
    const peca = (geo, m, pai, x, y, z) => { const o = new THREE.Mesh(geo, m); o.position.set(x, y, z); pai.add(o); return o; };
    // Membro com duas partes (coxa e canela, braço e antebraço) e uma junta no meio.
    function membro(pai, x, y, z, r1, r2, l1, l2, m1, m2, a1, a2, lado = 0, lado2 = 0) {
      const j1 = new THREE.Group(); j1.position.set(x, y, z); j1.rotation.set(a1, 0, lado); pai.add(j1);
      peca(new THREE.CapsuleGeometry(r1, l1 - 2 * r1, 4, 10), m1, j1, 0, -l1 / 2, 0);
      const j2 = new THREE.Group(); j2.position.y = -l1; j2.rotation.set(a2, 0, lado2); j1.add(j2);
      peca(new THREE.CapsuleGeometry(r2, l2 - 2 * r2, 4, 10), m2, j2, 0, -l2 / 2, 0);
      return { j1, j2 };
    }
    // pose: 'encostado' (costas na parede, um pé apoiado nela, braços cruzados) ou
    // 'em pe' (peso numa perna, uma mão no bolso e a outra com o cigarro).
    function rapaz({ altura, blusa, calca, tenis, rosto, capuz, bone, pose }) {
      const g = new THREE.Group(), corpo = new THREE.Group(), k = altura / 1.78; g.add(corpo); corpo.scale.setScalar(k);
      const mB = mat(blusa), mC = mat(calca), mT = mat(tenis), mR = mat(rosto);
      const quadril = 0.92;
      // pernas e pés
      const pernas = pose === 'encostado'
        ? [membro(corpo, -0.1, quadril, 0, 0.085, 0.065, 0.46, 0.45, mC, mC, 0.03, 0, 0.02), membro(corpo, 0.1, quadril, 0, 0.085, 0.065, 0.46, 0.45, mC, mC, -0.95, 1.55, -0.04)]
        : [membro(corpo, -0.11, quadril, 0, 0.085, 0.065, 0.46, 0.45, mC, mC, 0, 0, 0.06), membro(corpo, 0.11, quadril, 0, 0.085, 0.065, 0.46, 0.45, mC, mC, -0.12, 0.2, -0.03)];
      for (const pr of pernas) { const pe = peca(new THREE.BoxGeometry(0.11, 0.08, 0.27), mT, pr.j2, 0, -0.45, 0.06); pe.rotation.x = -pr.j1.rotation.x - pr.j2.rotation.x; }
      // quadril, tronco (mais largo nos ombros) e pescoço
      const q = peca(new THREE.CapsuleGeometry(0.15, 0.12, 4, 10), mC, corpo, 0, quadril + 0.02, 0); q.rotation.z = Math.PI / 2; q.scale.set(1, 1, 0.7);
      const tronco = peca(new THREE.CylinderGeometry(0.2, 0.16, 0.52, 14), mB, corpo, 0, quadril + 0.33, 0); tronco.scale.z = 0.62;
      const ombros = peca(new THREE.CapsuleGeometry(0.1, 0.3, 4, 10), mB, corpo, 0, quadril + 0.56, 0); ombros.rotation.z = Math.PI / 2; ombros.scale.z = 0.9;
      peca(new THREE.CylinderGeometry(0.05, 0.06, 0.1, 10), mR, corpo, 0, quadril + 0.66, 0);
      // braços
      const yOmbro = quadril + 0.56;
      if (pose === 'encostado') { // braços cruzados na frente do peito
        membro(corpo, -0.23, yOmbro, 0, 0.055, 0.047, 0.29, 0.27, mB, mB, -0.25, -1.55, 0.06, 1.05);
        membro(corpo, 0.23, yOmbro, 0, 0.055, 0.047, 0.29, 0.27, mB, mB, -0.2, -1.42, -0.06, -1.05);
      } else { // mãos nos bolsos
        membro(corpo, -0.24, yOmbro, 0, 0.055, 0.047, 0.29, 0.27, mB, mB, 0.12, -0.45, -0.14);
        membro(corpo, 0.24, yOmbro, 0, 0.055, 0.047, 0.29, 0.27, mB, mB, 0.12, -0.45, 0.14); }
      // cabeça (gira sozinha para acompanhar você)
      const cabeca = new THREE.Group(); cabeca.position.y = quadril + 0.8; corpo.add(cabeca);
      peca(new THREE.SphereGeometry(0.105, 16, 12), mR, cabeca, 0, 0, 0.005).scale.set(0.92, 1.12, 1);
      for (const x of [-0.035, 0.035]) peca(new THREE.SphereGeometry(0.009, 6, 4), olhoM, cabeca, x, 0.02, 0.098);
      if (capuz) { const h = peca(new THREE.SphereGeometry(0.15, 16, 12, 0, Math.PI * 2, 0, Math.PI * 0.6), mB, cabeca, 0, 0.015, -0.025); h.rotation.x = -0.35; h.scale.set(1, 1.08, 1.05); }
      if (bone) { peca(new THREE.SphereGeometry(0.112, 16, 8, 0, Math.PI * 2, 0, Math.PI / 2), mT, cabeca, 0, 0.035, 0);
        const aba = peca(new THREE.BoxGeometry(0.19, 0.012, 0.12), mT, cabeca, 0, 0.04, 0.12); aba.rotation.x = 0.12; }
      if (pose === 'encostado') corpo.rotation.x = -0.07; // costas apoiadas na parede
      street.add(g); return { g, corpoGira: pose !== 'encostado', virarCabeca: (y, aceno = 0) => { cabeca.rotation.set(aceno, y, 0); } };
    }
    const bocaZ = beco.c + beco.larg / 2; // quina do beco do lado de quem vem andando
    // encostado na fachada, ao lado da boca do beco, de frente para a calçada
    const a = rapaz({ altura: 1.82, blusa: 0x1c1f26, calca: 0x151a24, tenis: 0x111114, rosto: 0x1d1917, capuz: true, pose: 'encostado' });
    const POS_A = [x0 - 0.2, 0.16, bocaZ + 0.55], POS_B = [x0 - 0.6, 0.16, bocaZ - 0.5];
    const CONVERSA_B = Math.atan2(POS_A[0] - POS_B[0], POS_A[2] - POS_B[2]); // b virado para a
    a.g.position.set(...POS_A); a.g.rotation.y = -Math.PI / 2;
    // em pé na boca do beco, quase na calçada
    const b = rapaz({ altura: 1.76, blusa: 0x2d2824, calca: 0x16171b, tenis: 0x0e0e10, rosto: 0x1d1917, bone: true, pose: 'em pe' });
    b.g.position.set(...POS_B); b.g.rotation.y = CONVERSA_B;
    rapazes.push({ ...a, yaw: 0, outro: b.g.position, fase: 0 }, { ...b, yaw: 0, outro: a.g.position, fase: 3, corpo0: CONVERSA_B });

    // Versão realista: troca os bonecos por um modelo 3D de pessoa (avatar de exemplo do
    // three.js, com esqueleto), com a pose feita girando os ossos. Se não carregar em 10 s
    // (sem internet, por exemplo), ficam os bonecos de cima.
    const URL_PESSOA = 'https://cdn.jsdelivr.net/gh/mrdoob/three.js@r169/examples/models/gltf/readyplayer.me.glb';
    const comPrazo = (p, ms) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error('demorou')), ms))]);
    try {
      const [{ GLTFLoader }, { clone: clonarComOssos }] = await comPrazo(Promise.all([
        import('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/loaders/GLTFLoader.js'),
        import('https://cdn.jsdelivr.net/npm/three@0.169.0/examples/jsm/utils/SkeletonUtils.js')]), 10000);
      const modelo = await comPrazo(new GLTFLoader().loadAsync(URL_PESSOA), 10000);
      const girar = (osso, eixo, ang) => osso.quaternion.multiply(new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...eixo), ang));
      function pessoa({ altura, blusa, calca, tenis, gorro, bone, bigode, pose }) {
        const g = new THREE.Group(), corpo = clonarComOssos(modelo.scene); g.add(corpo);
        const ossos = {}; corpo.traverse(o => { if (o.isBone) ossos[o.name] = o; });
        corpo.traverse(o => { if (!o.isMesh) return; o.material = o.material.clone(); o.frustumCulled = false; o.castShadow = false;
          if (o.name === 'Wolf3D_Headwear') o.visible = false;
          if (o.name === 'Wolf3D_Beard') o.visible = !!bigode;
          const cor = { Wolf3D_Outfit_Top: blusa, Wolf3D_Outfit_Bottom: calca, Wolf3D_Outfit_Footwear: tenis }[o.name];
          // roupa lisa e escura (sem a estampa nem os detalhes do terno original): casaco, calça e tênis
          if (cor != null) { o.material.map = null; o.material.normalMap = null; o.material.color.set(cor); o.material.roughness = 1; o.material.metalness = 0; }
          else if (o.name === 'Wolf3D_Head' || o.name === 'Wolf3D_Body') o.material.color.multiplyScalar(0.5); // pele na penumbra
          else o.material.color.multiplyScalar(0.6);
          o.material.envMapIntensity = 0.15; // menos brilho: ficam mais na sombra
          fm(o.material); o.material.needsUpdate = true; });
        corpo.scale.setScalar(altura / 1.87);
        // pose (girando cada osso a partir da pose de repouso)
        ossos.LeftArm.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, 0.1))); // braços caídos ao lado do corpo
        ossos.RightArm.quaternion.multiply(new THREE.Quaternion().setFromEuler(new THREE.Euler(0.4, 0, -0.1)));
        if (pose === 'encostado') { // mãos no bolso e um pé apoiado na parede
          girar(ossos.LeftForeArm, [0, 0, 1], 0.35); girar(ossos.RightForeArm, [0, 0, 1], -0.35);
          girar(ossos.RightUpLeg, [1, 0, 0], -0.55); girar(ossos.RightLeg, [1, 0, 0], 1.35);
        } else { // em pé, peso numa perna, braços soltos
          girar(ossos.LeftForeArm, [0, 0, 1], 0.25); girar(ossos.RightForeArm, [0, 0, 1], -0.25);
          girar(ossos.LeftUpLeg, [0, 0, 1], -0.06); girar(ossos.RightUpLeg, [1, 0, 0], -0.08); }
        // gorro ou boné, presos ao osso da cabeça (alinhados com o topo da cabeça e os olhos)
        const cab = ossos.Head, topo = ossos.HeadTop_End.position.clone();
        const olhos = ossos.LeftEye.position.clone().add(ossos.RightEye.position).multiplyScalar(0.5);
        const cima = topo.clone().normalize(), frente = olhos.clone().sub(cima.clone().multiplyScalar(olhos.dot(cima))).normalize();
        const r = topo.length() * 0.56, mChapeu = fm(new THREE.MeshStandardMaterial({ color: gorro ?? bone ?? 0x111111, roughness: 1 }));
        const chapeu = new THREE.Mesh(new THREE.SphereGeometry(r, 20, 12, 0, Math.PI * 2, 0, Math.PI * (gorro ? 0.56 : 0.5)), mChapeu);
        chapeu.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), cima); chapeu.position.copy(topo).multiplyScalar(gorro ? 0.5 : 0.56).add(frente.clone().multiplyScalar(-r * 0.08));
        cab.add(chapeu);
        if (bone) { const aba = new THREE.Mesh(new THREE.CylinderGeometry(r * 0.95, r * 0.95, r * 0.06, 20, 1, false, -Math.PI / 2, Math.PI), mChapeu);
          aba.quaternion.copy(chapeu.quaternion); aba.position.copy(chapeu.position).add(frente.clone().multiplyScalar(r * 0.35)); cab.add(aba); }
        street.add(g);
        const neckQ = ossos.Neck.quaternion.clone(), headQ = cab.quaternion.clone(), bracoQ = ossos.RightForeArm.quaternion.clone();
        const q = (eixo, a) => new THREE.Quaternion().setFromAxisAngle(new THREE.Vector3(...eixo), a);
        return { g, corpoGira: pose !== 'encostado',
          virarCabeca: (y, aceno = 0) => { // o pescoço faz 40% do giro e a cabeça o resto (mais o aceno da conversa)
            ossos.Neck.quaternion.copy(neckQ).multiply(q([0, 1, 0], y * 0.4));
            cab.quaternion.copy(headQ).multiply(q([0, 1, 0], y * 0.6)).multiply(q([1, 0, 0], aceno)); },
          gesto: k => { ossos.RightForeArm.quaternion.copy(bracoQ).multiply(q([0, 0, 1], -0.75 * k)); } }; // mão que gesticula falando
      }
      const pa = pessoa({ altura: 1.82, blusa: 0x22262e, calca: 0x1b2232, tenis: 0x131315, gorro: 0x18191c, bigode: false, pose: 'encostado' });
      pa.g.position.set(POS_A[0] + 0.04, POS_A[1], POS_A[2]); pa.g.rotation.set(-0.05, -Math.PI / 2, 0, 'YXZ');
      const pb = pessoa({ altura: 1.76, blusa: 0x33291f, calca: 0x17181c, tenis: 0x0f0f11, bone: 0x101113, bigode: true, pose: 'em pe' });
      pb.g.position.set(...POS_B); pb.g.rotation.y = CONVERSA_B;
      for (const r of rapazes) r.g.visible = false; // some com os bonecos
      rapazes.length = 0;
      rapazes.push({ ...pa, yaw: 0, outro: pb.g.position, fase: 0 }, { ...pb, yaw: 0, outro: pa.g.position, fase: 3, corpo0: CONVERSA_B });
    } catch (e) { console.warn('Modelo de pessoa não carregou; ficam os bonecos.', e); }
  }
  // vira o corpo devagar e a cabeça mais rápido na direção de quem anda
  const giro = (atual, alvo, k) => atual + ((((alvo - atual + Math.PI) % (Math.PI * 2)) + Math.PI * 2) % (Math.PI * 2) - Math.PI) * k;
  // Antes: os dois conversam (um de frente para o outro, acenando com a cabeça e gesticulando,
  // cada um na sua vez). Quando ela chega a uns 14 m, param e passam a acompanhá-la com o
  // olhar; o que está em pé vira o corpo devagar na direção dela.
  function olharDosRapazes(t, pz) {
    for (const r of rapazes) { const p = r.g.position;
      const k = sm(clamp((14 - (pz - p.z)) / 3)); // 0 = conversando, 1 = olhando para ela
      const paraEla = Math.atan2(0 - p.x, pz - p.z), paraOOutro = Math.atan2(r.outro.x - p.x, r.outro.z - p.z);
      if (r.corpoGira) r.g.rotation.y = giro(r.g.rotation.y, k > 0.5 ? paraEla : r.corpo0, 0.015);
      const alvo = giro(paraOOutro, paraEla, k);
      const cabecaAlvo = THREE.MathUtils.clamp(giro(0, alvo - r.g.rotation.y, 1), -1.25, 1.25);
      r.yaw += (cabecaAlvo - r.yaw) * 0.08;
      const falando = (1 - k) * (Math.sin(t * 0.9 + r.fase) > 0 ? 1 : 0.25); // revezam a fala
      r.virarCabeca(r.yaw, falando * 0.07 * Math.sin(t * 2.4 + r.fase));
      r.gesto?.(falando * (0.5 + 0.5 * Math.sin(t * 3.1 + r.fase))); } }

  // ---------- o carro que segue ----------
  const car = carModel(0x101218, true); scene.add(car);
  const LANE_X = ROAD_X + ROAD_W / 2 - 1.7;
  const heads = [];
  for (const hx of [-0.68, 0.68]) { const s = new THREE.SpotLight(0xeef2ff, 90, 60, 0.42, 0.55, 1.4); s.position.set(hx, 0.8, -2.3); s.target.position.set(hx * 0.4 + 1.2, 0, -30); car.add(s); car.add(s.target);
    const gl = new THREE.Sprite(new THREE.SpriteMaterial({ map: glowTex, color: 0xdfe8ff, depthWrite: false, fog: false, blending: THREE.AdditiveBlending, transparent: true })); gl.scale.set(3.2, 3.2, 1); gl.position.set(hx, 0.8, -2.45); car.add(gl); heads.push(s, gl); }
  const beam = new THREE.Mesh(new THREE.ConeGeometry(2.6, 14, 24, 1, true), new THREE.MeshBasicMaterial({ color: 0xdfe6ff, transparent: true, opacity: 0.05, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide }));
  beam.visible = false; car.add(beam);

  // ---------- textos e painéis ----------
  function textPlane(lines, { h = 0.3, size = 128, color = '#F4EEE4', italicColor = '#E8A9B4', font = '700', lh = 1.2, shadow = true } = {}) {
    const [m0, g0] = mkCanvas(8, 8); let maxW = 0;
    for (const ln of lines) { const it = ln.startsWith('*'); g0.font = it ? `italic 400 ${size}px LO` : `${font} ${size}px LS`; maxW = Math.max(maxW, g0.measureText(it ? ln.slice(1) : ln).width); }
    const pad = size * 0.5; const W = Math.ceil(maxW + pad * 2), H = Math.ceil(lines.length * size * lh + pad);
    const [c, g] = mkCanvas(W, H);
    lines.forEach((ln, i) => { const it = ln.startsWith('*'); g.font = it ? `italic 400 ${size}px LO` : `${font} ${size}px LS`; g.fillStyle = it ? italicColor : color; g.textAlign = 'center'; g.textBaseline = 'top';
      if (shadow) { g.shadowColor = 'rgba(0,0,0,.55)'; g.shadowBlur = size * 0.18; } g.fillText(it ? ln.slice(1) : ln, W / 2, pad * 0.5 + i * size * lh); });
    const tex = canvasTex(c); tex.generateMipmaps = true; tex.minFilter = THREE.LinearMipmapLinearFilter;
    const sc = h / size; const m = new THREE.Mesh(new THREE.PlaneGeometry(W * sc, H * sc), new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthWrite: false, depthTest: false, fog: false, opacity: 0 }));
    m.renderOrder = 20; return m; }
  function phonePanel(img) {
    const [c, g] = mkCanvas(760, 1600);
    const r = (x, y, w, h, rad) => { g.beginPath(); g.moveTo(x + rad, y); g.arcTo(x + w, y, x + w, y + h, rad); g.arcTo(x + w, y + h, x, y + h, rad); g.arcTo(x, y + h, x, y, rad); g.arcTo(x, y, x + w, y, rad); g.closePath(); };
    g.fillStyle = '#0f1630'; r(0, 0, 760, 1600, 110); g.fill(); g.save(); r(24, 24, 712, 1552, 88); g.clip(); g.drawImage(img, 24, 24, 712, 1552); g.restore();
    const tex = canvasTex(c); tex.minFilter = THREE.LinearMipmapLinearFilter;
    const pm = new THREE.Mesh(new THREE.PlaneGeometry(0.74, 1.56), new THREE.MeshBasicMaterial({ map: tex, transparent: true, fog: false, opacity: 0, depthWrite: false, depthTest: false })); pm.renderOrder = 18; return pm; }
  function placeAround(obj, angleDeg, dist, y) { const a = THREE.MathUtils.degToRad(angleDeg); obj.position.set(Math.sin(a) * dist, y, -Math.cos(a) * dist); obj.lookAt(0, y, 0); }

  const rig = new THREE.Group(); scene.add(rig); // acompanha a pessoa
  const EYE = 1.6;
  const T = (lines, ang, dist, y, o = {}) => { const m = textPlane(lines, o); placeAround(m, ang, dist, y); rig.add(m); return m; };
  // Quando as duas linhas são duas frases completas, a 2ª fica em itálico rosa.
  // Quando é uma frase só quebrada em duas linhas, as duas usam o mesmo estilo,
  // para quem assiste ler como uma frase contínua.
  const texts = [
    { m: T(['22:47.', '*Voltando da faculdade.'], 0, 7.0, 2.15, { h: 0.42 }), a: 5, b: 13 },
    { m: T(['Faltam seis quarteirões.', '*A rua está vazia.'], 0, 7.0, 2.15, { h: 0.38 }), a: 15, b: 23 },
    { m: T(['Um motor', 'atrás de você.'], 0, 7.0, 2.15, { h: 0.4 }), a: 24.5, b: 31 },
    { m: T(['Os faróis atrás de você', 'não passam.'], 0, 7.0, 2.15, { h: 0.4 }), a: 35, b: 44 },
    { m: T(['Você acelera.', '*Ele também.'], 0, 7.0, 2.15, { h: 0.42 }), a: 49, b: 58 },
    // Durante o alerta (62 a 72,5 s): explica por que ninguém toca em "Estou bem".
    // Fica mais alto (y 3.45) para não cobrir o cartão do alerta.
    { m: T(['Você congela.', '*Não dá para pegar o celular.'], 0, 7.0, 3.45, { h: 0.34 }), a: 63, b: 67.6 },
    { m: T(['Você não consegue responder.', '*E o tempo acaba.'], 0, 7.0, 3.45, { h: 0.34 }), a: 68, b: 72.6 },
    { m: T(['Agora alguém sabe', 'onde você está.'], 0, 7.0, 2.15, { h: 0.38 }), a: 81.5, b: 87.5 },
    { m: T(['O Ampara percebe', 'o lugar, a hora e o seu corpo.'], 0, 7.0, 2.15, { h: 0.35 }), a: 88, b: 94.5 },
    { m: T(['E pergunta antes', 'de avisar quem você escolheu.'], 0, 7.0, 2.15, { h: 0.35 }), a: 95, b: 101 },
    { m: T(['*Você não está sozinha.'], 0, 7.0, 2.15, { h: 0.47 }), a: 101.5, b: 109 },
  ];
  const look = [
    { m: T(['olhe para trás'], 0, 7.0, 1.4, { h: 0.24, font: '500', color: '#E8A9B4' }), a: 25.5, b: 34 },
  ];

  // ---------- HUD do Ampara (referências ao app, sem a tela do celular) ----------
  IM.avatar = await loadImg(A('avatar.png'));
  function hudCard(wM, hM, ppm = 900) { const [c, g] = mkCanvas(Math.round(wM * ppm), Math.round(hM * ppm)); const tex = canvasTex(c); tex.minFilter = THREE.LinearMipmapLinearFilter;
    const m = new THREE.Mesh(new THREE.PlaneGeometry(wM, hM), new THREE.MeshBasicMaterial({ map: tex, transparent: true, opacity: 0, fog: false, depthTest: false, depthWrite: false, toneMapped: false }));
    m.renderOrder = 22; return { m, c, g, tex, key: '' }; }
  const rrect = (g, x, y, w, h, r) => { g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); };
  const RISK = { baixo: ['#3E9C7E', 0.28], moderado: ['#D9A441', 0.6], alto: ['#D2475F', 0.95] };
  const F = (w, s, f = 'LS') => `${w} ${s}px ${f}`;
  function glass(g, W, H) { rrect(g, 6, 6, W - 12, H - 12, 60); g.fillStyle = 'rgba(16,24,52,0.82)'; g.fill(); g.lineWidth = 5; g.strokeStyle = 'rgba(232,169,180,0.65)'; g.stroke(); }
  function avatarRing(g, cx, cy, r, color, frac) {
    g.save(); g.beginPath(); g.arc(cx, cy, r - 14, 0, 7); g.fillStyle = '#F4EEE4'; g.fill(); g.clip(); g.drawImage(IM.avatar, cx - r + 14, cy - r + 14, (r - 14) * 2, (r - 14) * 2); g.restore();
    g.lineWidth = 14; g.strokeStyle = 'rgba(255,255,255,0.18)'; g.beginPath(); g.arc(cx, cy, r, 0, 7); g.stroke();
    g.strokeStyle = color; g.lineCap = 'round'; g.beginPath(); g.arc(cx, cy, r, -Math.PI / 2, -Math.PI / 2 + frac * Math.PI * 2); g.stroke(); }
  // Batimentos mostrados no painel (e usados pelo som do coração no index.html): sobem com o
  // carro, sobem mais quando os dois rapazes começam a olhar (40 a 47 s) e disparam quando ela acelera.
  const bpmEm = t => 78 + 18 * ramp(t, 34, 48) + 12 * ramp(t, 40, 47) + 38 * ramp(t, 49, 59);
  // Momentos de ênfase: o painel pulsa aqui e o index.html toca um som curto.
  const ENFASES = [{ t: 33.4, tipo: 'mapa' }, { t: 34, tipo: 'risco' }, { t: 53, tipo: 'risco' }];
  const pulsoEm = (t, tipo) => { let k = 0; for (const e of ENFASES) if (e.tipo === tipo && t >= e.t && t < e.t + 0.9) k = Math.max(k, Math.sin(Math.PI * (t - e.t) / 0.9)); return k; };
  const riscoSubindo = t => ENFASES.some(e => e.tipo === 'risco' && t >= e.t && t < e.t + 3.5);
  // 1) status: bonequinha + risco + batimentos
  const status = hudCard(1.05, 0.5);
  function drawStatus(level, frac, bpm, subindo = false) { const key = level + '|' + frac.toFixed(2) + '|' + bpm + '|' + subindo; if (key === status.key) return; status.key = key;
    const { g, c } = status; const W = c.width, H = c.height; g.clearRect(0, 0, W, H); glass(g, W, H);
    avatarRing(g, 225, H / 2, 150, RISK[level][0], frac);
    g.textBaseline = 'top'; g.textAlign = 'left';
    g.font = F(700, 40); g.fillStyle = '#E8A9B4'; g.fillText('AMPARA · PROTEÇÃO', 430, 70);
    g.font = F(500, 58); g.fillStyle = '#F4EEE4'; g.fillText('Risco', 430, 130); const rw = g.measureText('Risco ').width;
    g.font = F(700, 76); g.fillStyle = RISK[level][0]; g.fillText(level, 430 + rw, 118);
    if (subindo) { const x = 430 + rw + g.measureText(level + ' ').width; g.beginPath(); g.moveTo(x, 182); g.lineTo(x + 25, 140); g.lineTo(x + 50, 182); g.closePath(); g.fill(); }
    g.font = F(700, 54); g.fillStyle = '#F4EEE4'; g.fillText('♥ ' + bpm + ' bpm', 430, 232);
    if (bpm > 100) { g.font = 'italic 400 44px LO'; g.fillStyle = '#E8A9B4'; g.fillText('acima do seu normal', 430, 305); }
    else { g.font = F(500, 40); g.fillStyle = 'rgba(244,238,228,.7)'; g.fillText('acompanhando você', 430, 308); }
    status.tex.needsUpdate = true; }
  placeAround(status.m, -17, 3.4, 1.1); rig.add(status.m);
  // 2) mapa: rua com ocorrências registradas
  const map = hudCard(0.82, 0.82);
  function drawMap(pulse) { const key = (pulse * 10 | 0) + ''; if (key === map.key) return; map.key = key;
    const { g, c } = map; const W = c.width, H = c.height; g.clearRect(0, 0, W, H); glass(g, W, H);
    g.save(); rrect(g, 40, 40, W - 80, H - 250, 40); g.clip(); g.fillStyle = '#1d2a52'; g.fillRect(0, 0, W, H);
    g.strokeStyle = '#2f4074'; g.lineWidth = 16; for (const x of [130, 300, 520, 650]) { g.beginPath(); g.moveTo(x, 0); g.lineTo(x + 30, H); g.stroke(); }
    for (const y of [120, 250, 400]) { g.beginPath(); g.moveTo(0, y); g.lineTo(W, y - 20); g.stroke(); }
    g.strokeStyle = '#3b4f8c'; g.lineWidth = 28; g.beginPath(); g.moveTo(380, H); g.lineTo(395, 0); g.stroke();
    for (const [x, y, r, a] of [[400, 200, 170, .55], [520, 120, 110, .4], [300, 330, 90, .3]]) { const gr = g.createRadialGradient(x, y, 0, x, y, r); gr.addColorStop(0, `rgba(210,71,95,${a})`); gr.addColorStop(1, 'rgba(210,71,95,0)'); g.fillStyle = gr; g.fillRect(x - r, y - r, 2 * r, 2 * r); }
    g.fillStyle = 'rgba(232,169,180,.35)'; g.beginPath(); g.arc(392, 470, 30 + pulse * 26, 0, 7); g.fill(); g.fillStyle = '#E8A9B4'; g.beginPath(); g.arc(392, 470, 22, 0, 7); g.fill(); g.lineWidth = 6; g.strokeStyle = '#fff'; g.stroke();
    g.restore();
    g.textAlign = 'left'; g.textBaseline = 'top'; g.font = F(700, 48); g.fillStyle = '#F4EEE4'; g.fillText('Esta rua, à noite', 60, H - 190);
    g.font = 'italic 400 42px LO'; g.fillStyle = '#E8A9B4'; g.fillText('tem ocorrências registradas.', 60, H - 132);
    g.font = F(500, 30); g.fillStyle = 'rgba(244,238,228,.6)'; g.fillText('dados públicos · SSP-SP', 60, H - 72);
    map.tex.needsUpdate = true; }
  placeAround(map.m, 0, 3.4, 0.82); rig.add(map.m); // no centro, abaixo da frase: o lado direito fica livre para ver o beco
  // 3) alerta: "Está tudo bem?" com contagem, depois "mensagem enviada"
  const alertC = hudCard(1.1, 1.25);
  function drawAlert(mode, n, k) { const key = mode + n + '|' + (k * 20 | 0); if (key === alertC.key) return; alertC.key = key;
    const { g, c } = alertC; const W = c.width, H = c.height; g.clearRect(0, 0, W, H);
    rrect(g, 6, 6, W - 12, H - 12, 70); g.fillStyle = '#FFFBF5'; g.fill(); g.fillStyle = mode === 'count' ? '#D2475F' : '#3E9C7E'; rrect(g, 6, 6, W - 12, 26, 13); g.fill();
    g.textAlign = 'center'; g.textBaseline = 'top';
    if (mode === 'count') {
      avatarRing(g, W / 2, 190, 115, '#D2475F', 1);
      g.font = F(700, 84); g.fillStyle = '#B4566E'; g.fillText('Risco alto', W / 2, 330);
      g.font = F(700, 64); g.fillStyle = '#1B2A55'; g.fillText('Está tudo bem?', W / 2, 432);
      g.font = F(500, 40); g.fillStyle = '#5B6787'; g.fillText('Seus contatos serão avisados em:', W / 2, 520);
      g.lineWidth = 14; g.strokeStyle = '#E9D7DB'; g.beginPath(); g.arc(W / 2, 710, 110, 0, 7); g.stroke();
      g.strokeStyle = '#D2475F'; g.lineCap = 'round'; g.beginPath(); g.arc(W / 2, 710, 110, -Math.PI / 2, -Math.PI / 2 + Math.PI * 2 * k); g.stroke();
      g.font = F(700, 120); g.fillStyle = '#B4566E'; g.textBaseline = 'middle'; g.fillText(String(n), W / 2, 712); g.textBaseline = 'top';
      rrect(g, 120, 880, W - 240, 130, 65); g.fillStyle = '#E6DFE2'; g.fill(); g.font = F(700, 52); g.fillStyle = '#A59AA0'; g.fillText('Estou bem, cancelar', W / 2, 920);
      g.font = F(500, 38); g.fillStyle = '#B4566E'; g.fillText('sem resposta…', W / 2, 1050);
    } else {
      g.fillStyle = '#E3F1EA'; g.beginPath(); g.arc(W / 2, 175, 110, 0, 7); g.fill(); g.strokeStyle = '#2F7962'; g.lineWidth = 18; g.lineCap = 'round'; g.lineJoin = 'round';
      g.beginPath(); g.moveTo(W / 2 - 48, 178); g.lineTo(W / 2 - 10, 216); g.lineTo(W / 2 + 54, 140); g.stroke();
      g.font = F(700, 76); g.fillStyle = '#1B2A55'; g.fillText('Mensagem enviada', W / 2, 315);
      g.font = 'italic 400 46px LO'; g.fillStyle = '#B4566E'; g.fillText('com a sua localização em tempo real', W / 2, 410);
      const names = ['Mãe', 'Amanda', 'Júlia'];
      names.forEach((nm, i) => { const vis = clamp(k * 4 - i * 0.8); if (vis <= 0) return; const y = 520 + i * 150; g.globalAlpha = vis;
        rrect(g, 110, y, W - 220, 120, 60); g.fillStyle = '#F4EEE4'; g.fill(); g.fillStyle = '#1B2A55'; g.beginPath(); g.arc(185, y + 60, 40, 0, 7); g.fill();
        g.font = F(700, 44); g.fillStyle = '#F4EEE4'; g.textBaseline = 'middle'; g.fillText(nm[0], 185, y + 62); g.textAlign = 'left'; g.fillStyle = '#1B2A55'; g.font = F(700, 52); g.fillText(nm, 260, y + 62);
        g.textAlign = 'right'; g.fillStyle = '#2F7962'; g.font = F(700, 40); g.fillText('✓ enviado', W - 150, y + 62); g.textAlign = 'center'; g.textBaseline = 'top'; g.globalAlpha = 1; });
    }
    alertC.tex.needsUpdate = true; }
  placeAround(alertC.m, 0, 3.6, 1.55); rig.add(alertC.m);
  const hud = { status, map, alertC };

  // setas: no vídeo, um anel de setas aponta o caminho mais curto até o alvo;
  // no óculos (xr), uma seta só, presa à frente do olhar.
  const arrowGeo = (() => { const s = new THREE.Shape(); s.moveTo(0, 0.16); s.lineTo(0.16, 0); s.lineTo(0, -0.16); s.lineTo(0.05, 0); s.closePath();
    const s2 = s.clone ? null : null; const g = new THREE.ShapeGeometry(s); return g; })();
  const arrowMat = () => new THREE.MeshBasicMaterial({ color: 0xE8A9B4, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide });
  const guides = [{ a: 16.5, b: 20.5, ang: 0 }, { a: 21, b: 23, ang: 0 }, { a: 25.5, b: 33.2, ang: 180 }, { a: 33.5, b: 37.5, ang: 0 }, { a: 38, b: 43.5, ang: 0 }, { a: 49, b: 53, ang: 0 }, { a: 53.5, b: 57.5, ang: 0 }, { a: 59, b: 80.5, ang: 0 }, { a: 81.5, b: 109, ang: 0 }, { a: 116, b: 123, ang: 180 }];
  const ringArrows = [];
  if (!xr) for (let k = 0; k < 12; k++) { const g = new THREE.Group(); for (let j = 0; j < 3; j++) { const m = new THREE.Mesh(arrowGeo, arrowMat()); m.position.x = j * 0.13; m.renderOrder = 25; g.add(m); }
    g.userData.ang = k * 30; rig.add(g); ringArrows.push(g); }
  const headArrow = new THREE.Group(); for (let j = 0; j < 3; j++) { const m = new THREE.Mesh(arrowGeo, arrowMat()); m.position.x = j * 0.11; m.scale.setScalar(0.8); m.renderOrder = 25; headArrow.add(m); }
  const headArrowLabel = textPlane(['vire'], { h: 0.05, font: '500', color: '#E8A9B4', shadow: false }); headArrowLabel.position.set(0.11, -0.18, 0); headArrow.add(headArrowLabel);
  // alvo pulsante
  const targetRing = new THREE.Mesh(new THREE.RingGeometry(0.98, 1.0, 64), new THREE.MeshBasicMaterial({ color: 0xE8A9B4, transparent: true, opacity: 0, depthTest: false, depthWrite: false, fog: false, side: THREE.DoubleSide }));
  targetRing.renderOrder = 19; rig.add(targetRing);

  // anel de luz do Ampara no chão
  const ring = new THREE.Mesh(new THREE.TorusGeometry(1, 0.018, 16, 200), new THREE.MeshBasicMaterial({ color: 0xE8A9B4, transparent: true, opacity: 0, fog: false }));
  ring.rotation.x = Math.PI / 2; ring.position.y = 0.2; rig.add(ring);
  const ring2 = ring.clone(); ring2.material = ring.material.clone(); rig.add(ring2);
  const warm = new THREE.PointLight(0xE8A9B4, 0, 26, 1.3); warm.position.set(0, 3, 0); rig.add(warm);
  // partículas suaves (luz do Ampara)
  const motes = (() => { const n = 260, pos = new Float32Array(n * 3); for (let i = 0; i < n; i++) { const a = rnd() * 6.283, r = 1 + rnd() * 5; pos[i * 3] = Math.cos(a) * r; pos[i * 3 + 1] = 0.3 + rnd() * 3.5; pos[i * 3 + 2] = Math.sin(a) * r; }
    const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    const p = new THREE.Points(g, new THREE.PointsMaterial({ map: glowTex, color: 0xffd0da, size: 0.03, transparent: true, opacity: 0, depthWrite: false, blending: THREE.AdditiveBlending, fog: false })); rig.add(p); return p; })();

  // sala clara final (no vídeo: créditos; no óculos: vira a sala do quiz)
  const final = new THREE.Group(); rig.add(final);
  const logoMesh = (() => { const t = new THREE.Texture(IM.logo_navy); t.needsUpdate = true; t.colorSpace = THREE.SRGBColorSpace; t.anisotropy = 8; const w = 2.4;
    return new THREE.Mesh(new THREE.PlaneGeometry(w, w * IM.logo_navy.height / IM.logo_navy.width), new THREE.MeshBasicMaterial({ map: t, transparent: true, opacity: 0, fog: false, depthWrite: false, depthTest: false })); })();
  logoMesh.renderOrder = 20;
  placeAround(logoMesh, 0, 5.0, 2.2); final.add(logoMesh);
  const fTag = textPlane(['*Tecnologia que percebe. Proteção que acompanha.'], { h: 0.2, italicColor: '#B4566E', shadow: false }); placeAround(fTag, 0, 5.0, 0.9); final.add(fTag);
  const fBack = textPlane(['Eureka 2026 · Stand 72', 'Instituto Mauá de Tecnologia', '*Maria Eduarda Rodrigues e Amanda Herculano'], { h: 0.21, color: '#1B2A55', italicColor: '#B4566E', shadow: false }); placeAround(fBack, 180, 5.0, 1.6); final.add(fBack);
  const fSideL = textPlane(['ampara.info'], { h: 0.26, color: '#1B2A55', shadow: false }); placeAround(fSideL, -90, 5.0, 1.6); final.add(fSideL);
  const fSideR = textPlane(['ampara.info'], { h: 0.26, color: '#1B2A55', shadow: false }); placeAround(fSideR, 90, 5.0, 1.6); final.add(fSideR);
  const fTexts = [logoMesh, fTag, fBack, fSideL, fSideR];
  const floorCream = new THREE.Mesh(new THREE.CircleGeometry(30, 64), new THREE.MeshBasicMaterial({ color: 0xEDE4D6, transparent: true, opacity: 0, fog: false, toneMapped: false }));
  floorCream.renderOrder = -5; floorCream.rotation.x = -Math.PI / 2; floorCream.position.y = 0.01; rig.add(floorCream);

  // ---------- atualização por tempo ----------
  const tmpV = new THREE.Vector3();
  function carState(t) {
    const pz = walkZ(t); let gap = lerpKeys(TL.carGap, t); let x = LANE_X, z = pz + gap, ry = 0;
    const [l0, l1] = TL.carLeave;
    if (t > l0) { const k = clamp((t - l0) / (l1 - l0)); const turn = sm(clamp(k / 0.35));
      ry = Math.PI * turn; x = LANE_X - turn * 3.6; z = pz + gap + Math.pow(Math.max(0, k - 0.25), 2) * 140 - Math.sin(turn * Math.PI) * 2.5; }
    return { x, z, ry };
  }
  const headLookYaw = { v: 0 }; // yaw da cabeça (xr), para a seta
  function update(t, opts = {}) {
    const pz = walkZ(t); rig.position.set(0, 0, pz);
    const cs = carState(t); car.position.set(cs.x, 0, cs.z); car.rotation.y = cs.ry;
    olharDosRapazes(t, pz);
    // passos: leve balanço só no vídeo não (evita enjoo) — nada de balanço de câmera.
    const freezeK = ramp(t, TL.freeze - 0.4, TL.freeze + 0.6) * (1 - ramp(t, TL.relief, TL.relief + 4));
    const toCream = ramp(t, TL.toCream[0], TL.toCream[1]);
    const glowOn = ramp(t, TL.relief - 1, TL.relief + 4);
    // postes
    const dimAll = 1 - freezeK * 0.8;
    for (const L of lamps) { let k = 1; if (L.flick) { const s = Math.sin(t * 21) + Math.sin(t * 7.7) + Math.sin(t * 13.3 + 1); k = (s > 1.5 || (t > 55 && t < 62 && s > 0.6)) ? 0.08 : 1; }
      L.k = k * dimAll; L.glow.material.opacity = L.k; L.cone.material.opacity = L.k * 0.8; }
    const near = [...lamps].sort((a, b) => Math.abs(a.z - pz + 3) - Math.abs(b.z - pz + 3)).slice(0, 4);
    POOL.forEach((l, i) => { const L = near[i]; l.position.copy(L.pos); l.intensity = 34 * L.k * (1 - toCream); });
    // faróis
    const hOn = t < TL.carLeave[0] + 9 ? 1 : 1 - ramp(t, TL.carLeave[0] + 9, TL.carLeave[1]);
    heads.forEach(h => { if (h.isSpotLight) h.intensity = 90 * hOn * (1 - toCream); else h.material.opacity = hOn * (1 - toCream); });
    beam.material.opacity = 0.05 * hOn * (1 - toCream);
    car.visible = toCream < 0.99;
    // névoa / céu
    const bg = NIGHT.clone().lerp(NAVY, glowOn * 0.55).lerp(CREAM, toCream);
    scene.background.copy(bg); scene.fog.color.copy(bg);
    scene.fog.density = 0.022 + freezeK * 0.03 - glowOn * 0.006 * (1 - toCream);
    if (toCream > 0) scene.fog.density = (0.016) * (1 - toCream) + 0.002;
    for (const m of fadeables) { m.opacity = m.userData.base * (1 - toCream); const tr = toCream > 0 || m.userData.keepT === true; if (m.transparent !== tr) { m.transparent = tr; m.needsUpdate = true; } }
    street.userData.sky.visible = street.userData.moon.visible = toCream < 0.999;
    street.visible = toCream < 0.999;
    hemi.color.set(0x2c3a70).lerp(new THREE.Color(0xffffff), toCream); hemi.intensity = 0.55 + glowOn * 0.5 + toCream * 1.5;
    // Ampara acende
    const rk = glowOn * (1 - toCream);
    ring.scale.setScalar(0.4 + glowOn * 1.2 + Math.sin(t * 1.3) * 0.05 * glowOn); ring.material.opacity = 0.9 * rk;
    const p2 = ((t - TL.relief) * 0.35) % 1; ring2.scale.setScalar(0.5 + p2 * 3); ring2.material.opacity = rk * (1 - p2) * 0.6;
    warm.intensity = rk * 22; motes.material.opacity = rk * 0.8; motes.rotation.y = t * 0.03;
    // textos
    const show = (m, a, b, fi = 0.8, fo = 0.8) => { m.material.opacity = ramp(t, a, a + fi) * (1 - ramp(t, b - fo, b)); m.visible = m.material.opacity > 0.002; };
    for (const x of texts) show(x.m, x.a, x.b, x.fi, x.fo);
    for (const x of look) show(x.m, x.a, x.b);
    { // HUD
      const sk = ramp(t, 16, 17.2) * (1 - ramp(t, 61.5, 62.5)); status.m.material.opacity = sk; status.m.visible = sk > 0.002;
      if (status.m.visible) { const lvl = t < 34 ? 'baixo' : t < 53 ? 'moderado' : 'alto';
        const fr = lvl === 'baixo' ? 0.28 : lvl === 'moderado' ? 0.28 + 0.32 * ramp(t, 34, 36) : 0.6 + 0.35 * ramp(t, 53, 55);
        const bpm = Math.round(bpmEm(t) + Math.sin(t * 2.3) * 1.5); drawStatus(lvl, fr, bpm, riscoSubindo(t) && Math.sin(t * 9) > -0.3); }
      status.m.scale.setScalar(1 + 0.14 * pulsoEm(t, 'risco'));
      status.m.position.y = 1.1 + Math.sin(t * 0.9) * 0.012;
      const mk = ramp(t, 33, 34.2) * (1 - ramp(t, 61.5, 62.5)); map.m.material.opacity = mk; map.m.visible = mk > 0.002;
      if (map.m.visible) drawMap((t * 0.8) % 1);
      map.m.scale.setScalar(1 + 0.14 * pulsoEm(t, 'mapa'));
      map.m.position.y = 0.82 + Math.sin(t * 0.9 + 1) * 0.012;
      const ak = ramp(t, 62.2, 63) * (1 - ramp(t, 80, 81.5)); alertC.m.material.opacity = ak; alertC.m.visible = ak > 0.002;
      if (alertC.m.visible) { const c0 = 62.5, c1 = TL.relief; if (t < c1) { const rem = Math.max(1, Math.ceil(10 - (t - c0) * 10 / (c1 - c0))); drawAlert('count', rem, clamp(1 - (t - c0) / (c1 - c0))); }
        else drawAlert('sent', 0, clamp((t - c1) / 2.5)); }
      alertC.m.scale.setScalar(0.92 + 0.08 * ramp(t, 62.2, 63));
    }
    // setas
    let gd = null, gk = 0; for (const G of guides) { if (xr && G.video) continue; const k = ramp(t, G.a, G.a + 0.6) * (1 - ramp(t, G.b - 0.6, G.b)); if (k > 0.01 && (!gd || G.a > gd.a)) { gk = k; gd = G; } }
    const pulse = 0.65 + 0.35 * Math.sin(t * 6);
    if (!xr) for (const g of ringArrows) { let k = 0; if (gd) { let diff = ((gd.ang - g.userData.ang + 540) % 360) - 180; const dir = Math.sign(diff) || 1; k = Math.abs(diff) > 40 ? gk : 0;
        const a = THREE.MathUtils.degToRad(g.userData.ang); const ay = 0.82 - 0.3 * toCream; g.position.set(Math.sin(a) * 2.2, ay, -Math.cos(a) * 2.2); g.lookAt(0, ay, 0); g.rotateY(Math.PI); g.scale.x = -dir; // aponta no sentido do alvo
        g.children.forEach((m, j) => { m.material.opacity = k * (0.35 + 0.65 * ((Math.sin(t * 7 - j * 1.2) + 1) / 2)); m.position.x = j * 0.13 + ((t * 0.6) % 0.13); }); }
      else g.children.forEach(m => m.material.opacity = 0); }
    if (gd) { const a = THREE.MathUtils.degToRad(gd.ang); const dist = gd.ang === 180 || gd.ang === 0 ? 3.0 : 3.4; targetRing.position.set(Math.sin(a) * dist * 0.98, gd.ang === 180 ? 1.0 : 1.2, -Math.cos(a) * dist * 0.98);
      targetRing.lookAt(0, targetRing.position.y, 0); const s = gd.ang === 180 ? 1.3 : 0.7; targetRing.scale.setScalar(s * (1 + 0.12 * Math.sin(t * 4))); targetRing.material.opacity = (gd.ang === 0 || gd.ang === 180) ? 0 : gk * 0.7; }
    else targetRing.material.opacity = 0;
    // seta presa ao olhar (xr)
    if (xr && opts.camera) { const cam = opts.camera; let k = 0, dir = 1;
      if (gd) { const yaw = Math.atan2(-tmpV.set(0, 0, -1).applyQuaternion(cam.quaternion).x, -tmpV.z) ; // 0 = frente(-z)
        const cur = -THREE.MathUtils.radToDeg(yaw); let diff = ((gd.ang - cur + 540) % 360) - 180; dir = Math.sign(diff) || 1; k = Math.abs(diff) > 30 ? gk : 0; }
      headArrow.visible = k > 0.01; if (headArrow.visible) { cam.getWorldPosition(tmpV); headArrow.position.copy(tmpV); headArrow.quaternion.copy(cam.quaternion); headArrow.translateZ(-1.4); headArrow.translateY(-0.18); headArrow.translateX(dir * 0.25); headArrow.scale.set(dir, 1, 1);
        headArrow.children.forEach((m, j) => { if (m.material) m.material.opacity = k * (0.35 + 0.65 * ((Math.sin(t * 7 - j * 1.2) + 1) / 2)); }); headArrowLabel.scale.x = dir; } }
    // sala final
    floorCream.material.opacity = toCream;
    const showFinal = !opts.hideFinal;
    logoMesh.material.opacity = showFinal ? ramp(t, TL.toCream[1], TL.toCream[1] + 2) : 0;
    fTexts.slice(1).forEach((m, i) => m.material.opacity = showFinal ? ramp(t, TL.toCream[1] + 1 + i * 0.5, TL.toCream[1] + 2.5 + i * 0.5) : 0);
    return { pz, car: cs, freezeK, glowOn, toCream, guideAng: gd ? gd.ang : null, guideK: gk };
  }

  return { scene, rig, car, update, ENFASES, bpmEm, walkZ, walkSpeed, carState, EYE, DUR: TL.dur, textPlane, placeAround, ramp, clamp, IM };
}
