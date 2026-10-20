// Интерфейс живёт в #app и может переезжать в окно поверх всех окон,
// поэтому элементы ищем один раз и дальше держим ссылки на них.
const app = document.getElementById('app');

// panel.html открывается в боковой панели своей вкладки (?tab=<вкладка>) и обычной
// вкладкой-запускателем (?pip&win=<окно браузера>&tab=<вкладка с музыкой>): Chrome открывает
// окно поверх всех окон только из вкладки, а из боковой панели — нет.
// В обоих случаях панель привязана к одной вкладке и за другими не следит.
const params = new URLSearchParams(location.search);
const isLauncher = params.has('pip');
if (isLauncher) document.body.classList.add('launcher');
// ?lite – панель внутри студии (studio/): там нужны только кнопки и ручки, а волна, пластинка и зерно
// отнимали кадры у записи – страница студии и панель живут в одном процессе
const isLite = params.has('lite');
if (isLite) document.body.classList.add('lite');
let selfTabId = null;
const els = {};
for (const el of app.querySelectorAll('[id]')) els[el.id] = el;
const $ = id => els[id];
const offTargets = [
  app.querySelector('.logo'), app.querySelector('.now'), app.querySelector('.deck'),
  app.querySelector('.presets'), els.controls, app.querySelector('footer'), els.share, els.popout,
];
const pct = v => `${Math.round(v * 100)}%`;
const RPM = 100 / 3; // 33⅓

const CHECKS = ['chop', 'drift', 'level'];
const RANGES = ['speed', 'chewAmt', 'tone', 'noise', 'wall', 'vinyl', 'reverb'];

const s = { ...SCREWED_DEFAULTS };
let t = translator(s.lang);

// ---------- настройки ----------
function renderControls() {
  for (const id of CHECKS) $(id).checked = s[id];
  const on = active();
  lastActive = on;
  $('on').checked = on;
  $('on').disabled = !canToggle();
  for (const id of RANGES) {
    const el = $(id);
    el.value = s[id];
    $(`${id}-out`).textContent = pct(s[id]);
    // акцентная заливка дорожки до ручки
    el.style.setProperty('--fill', `${((s[id] - el.min) / (el.max - el.min)) * 100}%`);
  }
  // режим треска переключается, только пока уровень больше нуля
  for (const b of $('vinyl-mode').children) {
    const cur = b.dataset.mode === s.vinylMode;
    b.classList.toggle('on', cur);
    b.setAttribute('aria-pressed', cur);
    b.disabled = !(s.vinyl > 0);
  }
  for (const b of presetBtns) {
    const on = screwedPresetActive(b.preset, s);
    b.el.classList.toggle('on', on);
    b.el.setAttribute('aria-pressed', on);
  }
  for (const wrap of $('user-presets').querySelectorAll('.user')) {
    const on = screwedPresetActive(userPresets.find(p => p.id === wrap.dataset.id), s);
    wrap.classList.toggle('on', on);
    wrap.firstChild.setAttribute('aria-pressed', on);
  }
  for (const el of favs) el.classList.toggle('on', Math.abs(s[el.dataset.fav] - Number(el.dataset.value)) < 0.005);
  // выключено — работает только кнопка «Вкл», остальное затемнено и не реагирует
  for (const el of offTargets) el.inert = !on;
  if (!on) {
    wave.length = 0; // старая волна при выключении не нужна
    kickTarget = 0;
  }
  renderProgress();
  app.classList.toggle('on', on);
  renderLive();
}

function update(patch) {
  Object.assign(s, patch);
  chrome.storage.local.set(patch);
  renderControls();
}

for (const id of CHECKS) {
  $(id).addEventListener('change', e => update({ [id]: e.target.checked }));
}
// главный выключатель включает эффект на сайте открытой вкладки и запоминает это
$('on').addEventListener('change', e => {
  if (!tabSite) return;
  update({ sites: screwedSitesWith(s.sites, tabSite, e.target.checked) });
});
for (const id of RANGES) {
  $(id).addEventListener('input', e => update({ [id]: Number(e.target.value) }));
}

for (const b of $('vinyl-mode').children) {
  b.addEventListener('click', () => update({ vinylMode: b.dataset.mode }));
}

// пресеты: кнопки строим по списку из defaults.js; подсветка гаснет, когда ручки разошлись с пресетом
const PRESET_ICONS = {
  heart: '<svg class="ico solid" viewBox="0 0 16 14" aria-hidden="true"><path d="M8 13 2.200 7.300a3.500 3.500 0 0 1 5-5L8 3l.800-.700a3.500 3.500 0 0 1 5 5z"/></svg>',
  radio: '<svg class="ico" viewBox="0 0 16 14" aria-hidden="true"><rect x="1.500" y="4.500" width="13" height="8" rx="1.500"/><path d="M4 4.500 12 1"/><circle cx="10.500" cy="8.500" r="1.800"/><path d="M4 7.500h3M4 9.500h3"/></svg>',
  tape: '<svg class="ico" viewBox="0 0 16 14" aria-hidden="true"><rect x="1.500" y="2" width="13" height="10" rx="1.500"/><circle cx="5.500" cy="6.500" r="1.500"/><circle cx="10.500" cy="6.500" r="1.500"/><path d="M5 10.500h6"/></svg>',
};
const presetBtns = SCREWED_PRESETS.map(preset => {
  const el = document.createElement('button');
  el.type = 'button';
  el.className = 'preset';
  if (preset.icon) el.innerHTML = PRESET_ICONS[preset.icon];
  el.addEventListener('click', () => update({ ...preset.values }));
  $('presets').append(el);
  return { el, preset };
});

// свои пресеты: хранятся отдельно от настроек, чтобы «Сброс» их не стирал
let userPresets = [];
function saveUserPresets(list) {
  userPresets = list;
  chrome.storage.local.set({ [SCREWED_USER_PRESETS_KEY]: list });
  renderUserPresets();
}
function renderUserPresets() {
  const row = $('user-presets');
  row.textContent = '';
  for (const preset of userPresets) {
    const wrap = document.createElement('span');
    wrap.className = 'preset user';
    const apply = document.createElement('button');
    apply.type = 'button';
    apply.textContent = preset.name;
    apply.addEventListener('click', () => update({ ...preset.values }));
    const del = document.createElement('button');
    del.type = 'button';
    del.className = 'del';
    del.textContent = '×';
    del.title = del.ariaLabel = t('presetDelete');
    del.addEventListener('click', () => saveUserPresets(screwedUserPresetsWithout(userPresets, preset.id)));
    wrap.append(apply, del);
    const on = screwedPresetActive(preset, s);
    wrap.classList.toggle('on', on);
    apply.setAttribute('aria-pressed', on);
    wrap.dataset.id = preset.id;
    row.append(wrap);
  }
  const add = document.createElement('button');
  add.type = 'button';
  add.className = 'preset add';
  add.textContent = '+';
  add.title = add.ariaLabel = t('presetSave');
  add.addEventListener('click', () => {
    if (userPresets.length >= SCREWED_USER_PRESETS_MAX) { toast(t('presetLimit', { n: SCREWED_USER_PRESETS_MAX })); return; }
    $('preset-form').hidden = false;
    $('preset-name').focus();
  });
  row.append(add);
}
$('preset-form').addEventListener('submit', e => {
  e.preventDefault();
  const list = screwedUserPresetsWith(userPresets, $('preset-name').value, s);
  if (!list) return;
  $('preset-name').value = '';
  $('preset-form').hidden = true;
  saveUserPresets(list);
});
chrome.storage.local.get({ [SCREWED_USER_PRESETS_KEY]: [] }, saved => {
  userPresets = saved[SCREWED_USER_PRESETS_KEY];
  renderUserPresets();
});

