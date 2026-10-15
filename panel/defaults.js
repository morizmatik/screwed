// Общие настройки для панели, фонового скрипта и content script (хранятся в chrome.storage.local)
const SCREWED_DEFAULTS = {
  speed: 0.8,    // базовая скорость (на шкале отмечена сердечком — так звучит удачнее всего); тон всегда падает вместе с ней, как на пластинке
  chewAmt: 0.15, // жевание плёнки, 0..1 (0 — выключено); 15% тоже отмечены сердечком
  tone: 0.4,     // «тёмный» lowpass, 0..1; 40% отмечены сердечком
  noise: 0.6,    // шум эфира: редкие «потери волны» с шипением и треском, 0..1 (0 — выключено); 60% — сердечко
  reverb: 0,     // реверб, 0..1 (0 — выключен); по умолчанию выключен, пока автор не послушал
  chop: false,   // чопы и эхо в ритм: включены или нет
  drift: true,   // плавающий тон: тембр медленно и случайно гуляет, как скорость у жевания
  sites: {},     // сайты, на которых эффект включён: { 'https://music.yandex.ru': true }
  lang: 'auto',  // язык интерфейса: auto — как у браузера
};

// ---------- пресеты ----------
// Пресет – набор значений всех ручек эффекта (не трогает сайты и язык), применяется одним действием.
// i18n – ключ названия в i18n.js. Активным считается пресет, у которого все значения совпали с текущими.
const SCREWED_PRESETS = [
  { id: 'slowed', i18n: 'presetSlowed', values: { speed: 0.8, chewAmt: 0, tone: 0.4, noise: 0, reverb: 0.4, chop: false, drift: false } },
  { id: 'tape', i18n: 'presetTape', values: { speed: 0.9, chewAmt: 0.5, tone: 0.5, noise: 0.3, reverb: 0.15, chop: false, drift: true } },
  { id: 'radio', i18n: 'presetRadio', values: { speed: 1, chewAmt: 0.1, tone: 0.7, noise: 0.8, reverb: 0, chop: false, drift: false } },
  { id: 'nightcore', i18n: 'presetNightcore', values: { speed: 1.3, chewAmt: 0, tone: 0, noise: 0, reverb: 0, chop: false, drift: false } },
];

function screwedPresetActive(preset, s) {
  return Object.entries(preset.values).every(([k, v]) =>
    typeof v === 'boolean' ? !!s[k] === v : Math.abs(s[k] - v) < 0.005);
}

// Свои пресеты: список { id, name, values } в chrome.storage.local под ключом userPresets.
// Не входят в SCREWED_DEFAULTS, чтобы «Сброс» их не стирал. Делиться ими можно обычной ссылкой «Поделиться»:
// код в ней несёт те же ручки, что и пресет.
const SCREWED_USER_PRESETS_KEY = 'userPresets';
const SCREWED_USER_PRESETS_MAX = 6;
const SCREWED_USER_PRESET_NAME_MAX = 16;

// значения ручек из текущих настроек (без сайтов и языка)
function screwedPresetValues(s) {
  const out = {};
  for (const k of Object.keys(SCREWED_PRESETS[0].values)) out[k] = s[k];
  return out;
}

// список с добавленным пресетом или null, если имя пустое или список полон (исходный не меняется)
function screwedUserPresetsWith(list, name, s) {
  const clean = String(name).trim().slice(0, SCREWED_USER_PRESET_NAME_MAX);
  if (!clean || list.length >= SCREWED_USER_PRESETS_MAX) return null;
  return [...list, { id: `u${Date.now().toString(36)}${list.length}`, name: clean, values: screwedPresetValues(s) }];
}

function screwedUserPresetsWithout(list, id) {
  return list.filter(p => p.id !== id);
}

// ---------- сайты ----------
// Эффект работает там, где сошлись два условия: на вкладке открыта панель (ключ tab:<номер вкладки>,
// его ведёт background.js) и сайт есть в sites — на нём пользователь эффект включил.
// Сайт — источник (origin) верхней страницы.
function screwedSite(url) {
  try {
    const u = new URL(url);
    return /^https?:$/.test(u.protocol) ? u.origin : null;
  } catch (e) {
    return null;
  }
}

// тот же список с добавленным или убранным сайтом (исходный не меняется)
function screwedSitesWith(sites, site, on) {
  const out = { ...sites };
  if (on) out[site] = true;
  else delete out[site];
  return out;
}

// ---------- настройки в ссылке «Поделиться» ----------
// Короткий код: s70-c50-t20-w1-n60 — скорость 70%, жевание 50%, тёмный тон 20%,
// плавающий тон включён (w0 — выключен), шум 60%. Реверб (r40) дописывается, только если он включён.
// Чопы (d1) дописываются, только если включены: версии до 0.12 незнакомую часть кода не понимают.
// Версии до 0.14 не понимают и w с n — у них ссылка откроет трек без настроек, пока Chrome их не обновит.
// Кладём его после # (браузер сохраняет эту часть даже при перенаправлениях сервера),
// а если у страницы уже есть своя часть после #, — обычным параметром ?screwed=.
const SCREWED_PARAM = 'screwed';

