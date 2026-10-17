// Демо-трек для живой панели: вымышленный сайт, играющий трек и волна,
// чтобы панель на странице-прослойке выглядела и жила как настоящая.
// Скорость берётся из ползунка панели (chrome.storage), и за ней едут
// проценты, подсчёт тона и темп — как в настоящем расширении.
(() => {
  const site = {
    host: 'backroom.audio', url: 'https://backroom.audio/juneokafor/second-shift',
    artist: 'June Okafor', title: 'Second Shift',
  };
  const nativeBpm = 105; // темп оригинала при 100% скорости
  const duration = 218;  // секунд в треке
  let speed = 0.8;       // как у расширения: значение по умолчанию
  let t = 84, i = 0;

  // «музыкальная» волна: бочка на каждую долю + шум
  const peaks = k => {
    const beat = Math.exp(-((k % 10) / 10) * 5);
    return Math.min(1, 0.18 + 0.55 * beat + 0.25 * Math.abs(Math.sin(k * 0.37)) * Math.abs(Math.sin(k * 0.05)));
  };

  const status = () => window.__emit({
    type: 'screwed:status', playing: 1, rate: speed, media: 1,
    host: site.host, url: site.url, title: `${site.artist} – ${site.title}`,
    meta: { artist: site.artist, title: site.title },
  });
  const monitor = () => window.__emit({
    type: 'screwed:monitor', t, d: duration, ready: true, paused: false,
    scratching: false, shift: 0, braking: false, rate: speed, wave: 'ok',
    peaks: [peaks(i++), peaks(i++)], kick: 0, bpm: Math.round(nativeBpm * speed),
  });

  // ползунок скорости меняет хранилище — ведём за ним проценты и темп
  chrome.storage.onChanged.addListener((changes, area) => {
    if (area === 'local' && 'speed' in changes) speed = changes.speed.newValue ?? 0.8;
  });

  // эффект включается по сайтам; вкладка демо — https://site.test (см. shim.js)
  setTimeout(() => {
    chrome.storage.local.set({ sites: { 'https://site.test': true } });
    status();
    for (let k = 0; k < 60; k++) monitor(); // сразу заполняем волну
    setInterval(() => { status(); t = (t + 0.1) % duration; monitor(); }, 100);
  }, 300);
})();
