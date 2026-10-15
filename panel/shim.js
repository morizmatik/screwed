// Заглушки API Chrome для живой панели на странице-прослойке.
// Панель (panel.js) думает, что работает внутри расширения; здесь вместо Chrome —
// localStorage в памяти и одна вымышленная вкладка. Демо-трек шлёт panel.js
// сообщения «от вкладки» через window.__emit (см. demo.js).
// Правь только вместе со store/src/serve.js — там тот же набор заглушек для стенда.
(() => {
  const store = {};
  const changed = [];
  const messages = [];

  window.chrome = {
    storage: {
      local: {
        get(d, cb) {
          const out = {};
          if (Array.isArray(d)) { for (const k of d) if (k in store) out[k] = store[k]; }
          else Object.assign(out, d, store);
          setTimeout(() => cb(out), 0);
        },
        remove(keys) { for (const k of [].concat(keys)) delete store[k]; },
        set(o) {
          const c = {};
          for (const k in o) { c[k] = { oldValue: store[k], newValue: o[k] }; store[k] = o[k]; }
          changed.forEach(l => l(c, 'local'));
        },
      },
      onChanged: { addListener(l) { changed.push(l); } },
    },
    runtime: {
      onMessage: { addListener(l) { messages.push(l); } },
      // favicon — статический SVG с цветом «сайта»; остальное — файлы рядом с панелью
      getURL: p => p.startsWith('/_favicon/')
        ? new URL('favicon.svg', location.href).href
        : new URL(p.replace(/^\//, ''), location.href).href,
      connect: () => ({ postMessage() {}, onDisconnect: { addListener() {} } }),
      sendMessage: async () => {},
    },
    tabs: {
      query: async () => [{ id: 1, index: 0, url: 'https://site.test/' }],
      get: async () => ({ id: 1, index: 0, url: 'https://site.test/' }),
      reload: async () => {},
      sendMessage: async () => true,
      onActivated: { addListener() {} },
      onUpdated: { addListener() {} },
      onRemoved: { addListener() {} },
      create() {}, getCurrent: cb => cb({ id: 99 }), update: async () => {}, remove() {},
    },
    commands: { getAll: cb => cb([
      { name: '_execute_action', shortcut: 'Alt+Shift+X' }, { name: 'toggle', shortcut: 'Alt+Shift+S' },
      { name: 'slower', shortcut: 'Alt+Shift+Down' }, { name: 'faster', shortcut: 'Alt+Shift+Up' } ]) },
    windows: { getCurrent: cb => cb({ id: 1 }) },
    i18n: { getUILanguage: () => new URLSearchParams(location.search).get('lang') || 'en' },
  };

  // demo.js и шлёт через это сообщения, как content script из вкладки
  window.__emit = msg => messages.forEach(l => l(msg, { tab: { id: 1 }, frameId: 0 }));
})();
