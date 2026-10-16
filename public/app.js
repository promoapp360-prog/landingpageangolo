// Landing laser — tracciamento Meta, UTM, form contatti
(function () {
  const C = window.CFG || {};
  const $ = (s, el = document) => el.querySelector(s);
  const $$ = (s, el = document) => [...el.querySelectorAll(s)];
  const eur = (n) => Number(n).toLocaleString('it-IT', { style: 'currency', currency: 'EUR', maximumFractionDigits: 0 });
  const store = { get: (k) => { try { return localStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { localStorage.setItem(k, v); } catch {} } };
  const ss = { get: (k) => { try { return sessionStorage.getItem(k); } catch { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch {} } };
  const uuid = () => (crypto.randomUUID ? crypto.randomUUID() : Date.now() + '-' + Math.random().toString(36).slice(2));

  // ---- UTM / fbclid (salvati per tutta la visita)
  const qs = new URLSearchParams(location.search);
  const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term', 'fbclid'];
  const attrib = JSON.parse(ss.get('attrib') || '{}');
  UTM_KEYS.forEach((k) => { if (qs.get(k)) attrib[k] = qs.get(k); });
  if (!attrib.landing) attrib.landing = location.href;
  ss.set('attrib', JSON.stringify(attrib));

  // ---- Meta Pixel con consenso cookie
  let pixelOn = false;
  function loadPixel() {
    if (pixelOn || !C.meta_pixel_id) return;
    pixelOn = true;
    !function (f, b, e, v, n, t, s) { if (f.fbq) return; n = f.fbq = function () { n.callMethod ? n.callMethod.apply(n, arguments) : n.queue.push(arguments); }; if (!f._fbq) f._fbq = n; n.push = n; n.loaded = !0; n.version = '2.0'; n.queue = []; t = b.createElement(e); t.async = !0; t.src = v; s = b.getElementsByTagName(e)[0]; s.parentNode.insertBefore(t, s); }(window, document, 'script', 'https://connect.facebook.net/en_US/fbevents.js');
    if (attrib.fbclid && !document.cookie.includes('_fbc=')) document.cookie = `_fbc=fb.1.${Date.now()}.${attrib.fbclid}; path=/; max-age=7776000; SameSite=Lax`;
    fbq('init', C.meta_pixel_id);
    fbq('track', 'PageView');
    if (window.__onPixel) window.__onPixel();
  }
  window.track = (ev, params = {}, eventID) => { if (pixelOn && window.fbq) fbq('track', ev, params, eventID ? { eventID } : undefined); };
  const banner = $('[data-cookie]');
  const consent = store.get('cookie_consent');
  if (C.meta_pixel_id) {
    if (consent === 'yes') loadPixel();
    else if (!consent && banner) banner.hidden = false;
  }
  if (banner) {
    $('[data-cookie-yes]', banner).onclick = () => { store.set('cookie_consent', 'yes'); banner.hidden = true; loadPixel(); };
    $('[data-cookie-no]', banner).onclick = () => { store.set('cookie_consent', 'no'); banner.hidden = true; };
  }
  $$('[data-cookie-settings]').forEach((a) => (a.onclick = (e) => { e.preventDefault(); if (banner && C.meta_pixel_id) banner.hidden = false; }));

  // Solo pagina di ringraziamento: evento Lead (deduplicato con la Conversions API lato server)
  if (document.body.dataset.page === 'grazie') {
    const fire = () => { const id = ss.get('lead_event_id'); if (id && !ss.get('lead_tracked')) { track('Lead', { content_name: 'Epilazione laser 3D' }, id); ss.set('lead_tracked', '1'); } };
    window.__onPixel = fire; if (pixelOn) fire();
  }

  // ---- WhatsApp e chiamata
  const waHref = (msg) => `https://wa.me/${C.whatsapp}?text=${encodeURIComponent(msg || C.whatsapp_messaggio || '')}`;
  function clickEvent(tipo) {
    const event_id = uuid();
    track('Contact', { content_name: tipo }, event_id);
    const body = JSON.stringify({ tipo, event_id, utm_campaign: attrib.utm_campaign, landing: attrib.landing });
    if (navigator.sendBeacon) navigator.sendBeacon('/api/click', new Blob([body], { type: 'application/json' }));
    else fetch('/api/click', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body, keepalive: true });
  }
  $$('[data-wa]').forEach((a) => { a.href = waHref(); a.target = '_blank'; a.rel = 'noopener'; a.addEventListener('click', () => clickEvent('whatsapp')); });
  $$('[data-call]').forEach((a) => a.addEventListener('click', () => clickEvent('telefono')));

  if (document.body.dataset.page) return; // le pagine secondarie si fermano qui

  // ---- Scarsità (posti del mese)
  const sc = $('[data-scarcity]');
  if (sc && C.posti_disponibili > 0) {
    const tot = Math.max(C.posti_disponibili, 10);
    const now = new Date();
    const mese = now.toLocaleDateString('it-IT', { month: 'long' });
    sc.innerHTML = `<div class="seats">${Array.from({ length: tot }, (_, i) => `<i class="${i < tot - C.posti_disponibili ? 'off' : ''}"></i>`).join('')}</div><span>Promo di ${mese}: <b>solo ${C.posti_disponibili} posti disponibili</b></span>`;
  }
  const pt = $('[data-promo-title]'); if (pt && C.promo_titolo) pt.textContent = C.promo_titolo;

  // ---- Pacchetti
  const box = $('[data-pkgs]');
  const sel = $('[data-pkg-select]');
  (C.pacchetti || []).forEach((p) => {
    const save = p.prezzo_pieno ? Math.round(p.prezzo_pieno - p.prezzo) : 0;
    const d = document.createElement('div');
    d.className = 'pkg' + (p.evidenza ? ' hot' : '');
    d.innerHTML = `${p.badge ? `<span class="badge">${p.badge}</span>` : ''}<h3></h3><p></p><div class="price"><b>${eur(p.prezzo)}</b>${p.prezzo_pieno ? `<s>${eur(p.prezzo_pieno)}</s><span class="save">Risparmi ${eur(save)}</span>` : ''}</div><a href="#prenota" class="btn ${p.evidenza ? 'btn-main' : 'btn-ghost-dark'} btn-block">Voglio questa promo</a>`;
    $('h3', d).textContent = p.nome; $('p', d).textContent = p.dettaglio || '';
    $('a', d).addEventListener('click', () => { if (sel) sel.value = p.nome; track('ViewContent', { content_name: p.nome, value: p.prezzo, currency: 'EUR' }); });
    box && box.appendChild(d);
    if (sel) { const o = document.createElement('option'); o.value = p.nome; o.textContent = `${p.nome} – ${eur(p.prezzo)}`; sel.appendChild(o); }
  });

  // ---- Zone (chip)
  const zb = $('[data-zone]');
  (C.zone || []).forEach((z) => { const l = document.createElement('label'); l.innerHTML = `<input type="checkbox" name="zone" value=""><span></span>`; $('input', l).value = z; $('span', l).textContent = z; zb && zb.appendChild(l); });

  // ---- Barra fissa: compare dopo l'hero, sparisce sul form
  const sticky = $('.sticky');
  const form = $('#lead-form');
  const onScroll = () => {
    const formRect = $('#prenota').getBoundingClientRect();
    const formVisible = formRect.top < innerHeight && formRect.bottom > 0;
    sticky.classList.toggle('on', scrollY > 420 && !formVisible);
  };
  addEventListener('scroll', onScroll, { passive: true }); onScroll();

  // ViewContent quando si scorre metà pagina (utile per il pubblico personalizzato)
  let vc = false;
  addEventListener('scroll', () => { if (!vc && scrollY > document.body.scrollHeight * 0.4) { vc = true; track('ViewContent', { content_name: 'Landing laser - scroll 40%' }); } }, { passive: true });

  // ---- Invio form
  form.addEventListener('submit', async (e) => {
    e.preventDefault();
    const err = $('[data-err]');
    err.textContent = '';
    $$('.bad', form).forEach((x) => x.classList.remove('bad'));
    const nome = form.nome.value.trim(), tel = form.telefono.value.trim();
    if (nome.length < 2) { form.nome.classList.add('bad'); form.nome.focus(); return (err.textContent = 'Inserisci il tuo nome'); }
    if (tel.replace(/\D/g, '').length < 8) { form.telefono.classList.add('bad'); form.telefono.focus(); return (err.textContent = 'Inserisci un numero di cellulare valido'); }
    if (!form.privacy.checked) return (err.textContent = "Spunta il consenso privacy per essere ricontattata");
    const event_id = uuid();
    const data = {
      nome, telefono: tel, zone: $$('input[name=zone]:checked', form).map((i) => i.value),
      pacchetto: form.pacchetto.value, fascia: (form.querySelector('input[name=fascia]:checked') || {}).value,
      privacy: true, website: form.website.value, event_id, ...attrib,
    };
    const btn = $('button[type=submit]', form);
    btn.disabled = true; btn.textContent = 'Invio in corso…';
    try {
      const r = await fetch('/api/lead', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      const j = await r.json();
      if (!r.ok) throw new Error(j.error || 'Errore');
      ss.set('lead_event_id', event_id);
      ss.set('lead_nome', nome.split(' ')[0]);
      location.href = '/grazie';
    } catch (ex) {
      err.innerHTML = `${ex.message}. <a href="${waHref()}" target="_blank" rel="noopener">Scrivici su WhatsApp</a>`;
      btn.disabled = false; btn.textContent = 'Voglio la consulenza gratuita →';
    }
  });
  // primo contatto col form → evento per ottimizzazione
  let started = false;
  form.addEventListener('focusin', () => { if (!started) { started = true; track('InitiateCheckout', { content_name: 'Form consulenza laser' }); } });

  // scroll morbido che compensa l'header
  $$('[data-scroll]').forEach((a) => a.addEventListener('click', (e) => { e.preventDefault(); $('#prenota').scrollIntoView({ behavior: 'smooth' }); setTimeout(() => form.nome.focus({ preventScroll: true }), 600); }));
})();
