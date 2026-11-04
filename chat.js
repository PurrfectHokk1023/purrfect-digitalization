/* Purrfect Digital website chat: a floating "Chat with us" bubble that answers the same FAQ as the
   Messenger bot (fb/messenger-bot.md) instantly, matches Taglish keywords, and hands off to Messenger,
   phone or the demo form. Self-contained: injects its own CSS and markup; no network calls. */
(() => {
  if (window.__pdChat) return; window.__pdChat = true;

  const MESSENGER = 'https://m.me/61596084187287';
  const PHONE = '0961 293 1559', TEL = 'tel:+639612931559';
  const EMAIL = 'purrfecthokkaidocafe@gmail.com';
  const onHome = !/(ecommerce|leasing)\.html/.test(location.pathname);
  const DEMO_FORM = onHome ? '#demo' : './#demo';

  const a = (href, text, ext) => `<a href="${href}"${ext ? ' target="_blank" rel="noopener"' : ''}>${text}</a>`;
  const site = (path, text) => a(path, text || 'purrfectdigital.online/' + path.replace(/^\.\//, ''));

  // Each intent: chip label, keywords (lower-case; short ones match whole words only), answer HTML.
  const INTENTS = [
    { id: 'price', chip: '💸 How much?', kw: ['magkano', 'price', 'prices', 'pricing', 'presyo', 'how much', 'hm', 'cost', 'rate', 'rates', 'package', 'packages', 'promo', 'discount', 'plan', 'plans', 'starter', 'growth', 'pro'],
      a: `Our launch promo is <b>80% off</b> for our first 20 businesses 🎉<ul>
<li><b>Starter</b>: ₱3,000 setup + ₱300/month <s>₱15,000 + ₱1,500</s></li>
<li><b>Growth</b>: ₱7,000 setup + ₱700/month <s>₱35,000 + ₱3,500</s></li>
<li><b>Pro</b>: ₱12,000 setup + ₱1,200/month <s>₱60,000 + ₱6,000</s></li></ul>
The promo monthly price is for the first 12 months. Same prices for any industry. Online sellers can start <b>free</b> as a Founding Seller (5 slots). ${site(onHome ? '#pricing' : './#pricing', 'See full pricing')}` },
    { id: 'services', chip: '🧩 What do you set up?', kw: ['what can you', 'what do you', 'services', 'service', 'offer', 'features', 'feature', 'tools', 'ano', 'set up', 'setup ng', 'pos', 'inventory', 'catalog', 'booking', 'bookings', 'orders', 'reports', 'website', 'system'],
      a: `Pick one or connect them all:<ul>
<li>Online catalog + QR cards</li><li>Online orders or bookings</li><li>Messenger assistant</li>
<li>POS / front desk with receipts</li><li>Time clock + staff checklists</li><li>Sales report you can check from home</li>
<li>Inventory with low-stock alerts</li><li>Daily books + cash-up</li></ul>
If customers ask, book, order or pay, we can digitalize it: cafés, shops, salons, clinics, staycations, commercial spaces, apartments, laundries and more.` },
    { id: 'demo', chip: '▶️ Live demos', kw: ['demo', 'demos', 'sample', 'try', 'see it', 'example', 'preview', 'tour', '360'],
      a: `Yes po! Try them now, no sign-up:<ul>
<li>🛍️ ${a('demo.html', 'Online seller demo', true)}</li>
<li>🏢 ${a('leasing-demo.html', 'Leasing demo', true)}: lease a unit yourself</li>
<li>🏝️ ${a('resort-demo.html', 'Private resort demo', true)}: bookings, Airbnb sync, check-in</li>
<li>🔄 ${a('tour.html#u206', '360° tour of a unit', true)}</li></ul>
Want us to walk you through it for your business? ${a(DEMO_FORM, 'Book a free demo')}.` },
    { id: 'ecom', chip: '🛒 Online sellers', kw: ['tiktok', 'shopee', 'lazada', 'online seller', 'seller', 'sellers', 'online shop', 'live selling', 'live sell', 'mine', 'ecommerce', 'e-commerce', 'founding seller', 'reseller'],
      a: `We connect your shops into one back office: one stock count, one chat inbox, packing, returns and payouts in one place, plus live-selling "mine" comments turned into invoices.<br>✨ <b>Founding Seller</b>: 5 sellers get the starter setup <b>free</b> (no setup or monthly fee during the pilot). Pay only when you move up to Seller Growth (₱7,000 + ₱700/month) or Seller Ecosystem (₱12,000 + ₱1,200/month). ${site('ecommerce.html', 'See the e-commerce page')}` },
    { id: 'lease', chip: '🏢 Leasing', kw: ['lease', 'leasing', 'rent', 'rental', 'renta', 'paupahan', 'commercial', 'apartment', 'apartments', 'boarding', 'unit', 'units', 'tenant', 'tenants', 'building', 'space', 'spaces', 'office', 'stall', 'landlord', 'lessor'],
      a: `We put leasing online from first inquiry to renewal: unit listings with 360° tours, viewing slots and reminders, online applications and digital leases, monthly billing (rent, dues, utilities, 5% EWT), a tenant portal, repairs and renewals.<br>Launch promo: Starter ₱3,000 + ₱300/month · Growth (up to 40 units) ₱7,000 + ₱700/month · Pro (several buildings) ₱12,000 + ₱1,200/month. ${site('leasing.html', 'See the leasing page')}` },
    { id: 'time', chip: '⏱️ How long?', kw: ['how long', 'gaano katagal', 'katagal', 'weeks', 'week', 'timeline', 'kailan', 'when can', 'how soon', 'fast', 'duration'],
      a: `About <b>4 weeks</b> (Starter is about 2):<ul>
<li><b>Week 1 Discover</b>: we visit and collect your products, prices and photos.</li>
<li><b>Week 2 Get found</b>: online catalog, orders or bookings and Messenger go live.</li>
<li><b>Week 3 Run the business</b>: POS, reports, inventory and books.</li>
<li><b>Week 4 Go live</b>: we train your team on site, then do daily checks for 2 weeks.</li></ul>` },
    { id: 'where', chip: '📍 Where are you?', kw: ['saan', 'where', 'location', 'located', 'address', 'visit', 'cavite', 'dasma', 'dasmarinas', 'dasmariñas', 'bacoor', 'imus', 'manila', 'metro', 'area', 'province', 'remote', 'onsite', 'on site'],
      a: `We start in <b>Cavite</b> (Dasmariñas, Bacoor, Imus) so we can visit you in person. Outside Cavite, remote setup is possible, just ask us po.` },
    { id: 'pay', chip: '💳 How do I pay?', kw: ['pay', 'payment', 'payments', 'bayad', 'magbayad', 'gcash', 'installment', 'hulugan', 'downpayment', 'down payment', 'terms', 'cancel', 'contract', 'refund'],
      a: `Half of the setup fee at kickoff, half at handover. The care plan is billed monthly and you can cancel anytime with 30 days' notice.` },
    { id: 'equip', chip: '💻 Equipment?', kw: ['equipment', 'hardware', 'printer', 'tablet', 'computer', 'laptop', 'device', 'devices', 'gamit', 'phone lang', 'cellphone', 'techy', 'training', 'train', 'staff'],
      a: `No need to buy new equipment po. Everything runs on the phone, tablet or laptop you already have; a receipt printer is optional. Your staff get on-site training, and the screens use big buttons and plain words.` },
    { id: 'own', chip: '🔐 Who owns the data?', kw: ['own', 'owns', 'data', 'account', 'accounts', 'privacy', 'secure', 'security'],
      a: `You do. Sheets, pages and Messenger settings are created under <b>your own accounts</b> from day one.` },
    { id: 'book', chip: '🗓️ Book a free demo', kw: ['book a demo', 'free demo', 'book', 'booking a demo', 'schedule', 'appointment', 'meeting', 'meet', 'consult', 'consultation', 'interested', 'sign up', 'signup', 'avail', 'start', 'get started'],
      a: `Great! ${a(DEMO_FORM, '<b>Book your free demo here</b>')} (takes a minute). Or message us your business name, what you sell or offer, your city and a good time to talk. You can also call or Viber ${a(TEL, PHONE)}.`,
      after: 'book' },
    { id: 'human', chip: '🙋 Talk to a person', kw: ['pm', 'pm me', 'person', 'human', 'agent', 'tao', 'kausap', 'talk', 'call', 'viber', 'phone', 'number', 'contact', 'email', 'reach', 'message you', 'messenger'],
      a: `Sure po! Message us on ${a(MESSENGER, 'Messenger', true)} and a team member will reply there. You can also call or Viber ${a(TEL, PHONE)} or email ${a('mailto:' + EMAIL, EMAIL)}.`,
      after: 'human' },
  ];
  const SMALL = [
    { kw: ['hi', 'hello', 'hey', 'good morning', 'good afternoon', 'good evening', 'kumusta', 'kamusta', 'musta', 'helo', 'yo'],
      a: `Hello po! 👋 Ask me anything about Purrfect Digital, or tap a topic below.` },
    { kw: ['thanks', 'thank you', 'salamat', 'ty', 'tnx', 'thx'],
      a: `You're welcome po! 😊 Anything else? You can also ${a(DEMO_FORM, 'book a free demo')} anytime.` },
  ];
  const CHIPS = ['price', 'services', 'demo', 'book', 'human'];
  const MORE = ['ecom', 'lease', 'time', 'where', 'pay', 'equip'];

  const norm = s => s.toLowerCase().normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^a-z0-9#\s-]/g, ' ').replace(/\s+/g, ' ').trim();
  const hits = (text, kws) => kws.reduce((n, k) => {
    const kk = norm(k);
    if (!kk) return n;
    const re = kk.length <= 3 || !kk.includes(' ') ? new RegExp('(^| )' + kk.replace(/[-#]/g, '\\$&') + '( |$)') : null;
    return n + ((re ? re.test(text) : text.includes(kk)) ? (kk.includes(' ') ? 2 : 1) : 0);
  }, 0);
  function answer(raw) {
    const t = norm(raw);
    let best = null, score = 0;
    // on a tie the more specific topic wins (leasing/e-commerce > prices etc. > booking > demos/general)
    const PRI = { ecom: 4, lease: 4, price: 3, time: 3, where: 3, pay: 3, equip: 3, own: 3, book: 2 };
    for (const it of INTENTS) {
      const s = hits(t, it.kw);
      if (s > score || (s && s === score && (PRI[it.id] || 1) > (PRI[best.id] || 1))) { best = it; score = s; }
    }
    if (best) return best;
    for (const sm of SMALL) if (hits(t, sm.kw)) return { a: sm.a };
    return { a: `Sorry po, I'm a simple assistant and didn't catch that 😅 Try one of the topics below, or ${a(MESSENGER, 'message us on Messenger', true)} and a person will reply. You can also call or Viber ${a(TEL, PHONE)}.`, miss: true };
  }

  const css = `
#pdc{--o:#ff6a1a;--o2:#e2470a;--bg:#0b1729;--bg2:#0f1d33;--ink:#f1f4fb;--mut:#97a3bb;--line:rgba(148,170,210,.18);
  position:fixed;right:max(18px,env(safe-area-inset-right));bottom:max(18px,env(safe-area-inset-bottom));z-index:60;font:15px/1.5 "Figtree",system-ui,-apple-system,"Segoe UI",sans-serif;color:var(--ink)}
#pdc *{box-sizing:border-box}
#pdc .pdc-fab{width:62px;height:62px;border-radius:50%;border:0;cursor:pointer;display:grid;place-items:center;background:linear-gradient(135deg,#ff7a2e,var(--o2));box-shadow:0 14px 34px -10px rgba(255,106,26,.75),inset 0 1px 0 rgba(255,255,255,.3);transition:transform .2s}
#pdc .pdc-fab:hover{transform:translateY(-2px) scale(1.03)}
#pdc .pdc-fab:focus-visible,#pdc button:focus-visible,#pdc a:focus-visible,#pdc input:focus-visible{outline:2px solid #38c6d9;outline-offset:3px}
#pdc .pdc-fab svg{width:28px;height:28px;color:#fff}
#pdc .pdc-fab .pdc-dot{position:absolute;top:4px;right:4px;width:13px;height:13px;border-radius:50%;background:#4fd18b;border:2px solid #05101d}
#pdc .pdc-nudge{position:absolute;right:72px;bottom:10px;white-space:nowrap;background:rgba(11,23,41,.92);border:1px solid var(--line);backdrop-filter:blur(12px);-webkit-backdrop-filter:blur(12px);padding:9px 34px 9px 14px;border-radius:14px;font-size:14px;box-shadow:0 16px 40px -16px rgba(0,0,0,.8);animation:pdcIn .3s ease}
#pdc .pdc-nudge button{position:absolute;right:6px;top:50%;transform:translateY(-50%);width:24px;height:24px;border:0;border-radius:50%;background:transparent;color:var(--mut);cursor:pointer;font-size:16px;line-height:1}
#pdc .pdc-panel{position:absolute;right:0;bottom:76px;width:min(390px,calc(100vw - 32px));height:min(600px,calc(100vh - 120px));height:min(600px,calc(100dvh - 120px));display:flex;flex-direction:column;overflow:hidden;border-radius:20px;
  background:linear-gradient(180deg,rgba(255,255,255,.05),rgba(255,255,255,.015)),var(--bg);border:1px solid var(--line);box-shadow:0 0 0 1px rgba(255,106,26,.08),0 30px 80px -24px rgba(0,0,0,.85),0 0 60px -20px rgba(255,106,26,.35);animation:pdcIn .22s ease;transform-origin:bottom right}
#pdc .pdc-panel[hidden]{display:none}
@keyframes pdcIn{from{opacity:0;transform:translateY(10px) scale(.98)}to{opacity:1;transform:none}}
#pdc header{display:flex;align-items:center;gap:12px;padding:14px 14px 14px 16px;border-bottom:1px solid var(--line);background:radial-gradient(120% 140% at 100% 0%,rgba(255,106,26,.22),transparent 60%)}
#pdc header img{width:40px;height:40px;border-radius:12px;background:#fff;padding:4px;flex:none}
#pdc header b{display:block;font-size:15.5px;letter-spacing:-.01em}
#pdc header small{display:flex;align-items:center;gap:6px;color:var(--mut);font-size:12.5px}
#pdc header small::before{content:"";width:7px;height:7px;border-radius:50%;background:#4fd18b;box-shadow:0 0 8px #4fd18b}
#pdc header .pdc-x{margin-left:auto;width:36px;height:36px;border-radius:50%;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);cursor:pointer;font-size:18px;line-height:1}
#pdc .pdc-log{flex:1;overflow-y:auto;padding:16px;display:flex;flex-direction:column;gap:10px;scroll-behavior:smooth;overscroll-behavior:contain}
#pdc .pdc-m{max-width:88%;padding:10px 13px;border-radius:16px;font-size:14.5px;overflow-wrap:anywhere}
#pdc .pdc-bot{align-self:flex-start;background:var(--bg2);border:1px solid var(--line);border-bottom-left-radius:5px}
#pdc .pdc-me{align-self:flex-end;background:linear-gradient(135deg,#ff7a2e,var(--o2));color:#fff;border-bottom-right-radius:5px}
#pdc .pdc-m ul{margin:6px 0;padding-left:18px}#pdc .pdc-m li{margin:2px 0}
#pdc .pdc-m s{color:var(--mut);font-size:12.5px;margin-left:4px}
#pdc .pdc-m a{color:#ffa36b;font-weight:600;text-underline-offset:3px}
#pdc .pdc-typing{display:inline-flex;gap:4px;padding:12px 14px}
#pdc .pdc-typing i{width:7px;height:7px;border-radius:50%;background:var(--mut);animation:pdcB 1s infinite}
#pdc .pdc-typing i:nth-child(2){animation-delay:.15s}#pdc .pdc-typing i:nth-child(3){animation-delay:.3s}
@keyframes pdcB{0%,60%,100%{opacity:.35;transform:none}30%{opacity:1;transform:translateY(-3px)}}
#pdc .pdc-chips{display:flex;flex-wrap:wrap;gap:7px;align-self:stretch}
#pdc .pdc-chips button{border:1px solid rgba(255,106,26,.38);background:rgba(255,106,26,.08);color:#ffd2b8;padding:7px 12px;border-radius:999px;font-weight:600;font-size:13px;font-family:inherit;cursor:pointer}
#pdc .pdc-chips button:hover{background:rgba(255,106,26,.2);color:#fff}
#pdc .pdc-cta{display:flex;flex-wrap:wrap;gap:8px}
#pdc .pdc-cta a{display:inline-flex;align-items:center;gap:6px;text-decoration:none;font-weight:600;font-size:13.5px;font-family:inherit;padding:9px 14px;border-radius:999px}
#pdc .pdc-cta .pri{background:linear-gradient(135deg,#ff7a2e,var(--o2));color:#fff}
#pdc .pdc-cta .sec{border:1px solid var(--line);color:var(--ink);background:rgba(255,255,255,.04)}
#pdc form{display:flex;gap:8px;padding:12px;border-top:1px solid var(--line);background:rgba(5,16,29,.6)}
#pdc input{flex:1;min-width:0;height:44px;border-radius:12px;border:1px solid var(--line);background:rgba(255,255,255,.04);color:var(--ink);padding:0 14px;font-size:16px;font-family:inherit}
#pdc input::placeholder{color:#7f8aa3}
#pdc form button{width:44px;height:44px;border-radius:12px;border:0;cursor:pointer;background:linear-gradient(135deg,#ff7a2e,var(--o2));color:#fff;display:grid;place-items:center;flex:none}
#pdc form button svg{width:20px;height:20px}
#pdc .pdc-foot{padding:0 12px 10px;font-size:11.5px;color:var(--mut);text-align:center;background:rgba(5,16,29,.6)}
#pdc .pdc-foot a{color:var(--mut)}
@media (max-width:520px){#pdc .pdc-panel{position:fixed;inset:auto 0 0 0;width:100%;height:min(86vh,640px);height:min(86dvh,640px);border-radius:20px 20px 0 0;padding-bottom:env(safe-area-inset-bottom)}
  #pdc .pdc-nudge{display:none}#pdc.pdc-open .pdc-fab{display:none}}
@media (prefers-reduced-motion:reduce){#pdc *{animation:none!important;transition:none!important}}
`;
  const style = document.createElement('style'); style.textContent = css; document.head.appendChild(style);

  const root = document.createElement('div'); root.id = 'pdc';
  root.innerHTML = `
<div class="pdc-panel" role="dialog" aria-modal="false" aria-label="Chat with Purrfect Digital" hidden>
  <header><img src="img/mark-64.png" alt="" width="40" height="40"><div><b>Purrfect Digital</b><small>Instant answers, any hour</small></div>
    <button class="pdc-x" type="button" aria-label="Close chat">✕</button></header>
  <div class="pdc-log" aria-live="polite"></div>
  <form autocomplete="off"><input type="text" name="q" placeholder="Type a question… (e.g. magkano?)" aria-label="Your question" maxlength="300">
    <button type="submit" aria-label="Send"><svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M5 12h14M13 6l6 6-6 6"/></svg></button></form>
  <div class="pdc-foot">Automated answers · ${a(MESSENGER, 'Talk to a person', true)}</div>
</div>
<button class="pdc-fab" type="button" aria-label="Chat with us" aria-expanded="false"><span class="pdc-dot" aria-hidden="true"></span>
  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z"/><path d="M8.5 11h.01M12 11h.01M15.5 11h.01" stroke-width="3"/></svg></button>`;
  document.body.appendChild(root);

  const panel = root.querySelector('.pdc-panel'), fab = root.querySelector('.pdc-fab'), log = root.querySelector('.pdc-log');
  const form = root.querySelector('form'), input = form.querySelector('input');
  const reduce = matchMedia('(prefers-reduced-motion: reduce)').matches;
  let started = false, busy = false;
  const store = { get: k => { try { return sessionStorage.getItem(k); } catch (e) { return null; } }, set: (k, v) => { try { sessionStorage.setItem(k, v); } catch (e) {} } };

  const scroll = () => { log.scrollTop = log.scrollHeight; };
  function add(html, who) { const m = document.createElement('div'); m.className = 'pdc-m ' + (who === 'me' ? 'pdc-me' : 'pdc-bot'); m.innerHTML = html; log.appendChild(m); scroll(); return m; }
  function chips(ids) {
    log.querySelectorAll('.pdc-chips').forEach(c => c.remove());
    const box = document.createElement('div'); box.className = 'pdc-chips';
    ids.forEach(id => { const it = INTENTS.find(i => i.id === id); const b = document.createElement('button'); b.type = 'button'; b.textContent = it.chip; b.onclick = () => ask(it.chip.replace(/^\S+\s/, ''), it); box.appendChild(b); });
    log.appendChild(box); scroll();
  }
  function ctas(kind) {
    const box = document.createElement('div'); box.className = 'pdc-cta';
    box.innerHTML = kind === 'human'
      ? `<a class="pri" href="${MESSENGER}" target="_blank" rel="noopener">💬 Open Messenger</a><a class="sec" href="${TEL}">📞 Call ${PHONE}</a>`
      : `<a class="pri" href="${DEMO_FORM}">🗓️ Book a free demo</a><a class="sec" href="${MESSENGER}" target="_blank" rel="noopener">💬 Messenger</a>`;
    box.querySelectorAll('a[href^="#"],a[href^="./#"]').forEach(l => l.addEventListener('click', () => close()));
    log.appendChild(box); scroll();
  }
  function reply(res) {
    const t = document.createElement('div'); t.className = 'pdc-m pdc-bot pdc-typing'; t.innerHTML = '<i></i><i></i><i></i>'; log.appendChild(t); scroll();
    busy = true;
    setTimeout(() => {
      t.remove(); add(res.a);
      log.lastElementChild.querySelectorAll('a[href^="#"],a[href^="./#"]').forEach(l => l.addEventListener('click', () => close()));
      if (res.after || res.miss) ctas(res.after === 'book' ? 'book' : 'human');
      const seen = res.id ? [res.id] : [];
      chips((res.id === 'price' || res.id === 'services' ? MORE : CHIPS).filter(id => !seen.includes(id)).slice(0, 6));
      busy = false;
    }, reduce ? 0 : 450 + Math.min(500, res.a.length));
  }
  function ask(text, intent) {
    if (busy || !text.trim()) return;
    add(text.replace(/[<>&]/g, c => ({ '<': '&lt;', '>': '&gt;', '&': '&amp;' }[c])), 'me');
    reply(intent || answer(text));
  }
  function open() {
    panel.hidden = false; root.classList.add('pdc-open'); fab.setAttribute('aria-expanded', 'true'); fab.setAttribute('aria-label', 'Close chat');
    root.querySelector('.pdc-nudge')?.remove(); store.set('pdcNudged', '1');
    if (!started) {
      started = true;
      add(`Hi po! 👋 I'm the Purrfect Digital assistant. We set up online orders, bookings, GCash payments, POS and sales reports for small businesses, live in 4 weeks.<br>🎉 <b>80% off</b> for our first 20 businesses. What would you like to know?`);
      chips(CHIPS);
    }
    setTimeout(() => input.focus({ preventScroll: true }), 50);
  }
  function close() { panel.hidden = true; root.classList.remove('pdc-open'); fab.setAttribute('aria-expanded', 'false'); fab.setAttribute('aria-label', 'Chat with us'); }

  fab.addEventListener('click', () => (panel.hidden ? open() : close()));
  root.querySelector('.pdc-x').addEventListener('click', () => { close(); fab.focus(); });
  form.addEventListener('submit', e => { e.preventDefault(); const v = input.value; input.value = ''; ask(v); });
  document.addEventListener('keydown', e => { if (e.key === 'Escape' && !panel.hidden) { close(); fab.focus(); } });

  // one gentle nudge per visit, after 9 s, unless the visitor already opened the chat
  if (!store.get('pdcNudged')) setTimeout(() => {
    if (!panel.hidden || store.get('pdcNudged')) return;
    const n = document.createElement('div'); n.className = 'pdc-nudge'; n.innerHTML = 'Questions? Chat with us 👋<button type="button" aria-label="Dismiss">×</button>';
    n.addEventListener('click', e => { if (e.target.tagName === 'BUTTON') { n.remove(); store.set('pdcNudged', '1'); } else open(); });
    root.appendChild(n); store.set('pdcNudged', '1');
  }, 9000);

  window.pdChat = { open, ask: t => { open(); ask(t); }, answer: t => (answer(t).id || (answer(t).miss ? 'miss' : 'small')) };
})();
