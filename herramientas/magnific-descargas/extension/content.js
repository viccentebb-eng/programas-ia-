/* Dentro de una página de Magnific: busca el botón «Download/Descargar» de tu sesión y lo pulsa, como si dieras clic.
   En videos, si la página ofrece varias calidades, elige 1080p (Full HD). Nunca pulsa «Get Premium» ni compra nada. */
'use strict';
const sleep = ms => new Promise(r => setTimeout(r, ms));
const visible = el => !!(el && el.offsetParent !== null && !el.disabled);
const textOf = el => `${el.textContent || ''} ${el.getAttribute('aria-label') || ''}`.replace(/\s+/g, ' ').trim();
const PROHIBIDO = /premium|suscr|subscri|comprar|buy|upgrade|plan(es)?\b|pricing|precio/i;
const BLOQUEO_PREMIUM = /get premium|go premium|hazte premium|obtener premium|suscr[ií]bete|subscribe/i;
const BLOQUEO_LOGIN = /^(iniciar sesi[oó]n|inicia sesi[oó]n|sign in|log in)$/i;

function downloadButton() {
  const esSeguro = el => visible(el) && !PROHIBIDO.test(el.getAttribute('data-cy') || '') && !PROHIBIDO.test(textOf(el));
  const byData = [...document.querySelectorAll('[data-cy="download-button"]')].find(esSeguro);
  if (byData) return byData;
  return [...document.querySelectorAll('button, a[role="button"]')]
    .find(el => esSeguro(el) && /^(descargar|download)(\s|$)/i.test(textOf(el)));
}

function pickHd() {
  const option = [...document.querySelectorAll('button, [role="option"], [role="menuitem"], [role="radio"], label, li')]
    .find(el => visible(el) && /1080|full\s?hd/i.test(textOf(el)) && textOf(el).length < 80 && !PROHIBIDO.test(textOf(el)));
  if (option) { option.click(); return true; }
  return false;
}

/** Antes del clic: la página no ofrece descarga porque falta sesión o Premium. */
function blocked() {
  const premium = [...document.querySelectorAll('[data-cy="go-premium-download"]')].find(visible)
    || [...document.querySelectorAll('button, a')].find(el => visible(el) && BLOQUEO_PREMIUM.test(textOf(el)) && /download|descarg/i.test(textOf(el)));
  const login = [...document.querySelectorAll('button, a')].find(el => visible(el) && BLOQUEO_LOGIN.test(textOf(el)));
  if (premium && !downloadButton()) return 'premium';
  if (login && !downloadButton()) return 'login';
  return null;
}

/** Después del clic: apareció una ventana que pide iniciar sesión o Premium. Sólo se avisa; no se pulsa nada. */
function modalDeBloqueo() {
  if ([...document.querySelectorAll('[data-cy="go-premium-download"]')].some(visible)) return 'premium';
  for (const dialog of document.querySelectorAll('[role="dialog"], dialog[open], [aria-modal="true"]')) {
    if (!visible(dialog) && !dialog.open) continue;
    const text = textOf(dialog);
    if (BLOQUEO_PREMIUM.test(text)) return 'premium';
    if (/iniciar sesi[oó]n|inicia sesi[oó]n|sign in|log in/i.test(text)) return 'login';
  }
  return null;
}

browser.runtime.onMessage.addListener(async msg => {
  if (msg?.cmd !== 'magnific-descargar') return undefined;
  // La página carga sus botones después del HTML: espera hasta 20 s.
  for (let i = 0; i < 40; i++) {
    const button = downloadButton();
    if (button) {
      if (msg.tipo === 'video') { pickHd(); await sleep(600); }
      button.click();
      await sleep(1500);
      if (msg.tipo === 'video') pickHd(); // algunas páginas preguntan la calidad después del clic
      await sleep(1500);
      return { ok: true, aviso: modalDeBloqueo() };
    }
    const reason = blocked();
    if (reason && i > 6) return { ok: false, reason };
    await sleep(500);
  }
  return { ok: false, reason: 'sin-boton' };
});
