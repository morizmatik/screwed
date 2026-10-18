# Screwed Music — share page

The page that “Share” links from the Screwed Music browser extension open:
https://screwify.space/

A single static file, no build step. The `ru/`, `zh/`, `es/`, `ar/`, `fr/` folders hold tiny pages that exist only for link previews in that language (messengers read the preview from the markup and do not run scripts); they send people straight to the main page, keeping everything after `#`. The track address and title travel after `#`, so they never reach the server.
- Язык: переключатель в шапке (выбор хранится в браузере), `?lang=xx` в адресе сильнее сохранённого; затем язык браузера.
