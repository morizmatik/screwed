/* feedback.js – "write to the author" dialog for any page, no build step and no dependencies.
 * A classic script: <script src="feedback.js"></script> defines window.Feedback
 * (in a bundler: import './feedback.js' and use window.Feedback).
 *
 *   const fb = Feedback.create({ url: 'https://…workers.dev', lang: 'en' });
 *   button.onclick = () => fb.open();
 *
 * The app name is not sent: the worker takes it from the page's origin (see worker.js).
 * Look: CSS variables on any ancestor or :root – --fb-bg, --fb-fg, --fb-muted, --fb-line,
 * --fb-field, --fb-accent, --fb-accent-fg, --fb-error, --fb-radius, --fb-button-radius, --fb-font.
 */
// Arrow wrapper on purpose: vite-plugin-singlefile strips a leading `(function(){…})();` as Vite's module loader,
// and a minified function wrapper here looked exactly like it (Mixtake lost half its bundle).
((global) => {
	'use strict';

	/** field length limits; the same numbers are used by worker.js */
	const LIMITS = { message: 2000, contact: 200 };

	const TEXTS = {
		en: {
			title: 'Contact the author',
			desc: 'Found a mistake, have a question or an idea? Your message will go directly to the author.',
			message: 'Message', messagePh: 'Tell us what happened or what\u2019s missing',
			contact: 'How can we get back to you? (optional)', contactPh: 'Email address or messenger username',
			send: 'Send', sending: 'Sending…', ok: 'Thank you, your message has been sent.',
			error: 'Could not send. Please try again a little later.',
			rate: 'Too many messages in a row. Please wait a minute.',
			empty: 'Please write at least a few words.', close: 'Close'
		},
		ru: {
			title: 'Написать автору',
			desc: 'Нашли ошибку, есть вопрос или идея? Сообщение придёт напрямую автору.',
			message: 'Сообщение', messagePh: 'Что случилось или чего не хватает',
			contact: 'Как вам ответить (необязательно)', contactPh: 'Почта или имя в мессенджере',
			send: 'Отправить', sending: 'Отправляю…', ok: 'Спасибо, сообщение отправлено.',
			error: 'Не получилось отправить. Попробуйте ещё раз чуть позже.',
			rate: 'Слишком много сообщений подряд. Подождите минуту.',
			empty: 'Напишите хотя бы пару слов.', close: 'Закрыть'
		},
		zh: {
			title: '给作者留言',
			desc: '发现错误，有问题或想法？消息会直接发给作者。',
			message: '留言', messagePh: '发生了什么，或者缺少什么',
			contact: '如何回复你（可选）', contactPh: '邮箱或聊天软件账号',
			send: '发送', sending: '正在发送…', ok: '谢谢，消息已发送。',
			error: '发送失败，请稍后再试。',
			rate: '消息太多了，请等一分钟。',
			empty: '请至少写几个字。', close: '关闭'
		},
		es: {
			title: 'Escribir al autor',
			desc: '¿Encontraste un error, tienes una pregunta o una idea? Tu mensaje llega directamente al autor.',
			message: 'Mensaje', messagePh: 'Qué pasó o qué falta',
			contact: 'Cómo responderte (opcional)', contactPh: 'Correo o usuario de mensajería',
			send: 'Enviar', sending: 'Enviando…', ok: 'Gracias, tu mensaje se ha enviado.',
			error: 'No se pudo enviar. Inténtalo de nuevo un poco más tarde.',
			rate: 'Demasiados mensajes seguidos. Espera un minuto.',
			empty: 'Escribe al menos unas palabras.', close: 'Cerrar'
		},
		ar: {
			title: 'راسل المطوّر',
			desc: 'وجدت خطأ أو لديك سؤال أو فكرة؟ تصل رسالتك مباشرة إلى المطوّر.',
			message: 'الرسالة', messagePh: 'ما الذي حدث أو ما الذي ينقص',
			contact: 'كيف نرد عليك (اختياري)', contactPh: 'البريد أو اسمك في تطبيق مراسلة',
			send: 'إرسال', sending: 'جارٍ الإرسال…', ok: 'شكرًا، أُرسلت رسالتك.',
			error: 'تعذّر الإرسال. حاول مرة أخرى بعد قليل.',
			rate: 'رسائل كثيرة متتالية. انتظر دقيقة.',
			empty: 'اكتب بضع كلمات على الأقل.', close: 'إغلاق'
		},
		fr: {
			title: 'Écrire à l’auteur',
			desc: 'Un bug, une question ou une idée ? Votre message arrive directement à l’auteur.',
			message: 'Message', messagePh: 'Ce qui s’est passé ou ce qui manque',
			contact: 'Comment vous répondre (facultatif)', contactPh: 'E-mail ou pseudo de messagerie',
			send: 'Envoyer', sending: 'Envoi…', ok: 'Merci, votre message a été envoyé.',
			error: 'Échec de l’envoi. Réessayez un peu plus tard.',
			rate: 'Trop de messages d’affilée. Attendez une minute.',
			empty: 'Écrivez au moins quelques mots.', close: 'Fermer'
		}
	};

	const CSS = `
.fb-dialog{--_bg:var(--fb-bg,#18171a);--_fg:var(--fb-fg,#ece9e4);--_muted:var(--fb-muted,#a19d97);--_line:var(--fb-line,#34313a);
 --_field:var(--fb-field,#0f0e10);--_accent:var(--fb-accent,#ec90a7);--_accent-fg:var(--fb-accent-fg,#141215);--_error:var(--fb-error,#ff8a80);
 --_r:var(--fb-radius,14px);
 box-sizing:border-box;width:min(460px,calc(100vw - 32px));max-height:calc(100dvh - 32px);margin:auto;padding:28px;
 border:1px solid var(--_line);border-radius:var(--_r);background:var(--_bg);color:var(--_fg);
 font:400 15px/1.5 var(--fb-font,system-ui,-apple-system,"Segoe UI",sans-serif);box-shadow:0 24px 80px rgb(0 0 0/.5)}
.fb-dialog::backdrop{background:rgb(0 0 0/.6);backdrop-filter:blur(3px)}
.fb-dialog *{box-sizing:border-box}
.fb-dialog h2{margin:0 36px 6px 0;font-size:22px;line-height:1.25;font-weight:600;letter-spacing:-.01em}
.fb-dialog[dir=rtl] h2{margin:0 0 6px 36px}
.fb-dialog .fb-desc{margin:0 0 20px;color:var(--_muted)}
.fb-dialog form{display:grid;gap:16px}
.fb-dialog label{display:grid;gap:6px;font-size:14px;font-weight:500}
.fb-dialog textarea,.fb-dialog input{width:100%;padding:10px 12px;border:1px solid var(--_line);border-radius:calc(var(--_r) - 4px);
 background:var(--_field);color:var(--_fg);font:inherit;font-size:15px;resize:vertical}
.fb-dialog textarea{min-height:120px}
.fb-dialog textarea::placeholder,.fb-dialog input::placeholder{color:var(--_muted);opacity:.7}
.fb-dialog textarea:focus-visible,.fb-dialog input:focus-visible,.fb-dialog button:focus-visible{outline:2px solid var(--_accent);outline-offset:2px}
.fb-dialog [aria-invalid=true]{border-color:var(--_error)}
.fb-dialog .fb-trap{position:absolute;left:-9999px;width:1px;height:1px;opacity:0}
.fb-dialog .fb-alert{margin:0;color:var(--_error);font-size:14px}
.fb-dialog .fb-send,.fb-dialog .fb-close{justify-self:start;min-height:44px;padding:0 22px;border:0;border-radius:var(--fb-button-radius,999px);
 background:var(--_accent);color:var(--_accent-fg);font:inherit;font-weight:600;cursor:pointer}
.fb-dialog .fb-send:disabled{opacity:.6;cursor:default}
.fb-dialog .fb-x{position:absolute;top:14px;inset-inline-end:14px;width:36px;height:36px;border:0;border-radius:50%;
 background:transparent;color:var(--_muted);font-size:24px;line-height:1;cursor:pointer}
.fb-dialog .fb-x:hover{color:var(--_fg);background:var(--_line)}
.fb-dialog .fb-done p{margin:0 0 20px;font-size:16px}
@media (prefers-reduced-motion:no-preference){.fb-dialog[open]{animation:fb-in .18s ease-out}}
@keyframes fb-in{from{opacity:0;transform:translateY(8px)}}
`;

	/** @returns {Promise<'ok' | 'empty' | 'rate' | 'error'>} */
	async function send(url, { message, contact = '', website = '', lang = document.documentElement.lang }) {
		if (!message || !message.trim()) return 'empty';
		// a stuck network must not leave the form "sending" forever
		const stop = new AbortController();
		const timer = setTimeout(() => stop.abort(), 15000);
		try {
			const res = await fetch(url, {
				method: 'POST',
				headers: { 'content-type': 'application/json' },
				body: JSON.stringify({ message, contact, website, page: location.pathname, lang }),
				signal: stop.signal
			});
			if (res.ok) return 'ok';
			const data = await res.json().catch(() => ({}));
			return data.error === 'rate' || data.error === 'empty' ? data.error : 'error';
		} catch (e) {
			return 'error';
		} finally {
			clearTimeout(timer);
		}
	}

	function h(tag, attrs, ...kids) {
		const el = document.createElement(tag);
		for (const k in attrs || {}) {
			if (k === 'text') el.textContent = attrs[k];
			else if (k.startsWith('on')) el.addEventListener(k.slice(2), attrs[k]);
			else el.setAttribute(k, attrs[k]);
		}
		el.append(...kids);
		return el;
	}

	let uid = 0;

	/**
	 * @param {{ url: string, lang?: string, texts?: object }} opts
	 *   lang – one of en ru zh es ar fr (others fall back to en); texts – overrides for any string
	 */
	function create({ url, lang, texts } = {}) {
		if (!url) throw new Error('Feedback.create: url is required');
		const code = String(lang || document.documentElement.lang || 'en').slice(0, 2).toLowerCase();
		const T = Object.assign({}, TEXTS.en, TEXTS[code], texts);
		if (!document.getElementById('fb-style')) document.head.append(h('style', { id: 'fb-style' }, CSS));

		const id = 'fb-' + ++uid;
		const message = h('textarea', { name: 'message', rows: '5', maxlength: LIMITS.message, placeholder: T.messagePh, required: '' });
		const contact = h('input', { name: 'contact', maxlength: LIMITS.contact, placeholder: T.contactPh, autocomplete: 'off' });
		// trap for bots: invisible to people and out of the keyboard order
		const trap = h('input', { name: 'website', class: 'fb-trap', tabindex: '-1', autocomplete: 'off', 'aria-hidden': 'true' });
		const alert = h('p', { class: 'fb-alert', role: 'alert', hidden: '' });
		const submit = h('button', { type: 'submit', class: 'fb-send', text: T.send });
		const form = h('form', { novalidate: '', onsubmit: onSubmit },
			h('label', {}, T.message, message),
			h('label', {}, T.contact, contact),
			trap, alert, submit);
		const done = h('div', { class: 'fb-done', hidden: '' },
			h('p', { role: 'status', text: T.ok }),
			h('button', { type: 'button', class: 'fb-close', text: T.close, onclick: () => close() }));
		const dialog = h('dialog', {
			class: 'fb-dialog', lang: code, dir: code === 'ar' ? 'rtl' : 'ltr', 'aria-labelledby': id + '-t', 'aria-describedby': id + '-d',
			onclose: () => { if (!done.hidden) reset(); },
			// a click on the backdrop closes the dialog
			onclick: (e) => { if (e.target === dialog) close(); }
		},
			h('button', { type: 'button', class: 'fb-x', 'aria-label': T.close, text: '×', onclick: () => close() }),
			h('h2', { id: id + '-t', text: T.title }),
			h('p', { id: id + '-d', class: 'fb-desc', text: T.desc }),
			form, done);
		document.body.append(dialog);

		function show(text) {
			alert.textContent = text;
			alert.hidden = !text;
		}
		// a closed dialog opens clean after a sent message, but unsent text is kept
		function reset() {
			form.hidden = false;
			done.hidden = true;
			message.value = contact.value = trap.value = '';
			show('');
		}
		async function onSubmit(e) {
			e.preventDefault();
			if (!message.value.trim()) {
				message.setAttribute('aria-invalid', 'true');
				show(T.empty);
				message.focus();
				return;
			}
			message.removeAttribute('aria-invalid');
			show('');
			submit.disabled = true;
			submit.textContent = T.sending;
			const result = await send(url, { message: message.value, contact: contact.value, website: trap.value, lang: code });
			submit.disabled = false;
			submit.textContent = T.send;
			if (result === 'ok') {
				form.hidden = true;
				done.hidden = false;
				done.querySelector('button').focus();
			} else show(result === 'rate' ? T.rate : result === 'empty' ? T.empty : T.error);
		}
		function open() {
			if (!dialog.open) dialog.showModal();
			if (!form.hidden) message.focus();
		}
		function close() {
			if (dialog.open) dialog.close();
			// the close event comes later; reset now so an immediate reopen is clean too
			if (!done.hidden) reset();
		}
		return { open, close, dialog };
	}

	global.Feedback = { create, send, LIMITS, TEXTS };
})(typeof window !== 'undefined' ? window : globalThis);
