/* Animaciones de los ejercicios.
 * Cada ejercicio define posturas clave (cadera, torso, pies y manos) y una secuencia
 * con el ritmo de la técnica. Rodillas y codos se calculan con cinemática inversa,
 * así los pies y las manos se quedan donde tienen que estar.
 * Lienzo SVG 300×210, suelo en y=200, la figura mira hacia +x en vista lateral.
 */
(function () {
  const SEG = { torso: 52, neck: 7, head: 10, ua: 30, fa: 28, th: 44, sh: 42, foot: 12 };
  const GROUND = 194;
  const R = (n) => Math.round(n * 10) / 10;
  const add = (a, b) => [a[0] + b[0], a[1] + b[1]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1]];
  const mul = (a, k) => [a[0] * k, a[1] * k];
  const norm = (a) => { const l = Math.hypot(a[0], a[1]) || 1; return [a[0] / l, a[1] / l]; };
  const rot = (v, deg) => { const r = deg * Math.PI / 180, c = Math.cos(r), s = Math.sin(r); return [v[0] * c - v[1] * s, v[0] * s + v[1] * c]; };
  const P = (p) => `${R(p[0])},${R(p[1])}`;

  /* ---------- Cinemática inversa de dos segmentos ---------- */
  function ik(a, t, l1, l2, h) {
    const dx = t[0] - a[0], dy = t[1] - a[1];
    const d = Math.hypot(dx, dy) || 0.001;
    const dd = Math.min(l1 + l2 - 0.3, Math.max(Math.abs(l1 - l2) + 0.3, d));
    const ux = dx / d, uy = dy / d;
    const end = [a[0] + ux * dd, a[1] + uy * dd];
    const x = (l1 * l1 - l2 * l2 + dd * dd) / (2 * dd);
    const y = Math.sqrt(Math.max(0, l1 * l1 - x * x));
    const px = -uy, py = ux;
    const s = (px * h[0] + py * h[1]) >= 0 ? 1 : -1;
    return [[a[0] + ux * x + px * y * s, a[1] + uy * x + py * y * s], end];
  }

  /* ---------- Interpolación de posturas ---------- */
  function lerpVal(a, b, k) {
    if (a === undefined) return b;
    if (b === undefined) return a;
    if (typeof a === 'number') return a + (b - a) * k;
    if (Array.isArray(a)) return a.map((v, i) => lerpVal(v, b[i], k));
    if (typeof a === 'object') { const o = {}; for (const key in a) o[key] = lerpVal(a[key], b[key], k); return o; }
    return k < 0.5 ? a : b;
  }
  function lerpPose(A, B, k) { const o = {}; for (const key of new Set([...Object.keys(A), ...Object.keys(B)])) o[key] = lerpVal(A[key], B[key], k); return o; }
  const EASE = {
    io: (t) => t < 0.5 ? 2 * t * t : 1 - Math.pow(-2 * t + 2, 2) / 2,
    in: (t) => t * t,
    out: (t) => 1 - (1 - t) * (1 - t),
    lin: (t) => t
  };

  /* ---------- Resolver esqueleto ---------- */
  function solve(A, p) {
    const front = A.view === 'front';
    const hip = p.hip;
    let up;
    if (p.sh) up = norm(sub(p.sh, hip));
    else { const r = p.torso * Math.PI / 180; up = [Math.sin(r), -Math.cos(r)]; }
    // boca abajo (plancha): el pecho mira al suelo
    const fwd = p.prone ? [up[1], -up[0]] : [-up[1], up[0]];
    const shC = add(hip, mul(up, SEG.torso));
    const hd = norm(add(mul(up, Math.cos((p.neck || 0) * Math.PI / 180)), mul(fwd, Math.sin((p.neck || 0) * Math.PI / 180))));
    const head = add(shC, mul(hd, SEG.neck + SEG.head));
    const wS = front ? 18 : 0, wH = front ? 11 : 0;
    const local = (pt) => pt && pt.t ? add(add(shC, mul(fwd, pt.t[0])), mul(up, -pt.t[1])) : pt;
    // {pol: [ángulo, distancia]}: punto fijo respecto al hombro/cadera (0º = abajo). Mantiene la articulación bloqueada.
    const pol = (pt, base) => pt && pt.pol
      ? add(base, [Math.sin(pt.pol[0] * Math.PI / 180) * pt.pol[1], Math.cos(pt.pol[0] * Math.PI / 180) * pt.pol[1]])
      : local(pt);
    const as = p.as || 1, ts = p.ts || 1, uas = p.uas || 1;
    const J = { hip, shC, up, fwd, head, hd, p, front };
    [['A', -1], ['B', 1]].forEach(([k, sgn], i) => {
      const sh = add(shC, mul(fwd, sgn * wS));
      const hp = add(hip, mul(fwd, sgn * wH));
      const eh = (p.eh || A.elb)[i], kh = (p.kh || A.kne)[i];
      // ea/eb: posición del codo fijada a mano (para recorridos que la cinemática inversa no resuelve bien)
      const el = k === 'A' ? p.ea : p.eb;
      const hT = pol(k === 'A' ? p.ha : p.hb, sh);
      const [elbow, hand] = el ? [pol(el, sh), hT] : ik(sh, hT, SEG.ua * as * uas, SEG.fa * as, eh);
      const kn = k === 'A' ? p.ka : p.kb;
      const fT = pol(k === 'A' ? p.fa : p.fb, hp);
      const [knee, ankle] = kn ? [kn, fT] : ik(hp, fT, SEG.th * ts, SEG.sh, kh);
      J[k] = { sh, hip: hp, elbow, hand, knee, ankle, toe: toeOf(A, knee, ankle, k) };
    });
    return J;
  }
  function toeOf(A, knee, ankle, k) {
    if (A.view === 'front') return [ankle[0] + (k === 'A' ? -5 : 5), ankle[1] + 1];
    const v = norm(sub(ankle, knee));
    if (A.toes === 'back') return [ankle[0] - SEG.foot, ankle[1] + 1];
    if (A.toes === 'down') return add(ankle, mul([-v[1], v[0]], SEG.foot));
    if (ankle[1] >= GROUND - 4) return [ankle[0] + SEG.foot, ankle[1] + 1];
    return add(ankle, mul([v[1], -v[0]], SEG.foot));
  }

  /* ---------- Dibujo ---------- */
  const line = (pts, w, cls) => `<polyline points="${pts.map(P).join(' ')}" stroke-width="${w}" class="${cls}"/>`;
  function drawFigure(A, J) {
    const front = A.view === 'front';
    const leg = (L, cls) => line([L.hip, L.knee, L.ankle], 11, cls) + line([L.ankle, L.toe], 6, cls);
    const arm = (L, cls) => line([L.sh, L.elbow, L.hand], 7.5, cls) + `<circle cx="${R(L.hand[0])}" cy="${R(L.hand[1])}" r="4.2" class="fill-${cls}"/>`;
    const neck = line([J.shC, add(J.shC, mul(J.hd, SEG.neck))], 7, 'near');
    const headC = J.head;
    // la coleta va siempre en la nuca (hacia la espalda), también boca abajo
    const hf = J.p.prone ? [J.hd[1], -J.hd[0]] : [-J.hd[1], J.hd[0]];
    const hair = front
      ? `<circle cx="${R(headC[0] + J.hd[0] * 10)}" cy="${R(headC[1] + J.hd[1] * 10)}" r="5" class="hair"/>`
      : `<circle cx="${R(headC[0] - hf[0] * 10 + J.hd[0] * 2)}" cy="${R(headC[1] - hf[1] * 10 + J.hd[1] * 2)}" r="5" class="hair"/>`;
    const head = hair + `<circle cx="${R(headC[0])}" cy="${R(headC[1])}" r="${SEG.head}" class="fill-near"/>`;
    if (front) {
      const torso = `<polygon points="${[J.A.sh, J.B.sh, J.B.hip, J.A.hip].map(P).join(' ')}" class="torso-front"/>`;
      return leg(J.A, 'near') + leg(J.B, 'near') + torso + neck + head + arm(J.A, 'near') + arm(J.B, 'near');
    }
    const curl = J.p.curl || 0;
    const mid = mul(add(J.hip, J.shC), 0.5);
    const c = add(mid, mul(J.fwd, -curl));
    const torso = `<path d="M${P(J.hip)} Q${P(c)} ${P(J.shC)}" stroke-width="16" class="near"/>`;
    return leg(J.B, 'far') + arm(J.B, 'far') + torso + neck + head + leg(J.A, 'near') + arm(J.A, 'near');
  }

  /* ---------- Material del gimnasio ---------- */
  const G = {
    floor: '<line x1="-200" y1="200" x2="500" y2="200" class="floor"/>',
    bench: (x1, x2, top) => `<rect x="${x1}" y="${top}" width="${x2 - x1}" height="7" rx="3" class="eq2"/><rect x="${x1 + 6}" y="${top + 7}" width="5" height="${200 - top - 7}" class="eq2"/><rect x="${x2 - 11}" y="${top + 7}" width="5" height="${200 - top - 7}" class="eq2"/>`,
    stack: (x, y1) => `<rect x="${x}" y="${y1}" width="11" height="${200 - y1}" rx="2" class="eq2"/>`,
    pulley: (p) => `<circle cx="${p[0]}" cy="${p[1]}" r="4.5" class="eqf"/>`,
    cable: (a, b) => `<line x1="${R(a[0])}" y1="${R(a[1])}" x2="${R(b[0])}" y2="${R(b[1])}" class="cable"/>`,
    db: (p) => `<circle cx="${R(p[0])}" cy="${R(p[1])}" r="7" class="eqf"/><circle cx="${R(p[0])}" cy="${R(p[1])}" r="2.5" class="hub"/>`,
    dbV: (p) => `<rect x="${R(p[0] - 4.5)}" y="${R(p[1] - 11)}" width="9" height="22" rx="3" class="eqf"/>`,
    dbF: (p) => `<rect x="${R(p[0] - 9)}" y="${R(p[1] - 1.5)}" width="18" height="3" class="eqf"/><rect x="${R(p[0] - 12)}" y="${R(p[1] - 6)}" width="5" height="12" rx="1.5" class="eqf"/><rect x="${R(p[0] + 7)}" y="${R(p[1] - 6)}" width="5" height="12" rx="1.5" class="eqf"/>`,
    plate: (p, r) => `<circle cx="${R(p[0])}" cy="${R(p[1])}" r="${r}" class="plate"/><circle cx="${R(p[0])}" cy="${R(p[1])}" r="3" class="eqf"/>`,
    pad: (p, w, h) => `<rect x="${R(p[0] - w / 2)}" y="${R(p[1] - h / 2)}" width="${w}" height="${h}" rx="${Math.min(w, h) / 2}" class="pad"/>`,
    mid: (a, b) => [(a[0] + b[0]) / 2, (a[1] + b[1]) / 2]
  };

  /* ---------- Indicaciones con flecha ---------- */
  // C(parte del cuerpo, texto, x, y): etiqueta fija en (x, y) con una flecha que sigue a esa parte
  const C = (a, t, x, y) => ({ a, t, p: [x, y] });
  function anchor(J, n) {
    const mid = mul(add(J.hip, J.shC), 0.5);
    const back = (pt, k) => J.front ? pt : add(pt, mul(J.fwd, -k));
    switch (n) {
      case 'glute': return back(J.hip, 8);
      case 'lumbar': return back(add(J.hip, mul(J.up, 13)), 7);
      case 'back': return back(mid, 8);
      case 'scap': return back(add(J.shC, mul(J.up, -6)), 7);
      case 'abs': return J.front ? mid : add(mid, mul(J.fwd, 8));
      case 'chest': return J.front ? add(J.shC, mul(J.up, -10)) : add(add(J.shC, mul(J.up, -8)), mul(J.fwd, 8));
      case 'chin': return add(J.head, mul(J.fwd, 9));
      case 'hamstring': return mul(add(J.A.hip, J.A.knee), 0.5);
      case 'heel': case 'ankle': return J.A.ankle;
      case 'foot': return mul(add(J.A.ankle, J.A.toe), 0.5);
      case 'footB': return J.B.ankle;
      case 'knee': return J.A.knee;
      case 'kneeB': return J.B.knee;
      case 'kneeOut': return add(J.B.knee, [8, 0]);
      case 'elbow': return J.A.elbow;
      case 'hand': return J.A.hand;
      case 'handB': return J.B.hand;
      case 'gluteSideA': return add(J.A.hip, [-10, -4]);
      case 'gluteSideB': return add(J.B.hip, [10, -4]);
      default: return J.hip;
    }
  }
  function cueSVG(J, c, alpha) {
    const a = anchor(J, c.a), px = c.p[0], py = c.p[1];
    const w = Math.round(c.t.length * 6.8 + 18), h = 21;
    const dx = a[0] - px, dy = a[1] - py, L = Math.hypot(dx, dy) || 1, ux = dx / L, uy = dy / L;
    const s = Math.min((w / 2) / Math.max(Math.abs(ux), 1e-6), (h / 2) / Math.max(Math.abs(uy), 1e-6));
    let arrow = '';
    if (L > s + 12) {
      const st = [px + ux * s, py + uy * s], end = [a[0] - ux * 5, a[1] - uy * 5];
      const hb = [end[0] - ux * 7, end[1] - uy * 7], nx = -uy, ny = ux;
      arrow = `<line x1="${R(st[0])}" y1="${R(st[1])}" x2="${R(hb[0])}" y2="${R(hb[1])}" class="cue-line"/>` +
        `<polygon points="${P(end)} ${P([hb[0] + nx * 4.5, hb[1] + ny * 4.5])} ${P([hb[0] - nx * 4.5, hb[1] - ny * 4.5])}" class="cue-fill"/>`;
    }
    return `<g class="cue" opacity="${R(alpha)}">${arrow}<circle cx="${R(a[0])}" cy="${R(a[1])}" r="3.5" class="cue-dot"/>` +
      `<rect x="${R(px - w / 2)}" y="${py - h / 2}" width="${w}" height="${h}" rx="10.5" class="cue-fill"/>` +
      `<text x="${px}" y="${py + 4.2}" text-anchor="middle" class="cue-text">${c.t}</text></g>`;
  }

  /* ---------- Ejercicios ---------- */
  const UP = [0, -1], DOWN = [0, 1], FWD = [1, 0], BACK = [-1, 0];

  const hipThrust = (pause) => ({
    view: 'side', kne: [UP, UP], elb: [UP, UP],
    bg: G.bench(66, 124, 152),
    fg: (J) => G.plate(G.mid(J.A.hand, J.B.hand), 20),
    base: { fa: [211, GROUND], fb: [214, GROUND], sh: [117, 145] },
    poses: {
      down: { hip: [160, 180], neck: 15, ha: [165, 166], hb: [167, 166] },
      up: { hip: [171, 145], neck: 40, ha: [175, 132], hb: [177, 132] }
    },
    seq: pause
      ? [['up', 1.3, 'Sube empujando con los talones', null, C('heel', 'Empuja con los talones', 248, 92)],
         ['up', 2.4, 'Aguanta 2 s apretando el glúteo', null, C('glute', 'Aprieta glúteo', 165, 188)],
         ['down', 2.6, 'Baja en 2 s', null, C('chin', 'Barbilla metida', 100, 100)],
         ['down', 0.6, 'Baja en 2 s', null, C('chin', 'Barbilla metida', 100, 100)]]
      : [['up', 1.3, 'Sube empujando con los talones', null, C('heel', 'Empuja con los talones', 248, 92)],
         ['up', 1.6, 'Aprieta el glúteo arriba', null, C('glute', 'Aprieta glúteo', 165, 188)],
         ['down', 2.2, 'Baja controlado', null, C('chin', 'Barbilla metida', 100, 100)],
         ['down', 0.6, 'Baja controlado', null, C('chin', 'Barbilla metida', 100, 100)]]
  });

  const ANIMS = {
    'hip-thrust': hipThrust(false),
    'hip-thrust-pause': hipThrust(true),

    'goblet-squat': {
      view: 'side', kne: [FWD, FWD], elb: [DOWN, DOWN],
      fg: (J) => G.dbV(G.mid(J.A.hand, J.B.hand)),
      base: { fa: [152, GROUND], fb: [156, GROUND], ha: { t: [14, 15] }, hb: { t: [15, 15] } },
      poses: {
        up: { hip: [150, 109], torso: 3 },
        down: { hip: [127, 158], torso: 21 }
      },
      seq: [['down', 2.4, 'Baja controlado (2 s)', null, C('knee', 'Rodillas como los pies', 248, 118)],
             ['down', 1, 'Abajo, espalda recta', null, C('back', 'Espalda recta', 60, 95)],
             ['up', 1.6, 'Sube empujando con todo el pie', null, C('foot', 'Empuja con todo el pie', 235, 178)],
             ['up', 0.8, 'Sube empujando con todo el pie', null, C('foot', 'Empuja con todo el pie', 235, 178)]]
    },

    'rdl': {
      view: 'side', kne: [FWD, FWD], elb: [BACK, BACK],
      fg: (J) => G.db(J.A.hand),
      base: { fa: [150, GROUND], fb: [153, GROUND] },
      poses: {
        top: { hip: [149, 111], torso: 0, ha: [153, 114], hb: [155, 114] },
        bottom: { hip: [124, 114], torso: 78, ha: [176, 160], hb: [178, 160] }
      },
      seq: [['bottom', 2.4, 'Cadera atrás, baja lento', null, C('glute', 'Cadera atrás', 55, 80)],
             ['bottom', 1, 'Nota el estiramiento del femoral', null, C('hamstring', 'Estira el femoral', 55, 165)],
             ['top', 1.6, 'Sube apretando el glúteo', null, C('glute', 'Aprieta glúteo', 55, 80)],
             ['top', 0.8, 'Sube apretando el glúteo', null, C('glute', 'Aprieta glúteo', 55, 80)]]
    },

    'reverse-lunge': {
      view: 'side', kne: [FWD, DOWN], elb: [BACK, BACK],
      fg: (J) => G.db(J.A.hand),
      base: { fa: [160, GROUND] },
      poses: {
        stand: { hip: [156, 109], torso: 3, fb: [154, GROUND], ha: [159, 114], hb: [161, 114] },
        mid: { hip: [146, 124], torso: 8, fb: [122, 184], ha: [153, 128], hb: [155, 128] },
        bottom: { hip: [134, 150], torso: 15, fb: [96, 189], ha: [148, 156], hb: [150, 156] }
      },
      seq: [['mid', 0.9, 'Paso largo hacia atrás', 'in', C('footB', 'Paso largo atrás', 55, 150)],
             ['bottom', 1.4, 'Baja hasta casi tocar el suelo', 'out', C('kneeB', 'Rodilla casi al suelo', 60, 118)],
             ['bottom', 0.6, 'Baja hasta casi tocar el suelo', null, C('kneeB', 'Rodilla casi al suelo', 60, 118)],
             ['mid', 1.1, 'Sube con el talón de delante', 'in', C('heel', 'Empuja con el talón', 252, 150)],
             ['stand', 0.7, 'Sube con el talón de delante', 'out', C('heel', 'Empuja con el talón', 252, 150)],
             ['stand', 0.8, 'Repite']]
    },

    'leg-curl': {
      view: 'side', kne: [[1, -1], [1, -1]], elb: [DOWN, DOWN],
      // Máquina: asiento, respaldo, rodillo sobre los muslos y palanca que gira en el eje de la rodilla
      bg: (J) => {
        const k = [172, 144], a = J.A.ankle, v = norm(sub(a, k));
        const pad = add(add(a, mul([-v[1], v[0]], 8)), mul(v, -3));
        return '<line x1="96" y1="198" x2="200" y2="198" stroke-width="5" class="eq2s"/>' +
          '<rect x="128" y="158" width="9" height="40" class="eq2"/><rect x="186" y="120" width="9" height="78" rx="2" class="eq2"/>' +
          '<line x1="110" y1="152" x2="96" y2="86" stroke-width="11" stroke-linecap="round" class="eq2s"/>' +
          '<rect x="102" y="150" width="74" height="9" rx="4" class="eq2"/>' +
          `<line x1="172" y1="144" x2="${R(pad[0])}" y2="${R(pad[1])}" stroke-width="6" stroke-linecap="round" class="eqs"/>` +
          `<circle cx="${R(pad[0])}" cy="${R(pad[1])}" r="7.5" class="pad"/>` +
          '<line x1="172" y1="144" x2="190" y2="128" stroke-width="5" class="eqs"/>';
      },
      fg: () => '<circle cx="172" cy="144" r="4.5" class="eqf"/>' + G.pad([162, 132], 26, 9),
      base: { hip: [128, 144], torso: -12, ha: [140, 153], hb: [142, 153] },
      poses: {
        ext: { fa: [213, 151], fb: [215, 151] },
        mid: { fa: [193, 180], fb: [195, 180] },
        curl: { fa: [158, 183], fb: [160, 183] }
      },
      seq: [['mid', 0.65, 'Flexiona las rodillas', 'in', C('heel', 'Talón hacia abajo y atrás', 240, 104)],
             ['curl', 0.65, 'Flexiona las rodillas', 'out', C('heel', 'Talón hacia abajo y atrás', 240, 104)],
             ['curl', 0.8, 'Aprieta el femoral', null, C('hamstring', 'Aprieta el femoral', 240, 104)],
             ['mid', 1.3, 'Vuelve lento (2-3 s)', 'in', C('glute', 'Cadera pegada al asiento', 225, 190)],
             ['ext', 1.3, 'Vuelve lento (2-3 s)', 'out', C('glute', 'Cadera pegada al asiento', 225, 190)],
             ['ext', 0.6, 'Vuelve lento (2-3 s)']]
    },

    'abductor-machine': {
      view: 'front', kne: [BACK, FWD], elb: [BACK, FWD],
      bg: '<rect x="120" y="62" width="60" height="80" rx="10" class="eq2"/><rect x="106" y="138" width="88" height="12" rx="5" class="eq2"/>' +
          '<rect x="145" y="150" width="10" height="46" class="eq2"/><rect x="104" y="196" width="92" height="4" class="eq2"/>' +
          '<rect x="112" y="140" width="5" height="16" rx="2" class="eqf"/><rect x="183" y="140" width="5" height="16" rx="2" class="eqf"/>',
      fg: (J) => {
        const pa = [J.A.knee[0] - 8, J.A.knee[1] + 2], pb = [J.B.knee[0] + 8, J.B.knee[1] + 2];
        const foot = (a) => `<rect x="${R(a[0] - 9)}" y="${R(a[1] + 4)}" width="18" height="4" rx="2" class="eqf"/>`;
        return G.pad(pa, 8, 26) + G.pad(pb, 8, 26) + foot(J.A.ankle) + foot(J.B.ankle);
      },
      base: { hip: [150, 138], torso: 0, ha: [114, 146], hb: [186, 146] },
      poses: {
        closed: { ka: [144, 151], kb: [156, 151], fa: [143, 186], fb: [157, 186] },
        open: { ka: [117, 149], kb: [183, 149], fa: [127, 185], fb: [173, 185] }
      },
      seq: [['open', 1.3, 'Abre empujando con las rodillas', null, C('kneeOut', 'Rodillas fuera', 255, 150)],
             ['open', 1.4, 'Aguanta 1 s', null, C('gluteSideB', 'Glúteo medio', 255, 108)],
             ['closed', 2.2, 'Cierra despacio'],
             ['closed', 0.6, 'Cierra despacio']]
    },

    'dead-bug': {
      view: 'side', kne: [UP, UP], elb: [UP, UP],
      base: { hip: [172, 188], torso: -90, neck: 0 },
      poses: {
        start: { ha: [122, 132], hb: [124, 132], fa: [214, 146], fb: [216, 146] },
        A: { ha: [66, 180], hb: [124, 132], fa: [214, 146], fb: [256, 178] },
        B: { ha: [122, 132], hb: [68, 180], fa: [256, 178], fb: [216, 146] }
      },
      seq: [['A', 2.2, 'Estira brazo y pierna contraria', null, C('lumbar', 'Lumbar pegada al suelo', 185, 70)],
             ['A', 0.6, 'Estira brazo y pierna contraria', null, C('lumbar', 'Lumbar pegada al suelo', 185, 70)],
             ['start', 1.5, 'Vuelve al centro'],
             ['B', 2.2, 'Ahora el otro lado', null, C('abs', 'Abdomen firme', 185, 70)],
             ['B', 0.6, 'Ahora el otro lado', null, C('abs', 'Abdomen firme', 185, 70)],
             ['start', 1.5, 'Vuelve al centro']]
    },

    'side-plank': {
      view: 'front', kne: [DOWN, UP], elb: [DOWN, UP],
      base: { fa: [252, GROUND], fb: [255, 189], ha: [130, 195] },
      poses: {
        down: { hip: [160, 186], sh: [110, 152], hb: [168, 175] },
        up: { hip: [160, 165], sh: [110, 150], hb: [165, 152] }
      },
      seq: [['up', 1.3, 'Sube la cadera', null, C('hip', 'Cadera arriba', 195, 100)],
             ['up', 3, 'Aguanta: cuerpo en línea recta', null, C('hip', 'Sin dejar caer la cadera', 195, 100)],
             ['down', 1.3, 'Baja controlado'],
             ['down', 0.8, 'Baja controlado']]
    },

    'lat-pulldown': {
      view: 'front', kne: [BACK, FWD], elb: [[-0.6, 1], [0.6, 1]],
      bg: '<rect x="122" y="70" width="56" height="70" rx="8" class="eq2"/><rect x="110" y="138" width="80" height="10" rx="4" class="eq2"/>' +
          '<rect x="146" y="148" width="8" height="52" class="eq2"/>' + G.pulley([150, 6]),
      fg: (J) => {
        const a = J.A.hand, b = J.B.hand, m = G.mid(a, b);
        return G.cable([150, 6], m) + `<line x1="${R(a[0] - 14)}" y1="${R(a[1])}" x2="${R(b[0] + 14)}" y2="${R(b[1])}" stroke-width="4.5" stroke-linecap="round" class="eqs"/>` +
          G.pad([150, 147], 64, 9);
      },
      base: { hip: [150, 140], torso: 0, ka: [138, 150], kb: [162, 150], fa: [136, 190], fb: [164, 190] },
      poses: {
        top: { ha: [112, 34], hb: [188, 34] },
        bottom: { ha: [106, 93], hb: [194, 93] }
      },
      seq: [['bottom', 1.3, 'Lleva los codos hacia abajo', null, C('elbow', 'Codos hacia abajo', 48, 140)],
             ['bottom', 0.9, 'Barra al pecho, pecho arriba', null, C('chest', 'Pecho arriba', 250, 112)],
             ['top', 2.4, 'Sube controlado'],
             ['top', 0.6, 'Sube controlado']]
    },

    'incline-db-press': {
      view: 'side', kne: [UP, UP], elb: [[0.2, 1], [0.2, 1]],
      bg: '<line x1="126" y1="154" x2="72" y2="123" stroke-width="8" stroke-linecap="round" class="eq2s"/><rect x="118" y="150" width="48" height="8" rx="3" class="eq2"/><rect x="138" y="158" width="8" height="42" class="eq2"/><rect x="100" y="140" width="6" height="60" class="eq2"/>',
      fg: (J) => G.db(J.A.hand),
      base: { hip: [140, 145], torso: -60, neck: 12, fa: [185, GROUND], fb: [188, GROUND] },
      poses: {
        top: { ha: [101, 64], hb: [103, 64], ea: [99, 91], eb: [101, 91] },
        bottom: { ha: [101, 108], hb: [103, 108], ea: [101, 136], eb: [103, 136] }
      },
      seq: [['top', 1.3, 'Empuja hacia arriba', null, C('hand', 'Encima del pecho', 175, 45)],
             ['top', 0.7, 'Empuja hacia arriba', null, C('hand', 'Encima del pecho', 175, 45)],
             ['bottom', 2.4, 'Baja en vertical doblando los codos', null, C('elbow', 'Codos abajo, a 45º', 45, 178)],
             ['bottom', 0.6, 'Baja en vertical doblando los codos', null, C('elbow', 'Codos abajo, a 45º', 45, 178)]]
    },

    'seated-row': {
      view: 'side', kne: [UP, UP], elb: [BACK, BACK],
      bg: '<line x1="80" y1="198" x2="218" y2="198" stroke-width="5" class="eq2s"/><rect x="86" y="160" width="58" height="8" rx="3" class="eq2"/><rect x="112" y="168" width="8" height="30" class="eq2"/>' +
          '<rect x="204" y="110" width="11" height="88" rx="2" class="eq2"/>' + G.pulley([209, 128]),
      fg: (J) => { const m = G.mid(J.A.hand, J.B.hand); return G.cable([209, 128], m) + `<rect x="${R(m[0] - 2.5)}" y="${R(m[1] - 7)}" width="5" height="14" rx="2" class="eqf"/>`; },
      base: { hip: [118, 155], fa: [198, 161], fb: [200, 158] },
      poses: {
        ext: { torso: 8, ha: [178, 127], hb: [180, 127] },
        pull: { torso: -4, ha: [136, 130], hb: [138, 130] }
      },
      seq: [['pull', 1.3, 'Tira con los codos hacia atrás', null, C('elbow', 'Codos atrás', 58, 108)],
             ['pull', 1.2, 'Junta los omóplatos', null, C('scap', 'Junta omóplatos', 58, 84)],
             ['ext', 2.4, 'Vuelve estirando los brazos', null, C('back', 'Espalda recta', 58, 108)],
             ['ext', 0.6, 'Vuelve estirando los brazos', null, C('back', 'Espalda recta', 58, 108)]]
    },

    'db-shoulder-press': {
      view: 'side', kne: [UP, UP], elb: [[0.2, 1], [0.2, 1]],
      bg: '<rect x="116" y="70" width="8" height="82" rx="3" class="eq2"/><rect x="116" y="150" width="50" height="8" rx="3" class="eq2"/><rect x="136" y="158" width="8" height="42" class="eq2"/>',
      fg: (J) => G.db(J.A.hand),
      base: { hip: [138, 145], torso: -5, fa: [185, GROUND], fb: [188, GROUND] },
      poses: {
        bottom: { ha: [136, 70], hb: [138, 70], ea: [136, 98], eb: [138, 98] },
        top: { ha: [136, 38], hb: [138, 38], ea: [135, 66], eb: [137, 66] }
      },
      seq: [['top', 1.3, 'Empuja hacia arriba', null, C('hand', 'Arriba sin bloquear', 205, 40)],
             ['top', 0.7, 'Empuja hacia arriba', null, C('hand', 'Arriba sin bloquear', 205, 40)],
             ['bottom', 2.4, 'Baja en vertical hasta las orejas', null, C('lumbar', 'Sin arquear la espalda', 60, 186)],
             ['bottom', 0.6, 'Baja en vertical hasta las orejas', null, C('lumbar', 'Sin arquear la espalda', 60, 186)]]
    },

    'lateral-raise': {
      view: 'front', kne: [BACK, FWD], elb: [[-0.7, -0.7], [0.7, -0.7]],
      fg: (J) => G.dbF(J.A.hand) + G.dbF(J.B.hand),
      base: { hip: [150, 109], torso: 0, fa: [138, GROUND], fb: [162, GROUND] },
      poses: {
        down: { ha: { pol: [-6, 55] }, hb: { pol: [6, 55] } },
        up: { ha: { pol: [-84, 55] }, hb: { pol: [84, 55] } }
      },
      seq: [['up', 1.3, 'Sube hasta la altura de los hombros', null, C('elbow', 'Codos fijos', 75, 22)],
             ['up', 0.9, 'Sube hasta la altura de los hombros', null, C('handB', 'Altura del hombro', 228, 22)],
             ['down', 2.4, 'Baja despacio (2 s)'],
             ['down', 0.6, 'Baja despacio (2 s)']]
    },

    'face-pull': {
      view: 'side', kne: [FWD, FWD], elb: [[-1, -0.2], [-1, -0.2]],
      bg: G.stack(236, 20) + G.pulley([240, 50]),
      fg: (J) => G.cable([240, 50], G.mid(J.A.hand, J.B.hand)),
      base: { hip: [152, 109], torso: -8, fa: [168, GROUND], fb: [138, GROUND] },
      poses: {
        // el codo viaja hacia atrás a la altura del hombro y la mano va siempre a su altura o por encima
        ext: { ha: [198, 50], hb: [200, 50], ea: [174, 57], eb: [176, 57] },
        pull: { ha: [149, 41], hb: [151, 41], ea: [128, 54], eb: [130, 54] }
      },
      seq: [['pull', 1.3, 'Tira hacia la cara, codos altos', null, C('elbow', 'Codos altos y atrás', 80, 18)],
             ['pull', 1, 'Manos a los lados de la cara', null, C('hand', 'Separa las manos', 205, 98)],
             ['ext', 2, 'Vuelve controlado'],
             ['ext', 0.6, 'Vuelve controlado']]
    },

    'pallof': {
      view: 'front', kne: [BACK, FWD], elb: [[-1, 0.5], [1, 0.5]],
      bg: G.stack(20, 30) + G.pulley([30, 84]),
      fg: (J) => { const m = G.mid(J.A.hand, J.B.hand); const r = 4 + 4 * (J.p.z || 0); return G.cable([30, 84], m) + `<circle cx="${R(m[0])}" cy="${R(m[1])}" r="${R(r)}" class="eqf"/>`; },
      base: { hip: [150, 109], torso: 0, fa: [136, GROUND], fb: [164, GROUND], ha: [148, 86], hb: [152, 86] },
      poses: {
        chest: { as: 1, z: 0 },
        ext: { as: 0.6, z: 1 }
      },
      seq: [['ext', 1.3, 'Estira los brazos al frente', null, C('hand', 'Brazos al frente', 235, 55)],
             ['ext', 2.4, 'Aguanta sin dejar que te gire', null, C('abs', 'Sin girar el tronco', 235, 130)],
             ['chest', 1.3, 'Recoge al pecho'],
             ['chest', 0.6, 'Recoge al pecho']]
    },

    'plank': {
      view: 'side', kne: [DOWN, DOWN], elb: [DOWN, DOWN], toes: 'down',
      base: { sh: [110, 170], prone: true, neck: 6, fa: [252, 188], fb: [255, 188], ha: [84, 194], hb: [86, 194] },
      poses: {
        a: { hip: [168, 178] },
        b: { hip: [168, 176.5] }
      },
      seq: [['b', 2.2, 'Cuerpo recto de cabeza a talones', null, C('hip', 'Cadera alineada', 175, 125)],
             ['a', 2.2, 'Aprieta glúteo y abdomen', null, C('elbow', 'Codo bajo el hombro', 70, 135)]]
    },

    'bulgarian': {
      view: 'side', kne: [FWD, DOWN], elb: [BACK, BACK],
      bg: G.bench(56, 102, 152),
      fg: (J) => G.db(J.A.hand),
      base: { fa: [178, GROUND], fb: [94, 149] },
      poses: {
        top: { hip: [146, 114], torso: 22, ha: [166, 122], hb: [168, 122] },
        bottom: { hip: [134, 152], torso: 28, ha: [159, 162], hb: [161, 162] }
      },
      seq: [['bottom', 2.4, 'Baja recto y controlado', null, C('knee', 'Rodilla sobre el pie', 242, 112)],
             ['bottom', 0.9, 'Baja recto y controlado', null, C('back', 'Torso inclinado', 75, 85)],
             ['top', 1.6, 'Sube con el talón de delante', null, C('heel', 'Empuja con el talón', 242, 160)],
             ['top', 0.8, 'Sube con el talón de delante', null, C('heel', 'Empuja con el talón', 242, 160)]]
    },

    'hyperextension': {
      view: 'side', kne: [FWD, FWD], elb: [DOWN, DOWN],
      bg: '<line x1="60" y1="198" x2="150" y2="198" stroke-width="5" class="eq2s"/><line x1="112" y1="198" x2="118" y2="156" stroke-width="6" class="eq2s"/><line x1="76" y1="198" x2="74" y2="186" stroke-width="5" class="eq2s"/>' +
          '<line x1="118" y1="155" x2="135" y2="138" stroke-width="11" stroke-linecap="round" class="pads"/>',
      fg: (J) => `<circle cx="${R(J.A.ankle[0] + 3)}" cy="${R(J.A.ankle[1] - 7)}" r="5.5" class="pad"/>`,
      base: { hip: [130, 130], fa: [70, 190], fb: [72, 190], ha: { t: [9, 14] }, hb: { t: [11, 12] } },
      poses: {
        top: { torso: 45, curl: 0 },
        bottom: { torso: 125, curl: 4 }
      },
      seq: [['top', 1.3, 'Sube usando el glúteo', null, C('glute', 'Sube con el glúteo', 60, 85)],
             ['top', 1.2, 'Aprieta arriba', null, C('lumbar', 'Sin arquear la lumbar', 228, 42)],
             ['bottom', 2.2, 'Baja controlado'],
             ['bottom', 0.6, 'Baja controlado']]
    },

    'cable-kickback': {
      view: 'side', kne: [[0.7, 0.7], FWD], elb: [DOWN, DOWN],
      bg: G.stack(200, 20) + G.pulley([205, 188]),
      fg: (J) => G.cable([205, 188], J.A.ankle) + `<circle cx="${R(J.A.ankle[0])}" cy="${R(J.A.ankle[1])}" r="4" class="eqf"/>`,
      base: { hip: [146, 108], torso: 22, fb: [150, GROUND], ha: [200, 88], hb: [202, 88] },
      poses: {
        start: { fa: { pol: [2, 83] } },
        back: { fa: { pol: [-44, 84] } }
      },
      seq: [['back', 1.3, 'Lleva la pierna atrás, rodilla casi estirada', null, C('glute', 'Aprieta glúteo', 60, 70)],
             ['back', 1.4, 'Aprieta el glúteo 1 s', null, C('lumbar', 'Espalda quieta', 60, 95)],
             ['start', 2, 'Vuelve despacio'],
             ['start', 0.6, 'Vuelve despacio']]
    },

    'cable-abduction': {
      view: 'front', kne: [BACK, FWD], elb: [BACK, DOWN],
      bg: G.stack(214, 20) + G.pulley([219, 190]),
      fg: (J) => G.cable([219, 190], J.A.ankle) + `<circle cx="${R(J.A.ankle[0])}" cy="${R(J.A.ankle[1])}" r="4" class="eqf"/>`,
      base: { hip: [152, 109], fb: [163, GROUND], ha: [133, 108], hb: [212, 100] },
      poses: {
        start: { torso: 0, fa: { pol: [-4, 85] } },
        out: { torso: 5, fa: { pol: [-30, 85] } }
      },
      seq: [['out', 1.3, 'Separa la pierna, rodilla estirada', null, C('gluteSideA', 'Glúteo medio', 55, 75)],
             ['out', 0.9, 'Separa la pierna, rodilla estirada', null, C('gluteSideA', 'Glúteo medio', 55, 75)],
             ['start', 2, 'Vuelve sin cruzar la pierna', null, C('ankle', 'Sin cruzar', 55, 168)],
             ['start', 0.6, 'Vuelve sin cruzar la pierna', null, C('ankle', 'Sin cruzar', 55, 168)]]
    },

    'cable-crunch': {
      view: 'side', kne: [[1, 1], [1, 1]], elb: [DOWN, DOWN], toes: 'back',
      bg: G.pulley([196, 6]),
      fg: (J) => G.cable([196, 6], G.mid(J.A.hand, J.B.hand)),
      base: { hip: [150, 148], fa: [110, GROUND], fb: [108, GROUND], ha: { t: [5, -9] }, hb: { t: [6, -9] } },
      poses: {
        up: { torso: 25, curl: 0, neck: 5 },
        down: { torso: 78, curl: 12, neck: 25 }
      },
      seq: [['down', 1.3, 'Encoge el abdomen hacia los muslos', null, C('abs', 'Encoge el abdomen', 240, 186)],
             ['down', 0.9, 'Encoge el abdomen hacia los muslos', null, C('hip', 'Cadera quieta', 85, 110)],
             ['up', 2, 'Vuelve despacio'],
             ['up', 0.6, 'Vuelve despacio']]
    },

    'leg-raise': {
      view: 'side', kne: [UP, UP], elb: [UP, UP],
      bg: G.bench(58, 192, 166),
      base: { hip: [156, 160], torso: -90, ha: [68, 166], hb: [70, 166] },
      poses: {
        down: { fa: [240, 154], fb: [242, 152] },
        mid: { fa: [215, 103], fb: [217, 101] },
        up: { fa: [160, 76], fb: [162, 74] }
      },
      seq: [['mid', 0.9, 'Sube las piernas juntas', 'in', C('knee', 'Piernas casi estiradas', 228, 45)],
             ['up', 0.9, 'Sube las piernas juntas', 'out', C('knee', 'Piernas casi estiradas', 228, 45)],
             ['up', 0.6, 'Sube las piernas juntas'],
             ['mid', 1.5, 'Baja lento', 'in', C('lumbar', 'Lumbar pegada al banco', 95, 115)],
             ['down', 1.5, 'Baja lento, sin despegar la lumbar', 'out', C('lumbar', 'Lumbar pegada al banco', 95, 115)],
             ['down', 0.6, 'Baja lento, sin despegar la lumbar']]
    }
  };

  /* ---------- Reproductor ---------- */
  const TEMPO = 1.1; // >1 = más lento
  function poseOf(A, name) { return Object.assign({}, A.base, A.poses[name]); }
  function frameAt(A, time) {
    const total = A.seq.reduce((s, x) => s + x[1], 0);
    let t = (time / TEMPO) % total, i = 0;
    while (t > A.seq[i][1] && i < A.seq.length - 1) { t -= A.seq[i][1]; i++; }
    const prev = A.seq[(i - 1 + A.seq.length) % A.seq.length];
    const step = A.seq[i];
    const k = (EASE[step[3] || 'io'])(Math.min(1, t / step[1]));
    return { pose: lerpPose(poseOf(A, prev[0]), poseOf(A, step[0]), k), label: step[2], cue: step[4] || null };
  }
  function render(A, pose, cues, alpha) {
    const J = solve(A, pose);
    const cs = (cues || []).map((c) => cueSVG(J, c, alpha == null ? 1 : alpha)).join('');
    const bg = typeof A.bg === 'function' ? A.bg(J) : (A.bg || '');
    return G.floor + `<g class="content">${bg}<g class="fig">${drawFigure(A, J)}</g>${A.fg ? A.fg(J) : ''}${cs}</g>`;
  }

  let raf = null;
  function play(id, svg, labelEl) {
    stop();
    const A = ANIMS[id];
    if (!A) return false;
    fit(A, svg);
    const t0 = performance.now();
    let lastLabel = null, cueKey = null, cueStart = 0;
    const loop = (now) => {
      const f = frameAt(A, (now - t0) / 1000);
      const key = f.cue ? f.cue.a + f.cue.t : '';
      if (key !== cueKey) { cueKey = key; cueStart = now; }
      svg.innerHTML = render(A, f.pose, f.cue ? [f.cue] : [], Math.min(1, (now - cueStart) / 250));
      if (labelEl && f.label !== lastLabel) { labelEl.textContent = f.label; lastLabel = f.label; }
      raf = requestAnimationFrame(loop);
    };
    raf = requestAnimationFrame(loop);
    return true;
  }
  // Encuadre: une las cajas de todas las posturas (con sus indicaciones) y amplía hasta llenar el lienzo
  function fit(A, svg) {
    let x1 = Infinity, y1 = Infinity, x2 = -Infinity, y2 = -Infinity;
    const cues = A.seq.map((s) => s[4]).filter(Boolean);
    try {
      for (const n in A.poses) {
        svg.innerHTML = render(A, poseOf(A, n), cues, 1);
        const b = svg.querySelector('.content').getBBox();
        x1 = Math.min(x1, b.x); y1 = Math.min(y1, b.y); x2 = Math.max(x2, b.x + b.width); y2 = Math.max(y2, b.y + b.height);
      }
    } catch (e) { return; }
    if (!isFinite(x1)) return;
    const pad = 10, ratio = 300 / 210;
    x1 -= pad; x2 += pad; y1 -= pad; y2 = Math.max(y2, 200) + 6;
    let w = x2 - x1, h = y2 - y1;
    if (w < 190) { x1 -= (190 - w) / 2; w = 190; }
    if (w / h > ratio) { const nh = w / ratio; y1 -= nh - h; h = nh; }
    else { const nw = h * ratio; x1 -= (nw - w) / 2; w = nw; }
    svg.setAttribute('viewBox', `${R(x1)} ${R(y1)} ${R(w)} ${R(h)}`);
  }
  function stop() { if (raf) cancelAnimationFrame(raf); raf = null; }

  window.ExAnim = { play, stop, has: (id) => !!ANIMS[id], ids: () => Object.keys(ANIMS), _A: ANIMS, _poseOf: poseOf, _render: render, _fit: fit, _frame: frameAt };
})();
