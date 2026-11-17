// Анимации на главной – целиком на WebGL, фоном на весь экран. По абстрактной сцене на приложение: свет, кольца,
// полосы – суть в общих чертах, без интерфейса, поэтому их не нужно обновлять вслед за приложениями.
// Вид – тёплый, «аналоговый»: мягкое свечение (ореол, как у плёнки), живое зерно, виньетка, тёплый тон.
//
// Акцент – прямоугольник «рамки» (элемент, переданный в mount): там сцена резкая и яркая; от его краёв к краям
// экрана она всё сильнее размывается и гаснет – остаётся едва заметная атмосфера. Сцены продолжаются за рамку
// сами (кольца, полосы, волны), так что фон – та же сцена, а не растянутый край.
//
// Как устроено: каждая сцена – ветка одного фрагментного шейдера (SCENE). Она рисуется в текстуры: мелкую на весь
// экран (плитка общего атласа – из неё размытие, ореол и фон) и, пока сцена почти резкая, полную – только рамку.
// Шейдер COMP смешивает сцены: ничего не выбрано – сцены плавно сменяют друг друга по очереди, размытие то
// наплывает, то уходит; выбрано – эта сцена наводится на резкость, остальные расплываются и гаснут. Без WebGL – CSS-фон страницы.
//   const fx = ScrewifyScenes.mount(frameElement, ['screwify', 'beatcut', …], { lite: () => isPhone });
//   fx.focus('beatcut'); fx.focus('');  mount вернёт null, если WebGL нет – тогда фон рисует CSS.
(() => {
  'use strict';

  const INDEX = { screwify: 0, beatcut: 1, mixtake: 2, lab: 3, polar: 4 };

  const VERT = 'attribute vec2 p; void main() { gl_Position = vec4(p, 0., 1.); }';

  // Сцены. uv – координаты рамки (0…1 внутри неё, за ней – дальше; ось y вверх), q – от её центра с учётом пропорций.
  // Возвращают свет на тёмном: rgb и альфу = яркость (премультиплицированно).
  const SCENE = `precision highp float;
uniform float scene;
uniform float t;
uniform vec4 vp;      // прямоугольник отрисовки, px кадрового буфера
uniform vec4 dom;     // какую часть координат рамки он покрывает: (u0, v0, u1, v1); рамка – 0…1
uniform float aspect; // пропорции рамки
float hash(vec2 p) { return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453); }
float noise(vec2 p) {
  vec2 i = floor(p), f = fract(p);
  f = f * f * (3. - 2. * f);
  return mix(mix(hash(i), hash(i + vec2(1, 0)), f.x), mix(hash(i + vec2(0, 1)), hash(i + vec2(1, 1)), f.x), f.y);
}
float fbm(vec2 p) { float v = 0., a = .5; for (int i = 0; i < 4; i++) { v += a * noise(p); p *= 2.03; a *= .5; } return v; }
float tanh1(float x) { float e = exp(2. * clamp(x, -10., 10.)); return (e - 1.) / (e + 1.); }
const vec3 PINK = vec3(.93, .53, .55), CREAM = vec3(.96, .88, .76), AMBER = vec3(.98, .62, .3), RUST = vec3(.72, .3, .18);
const vec3 OLIVE = vec3(.62, .74, .44), SKY = vec3(.42, .62, .92);

// Screwify: розовый светящийся круг, внутри которого медленно завивается вихрь; закрутка то сильнее, то слабее –
// как будто звук тянется и замедляется; от края – мягкое свечение
vec3 screwify(vec2 q) {
  vec2 c = q - vec2(-.06, 0.);
  float r = length(c), a = atan(c.y, c.x);
  float R = .3 + .012 * sin(t * .21);
  float twist = 2.6 + 1.4 * sin(t * .17);          // сила закрутки
  float sw = a + twist * (1. - smoothstep(0., R, r)) * 2.2 - t * .25;
  vec2 p = vec2(cos(sw), sin(sw)) * r / R;
  float n = fbm(p * 2.4 + vec2(t * .04, -t * .03));
  float arms = .5 + .5 * sin(sw * 3. + r * 9. - t * .3);
  float inside = smoothstep(R, R - .015, r);
  vec3 col = mix(PINK * .55, PINK * 1.05, n) * (.7 + .3 * arms);
  col = mix(col, CREAM, smoothstep(.6, .95, n * (.6 + .4 * arms)) * .45);
  col *= inside * (.85 + .15 * smoothstep(R, 0., r));
  col += PINK * .35 * exp(-max(0., r - R) * 9.) * (1. - inside);   // ореол вокруг круга
  return col;
}

// Beatcut: тёплая светящаяся лента разрезана на куски; куски сдвинуты по высоте и по фазе и неспешно
// перестраиваются на каждый «удар» – видео, нарезанное под ритм; на местах разрезов – тонкие светлые черты
vec3 beatcut(vec2 uv) {
  float b = t / 2.6, k = floor(b), f = smoothstep(0., 1., fract(b));
  // границы кусков – неравные доли
  float x = uv.x * 6.;
  float seg = floor(x + .35 * sin(floor(x) * 2.3));
  float sx = fract(x + .35 * sin(floor(x) * 2.3));
  float dy = mix(hash(vec2(seg, k - 1.)), hash(vec2(seg, k)), f) - .5;
  float dp = mix(hash(vec2(seg, k + 9.)), hash(vec2(seg, k + 10.)), f) * 6.;
  float y = .5 + dy * .22 + .07 * sin(uv.x * 7. + dp + t * .4);
  float d = abs(uv.y - y);
  float body = exp(-d * d * 900.) ;
  float tex = .6 + .4 * fbm(vec2(uv.x * 4. + dp, (uv.y - y) * 20. + t * .1));
  vec3 tone = mix(AMBER, RUST, hash(vec2(seg, 3.))) ;
  tone = mix(tone, CREAM, .25 * hash(vec2(seg, 7.)));
  float edge = smoothstep(0., .04, sx) * smoothstep(1., .96, sx);
  vec3 col = tone * body * tex * edge * .9;
  col += tone * exp(-d * 9.) * .1 * edge;            // мягкое свечение вокруг ленты
  col += CREAM * exp(-min(sx, 1. - sx) * 120.) * exp(-d * 6.) * .35;  // разрезы
  return col;
}

// Mixtake: несколько полос света колышутся и сходятся к ровной целевой линии
vec3 mixtake(vec2 uv) {
  vec3 col = vec3(0.);
  float spread = .55 + .45 * sin(t * .3);
  for (int j = 0; j < 4; j++) {
    float fj = float(j);
    float y = .5 + spread * (.16 * sin(uv.x * (3. + fj) + t * (.5 + fj * .13) + fj * 1.7) + .05 * (fbm(vec2(uv.x * 2. + fj, t * .2)) - .5));
    float d = abs(uv.y - y);
    vec3 c = mix(SKY, AMBER, fj / 3.);
    col += c * (exp(-d * 70.) * .7 + exp(-d * 12.) * .12);
  }
  float target = exp(-abs(uv.y - .5) * 220.) * (.5 + .5 * step(.5, fract(uv.x * 22.)));
  col += CREAM * target * .55;
  return col;
}

// Lab: светящаяся волна – то чистый синус, то перегружена почти до прямоугольника
vec3 lab(vec2 uv) {
  float drive = .5 + .45 * sin(t * .45);
  float k = 1. + drive * 7.;
  float ph = uv.x * 6.2832 * 1.6 + t * 1.1;
  float clean = sin(ph);
  float v = tanh1(k * clean) / tanh1(k);
  float d = abs(uv.y - .5 - v * .26);
  float g = abs(uv.y - .5 - clean * .26);
  vec3 col = OLIVE * (exp(-d * 80.) * .9 + exp(-d * 14.) * .18);
  col += CREAM * exp(-g * 140.) * .25 * step(.5, fract(uv.x * 30.));
  return col;
}

// Polar (бывший VideoChop): сетка мягких нот; световая полоса идёт слева направо, задетые ноты вспыхивают своим цветом
vec3 polar(vec2 uv) {
  float cols = 16., rows = 7.;
  vec2 g = vec2(uv.x * cols, uv.y * rows), id = floor(g), f = fract(g) - .5;
  float pos = fract(t / 6.) * (cols + 2.) - 1.;
  float h = hash(id + vec2(floor(id.x / 2.) * 3.1, 0.));
  float note = step(.72, h);
  float lit = exp(-max(0., pos - id.x) * .9) * step(id.x, pos + .5);
  vec3 c = h > .9 ? PINK : h > .82 ? AMBER : h > .76 ? SKY : OLIVE;
  float shape = smoothstep(.5, .36, max(abs(f.x) * .9, abs(f.y) * 1.25));
  vec3 col = c * note * shape * (.12 + .85 * lit);
  col += CREAM * exp(-abs(uv.x * cols - pos) * 2.5) * .12;
  return col;
}

void main() {
  vec2 uv = mix(dom.xy, dom.zw, (gl_FragCoord.xy - vp.xy) / vp.zw);
  vec2 q = (uv - .5) * vec2(aspect, 1.);
  vec3 c = scene < .5 ? screwify(q) : scene < 1.5 ? beatcut(uv) : scene < 2.5 ? mixtake(uv) : scene < 3.5 ? lab(uv) : polar(uv);
  c = max(c, 0.);
  gl_FragColor = vec4(c, clamp(max(c.r, max(c.g, c.b)), 0., 1.));
}`;

  // Сборка на весь экран. В рамке – резкая сцена из полной текстуры; размытие, ореол и фон – из мелкой плитки
  // атласа, покрывающей весь экран (линейная фильтрация + отсчёты по спирали – ровный туман без ступенек).
  // Чем дальше от рамки, тем сильнее размытие и тише свет. Потом – тёплый тон, виньетка, зерно.
  const COMP = `precision highp float;
uniform sampler2D f0, f1, f2, f3, f4, atlas;
uniform float w[5];
uniform float b[5];
uniform float k;      // px экрана на единицу размытия (единица – px сцены шириной 900)
uniform vec2 tile;    // размер плитки атласа, px
uniform vec2 res;     // размер экрана, px
uniform vec4 rect;    // рамка: x, y (снизу), ширина, высота, px
uniform float time;
uniform float calm;   // 0 – выбрано приложение, 1 – туман (всё медленнее и тише)
uniform float farMin; // лёгкий фон (телефон): весь экран как бы далеко от рамки – размыто и тихо
uniform float grain;  // сила зерна
uniform float gain;   // яркость сцен: лёгкому фону без резкой рамки нужно ярче
vec2 uv, ruv;
float far;            // 0 – в рамке, 1 – далеко от неё
vec4 soft(float i, float r) {
  vec2 lo = .5 / tile, hi = 1. - lo, st = r / res;
  vec4 acc = vec4(0.);
  for (int n = 0; n < 16; n++) {
    float fn = float(n);
    float a = fn * 2.39996 + time * .05;
    vec2 p = clamp(uv + vec2(cos(a), sin(a)) * sqrt((fn + .5) / 16.) * st, lo, hi);
    acc += texture2D(atlas, vec2((i + p.x) / 5., p.y));
  }
  return acc / 16.;
}
vec4 layer(sampler2D f, float i, float bl) {
  float be = bl + far * 220.;                     // у краёв рамки размытие нарастает плавно (≈40 px)
  float m = smoothstep(.5, 10., be);
  vec4 s = m < 1. ? texture2D(f, ruv) : vec4(0.);
  vec4 glow = soft(i, (be + 5. + far * 120.) * k); // ореол есть и у резкой сцены – свет «плывёт», как на плёнке
  return mix(s + glow * .45, glow * 1.15, m) * mix(1., .16, smoothstep(0., .5, far));
}
float rnd(vec2 p) { return fract(sin(dot(p, vec2(12.9898, 78.233))) * 43758.5453); }
// «как сквозь воду»: медленное переливающееся смещение – крупные мягкие волны, без ряби
vec2 lens(vec2 p) {
  float tt = time * .22;
  return vec2(sin(p.y * 5.3 + tt * 1.3) + sin(p.x * 3.1 - tt * .9 + p.y * 2.),
              cos(p.x * 4.7 - tt * 1.1) + sin(p.y * 2.9 + tt * .7 - p.x * 1.6));
}
// свет со дна: каустика – сеть тонких изгибающихся светлых нитей, медленно текущих, как блики на дне бассейна
float caustic(vec2 p) {
  float tt = time * .12, v = 0.;
  vec2 q = p;
  for (int n = 0; n < 3; n++) {
    float fn = float(n);
    q += vec2(sin(q.y * 1.3 + tt + fn * 1.7), cos(q.x * 1.1 - tt * 1.2 + fn * 2.3)) * .55;
    v = max(v, exp(-abs(sin(q.x * 1.8) + sin(q.y * 1.8)) * 2.6));
  }
  return v;
}
void main() {
  vec2 frag = gl_FragCoord.xy + lens(gl_FragCoord.xy / res.y * 1.4) * res.y * .006;
  uv = frag / res;
  ruv = (frag - rect.xy) / rect.zw;
  vec2 d = max(abs(gl_FragCoord.xy - rect.xy - rect.zw * .5) - rect.zw * .5, 0.);
  far = max(clamp(length(d) / res.y, 0., 1.), farMin);
  vec3 col = vec3(.06, .048, .04);
  vec4 c;
  if (w[0] > .004) { c = layer(f0, 0., b[0]); col = col * (1. - min(c.a, 1.) * w[0]) + c.rgb * w[0] * gain; }
  if (w[1] > .004) { c = layer(f1, 1., b[1]); col = col * (1. - min(c.a, 1.) * w[1]) + c.rgb * w[1] * gain; }
  if (w[2] > .004) { c = layer(f2, 2., b[2]); col = col * (1. - min(c.a, 1.) * w[2]) + c.rgb * w[2] * gain; }
  if (w[3] > .004) { c = layer(f3, 3., b[3]); col = col * (1. - min(c.a, 1.) * w[3]) + c.rgb * w[3] * gain; }
  if (w[4] > .004) { c = layer(f4, 4., b[4]); col = col * (1. - min(c.a, 1.) * w[4]) + c.rgb * w[4] * gain; }
  // свет со дна – тёплые блики, сильнее внизу; в тумане тише
  float cs = caustic(uv * vec2(res.x / res.y, 1.) * 5.);
  col += vec3(1., .78, .55) * cs * (.022 + .01 * (1. - calm)) * smoothstep(.9, 0., uv.y);
  // тёплый тон и мягкое сжатие светов, как у плёнки
  col *= vec3(1.06, .98, .86);
  col = col / (1. + col * .35);
  vec2 q = uv - .5;
  col *= 1. - dot(q, q) * .7;
  // зерно – живое, крупнее пикселя, сильнее в тенях
  vec2 gp = floor(gl_FragCoord.xy / 1.6);
  float gr = rnd(gp + fract(time * 23.) * 91.) - .5;
  col += gr * (.05 - .025 * dot(col, vec3(.33))) * grain;
  gl_FragColor = vec4(col, 1.);
}`;

  // opts.lite() – true: лёгкий фон без рамки (телефон, узкое окно): весь экран сильно размыт, канвас в низком
  // разрешении (в CSS-пикселях, не в пикселях устройства), 20 кадров в секунду, полных текстур нет.
  function mount(el, ids, opts = {}) {
    const canvas = document.createElement('canvas');
    canvas.className = 'scenes-bg';
    canvas.setAttribute('aria-hidden', 'true');
    const gl = canvas.getContext('webgl', { antialias: false, alpha: false, premultipliedAlpha: false });
    if (!gl) return null;
    document.body.prepend(canvas);

    const program = (vs, fs) => {
      const p = gl.createProgram();
      for (const [type, src] of [[gl.VERTEX_SHADER, vs], [gl.FRAGMENT_SHADER, fs]]) {
        const s = gl.createShader(type);
        gl.shaderSource(s, src); gl.compileShader(s);
        if (!gl.getShaderParameter(s, gl.COMPILE_STATUS)) console.warn(gl.getShaderInfoLog(s));
        gl.attachShader(p, s);
      }
      gl.bindAttribLocation(p, 0, 'p');
      gl.linkProgram(p);
      const cache = {};
      return { p, u: n => (n in cache ? cache[n] : (cache[n] = gl.getUniformLocation(p, n))) };
    };
    const scene = program(VERT, SCENE), comp = program(VERT, COMP);
    gl.bindBuffer(gl.ARRAY_BUFFER, gl.createBuffer());
    gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, -1, 1, 1, 1]), gl.STATIC_DRAW);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);

    // цель отрисовки: текстура + кадровый буфер
    const target = () => {
      const tex = gl.createTexture();
      gl.bindTexture(gl.TEXTURE_2D, tex);
      for (const [k, v] of [[gl.TEXTURE_MIN_FILTER, gl.LINEAR], [gl.TEXTURE_MAG_FILTER, gl.LINEAR], [gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE], [gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE]]) gl.texParameteri(gl.TEXTURE_2D, k, v);
      return { tex, fb: gl.createFramebuffer(), w: 0, h: 0 };
    };
    const size = (tg, w, h) => {
      if (tg.w === w && tg.h === h) return;
      tg.w = w; tg.h = h;
      gl.bindTexture(gl.TEXTURE_2D, tg.tex);
      gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null);
      gl.bindFramebuffer(gl.FRAMEBUFFER, tg.fb);
      gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, tg.tex, 0);
    };
    const atlas = target();
    // текущие вес и размытие плавно идут к целевым – отсюда мягкое наведение резкости
    const layers = ids.map(id => ({ id, n: INDEX[id] ?? 0, full: target(), w: 0, b: 40, tw: 0, tb: 40 }));

    let focused = '', raf = 0, last = 0, running = false, st = 0, rate = 0.35, calm = 1;
    const t0 = performance.now();
    const still = matchMedia('(prefers-reduced-motion: reduce)');
    const OUT_B = 34;
    const setTargets = () => {
      for (const l of layers) {
        if (!focused) { l.tw = 0; l.tb = OUT_B; }   // дальше по кадрам – очередь сцен
        else if (l.id === focused) { l.tw = 1; l.tb = 0; }
        else { l.tw = 0; l.tb = OUT_B; }
      }
    };
    setTargets();
    for (const l of layers) { l.w = l.tw; l.b = l.tb; }

    // dom – какую часть координат рамки покрывает этот прямоугольник
    const draw = (n, x, y, w, h, t, dom, aspect) => {
      gl.viewport(x, y, w, h);
      gl.uniform1f(scene.u('scene'), n);
      gl.uniform1f(scene.u('t'), t);
      gl.uniform4f(scene.u('vp'), x, y, w, h);
      gl.uniform4fv(scene.u('dom'), dom);
      gl.uniform1f(scene.u('aspect'), aspect);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    const frame = now => {
      raf = running ? requestAnimationFrame(frame) : 0;
      const lite = !!(opts.lite && opts.lite());
      // без фокуса хватает 30 кадров в секунду – туман медленный; лёгкому фону – 20, при «уменьшить движение» – 2
      if ((lite || !focused) && now - last < (lite ? (still.matches ? 500 : 50) : 30)) return;
      const dt = Math.min(0.05, (now - (last || now)) / 1000);
      last = now;
      // фон – на весь экран; плотность пикселей до 1,5: дальше от рамки всё равно размыто
      // лёгкий фон – в CSS-пикселях: половинный канвас на телефоне растягивался в 4–6 раз и выглядел «пиксельным»
      const dpr = lite ? Math.min(1, devicePixelRatio || 1) : Math.min(1.5, devicePixelRatio || 1);
      const cw = Math.round(innerWidth * dpr), ch = Math.round(innerHeight * dpr);
      // лёгкий фон: «рамка» – весь экран
      const r = lite ? { left: 0, bottom: innerHeight, width: innerWidth, height: innerHeight } : el.getBoundingClientRect();
      if (!cw || !ch || !r.width) return;
      if (canvas.width !== cw || canvas.height !== ch) { canvas.width = cw; canvas.height = ch; }
      const rx = r.left * dpr, ry = (innerHeight - r.bottom) * dpr, rw = r.width * dpr, rh = r.height * dpr;
      // полная текстура – только рамка (не крупнее 1280 по ширине); атлас – весь экран в 1/8
      const s = Math.min(1, 1280 / rw), fw = Math.round(rw * s), fh = Math.round(rh * s);
      const tw = Math.max(8, Math.round(cw / 8)), th = Math.max(8, Math.round(ch / 8));
      size(atlas, tw * 5, th);
      const screenDom = [-rx / rw, -ry / rh, (cw - rx) / rw, (ch - ry) / rh];
      const aspect = rw / rh;
      // время сцен: без выбора – медленнее, спокойнее; скорость меняется плавно
      rate += ((focused ? 1 : 0.6) - rate) * (1 - Math.exp(-dt * 2));
      calm += ((focused ? 0 : 1) - calm) * (1 - Math.exp(-dt * 2));
      st += dt * rate;
      const t = still.matches ? 3 : st;
      // без выбора – сцены по очереди, по 8 с, последние 2,5 с плавно перетекают в следующую; размытие то наплывает,
      // то уходит в случайные моменты, но сцена не растворяется целиком
      if (!focused) {
        const rt = still.matches ? 0 : (now - t0) / 1000;
        const T = rt / 8, i0 = Math.floor(T) % layers.length, ff = T - Math.floor(T);
        const x = ff < 0.7 ? 0 : (ff - 0.7) / 0.3, xs = x * x * (3 - 2 * x);
        layers.forEach((l, i) => {
          const w = i === i0 ? 1 - xs : i === (i0 + 1) % layers.length ? xs : 0;
          const haze = 0.5 + 0.5 * Math.sin(rt * 0.37 + i * 2.1) * Math.sin(rt * 0.23 + i * 1.3 + 1);
          l.tw = w * 0.9;
          l.tb = 1 + 12 * haze * haze + 14 * (1 - w);
        });
      }
      // переход между сценами – медленный и разнесённый по времени: уходящая сначала расплывается, потом гаснет;
      // приходящая сначала проявляется размытой, потом наводится на резкость (постоянные времени 0,4–0,9 с)
      // для переходов – настоящее прошедшее время (до 0,25 с): на редких кадрах они не растягиваются
      const dte = Math.min(0.25, (now - (frame.prev || now)) / 1000);
      frame.prev = now;
      const ease = rate => (still.matches ? 1 : 1 - Math.exp(-dte * rate));
      for (const l of layers) {
        const up = l.tw > l.w;
        l.w += (l.tw - l.w) * ease(up ? 2.2 : 1.4);
        l.b += (l.tb - l.b) * ease(l.tb < l.b ? (l.w > 0.6 ? 2.4 : 1.1) : 2.6);
      }

      gl.useProgram(scene.p);
      gl.bindFramebuffer(gl.FRAMEBUFFER, atlas.fb);
      gl.viewport(0, 0, atlas.w, atlas.h);
      gl.clearColor(0, 0, 0, 0);
      gl.clear(gl.COLOR_BUFFER_BIT);
      layers.forEach((l, i) => {
        if (l.w < 0.004) return;
        draw(l.n, i * tw, 0, tw, th, t, screenDom, aspect);
        // полная сцена – только пока она почти резкая
        if (!lite && l.b < 10.5) {
          size(l.full, fw, fh);
          gl.bindFramebuffer(gl.FRAMEBUFFER, l.full.fb);
          draw(l.n, 0, 0, fw, fh, t, [0, 0, 1, 1], aspect);
          gl.bindFramebuffer(gl.FRAMEBUFFER, atlas.fb);
        }
      });

      gl.bindFramebuffer(gl.FRAMEBUFFER, null);
      gl.viewport(0, 0, cw, ch);
      gl.useProgram(comp.p);
      layers.forEach((l, i) => {
        gl.activeTexture(gl.TEXTURE0 + i);
        gl.bindTexture(gl.TEXTURE_2D, l.full.w ? l.full.tex : atlas.tex);
        gl.uniform1i(comp.u('f' + i), i);
      });
      gl.activeTexture(gl.TEXTURE5);
      gl.bindTexture(gl.TEXTURE_2D, atlas.tex);
      gl.uniform1i(comp.u('atlas'), 5);
      gl.uniform1fv(comp.u('w'), layers.map(l => l.w));
      gl.uniform1fv(comp.u('b'), layers.map(l => l.b));
      gl.uniform1f(comp.u('k'), (lite ? Math.max(rw, rh) : rw) / 900);
      gl.uniform1f(comp.u('farMin'), lite ? 0.2 : 0);
      gl.uniform1f(comp.u('grain'), lite ? 0.25 : 1);
      // на телефоне фон лежит прямо под текстом – ярче 1,3 описания под обложками тонут
      gl.uniform1f(comp.u('gain'), lite ? 1.3 : 1);
      gl.uniform2f(comp.u('tile'), tw, th);
      gl.uniform4f(comp.u('rect'), rx, ry, rw, rh);
      gl.uniform2f(comp.u('res'), cw, ch);
      gl.uniform1f(comp.u('time'), still.matches ? 3 : (now - t0) / 1000);
      gl.uniform1f(comp.u('calm'), calm);
      gl.drawArrays(gl.TRIANGLE_STRIP, 0, 4);
    };

    return {
      focus(id) { focused = id || ''; setTargets(); },
      start() { if (running) return; running = true; last = 0; canvas.hidden = false; raf = requestAnimationFrame(frame); },
      stop() { running = false; canvas.hidden = true; if (raf) cancelAnimationFrame(raf); raf = 0; },
    };
  }

  window.ScrewifyScenes = { mount };
})();