// сердечки у ползунков ставят рекомендуемое значение
const favs = app.querySelectorAll('.fav');
for (const el of favs) {
  el.addEventListener('click', () => update({ [el.dataset.fav]: Number(el.dataset.value) }));
}

$('restart').addEventListener('click', () => {
  if (activeTabId !== null) chrome.tabs.reload(activeTabId).catch(() => {});
});

$('reset').addEventListener('click', () => {
  // сбрасываем параметры, но не выключаем эффект и не забываем сайты
  const { sites, ...rest } = SCREWED_DEFAULTS;
  update(rest);
});

// горячие клавиши и стрелки на панели меняют настройки в обход формы
chrome.storage.onChanged.addListener((changes, area) => {
  if (area !== 'local') return;
  if (SCREWED_USER_PRESETS_KEY in changes) {
    userPresets = changes[SCREWED_USER_PRESETS_KEY].newValue || [];
    renderUserPresets();
  }
  for (const key in changes) {
    if (key in s) s[key] = changes[key].newValue ?? SCREWED_DEFAULTS[key];
  }
  renderControls();
  if ('lang' in changes) applyLang();
});

// ---------- язык ----------
function applyLang() {
  t = translator(s.lang);
  const code = resolveLang(s.lang);
  for (const root of roots()) {
    root.lang = code;
    root.dir = code === 'ar' ? 'rtl' : 'ltr';
  }
  for (const el of app.querySelectorAll('[data-i18n]')) el.textContent = t(el.dataset.i18n);
  for (const el of app.querySelectorAll('[data-i18n-placeholder]')) el.placeholder = t(el.dataset.i18nPlaceholder);
  for (const { el, preset } of presetBtns) {
    const name = t(preset.i18n);
    if (preset.icon) el.setAttribute('aria-label', name); else el.textContent = name;
    el.title = `${name} – ${t(preset.desc)}`;
  }
  renderUserPresets();
  for (const el of app.querySelectorAll('[data-i18n-title]')) el.title = t(el.dataset.i18nTitle);
  for (const el of app.querySelectorAll('[data-i18n-aria]')) el.setAttribute('aria-label', t(el.dataset.i18nAria));
  renderPopout();

  const select = $('lang');
  select.textContent = '';
  // «Авто (Русский)» — видно, какой язык выбран автоматически
  select.append(new Option(`${t('langAuto')} (${SCREWED_LANGS[resolveLang('auto')]})`, 'auto'));
  for (const [value, name] of Object.entries(SCREWED_LANGS)) select.append(new Option(name, value));
  select.value = s.lang;

  renderKeys();
  renderLive();
  renderProgress();
}

$('lang').addEventListener('change', e => update({ lang: e.target.value }));

// ---------- что играет на активной вкладке ----------
let activeTabId = null;   // вкладка, к которой привязана панель
let tabSite = null;       // её сайт (origin) или null на служебных страницах
let tabUrl = null;        // её адрес — по нему берём иконку сайта, когда страница не отвечает
let reachable = true;

// Работает ли эффект на вкладке панели: страница отвечает и пользователь включал эффект
// на этом сайте. Сама открытая панель и значит, что расширение на вкладке работает.
const active = () => reachable && !!tabSite && !!s.sites[tabSite];
// Можно ли нажать «Вкл»: настройки прочитаны, страница отвечает и это не служебная страница
let loaded = false;
const canToggle = () => loaded && reachable && !!tabSite;
let lastActive = null;
// состояние вкладки изменилось: если от этого включился или выключился эффект
// либо кнопку «Вкл» стало можно (нельзя) нажать — перерисовываем всё
function refresh() {
  if (active() !== lastActive || $('on').disabled === canToggle()) renderControls();
  else renderLive();
}
const frames = new Map(); // frameId -> последний статус
let mon = null;           // последние данные о волне и прогрессе: { frameId, at, t, d, paused, rate, wave, bpm }

const monFresh = () => mon && performance.now() - mon.at < 1500;

function live() {
  let playing = 0, rate = null, title = null, host = null, media = 0, meta = null;
  for (const [frameId, f] of frames) {
    playing += f.playing;
    media += f.media || 0;
    if (f.playing && rate === null) rate = f.rate;
    if (frameId === 0) { title = f.title; host = f.host; }
    else if (f.playing && !host) host = f.host;
    // название и обложка — от фрейма, который играет, иначе от страницы
    if (f.meta && (f.playing || !meta)) meta = f.meta;
  }
  // поток прогресса приходит чаще статуса, поэтому скорость берём из него
  if (playing && monFresh() && !mon.paused) rate = mon.rate;
  return { playing, rate, title, host, media, meta };
}

function resetTab() {
  frames.clear();
  mon = null;
  wave.length = 0;
  renderProgress();
}

let spinTarget = 0; // град/с

function renderLive() {
  const n = live();
  const playing = n.playing > 0 && n.rate !== null;

  const scratching = monFresh() && mon.scratching;
  const braking = monFresh() && mon.braking;
  // страница ответила, а медиа-элементов на ней нет
  const noMedia = reachable && frames.size > 0 && n.media === 0;
  // Расширение не видит звук: вкладку открыли раньше, чем оно загрузилось, или плеер
  // спрятан так, что движок его не нашёл. Перезагрузка вкладки подключает всё заново.
  const lost = !reachable && !!tabSite;
  $('rescue').hidden = !lost && !(noMedia && tabSite);
  app.classList.toggle('lost', lost);
  $('rescue-text').textContent = lost ? t('rescueLost') : t('rescueNoMedia');
  const pill = $('now-state');
  pill.textContent = !reachable ? t('unavailable') : scratching ? t('scratch') : braking ? t('stop')
    : playing ? (n.playing > 1 ? t('playingN', { n: n.playing }) : t('playing'))
    : noMedia ? t('noMedia') : t('silent');
  pill.classList.toggle('playing', reachable && (playing || scratching));
  $('now-host').textContent = reachable ? n.host || '' : '';
  $('now-note').hidden = !noMedia;
  app.classList.toggle('no-media', noMedia || !reachable);

  const track = n.meta && n.meta.title ? [n.meta.artist, n.meta.title].filter(Boolean).join(' – ') : '';
  const title = $('now-title');
  const text = !reachable ? t('unreachable')
    : track || n.title || (playing ? t('untitled') : t('nothingPlaying'));
  title.textContent = text;
  title.title = text;
  title.classList.toggle('empty', !reachable || !(track || n.title));
  setCover(reachable && n.meta ? n.meta.artwork : null);

  // во время воспроизведения табло показывает реальную скорость, включая жевание
  const showLive = active() && playing;
  const shown = showLive ? n.rate : s.speed;
  $('speed-out').textContent = pct(shown);
  // при падении тона показываем, на сколько полутонов он сдвинут: 70% ≈ −6,2
  const semis = Math.round(12 * Math.log2(shown) * 10) / 10;
  const fmtSemis = new Intl.NumberFormat(resolveLang(s.lang), { maximumFractionDigits: 1, signDisplay: 'exceptZero' });
  // число со знаком — островком слева направо, чтобы в арабском минус не уезжал за цифры
  $('pitch-out').textContent = t('semitones', { n: `\u2066${fmtSemis.format(semis)}\u2069` });
  // пластинка крутится, только когда что-то играет и расширение включено
  spinTarget = playing && active() ? n.rate * RPM * 6 : 0;
}