function screwedShareCode(s) {
  const p = v => Math.round(v * 100);
  return `s${p(s.speed)}-c${p(s.chewAmt)}-t${p(s.tone)}-w${s.drift ? 1 : 0}-n${p(s.noise)}${s.reverb > 0 ? `-r${p(s.reverb)}` : ''}${s.chop ? '-d1' : ''}`;
}

function screwedParseCode(code) {
  // ссылка без чопов и реверба выключает их и у получателя; плавающий тон и шум из старых ссылок,
  // где их нет, остаются такими, как у получателя
  const out = { chop: false, reverb: 0 };
  for (const part of String(code).split('-')) {
    // незнакомые буквы пропускаем: так ссылки из будущих версий с новыми настройками не ломаются
    const m = part.match(/^([a-z])(\d{1,3})$/);
    if (!m) return null;
    const n = Number(m[2]);
    if (m[1] === 's') out.speed = Math.min(2, Math.max(0.3, n / 100));
    // 'p' (тон вниз) был в старых ссылках; теперь тон падает всегда — просто пропускаем
    if (m[1] === 'c') out.chewAmt = Math.min(1, n / 100);
    if (m[1] === 't') out.tone = Math.min(1, n / 100);
    if (m[1] === 'd') out.chop = n > 0;
    if (m[1] === 'w') out.drift = n > 0;
    if (m[1] === 'n') out.noise = Math.min(1, n / 100);
    if (m[1] === 'r') out.reverb = Math.min(1, n / 100);
  }
  return 'speed' in out ? out : null;
}

const SCREWED_HASH_RE = new RegExp(`(^#|&)${SCREWED_PARAM}=([^&]*)`);

// убрать наш параметр из адреса страницы
function screwedStripUrl(href) {
  const u = new URL(href);
  u.searchParams.delete(SCREWED_PARAM);
  const hash = u.hash.replace(SCREWED_HASH_RE, '$1').replace(/^#&/, '#').replace(/&$/, '');
  u.hash = hash === '#' ? '' : hash;
  return u.href;
}

function screwedShareUrl(pageUrl, s) {
  const u = new URL(screwedStripUrl(pageUrl));
  const code = screwedShareCode(s);
  if (u.hash) u.searchParams.set(SCREWED_PARAM, code);
  else u.hash = `${SCREWED_PARAM}=${code}`;
  return u.href;
}

// Страница-прослойка (папка site/): у кого расширения нет, тот увидит на ней трек, настройки
// и кнопку установки; у кого есть — сразу попадёт на трек. Адрес трека и название идут после #,
// то есть на сервер не отправляются. Страница живёт в отдельном публичном репозитории
// morizmatik/screwed (GitHub Pages). С пустым адресом ссылка ведёт прямо на сайт.
const SCREWED_LANDING = 'https://screwify.space/';

// У каждого языка, кроме английского, свой адрес (…/screwed/ru/): превью ссылки в мессенджерах
// берётся из разметки страницы, и так оно выходит на языке отправителя. Саму страницу
// получатель всё равно увидит на языке своего браузера.
const SCREWED_LANDING_LANGS = ['ru', 'zh', 'es', 'ar', 'fr'];

function screwedLandingUrl(shareUrl, track, lang) {
  if (!SCREWED_LANDING) return shareUrl;
  const params = new URLSearchParams({ to: shareUrl });
  if (track) params.set('track', track);
  const dir = SCREWED_LANDING_LANGS.includes(lang) ? `${lang}/` : '';
  return `${SCREWED_LANDING}${dir}#${params}`;
}

// открыта ли сейчас страница-прослойка
function screwedIsLanding(href) {
  return !!SCREWED_LANDING && href.split('#')[0] === SCREWED_LANDING;
}

// настройки из адреса или null
function screwedReadUrl(href) {
  const u = new URL(href);
  const fromHash = u.hash.match(SCREWED_HASH_RE);
  const code = u.searchParams.get(SCREWED_PARAM) || (fromHash && decodeURIComponent(fromHash[2]));
  return code ? screwedParseCode(code) : null;
}

// Раньше у тона, жевания и стиля сайта были отдельные выключатели. Переносим старые
// настройки: выключенное жевание — это сила 0; сами ключи больше не нужны.
function screwedMigrate() {
  // 'on' был общим выключателем для всех вкладок; с 0.13 расширение включается по вкладкам.
  // 'sweep' — плавающий тон по тактам из 0.14.0–0.14.1; теперь он не привязан к ритму (drift).
  chrome.storage.local.get(['chew', 'pitch', 'siteTheme', 'on', 'sweep'], old => {
    if (old.chew === false) chrome.storage.local.set({ chewAmt: 0 });
    const stale = Object.keys(old);
    if (stale.length) chrome.storage.local.remove(stale);
  });
}
