// Общие настройки для панели, фонового скрипта и content script (хранятся в chrome.storage.local)
const SCREWED_DEFAULTS = {
  speed: 0.8,    // базовая скорость (на шкале отмечена сердечком — так звучит удачнее всего); тон всегда падает вместе с ней, как на пластинке
  chewAmt: 0.15, // жевание плёнки, 0..1 (0 — выключено); 15% тоже отмечены сердечком
  tone: 0.4,     // «тёмный» lowpass, 0..1; 40% отмечены сердечком
  noise: 0.6,    // шум эфира: редкие «потери волны» с шипением и треском, 0..1 (0 — выключено); 60% — сердечко
  chop: false,   // чопы и эхо в ритм: включены или нет
  drift: true,   // плавающий тон: тембр медленно и случайно гуляет, как скорость у жевания
  sites: {},     // сайты, на которых эффект включён: { 'https://music.yandex.ru': true }
  lang: 'auto',  // язык интерфейса: auto — как у браузера
};

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
// плавающий тон включён (w0 — выключен), шум 60%.
// Чопы (d1) дописываются, только если включены: версии до 0.12 незнакомую часть кода не понимают.
// Версии до 0.14 не понимают и w с n — у них ссылка откроет трек без настроек, пока Chrome их не обновит.
// Кладём его после # (браузер сохраняет эту часть даже при перенаправлениях сервера),
// а если у страницы уже есть своя часть после #, — обычным параметром ?screwed=.
const SCREWED_PARAM = 'screwed';

function screwedShareCode(s) {
  const p = v => Math.round(v * 100);
  return `s${p(s.speed)}-c${p(s.chewAmt)}-t${p(s.tone)}-w${s.drift ? 1 : 0}-n${p(s.noise)}${s.chop ? '-d1' : ''}`;
}

function screwedParseCode(code) {
  // ссылка без чопов выключает их и у получателя; плавающий тон и шум из старых ссылок,
  // где их нет, остаются такими, как у получателя
  const out = { chop: false };
  for (const part of String(code).split('-')) {
    // незнакомые буквы пропускаем: так ссылки из будущих версий с новыми настройками не ломаются
    const m = part.match(/^([a-z])(\d{1,3})$/);
    if (!m) return null;
    const n = Number(m[2]);
    if (m[1] === 's') out.speed = Math.min(1.2, Math.max(0.3, n / 100));
    // 'p' (тон вниз) был в старых ссылках; теперь тон падает всегда — просто пропускаем
    if (m[1] === 'c') out.chewAmt = Math.min(1, n / 100);
    if (m[1] === 't') out.tone = Math.min(1, n / 100);
    if (m[1] === 'd') out.chop = n > 0;
    if (m[1] === 'w') out.drift = n > 0;
    if (m[1] === 'n') out.noise = Math.min(1, n / 100);
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