function ping() {
  if (activeTabId === null) return;
  chrome.tabs.sendMessage(activeTabId, { type: 'screwed:ping', tabId: activeTabId })
    .then(() => { reachable = true; pinged = true; refresh(); welcome(); })
    .catch(() => {
      reachable = false;
      refresh();
      fallbackTheme(); // страница о себе не расскажет — красим по памяти и по иконке
    });
}

// привязать панель к вкладке: с этого момента она показывает и управляет только ею
function bindTab(tab) {
  activeTabId = tab ? tab.id : null;
  tabSite = tab ? screwedSite(tab.url) : null;
  tabUrl = tab ? tab.url : null;
  resetTab();
  reachable = true;
  pinged = false;
  refresh();
  ping();
  connectToBackground();
}

// Боковую панель вместе с вкладкой Chrome закрывает сам. Мини-плеер — отдельная вкладка
// и окно: закрыли вкладку с музыкой — закрываем и его (окно уходит вместе со вкладкой-запускателем).
chrome.tabs.onRemoved.addListener(tabId => {
  if (isLauncher && tabId === activeTabId && selfTabId !== null) chrome.tabs.remove(selfTabId).catch(() => {});
});

// пока панель открыта, страница должна знать, что волну и прогресс есть кому показывать
setInterval(ping, 1500);

chrome.runtime.onMessage.addListener((msg, sender) => {
  if (!msg || !sender.tab || sender.tab.id !== activeTabId) return;
  if (msg.type === 'screwed:status') {
    frames.set(sender.frameId, msg);
    reachable = true;
    refresh();
    if (sender.frameId === 0 && msg.theme) onSiteTheme(msg.theme);
  }
  if (msg.type === 'screwed:monitor') onMonitor(msg, sender.frameId);
});

chrome.tabs.onUpdated.addListener((tabId, info) => {
  if (tabId !== activeTabId) return;
  if (info.url) { tabSite = screwedSite(info.url); tabUrl = info.url; pinged = false; refresh(); } // во вкладке открыли другой сайт
  if (info.status === 'loading') { resetTab(); renderLive(); }
  if (info.status === 'complete') ping();
});

// ---------- прогресс ----------
const seek = $('seek');
let seeking = false;   // пользователь тянет ползунок — не перебиваем его
let holdUntil = 0;     // после перемотки страница ещё мгновение шлёт старое время

const fmt = sec => {
  sec = Math.max(0, Math.floor(sec));
  const h = Math.floor(sec / 3600), m = Math.floor(sec / 60) % 60, s2 = String(sec % 60).padStart(2, '0');
  return h ? `${h}:${String(m).padStart(2, '0')}:${s2}` : `${m}:${s2}`;
};

function onMonitor(msg, frameId) {
  if (!active()) return; // запоздавшие данные после выключения не показываем
  const now = performance.now();
  // если плееров несколько (например, в iframe), показываем тот, что играет
  const take = !mon || mon.frameId === frameId || !monFresh() || (mon.paused && !msg.paused);
  if (!take) return;
  if (mon && mon.frameId !== frameId) wave.length = 0;
  mon = { ...msg, frameId, at: now };
  if (msg.kick && !msg.paused) kickTarget = Math.max(kickTarget, msg.kick);
  // Скретч: новые пики не дописываем — уже нарисованная волна ездит за пластинкой назад и вперёд
  if (msg.scratching) scratchShift = msg.shift * PEAKS_PER_SEC;
  else settleScratch();
  if (!msg.paused && !msg.scratching && msg.peaks.length) {
    wave.push(...msg.peaks);
    if (wave.length > WAVE_KEEP) wave.splice(0, wave.length - WAVE_KEEP);
    lastPeaksAt = now;
  }
  renderProgress();
  renderLive();
  if (still && !isLite) drawWave(now); // без анимации перерисовываем только по приходу данных
}

function renderProgress() {
  const row = $('progress');
  const hint = $('wave-hint');
  if (!mon) {
    row.hidden = true;
    hint.hidden = true;
    return;
  }
  row.hidden = false;

  // выключено: прогресс в ноль, кнопка — «играть»
  if (!active()) {
    seek.value = 0;
    seek.style.setProperty('--fill', '0%');
    $('time').textContent = '';
    $('playpause').classList.add('paused');
    $('playpause').setAttribute('aria-label', t('play'));
    hint.hidden = true;
    return;
  }

  const pp = $('playpause');
  pp.classList.toggle('paused', mon.paused);
  pp.setAttribute('aria-label', mon.paused ? t('play') : t('pause'));

  // плеер есть, но трек в него ещё не загружен: кнопка «играть» есть, перематывать нечего
  const empty = mon.ready === false;
  const isLive = !empty && mon.d === null;
  seek.disabled = empty || isLive;
  if (empty) {
    seek.value = 0;
    seek.style.setProperty('--fill', '0%');
    $('time').textContent = '';
  } else if (isLive) {
    seek.style.setProperty('--fill', '100%');
    $('time').textContent = `${t('live')} · ${fmt(mon.t)}`;
  } else if (!seeking && performance.now() > holdUntil) {
    seek.max = mon.d;
    seek.value = mon.t;
    seek.style.setProperty('--fill', `${(mon.t / mon.d) * 100}%`);
    $('time').textContent = `${fmt(mon.t)} / ${fmt(mon.d)}`;
  }

  const reason = mon.wave === 'blocked' ? t('waveBlocked')
    : mon.wave === 'waiting' && !mon.paused ? t('waveWaiting')
    : '';
  hint.textContent = reason;
  hint.hidden = !reason;
}

function control(action, extra = {}) {
  if (activeTabId === null || !mon) return;
  chrome.tabs.sendMessage(activeTabId, { type: 'screwed:control', action, ...extra }, { frameId: mon.frameId })
    .catch(() => {});
}

// перетаскивание ползунка мышью — тоже скретч: звук идёт за ползунком
let seekScratch = false;
let seekScratchEndedAt = -Infinity;

seek.addEventListener('pointerdown', () => {
  if (seek.disabled || !mon) return;
  seeking = true;
  seekScratch = true;
  control('scratch-start');
});
function onPointerUp() {
  if (!seekScratch) { seeking = false; return; }
  seekScratch = false;
  seeking = false;
  seekScratchEndedAt = holdUntil = performance.now() + 400;
  endScratch();
}
window.addEventListener('pointerup', onPointerUp);
seek.addEventListener('input', () => {
  seeking = true;
  const t = Number(seek.value);
  seek.style.setProperty('--fill', `${(t / Number(seek.max)) * 100}%`);
  $('time').textContent = `${fmt(t)} / ${fmt(Number(seek.max))}`;
  if (seekScratch) sendThrottled('scratch-move', { time: t });
});
seek.addEventListener('change', () => {
  // после перетаскивания мышью перемотку уже сделал scratch-end
  if (seekScratch || performance.now() < seekScratchEndedAt) return;
  seeking = false;
  holdUntil = performance.now() + 400;
  control('seek', { time: Number(seek.value) }); // стрелки клавиатуры
});

// не чаще раза за кадр: движения мыши приходят быстрее, чем есть смысл слать
let pendingMove = null;
function sendThrottled(action, extra) {
  const first = !pendingMove;
  pendingMove = { action, extra };
  if (!first) return;
  raf(() => {
    const m = pendingMove;
    pendingMove = null;
    if (m) control(m.action, m.extra);
  });
}

// последнее движение должно дойти до страницы раньше, чем команда «отпустил»
function endScratch() {
  if (pendingMove) {
    control(pendingMove.action, pendingMove.extra);
    pendingMove = null;
  }
  control('scratch-end');
}

$('prevtrack').addEventListener('click', () => control('prev'));
$('nexttrack').addEventListener('click', () => control('next'));
$('playpause').addEventListener('click', () => {
  if (!mon) return;
  mon.paused = !mon.paused; // сразу меняем иконку, не дожидаясь страницы
  renderProgress();
  control('toggle');
});

// ---------- живая волна ----------
const WAVE_KEEP = 600;
const COL = 3;            // ширина столбика на один пик, px
const BATCH = 2;          // пиков в одном сообщении от страницы
const BATCH_MS = 100;
const PEAKS_PER_SEC = 1000 * BATCH / BATCH_MS;
const wave = [];
let lastPeaksAt = 0;
let scratchShift = 0;     // на сколько пиков пластинку увели от места захвата (назад — минус)
let shownShift = 0;       // то же, сглаженное для отрисовки

// Пластинку отпустили: звук пойдёт с нового места, поэтому волну правее иглы отрезаем,
// а если увели вперёд — оставляем пустой промежуток.
function settleScratch() {
  const n = Math.round(scratchShift);
  scratchShift = shownShift = 0;
  if (n < 0) wave.length = Math.max(0, wave.length + n);
  else for (let i = Math.min(n, WAVE_KEEP); i > 0; i--) wave.push(0);
}
const canvas = $('wave');
const wctx = canvas.getContext('2d');

function drawWave(now) {
  const dpr = view().devicePixelRatio || 1;
  const w = canvas.clientWidth, h = canvas.clientHeight;
  if (canvas.width !== Math.round(w * dpr) || canvas.height !== Math.round(h * dpr)) {
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
  }
  wctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  wctx.clearRect(0, 0, w, h);

  const mid = h / 2;
  wctx.fillStyle = rgba(waveColors.line, 1);
  wctx.fillRect(0, mid - 0.5, w, 1);

  const flowing = monFresh() && !mon.paused && mon.wave === 'ok';
  // между пакетами плавно сдвигаем волну, чтобы она текла, а не прыгала
  const scratching = flowing && mon.scratching;
  const offset = flowing && !scratching ? Math.min(1, (now - lastPeaksAt) / BATCH_MS) * COL * BATCH : 0;
  // данные о скретче приходят реже кадров — догоняем плавно
  shownShift = still ? scratchShift : shownShift + (scratchShift - shownShift) * 0.35;

  // волна нейтральная; акцентом — только игла
  wctx.fillStyle = rgba(waveColors.fg, flowing ? 0.5 : 0.28);

  for (let i = wave.length - 1, x = w - COL - offset - shownShift * COL; i >= 0 && x > -COL; i--, x -= COL) {
    const amp = Math.pow(wave[i], 0.6) * (mid - 3);
    const bar = Math.max(1, amp);
    wctx.fillRect(x, mid - bar, COL - 1, bar * 2);
  }

  // «игла» справа — здесь звучит сейчас
  if (flowing) {
    wctx.fillStyle = rgba(waveColors.pink, 1);
    wctx.fillRect(w - 1.5, 0, 1.5, h);
  }
}

// ---------- цвета сайта ----------
// Фон и текст берём со страницы, акцент — из иконки сайта
// (красный у YouTube, жёлтый у Яндекс Музыки, оранжевый у SoundCloud...).
const THEME_VARS = ['--bg', '--panel', '--line', '--fg', '--muted', '--pink', '--on-accent'];
const DEFAULT_ACCENT = [236, 144, 167]; // #EC90A7 — брэнд-акцент (см. palette.css)
const probe = document.createElement('canvas').getContext('2d', { willReadFrequently: true });

// любой цвет CSS → [r, g, b, a]
function parseColor(str) {
  if (!str) return null;
  probe.fillStyle = '#010203';
  probe.fillStyle = str;
  const n = probe.fillStyle;
  if (n === '#010203' && !/^#010203$/i.test(str.trim())) return null;
  if (n[0] === '#') return [1, 3, 5].map(i => parseInt(n.slice(i, i + 2), 16)).concat(1);
  const m = n.match(/[\d.]+/g);
  return m ? [+m[0], +m[1], +m[2], m[3] === undefined ? 1 : +m[3]] : null;
}

const css = c => `rgb(${c.slice(0, 3).map(Math.round).join(', ')})`;
const rgba = (c, a) => `rgba(${c.slice(0, 3).map(Math.round).join(', ')}, ${a})`;
const mix = (a, b, t) => a.slice(0, 3).map((v, i) => v + (b[i] - v) * t);
const luminance = c => {
  const [r, g, b] = c.slice(0, 3).map(v => { v /= 255; return v <= 0.03928 ? v / 12.92 : Math.pow((v + 0.055) / 1.055, 2.4); });
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const contrast = (a, b) => { const [x, y] = [luminance(a), luminance(b)].sort((p, q) => q - p); return (x + 0.05) / (y + 0.05); };

function toHsl([r, g, b]) {
  r /= 255; g /= 255; b /= 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b), l = (max + min) / 2;
  if (max === min) return [0, 0, l];
  const d = max - min, s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
  const h = max === r ? (g - b) / d + (g < b ? 6 : 0) : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
  return [h * 60, s, l];
}
function fromHsl(h, s, l) {
  h = ((h % 360) + 360) % 360;
  const k = n => (n + h / 30) % 12, a = s * Math.min(l, 1 - l);
  const f = n => l - a * Math.max(-1, Math.min(k(n) - 3, Math.min(9 - k(n), 1)));
  return [f(0) * 255, f(8) * 255, f(4) * 255];
}

// самый «весомый» насыщенный цвет иконки
function dominantColor(img) {
  const c = document.createElement('canvas');
  c.width = c.height = 32;
  const x = c.getContext('2d', { willReadFrequently: true });
  x.drawImage(img, 0, 0, 32, 32);
  const d = x.getImageData(0, 0, 32, 32).data;
  const buckets = new Map();
  for (let i = 0; i < d.length; i += 4) {
    if (d[i + 3] < 128) continue;
    const [h, sat, l] = toHsl([d[i], d[i + 1], d[i + 2]]);
    if (sat < 0.3 || l < 0.15 || l > 0.9) continue;
    const k = Math.round(h / 15) % 24;
    const b = buckets.get(k) || { w: 0, r: 0, g: 0, b: 0 };
    const w = sat * (1 - Math.abs(l - 0.5));
    b.w += w; b.r += d[i] * w; b.g += d[i + 1] * w; b.b += d[i + 2] * w;
    buckets.set(k, b);
  }
  let best = null;
  for (const b of buckets.values()) if (!best || b.w > best.w) best = b;
  return best && best.w > 3 ? [best.r / best.w, best.g / best.w, best.b / best.w] : null;
}

const accentCache = new Map(); // host -> [r, g, b] | null

function faviconAccent(pageUrl) {
  let host;
  try { host = new URL(pageUrl).host; } catch (e) { return Promise.resolve(null); }
  if (accentCache.has(host)) return Promise.resolve(accentCache.get(host));
  return new Promise(resolve => {
    const url = new URL(chrome.runtime.getURL('/_favicon/'));
    url.searchParams.set('pageUrl', pageUrl);
    url.searchParams.set('size', '32');
    const img = new Image();
    img.onload = () => {
      let c = null;
      try { c = dominantColor(img); } catch (e) {}
      accentCache.set(host, c);
      resolve(c);
    };
    img.onerror = () => resolve(null);
    img.src = url.toString();
  });
}

// вторичный текст: приглушённее основного, но не ниже 4.5:1 к фону
function mutedColor(fg, bg) {
  let t = 0.42;
  while (t > 0 && contrast(mix(fg, bg, t), bg) < 4.5) t -= 0.03;
  return mix(fg, bg, Math.max(t, 0));
}

function buildPalette(theme, accent) {
  const meta = parseColor(theme.themeColor);
  let bg = parseColor(theme.bg);
  if (!bg || bg[3] < 0.5) bg = meta && meta[3] >= 0.5 ? meta : null;
  if (!bg) return null;
  const light = luminance(bg) > 0.4;

  let fg = parseColor(theme.fg);
  if (!fg || contrast(fg, bg) < 4.5) fg = light ? [24, 22, 28] : [238, 236, 242];

  // акцент: иконка → theme-color, если он цветной → фирменный розовый
  if (!accent && meta && toHsl(meta)[1] > 0.35) accent = meta;
  const [h, sat0] = toHsl(accent || DEFAULT_ACCENT);
  const sat = Math.max(0.6, sat0);
  // на светлом фоне акцент темнее, на тёмном — светлее, чтобы читался
  const al = light ? 0.45 : 0.6;

  const pink = fromHsl(h, sat, al);
  // на закрашенной кнопке — белый или почти чёрный, что читается лучше
  const onAccent = contrast(pink, [255, 255, 255]) >= contrast(pink, [18, 18, 20]) ? [255, 255, 255] : [18, 18, 20];
  return {
    '--on-accent': css(onAccent),
    '--bg': css(bg),
    '--fg': css(fg),
    '--muted': css(mutedColor(fg, bg)),
    '--line': css(mix(bg, fg, 0.16)),
    '--panel': css(mix(bg, fg, 0.05)),
    '--pink': css(pink),
  };
}

let themeKey = '';
const waveColors = {};

function readWaveColors() {
  const st = getComputedStyle(document.documentElement);
  for (const name of ['fg', 'line', 'pink']) {
    waveColors[name] = parseColor(st.getPropertyValue(`--${name}`).trim()) || DEFAULT_ACCENT;
  }
}

function applyPalette(palette) {
  for (const { style } of roots()) {
    for (const v of THEME_VARS) style.removeProperty(v);
    if (palette) for (const [k, v] of Object.entries(palette)) style.setProperty(k, v);
  }
  readWaveColors();
}

function resetTheme() {
  themeKey = '';
  fontKey = '';
  applyPalette(null);
  applyFonts(null);
}

// ---------- шрифт сайта ----------
// Страница присылает имена шрифтов и где их взять: правила @font-face
// или адреса таблиц стилей, которые она сама прочитать не может (Google Fonts и т.п.).
const FONT_VARS = ['--font', '--font-display'];
const FALLBACK_FONT = 'system-ui, -apple-system, "Segoe UI", sans-serif';
const MAX_FACES = 24, MAX_BYTES = 3e6;
const loadedFonts = new Set();  // url|weight|range
const fileCache = new Map();    // url -> Promise<ArrayBuffer | null>
const sheetCache = new Map();   // url -> Promise<css>
let fontKey = '';

const quote = f => `"${f.replace(/"/g, '')}"`;
const safeUrl = u => /^(https?:|data:)/.test(u);

// подключаем только начертания для латиницы и кириллицы
function coversText(range) {
  if (!range) return true;
  return range.split(',').some(part => {
    const m = part.trim().match(/^U\+([0-9a-f?]+)(?:-([0-9a-f]+))?$/i);
    if (!m) return false;
    const lo = parseInt(m[1].replace(/\?/g, '0'), 16);
    const hi = m[2] ? parseInt(m[2], 16) : parseInt(m[1].replace(/\?/g, 'f'), 16);
    return (lo <= 0x7a && hi >= 0x41) || (lo <= 0x44f && hi >= 0x410);
  });
}

// и только обычное начертание весом 400–700 — больше панели не нужно
function coversWeight(weight) {
  const w = String(weight).trim().replace('normal', '400').replace('bold', '700').split(/\s+/).map(Number);
  const lo = w[0], hi = w.length > 1 ? w[1] : w[0];
  return [400, 500, 600, 700].some(x => x >= lo && x <= hi);
}

const usefulFace = f => safeUrl(f.url) && (f.style || 'normal').trim() === 'normal'
  && coversWeight(f.weight) && coversText(f.range);

function parseFaceCss(css, base, want) {
  const faces = [];
  for (const block of css.matchAll(/@font-face\s*{([^}]*)}/g)) {
    const props = {};
    for (const p of block[1].matchAll(/([\w-]+)\s*:\s*([^;]+);?/g)) props[p[1].toLowerCase()] = p[2].trim();
    const family = (props['font-family'] || '').replace(/^["']|["']$/g, '');
    if (!want.has(family.toLowerCase())) continue;
    const urls = [...(props.src || '').matchAll(/url\(\s*["']?([^"')]+)["']?\s*\)/g)].map(m => m[1]);
    const best = urls.find(u => /\.woff2/.test(u)) || urls.find(u => /\.woff/.test(u)) || urls[0];
    let url;
    try { url = new URL(best, base).href; } catch (e) { continue; }
    faces.push({ family, url, weight: props['font-weight'] || '400', style: props['font-style'] || 'normal', range: props['unicode-range'] || '' });
  }
  return faces;
}

function sheetFaces(url, want) {
  if (!sheetCache.has(url)) {
    sheetCache.set(url, fetch(url, { credentials: 'omit' }).then(r => r.ok ? r.text() : '').catch(() => ''));
  }
  return sheetCache.get(url).then(css => css.length > MAX_BYTES ? [] : parseFaceCss(css, url, want));
}

const faceKey = f => `${f.url}|${f.weight}|${f.range}`;

// Google Fonts отдаёт один и тот же (вариативный) файл для всех толщин,
// поэтому файл качаем один раз, а начертания регистрируем для каждой толщины
function fontFile(url) {
  if (!fileCache.has(url)) {
    fileCache.set(url, fetch(url, { credentials: 'omit' })
      .then(r => r.ok ? r.arrayBuffer() : null)
      .then(buf => buf && buf.byteLength <= MAX_BYTES ? buf : null)
      .catch(() => null));
  }
  return fileCache.get(url);
}

async function loadFace(f) {
  if (loadedFonts.has(faceKey(f))) return;
  const buf = await fontFile(f.url);
  if (!buf) return;
  try {
    const face = new FontFace(f.family, buf, { weight: f.weight, style: 'normal', ...(f.range ? { unicodeRange: f.range } : {}) });
    await face.load();
    document.fonts.add(face);
    loadedFonts.add(faceKey(f));
    const rec = { family: f.family, buf, desc: { weight: f.weight, style: 'normal', ...(f.range ? { unicodeRange: f.range } : {}) } };
    fontFaces.push(rec);
    if (pipWin) addFontTo(pipWin, rec);
  } catch (e) {}
}

// у окна поверх всех окон свой набор шрифтов — добавляем туда те же
const fontFaces = []; // { family, buf, desc }
function addFontTo(win, rec) {
  try {
    const face = new win.FontFace(rec.family, rec.buf, rec.desc);
    face.load().then(() => win.document.fonts.add(face)).catch(() => {});
  } catch (e) {}
}

async function applySiteFonts(fonts) {
  if (!fonts || !fonts.text) { fontKey = ''; applyFonts(null); return; }
  const key = JSON.stringify(fonts);
  if (key === fontKey) return;
  fontKey = key;

  const want = new Set([fonts.text, fonts.display].map(f => f.toLowerCase()));
  let faces = fonts.faces.slice();
  const found = family => faces.some(f => f.family.toLowerCase() === family);
  for (const url of fonts.sheets) {
    if ([...want].every(found)) break;
    if (safeUrl(url)) faces.push(...await sheetFaces(url, want));
  }
  const seen = new Set();
  faces = faces.filter(f => usefulFace(f) && !seen.has(faceKey(f)) && seen.add(faceKey(f))).slice(0, MAX_FACES);
  await Promise.all(faces.map(loadFace));
  // даже если файлы не скачались, шрифт мог оказаться установленным в системе
  if (fontKey === key) applyFonts(fonts);
}

function applyFonts(fonts) {
  for (const { style } of roots()) {
    for (const v of FONT_VARS) style.removeProperty(v);
    if (!fonts) continue;
    style.setProperty('--font', `${quote(fonts.text)}, ${FALLBACK_FONT}`);
    style.setProperty('--font-display', `${quote(fonts.display)}, ${quote(fonts.text)}, ${FALLBACK_FONT}`);
  }
}

// ---------- цвета сайта по памяти ----------
// Страница, к которой расширение не подключилось, свои цвета не пришлёт. Для сайтов, где эффект
// включён, помним их с прошлого раза (без адреса страницы); для остальных — тёмная панель
// с акцентом из иконки сайта.
const DEFAULT_THEME = { bg: '#151515', fg: '#BDBBB5', themeColor: null, fonts: null };
let themes = {}; // сайт (origin) -> { bg, fg, themeColor, fonts }
chrome.storage.local.get({ themes: {} }, saved => { themes = saved.themes; });

function rememberTheme(theme) {
  if (!tabSite || !s.sites[tabSite]) return;
  const { url, ...rest } = theme;
  if (JSON.stringify(themes[tabSite]) === JSON.stringify(rest)) return;
  themes[tabSite] = rest;
  // сайты, на которых эффект выключили, забываем
  for (const site in themes) if (!s.sites[site]) delete themes[site];
  chrome.storage.local.set({ themes });
}

function fallbackTheme() {
  if (!tabSite) { resetTheme(); return; } // на служебных страницах красить не во что
  applyTheme({ ...(themes[tabSite] || DEFAULT_THEME), url: tabUrl });
}

function onSiteTheme(theme) {
  rememberTheme(theme);
  applyTheme(theme);
}

function applyTheme(theme) {
  const key = JSON.stringify(theme);
  if (key === themeKey) return;
  themeKey = key;
  applySiteFonts(theme.fonts);
  faviconAccent(theme.url).then(accent => {
    if (themeKey !== key) return; // пока грузилась иконка, сайт сменился
    applyPalette(buildPalette(theme, accent));
  });
}

readWaveColors();

// ---------- горячие клавиши ----------
const COMMANDS = {
  _execute_action: 'cmdOpen',
  toggle: 'cmdToggle',
  slower: 'cmdSlower',
  faster: 'cmdFaster',
};

let commandList = [];
chrome.commands.getAll(list => {
  commandList = list;
  renderKeys();
});

function renderKeys() {
  const dl = $('keys');
  dl.textContent = '';
  for (const c of commandList) {
    if (!(c.name in COMMANDS)) continue;
    const dt = document.createElement('dt');
    dt.textContent = c.shortcut || t('notSet');
    dt.dir = 'ltr';
    dt.classList.toggle('unset', !c.shortcut);
    const dd = document.createElement('dd');
    dd.textContent = t(COMMANDS[c.name]);
    dl.append(dt, dd);
  }
}

$('shortcuts').addEventListener('click', () => {
  chrome.tabs.create({ url: 'chrome://extensions/shortcuts' });
});

// ---------- пластинка ----------
const record = $('record');
const logoFlash = $('logo-flash');
// Реакция логотипа на бочку: удар поднимает цель, яркость плавно (за ~30 мс) догоняет её
// и вместе с ней плавно гаснет — без резких скачков, но на пике до максимума.
let kickTarget = 0, kickLevel = 0;
const still = matchMedia('(prefers-reduced-motion: reduce)').matches || isLite;
let angle = 0, omega = 0, last = performance.now();

function spin(now) {
  const dt = Math.min(0.1, (now - last) / 1000);
  last = now;
  if (grab) {
    // пластинку держит рука
    angle = grab.recordAngle + grab.total;
    omega = 0;
  } else {
    // инерция диска: плавный разгон и остановка, как у вертушки
    omega += (spinTarget - omega) * Math.min(1, dt * 3);
    if (spinTarget === 0 && omega < 0.5) omega = 0;
    angle = (angle + omega * dt) % 360;
  }
  record.style.transform = `rotate(${angle}deg)`;
  // логотип вспыхивает на удар бочки и плавно гаснет
  kickTarget *= Math.exp(-dt * 4);
  kickLevel += (kickTarget - kickLevel) * Math.min(1, dt * 45);
  if (kickLevel < 0.01 && kickTarget < 0.01) kickLevel = kickTarget = 0;
  // тень под логотипом; слабые удары тоже должно быть видно, поэтому кривая чуть приподнята
  logoFlash.style.opacity = kickLevel ? Math.pow(Math.min(1, kickLevel), 0.6).toFixed(3) : '0';
  drawWave(now);
  raf(spin);
}

// ---------- скретч пластинкой ----------
// Один оборот при 33⅓ об/мин — это 1,8 секунды звука, то есть 200° на секунду.
const DEG_PER_SEC = RPM * 6;
const platter = app.querySelector('.platter');
let grab = null; // { recordAngle, last, total }

const pointerAngle = e => {
  const r = platter.getBoundingClientRect();
  return Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2)) * 180 / Math.PI;
};

platter.addEventListener('pointerdown', e => {
  if (!mon || e.button !== 0) return;
  e.preventDefault();
  try { platter.setPointerCapture(e.pointerId); } catch (err) {}
  grab = { recordAngle: angle, last: pointerAngle(e), total: 0 };
  platter.classList.add('grabbed');
  control('scratch-start');
});

platter.addEventListener('pointermove', e => {
  if (!grab) return;
  const a = pointerAngle(e);
  let d = a - grab.last;
  if (d > 180) d -= 360;
  if (d < -180) d += 360;
  grab.last = a;
  grab.total += d; // по часовой — вперёд, против — назад
  sendThrottled('scratch-move', { delta: grab.total / DEG_PER_SEC });
  if (still) record.style.transform = `rotate(${grab.recordAngle + grab.total}deg)`;
});

const release = () => {
  if (!grab) return;
  angle = grab.recordAngle + grab.total;
  grab = null;
  platter.classList.remove('grabbed');
  endScratch();
};
platter.addEventListener('pointerup', release);
platter.addEventListener('pointercancel', release);
platter.addEventListener('lostpointercapture', release);

// ---------- обложка на этикетке пластинки ----------
// Картинку сначала загружаем: если сайт не отдаёт её чужим страницам, остаётся обычная этикетка.
let coverUrl = null;

function setCover(url) {
  if (url && !/^https?:/.test(url)) url = null;
  if (url === coverUrl) return;
  coverUrl = url;
  const label = $('label');
  const backdrop = $('backdrop');
  backdrop.classList.remove('on'); // старая обложка гаснет, новая проступает после загрузки
  if (!url) {
    label.classList.remove('cover');
    label.style.removeProperty('--cover');
    return;
  }
  const img = new Image();
  img.onload = () => {
    if (coverUrl !== url) return;
    const css = `url("${url.replace(/["\\\n]/g, encodeURIComponent)}")`;
    label.style.setProperty('--cover', css);
    label.classList.add('cover');
    setTimeout(() => {
      if (coverUrl !== url) return;
      backdrop.style.setProperty('--cover', css);
      backdrop.classList.add('on');
    }, 350);
  };
  img.src = url;
}

// При самом первом открытии панели после установки эффект сразу включается на сайте вкладки:
// ключ welcomed запоминает, что это уже было, и дальше выбор остаётся за пользователем.
// Ключ false ставит только background при свежей установке (reason 'install'): у старых
// пользователей его нет – значит, true, и ничего само не включается.
// Только когда страница вкладки ответила на ping: на вкладках, где расширение не работает
// (Chrome Web Store, chrome://), приветствие не тратится.
let welcomed = true;
let pinged = false;
function welcome() {
  if (welcomed || !pinged || !canToggle()) return;
  welcomed = true;
  chrome.storage.local.set({ welcomed: true });
  if (!s.sites[tabSite]) update({ sites: screwedSitesWith(s.sites, tabSite, true) });
}

screwedMigrate();
chrome.storage.local.get({ ...SCREWED_DEFAULTS, welcomed: true }, ({ welcomed: seen, ...saved }) => {
  Object.assign(s, saved);
  welcomed = seen;
  loaded = true;
  welcome();
  applyLang();
  renderControls();
  if (!still) raf(spin);
});

// К какой вкладке привязана панель, сказано в её адресе (?tab=…). Если нет — берём вкладку,
// которая сейчас открыта в окне панели.
const boundTabId = Number(params.get('tab')) || null;
if (isLauncher) {
  chrome.tabs.getCurrent(tab => { selfTabId = tab ? tab.id : null; });
  document.getElementById('launch').hidden = false;
}
if (boundTabId) {
  chrome.tabs.get(boundTabId).then(bindTab).catch(() => bindTab(null));
} else {
  chrome.tabs.query({ active: true, currentWindow: true }).then(([tab]) => bindTab(tab)).catch(() => bindTab(null));
}

// ---------- мини-плеер поверх всех окон ----------
// Document Picture-in-Picture — то же окно, что у мини-плеера Spotify.
// Переносим в него весь интерфейс, а когда окно закрывают — возвращаем в панель.
// Окно живёт, пока открыта боковая панель: закроется панель — закроется и оно.
let pipWin = null;
const view = () => pipWin || window;
const raf = cb => view().requestAnimationFrame(cb);
const roots = () => pipWin ? [document.documentElement, pipWin.document.documentElement] : [document.documentElement];
const popped = document.getElementById('popped');
let toastTimer = null;

function toast(text, sticky = false) {
  const el = $('toast');
  el.textContent = text;
  el.hidden = false;
  clearTimeout(toastTimer);
  if (!sticky) toastTimer = setTimeout(() => { el.hidden = true; }, 5000);
}

function renderPopout() {
  const btn = $('popout');
  const label = pipWin ? t('popIn') : t('popOut');
  btn.title = label;
  btn.setAttribute('aria-label', label);
  btn.setAttribute('aria-pressed', String(!!pipWin));
  document.getElementById('popped-text').textContent = t('poppedOut');
  document.getElementById('popin').textContent = t('popIn');
  document.getElementById('launch-text').textContent = pipWin ? t('launcherOpen') : t('launchText');
  document.getElementById('launch-btn').textContent = t('launchBtn');
  document.getElementById('launch-btn').hidden = !!pipWin;
}

// Боковая панель открыть окно поверх всех окон не может — открываем вкладку-запускатель
// рядом с вкладкой, где играет музыка. Окно открывается по нажатию кнопки в ней.
async function openLauncher() {
  if (activeTabId === null) return;
  const tab = await chrome.tabs.get(activeTabId).catch(() => null);
  if (!tab) return;
  const url = chrome.runtime.getURL(`panel.html?pip&win=${tab.windowId}&tab=${tab.id}`);
  chrome.tabs.create({ windowId: tab.windowId, url, index: tab.index + 1 });
}

// Высота мини-плеера по содержимому, чтобы снизу не оставалось пустого места.
// Меряем до открытия окна: после него менять размер Chrome без клика не даёт.
const MINI_WIDTH = 360;
function miniHeight() {
  const body = document.body.classList;
  const wasLauncher = body.contains('launcher');
  const progress = $('progress'), progressHidden = progress.hidden;
  body.remove('launcher');
  body.add('mini');
  progress.hidden = false; // прогресс появится, как только заиграет трек
  const prev = app.getAttribute('style');
  app.style.cssText = `position:absolute;visibility:hidden;left:0;top:0;width:${MINI_WIDTH - 28}px`;
  const h = Math.ceil(app.getBoundingClientRect().height) + 22; // + отступы body.mini
  if (prev === null) app.removeAttribute('style'); else app.setAttribute('style', prev);
  progress.hidden = progressHidden;
  body.remove('mini');
  if (wasLauncher) body.add('launcher');
  return h;
}

async function popOut() {
  if (pipWin) { pipWin.close(); return; }
  // из боковой панели Chrome окно поверх всех окон не открывает — сразу вкладка-запускатель
  if (!isLauncher) { openLauncher(); return; }
  let win;
  try {
    // если Chrome не ответит, не ждём вечно — покажем ошибку
    const timeout = new Promise((_, reject) => setTimeout(() => reject(new Error('no response from Chrome in 4 s')), 4000));
    const size = { width: MINI_WIDTH, height: miniHeight() };
    win = await Promise.race([window.documentPictureInPicture.requestWindow(size), timeout]);
  } catch (e) {
    // точный текст ошибки — чтобы было понятно, что именно не так
    const err = document.getElementById('launch-error');
    err.textContent = `${t('pipUnsupported')} (${e.name}: ${e.message})`;
    err.hidden = false;
    return;
  }
  pipWin = win;
  const doc = win.document;
  doc.title = 'Screwify';
  const link = doc.createElement('link');
  link.rel = 'stylesheet';
  link.href = chrome.runtime.getURL('panel.css');
  doc.head.append(link);
  // язык, направление письма, цвета и шрифт сайта — как в панели
  const root = doc.documentElement;
  root.lang = document.documentElement.lang;
  root.dir = document.documentElement.dir;
  root.setAttribute('style', document.documentElement.getAttribute('style') || '');
  for (const rec of fontFaces) addFontTo(win, rec);

  doc.body.classList.add('mini');
  doc.body.append(app);
  popped.hidden = isLauncher; // у вкладки-запускателя свой текст
  win.addEventListener('pointerup', onPointerUp);
  win.addEventListener('pagehide', () => {
    // вкладка-запускатель больше не нужна: закрыли мини-плеер — закрываем и её
    if (isLauncher) { if (selfTabId !== null) chrome.tabs.remove(selfTabId); return; }
    document.body.insertBefore(app, popped);
    popped.hidden = true;
    pipWin = null;
    renderPopout();
    if (!still) raf(spin); // анимация шла от окна, которого больше нет
  });
  renderPopout(); // анимация сама переедет в новое окно со следующего кадра
  // возвращаем пользователя на вкладку с музыкой
  if (isLauncher && activeTabId !== null) chrome.tabs.update(activeTabId, { active: true }).catch(() => {});
}

$('popout').addEventListener('click', popOut);

// ---------- поделиться ----------
// Ссылка на ту же страницу сайта + наши настройки (#screwed=s70-p1-c50-t20).
// У получателя расширение забирает их ещё до запуска кода сайта.
async function share() {
  const top = frames.get(0);
  const pageUrl = top && top.url;
  if (!reachable || !pageUrl || !/^https?:/.test(pageUrl)) { toast(t('shareNoPage')); return; }
  const { meta } = live();
  const track = meta && meta.title ? [meta.artist, meta.title].filter(Boolean).join(' – ') : '';
  const link = screwedLandingUrl(screwedShareUrl(pageUrl, s), track, resolveLang(s.lang));
  if (await copyText(link)) toast(t('shareCopied'));
  else toast(link, true); // буфер обмена недоступен — показываем ссылку, чтобы скопировать вручную
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch (e) {
    // старый способ: работает там, где новый API закрыт
    const area = document.createElement('textarea');
    area.value = text;
    area.style.cssText = 'position:fixed;opacity:0';
    document.body.append(area);
    area.select();
    let ok = false;
    try { ok = document.execCommand('copy'); } catch (err) {}
    area.remove();
    return ok;
  }
}

$('share').addEventListener('click', share);
document.getElementById('launch-btn').addEventListener('click', popOut);
document.getElementById('popin').addEventListener('click', () => pipWin && pipWin.close());

// ---------- закрыли панель — выключаем эффект на её вкладке ----------
// Фоновый скрипт держит связь с панелью и мини-плеером каждой вкладки и выключает на ней эффект,
// когда не осталось ни того, ни другого. Раз в 20 секунд напоминаем о себе,
// чтобы Chrome не усыпил фоновый скрипт и он заметил закрытие.
function connectToBackground() {
  if (activeTabId === null) return;
  const port = chrome.runtime.connect({ name: `${isLauncher ? 'mini' : 'panel'}:${activeTabId}` });
  const heartbeat = setInterval(() => port.postMessage('alive'), 20000);
  port.onDisconnect.addListener(() => {
    clearInterval(heartbeat);
    setTimeout(connectToBackground, 500); // фоновый скрипт перезапустился — подключаемся заново
  });
}
// Если фоновый скрипт спит, разрыв соединения он не заметит — говорим о закрытии прямо
// (сообщение его будит). Когда панель только прячут при уходе на другую вкладку, pagehide не приходит.
addEventListener('pagehide', () => {
  if (activeTabId === null) return;
  try { chrome.runtime.sendMessage({ type: 'screwed:panel-closed', tabId: activeTabId }).catch(() => {}); } catch (e) {}
});
