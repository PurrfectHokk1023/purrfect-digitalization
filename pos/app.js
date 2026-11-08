'use strict';
/* Purrfect POS (Purrfect Digitalization, Nov 2026): an offline point of sale any small shop can use, sold for ₱299 on
   purrfectdigital.online/point-of-sale.html. Settings, items, photos and open tickets live in localStorage; receipts in
   IndexedDB ("purrfect-pos"). Nothing leaves the device except the one-time license check, unless the owner turns on the
   online back office (Settings): then receipts, the time clock and items are copied to the shop's private back office (office.html).
   New versions install themselves: sw.js asks the server for fresh files, and the page reloads when nothing is in progress.
   Until a key is activated the app runs as a demo: sample items, a banner, and DEMO printed on receipts.
   The café's own POS (clients/purrfect-hokkaido/pos/) shares this origin and uses "pos-*" keys, so every key here
   starts with "ppos-". */

const API = ((location.hostname === '127.0.0.1' || location.hostname === 'localhost') && (() => { try { return localStorage.getItem('pd-api'); } catch (e) { return null; } })())
  || 'https://script.google.com/macros/s/AKfycbzLxG6AdWT0htxRveNG7Ur-wyLq063d_GvQweaE492pvUSCA2aOi1_QTaO0aiEtNWPL/exec';   // Purrfect Digitalization web app (PosOrders.gs); a local test server can stand in on localhost
const BUY = 'https://purrfectdigital.online/point-of-sale.html#buy';
const APP_V = '2026-11-08.1';   // shown in Settings; change it with CACHE in make_pos_app.py
const PROMO = Date.now() < Date.UTC(2026, 11, 31, 16);   // year-end promo: 40% off (₱179) until 31 Dec 2026, 11:59 PM Manila
const PRICE = PROMO ? '₱179' : '₱299';
const WS = 'ws://127.0.0.1:40213/';   // "Server for RawBT" app on Android
const $ = s => document.querySelector(s);
const store = {get: k => { try { return localStorage.getItem(k); } catch (e) { return null; } },
               set: (k, v) => { try { localStorage.setItem(k, v); return true; } catch (e) { return false; } },
               del: k => { try { localStorage.removeItem(k); } catch (e) {} },
               keys: () => { try { return Object.keys(localStorage); } catch (e) { return []; } }};
const jget = (k, d = null) => { try { const v = JSON.parse(store.get(k)); return v == null ? d : v; } catch (e) { return d; } };
const jset = (k, v) => store.set(k, JSON.stringify(v));
const r2 = n => Math.round((Number(n) || 0) * 100) / 100;
const peso = n => (n < 0 ? '−' : '') + '₱' + Math.abs(r2(n)).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const uid = () => Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const el = (tag, props = {}, kids = []) => { const e = Object.assign(document.createElement(tag), props); e.append(...kids.filter(k => k != null && k !== false)); return e; };
const timeLabel = d => new Date(d).toLocaleTimeString('en-PH', {hour: 'numeric', minute: '2-digit'});
const dayKey = d => { const x = new Date(d); return x.getFullYear() + '-' + String(x.getMonth() + 1).padStart(2, '0') + '-' + String(x.getDate()).padStart(2, '0'); };
const dayLabel = k => new Date(k + 'T12:00:00').toLocaleDateString('en-PH', {weekday: 'short', month: 'short', day: 'numeric', year: 'numeric'});
const plural = (n, w) => n + ' ' + w + (n === 1 ? '' : 's');
const topVeil = () => { const vs = document.querySelectorAll('.veil'); return vs[vs.length - 1]; };

// ---- settings, license, items -------------------------------------------------------------------------
const DEFAULTS = {shop: {name: '', lines: [], tin: '', footer: 'Thank you! Please come again.', notOfficial: true},
  logo: '', paper: '32', printer: 'auto', printerName: '', copies: 1, autoprint: true, cashier: '', prefix: '',
  pays: ['Cash', 'GCash', 'Maya', 'Card'], srMode: 'all', lowDefault: 5, pin: null, catOrder: [], cam: ''};
const PAY_TYPES = ['Cash', 'GCash', 'Maya', 'Card', 'Bank transfer', 'Other'];
let S = Object.assign({}, DEFAULTS, jget('ppos-settings', {}));
S.shop = Object.assign({}, DEFAULTS.shop, S.shop || {});
const saveS = () => { if (!jset('ppos-settings', S)) toast('This device is out of storage: settings were not saved.'); };

let LIC = jget('ppos-license');
const licensed = () => !!(LIC && LIC.key);
const DEV = store.get('ppos-dev') || (() => { const d = crypto.randomUUID ? crypto.randomUUID().replace(/-/g, '') : uid() + uid(); store.set('ppos-dev', d); return d; })();

const COLORS = ['#6b7280', '#d32f2f', '#c2185b', '#e65100', '#c49000', '#2e7d32', '#1565c0', '#6a1b9a', '#00796b'];
const SAMPLE = [
  ['Coffee', '#e65100', [['Americano', 90], ['Café Latte', 120], ['Iced Spanish Latte', 140], ['Hot Chocolate', 110]]],
  ['Food', '#2e7d32', [['Ham & Cheese Sandwich', 150], ['Chicken Rice Bowl', 165], ['Fries', 80], ['Ensaymada', 55, 12]]],
  ['Drinks', '#1565c0', [['Bottled Water', 25, 3], ['Iced Tea', 45], ['Soda in Can', 50]]],
  ['Add-ons', '#6a1b9a', [['Extra Shot', 30], ['Oat Milk', 35]]],
];
let ITEMS = jget('ppos-items');
if (!Array.isArray(ITEMS)) {
  ITEMS = SAMPLE.flatMap(([cat, color, xs]) => xs.map(([name, price, stock]) =>
    ({id: uid(), name, cat, price, color, sample: true, ...(stock != null ? {track: true, stock, low: 5} : {})})));
  jset('ppos-items', ITEMS);
}
let IDX = {}, CATS = [];
function refreshItems() {
  IDX = Object.fromEntries(ITEMS.map(i => [i.id, i]));
  const seen = [...new Set(ITEMS.map(i => i.cat || 'Other'))];
  CATS = [...S.catOrder.filter(c => seen.includes(c)), ...seen.filter(c => !S.catOrder.includes(c))];
}
function saveItems() { if (!jset('ppos-items', ITEMS)) toast('This device is out of storage: items were not saved. Remove some photos.'); refreshItems(); syncSoon(15000); }
const photoOf = id => store.get('ppos-ph-' + id) || '';
refreshItems();

// ---- receipts in IndexedDB --------------------------------------------------------------------------------
const db = (() => {
  let opening = null, mem = null;   // mem = in-memory fallback when IndexedDB is blocked (some private windows)
  const open = () => opening || (opening = new Promise((res, rej) => {
    const r = indexedDB.open('purrfect-pos', 1);
    r.onupgradeneeded = () => { const s = r.result.createObjectStore('receipts', {keyPath: 'no'}); s.createIndex('at', 'at'); };
    r.onsuccess = () => res(r.result);
    r.onerror = () => rej(r.error);
  }).catch(e => { mem = new Map(); toast('Receipts cannot be saved in this browser window (private mode?).'); return null; }));
  const run = async (mode, fn) => {
    const d = await open();
    if (!d) return fn(null);
    return new Promise((res, rej) => {
      const t = d.transaction('receipts', mode), req = fn(t.objectStore('receipts'));
      t.oncomplete = () => res(req && 'result' in req ? req.result : undefined);
      t.onerror = () => rej(t.error); t.onabort = () => rej(t.error);
    });
  };
  const memAll = () => [...mem.values()].sort((a, b) => a.at < b.at ? -1 : 1);
  return {
    put: r => run('readwrite', s => s ? s.put(r) : void mem.set(r.no, r)),
    putAll: rs => run('readwrite', s => { for (const r of rs) s ? s.put(r) : mem.set(r.no, r); }),
    get: no => run('readonly', s => s ? s.get(no) : {result: mem.get(no)}),
    range: (from, to) => run('readonly', s => s ? s.index('at').getAll(IDBKeyRange.bound(from, to, false, true)) : {result: memAll().filter(r => r.at >= from && r.at < to)}),
    all: () => run('readonly', s => s ? s.getAll() : {result: memAll()}),
    count: () => run('readonly', s => s ? s.count() : {result: mem.size}),
  };
})();

// ---- online back office (opt-in) ------------------------------------------------------------------------------
// "Online back office" in Settings (licensed copies, off by default): the register copies its receipts, time clock, items and stock to
// the shop's private back office (BackOffice.gs in the web app), and the owner checks sales, staff and net profit from any phone on
// office.html. Off, nothing leaves this device but the license check. Receipts to send wait in ppos-sync-q (their numbers); each send
// carries up to 150 of them, the last 14 days of the time clock and every item, then drops what it sent from the queue.
const SYNC_Q = 'ppos-sync-q', SYNC_AT = 'ppos-sync-at';
let syncTimer = null, syncing = false;
function officeOn() { return licensed() && !!S.office; }
function queueSync(no) { if (!officeOn()) return; const q = jget(SYNC_Q, []); if (!q.includes(no)) q.push(no); jset(SYNC_Q, q); syncSoon(); }
function syncSoon(ms) { if (!officeOn()) return; clearTimeout(syncTimer); syncTimer = setTimeout(syncNow, ms ?? 4000); }
async function syncNow() {
  if (!officeOn() || syncing) return;
  if (!navigator.onLine) { syncSoon(60000); return; }
  syncing = true;
  const nos = jget(SYNC_Q, []).slice(0, 150);
  try {
    const receipts = [];
    for (const no of nos) { const r = await db.get(no); if (r && !r.demo) receipts.push(slimSale(r)); }
    const since = new Date(Date.now() - 14 * 864e5).toISOString(), who = Object.fromEntries(STAFF.map(x => [x.id, x.name]));
    const r = await fetch(API, {method: 'POST', body: JSON.stringify({pos: 'sync', key: LIC.key, dev: DEV, shop: S.shop.name, receipts,
      punches: PUNCH.filter(x => (x.out || x.in) >= since).map(x => ({id: x.id, staff: who[x.staff] || 'Staff', in: x.in, out: x.out || ''})),
      items: ITEMS.filter(i => !i.sample).map(i => ({id: i.id, name: i.name, cat: i.cat, price: i.price, cost: i.cost ?? '', track: !!i.track,
        stock: i.track ? i.stock : '', low: i.track ? (i.low ?? S.lowDefault) : ''}))})}).then(x => x.json());
    if (!r || !r.ok) throw new Error((r && r.error) || 'Not accepted');
    const left = jget(SYNC_Q, []).filter(no => !nos.includes(no));
    jset(SYNC_Q, left); store.set(SYNC_AT, new Date().toISOString()); store.del('ppos-sync-err');
    if (left.length) syncSoon(1500);
  } catch (e) { store.set('ppos-sync-err', String((e && e.message) || e).slice(0, 80)); syncSoon(120000); }
  finally { syncing = false; }
}
function slimSale(r) {   // what the back office needs of a receipt: no Sr/PWD names or IDs, no payment reference numbers
  return {no: r.no, at: r.at, type: r.type, sub: r.sub, disc: r.disc || 0, total: r.total, refunded: r.refunded || 0, voided: !!r.voided, cashier: r.cashier || '',
    qty: r.qty, refundedQty: r.refundedQty || {},
    lines: r.lines.map(l => ({id: l.id, name: l.name, qty: l.qty, price: l.price, cost: l.cost ?? (IDX[l.id] && IDX[l.id].cost != null ? IDX[l.id].cost : '')}))};
}
setInterval(() => syncNow(), 5 * 60000);   // keeps the time clock and stock fresh in the back office too
window.addEventListener('online', () => syncSoon(1000));

// ---- ticket -------------------------------------------------------------------------------------------
const SAVED = jget('ppos-ticket', {});   // the ticket survives a closed app or a reload
let ticket = Array.isArray(SAVED.ticket) ? SAVED.ticket : [];   // [{id, qty}]
let disc = SAVED.disc || null;   // {kind: 'sr', id, name, mode: 'all'|'top'} | {kind: 'pct'|'amt', value, reason}

function totals() {
  let sub = 0, qty = 0, top = 0;
  for (const l of ticket) { const it = IDX[l.id]; if (!it) continue; sub += it.price * l.qty; qty += l.qty; top = Math.max(top, it.price); }
  sub = r2(sub);
  let off = 0, label = '';
  if (disc && sub > 0) {
    if (disc.kind === 'sr') { off = disc.mode === 'top' ? top * 0.2 : sub * 0.2; label = 'Sr/PWD 20%' + (disc.mode === 'top' ? ' (1 item)' : ''); }
    else if (disc.kind === 'pct') { off = sub * disc.value / 100; label = 'Discount ' + disc.value + '%'; }
    else { off = Math.min(disc.value, sub); label = 'Discount'; }
    if (disc.reason) label += ' · ' + disc.reason;
  }
  off = r2(off);
  return {sub, disc: off, total: r2(sub - off), qty, label};
}

const catSel = $('#cat');
function buildCats() {
  const cur = catSel.value || store.get('ppos-cat') || '';
  catSel.replaceChildren(new Option('All items', ''), ...CATS.map(c => new Option(c, c)));
  catSel.value = CATS.includes(cur) ? cur : '';
}
catSel.onchange = () => { store.set('ppos-cat', catSel.value); renderGrid(); };
$('#q').oninput = renderGrid;
const sortItems = xs => xs.sort((a, b) => CATS.indexOf(a.cat) - CATS.indexOf(b.cat) || a.name.localeCompare(b.name));

function renderGrid() {
  const q = $('#q').value.trim().toLowerCase(), c = catSel.value, g = $('#grid');
  const inT = {}; ticket.forEach(l => { inT[l.id] = (inT[l.id] || 0) + l.qty; });
  const list = sortItems(ITEMS.filter(i => !i.hidden && (!c || i.cat === c) && (!q || (i.name + ' ' + i.cat).toLowerCase().includes(q))));
  g.replaceChildren(...list.map(i => {
    const ph = photoOf(i.id), b = el('button', {className: 'tile'});
    b.style.setProperty('--c', i.color || COLORS[0]);
    b.setAttribute('aria-label', i.name + ', ' + peso(i.price));
    if (ph) b.append(el('img', {src: ph, alt: '', loading: 'lazy'}));
    b.append(el('span', {className: 'nm'}, [i.name, el('small', {textContent: peso(i.price)})]));
    if (inT[i.id]) b.append(el('span', {className: 'q', textContent: inT[i.id]}));
    if (i.track) {
      const left = r2(i.stock);
      if (left <= 0) { b.classList.add('out'); b.append(el('span', {className: 'st out', textContent: 'OUT'})); }
      else if (left <= (i.low ?? S.lowDefault)) b.append(el('span', {className: 'st', textContent: left + ' left'}));
    }
    b.onclick = () => add(i.id);
    return b;
  }));
  if (!list.length) g.append(el('p', {className: 'empty', textContent: ITEMS.length ? 'No items match.' : 'No items yet. Tap the pencil above to add your first item.'}));
}

function add(id) {
  const it = IDX[id], l = ticket.find(x => x.id === id);
  if (it.track && r2(it.stock) - (l ? l.qty : 0) <= 0) toast(it.name + ' is out of stock (added anyway)');
  if (l) l.qty++; else ticket.push({id, qty: 1});
  render();
}

function render() {
  ticket = ticket.filter(l => IDX[l.id]);
  if (!ticket.length) disc = null;
  jset('ppos-ticket', {ticket, disc});
  const t = totals(), box = $('#lines');
  box.replaceChildren();
  if (!ticket.length) box.append(el('p', {className: 'none', textContent: 'Tap items to add them to the ticket.'}));
  ticket.forEach((l, idx) => {
    const it = IDX[l.id];
    const b = el('button', {className: 'line'}, [
      el('span', {}, [el('b', {textContent: it.name}), l.qty > 1 ? el('span', {className: 'x', textContent: ' × ' + l.qty}) : null]),
      el('span', {className: 'amt', textContent: peso(it.price * l.qty)})]);
    b.onclick = () => editLine(idx);
    box.append(b);
  });
  const sum = $('#sum'); sum.replaceChildren();
  const row = (k, v, cls) => sum.append(el('div', {className: cls || ''}, [el('span', {textContent: k}), el('span', {textContent: v})]));
  if (t.disc) { row('Subtotal', peso(t.sub)); row(t.label, '−' + peso(t.disc), 'disc'); }
  row('Total', peso(t.total), 'tot');
  $('#cTot').textContent = peso(t.total);
  $('#mTot').textContent = peso(t.total) + (t.qty ? ' · ' + t.qty + (t.qty === 1 ? ' item' : ' items') : '');
  $('#chargeBtn').disabled = !ticket.length;
  $('#discBtn').classList.toggle('on', !!disc);
  $('#discBtn').textContent = disc ? 'Remove discount' : 'Discount';
  renderGrid();
}

// ---- sheets -------------------------------------------------------------------------------------------
function sheet(title, build, cls) {
  const v = el('div', {className: 'veil'});
  const s = el('div', {className: 'sheet' + (cls ? ' ' + cls : '')});
  s.setAttribute('role', 'dialog'); s.setAttribute('aria-modal', 'true'); s.setAttribute('aria-label', title);
  const x = el('button', {className: 'btn o sm', textContent: 'Close'});
  const bd = el('div', {className: 'bd'});
  s.append(el('header', {}, [el('h2', {textContent: title}), x]), bd); v.append(s); document.body.append(v);
  const prev = document.activeElement;
  const close = () => { v.remove(); document.removeEventListener('keydown', esc); if (prev && prev.focus) prev.focus(); };
  const esc = e => { if (e.key === 'Escape' && topVeil() === v) close(); };
  document.addEventListener('keydown', esc);
  x.onclick = close; v.onclick = e => { if (e.target === v) close(); };
  build(bd, close, x);
  s.tabIndex = -1;   // keyboard focus starts inside the dialog without a ring on its Close button
  if (!s.contains(document.activeElement)) s.focus({preventScroll: true});
  return close;
}
function toast(msg) { const t = el('div', {className: 'toast', textContent: msg}); t.setAttribute('role', 'status'); document.body.append(t); setTimeout(() => t.remove(), 3400); }
function confirmBox(title, text, yesText, onYes) {
  sheet(title, (bd, close) => {
    const yes = el('button', {className: 'btn g', textContent: yesText}), no = el('button', {className: 'btn o', textContent: 'Cancel'});
    yes.onclick = () => { close(); onYes(); }; no.onclick = close;
    bd.append(el('p', {textContent: text}), el('div', {className: 'row2'}, [no, yes]));
  });
}

function editLine(idx) {
  const l = ticket[idx], it = IDX[l.id];
  sheet(it.name, (bd, close) => {
    let q = l.qty;
    const out = el('output', {textContent: q});
    const minus = el('button', {textContent: '−', ariaLabel: 'One less'}), plus = el('button', {textContent: '+', ariaLabel: 'One more'});
    minus.onclick = () => { q = Math.max(1, q - 1); out.textContent = q; }; plus.onclick = () => { q++; out.textContent = q; };
    const save = el('button', {className: 'btn g', textContent: 'Save'}), del = el('button', {className: 'btn o danger', textContent: 'Remove item'});
    save.onclick = () => { l.qty = q; render(); close(); };
    del.onclick = () => { ticket.splice(idx, 1); render(); close(); };
    bd.append(el('p', {className: 'note', textContent: peso(it.price) + ' each · ' + it.cat}), el('div', {className: 'stepper'}, [minus, out, plus]), el('div', {className: 'row2'}, [del, save]));
  });
}

function showDiscount() {
  if (!ticket.length) return;
  if (disc) { disc = null; render(); toast('Discount removed'); return; }
  sheet('Discount', (bd, close) => {
    const id = el('input', {placeholder: 'ID number', autocomplete: 'off'}), nm = el('input', {placeholder: 'Full name', autocomplete: 'off'});
    const mode = el('select', {}, [new Option('The whole ticket', 'all'), new Option('One piece of the highest-priced item', 'top')]); mode.value = S.srMode;
    const err = el('p', {className: 'warn'}), sr = el('button', {className: 'btn g', textContent: 'Apply Sr/PWD 20%'});
    sr.onclick = () => {
      const v = id.value.trim();
      if (v.replace(/[^A-Za-z0-9]/g, '').length < 4) { err.textContent = 'Type the full ID number.'; id.focus(); return; }
      disc = {kind: 'sr', id: v, name: nm.value.trim(), mode: mode.value}; close(); render();
    };
    const kind = el('select', {ariaLabel: 'Discount type'}, [new Option('% off', 'pct'), new Option('₱ off', 'amt')]);
    const val = el('input', {type: 'number', inputMode: 'decimal', min: 0, step: '0.01', placeholder: '10', ariaLabel: 'Discount amount'});
    const why = el('input', {placeholder: 'Reason (optional), e.g. Promo', maxLength: 40});
    const err2 = el('p', {className: 'warn'}), other = el('button', {className: 'btn o', textContent: 'Apply discount'});
    other.onclick = () => {
      const v = Number(val.value);
      if (!(v > 0) || (kind.value === 'pct' && v > 100)) { err2.textContent = kind.value === 'pct' ? 'Enter 1 to 100.' : 'Enter an amount.'; val.focus(); return; }
      disc = {kind: kind.value, value: r2(v), reason: why.value.trim()}; close(); render();
    };
    bd.append(el('h3', {textContent: 'Senior citizen or PWD'}),
      el('p', {className: 'note', textContent: 'Check the ID first. The ID number and name print on the receipt for the customer’s signature.'}),
      el('label', {}, ['SC / PWD ID number', id]), el('label', {}, ['Name', nm]), el('label', {}, ['The 20% applies to', mode]), err, sr,
      el('h3', {textContent: 'Other discount'}), el('div', {className: 'row2'}, [kind, val]), why, err2, other);
    setTimeout(() => id.focus(), 60);
  });
}
$('#discBtn').onclick = showDiscount;
$('#clearBtn').onclick = () => { if (ticket.length) confirmBox('Clear this ticket?', 'All items on the ticket will be removed.', 'Clear ticket', newSale); };
function newSale() { ticket = []; disc = null; render(); $('#right').classList.remove('open'); }

// ---- charge -------------------------------------------------------------------------------------------
$('#chargeBtn').onclick = () => {
  const t = totals();
  sheet('Charge', (bd, close) => {
    const cash = el('input', {type: 'number', inputMode: 'decimal', min: 0, step: '0.01', placeholder: t.total.toFixed(2)});
    const ch = el('p', {className: 'note'});
    const upd = () => { const v = Number(cash.value || 0); ch.className = v && v < t.total ? 'warn' : 'note'; ch.textContent = !v ? 'Leave empty for the exact amount.' : v < t.total ? 'Short by ' + peso(t.total - v) : 'Change ' + peso(v - t.total); };
    cash.oninput = upd; upd();
    const notes = [t.total, ...[20, 50, 100, 200, 500, 1000].filter(n => n > t.total)].slice(0, 4);
    const quick = el('div', {className: 'quick'}, notes.map((n, i) => { const b = el('button', {textContent: i === 0 ? 'Exact' : '₱' + n}); b.onclick = () => { cash.value = n; upd(); }; return b; }));
    const ref = el('input', {placeholder: 'Reference no. for GCash, Maya or card (optional)', maxLength: 40, autocomplete: 'off'});
    const pay = type => {
      const tendered = type === 'Cash' ? (Number(cash.value || 0) || t.total) : t.total;
      if (type === 'Cash' && tendered < t.total) { cash.focus(); upd(); return; }
      close(); done(type, tendered, type === 'Cash' ? '' : ref.value.trim());
    };
    const pays = el('div', {className: 'pays'}, ['Cash', ...S.pays.filter(p => p !== 'Cash')].map(p => { const b = el('button', {className: 'btn g', textContent: p}); b.onclick = () => pay(p); return b; }));
    bd.append(el('div', {className: 'big'}, [peso(t.total), el('small', {textContent: t.disc ? 'includes ' + t.label + ' −' + peso(t.disc) : 'Total amount due'})]),
      el('label', {}, ['Cash received', cash]), quick, ch, ...(S.pays.some(p => p !== 'Cash') ? [ref] : []), pays);
  });
};

function nextNo() {
  const d = new Date(), ymd = String(d.getFullYear()).slice(2) + String(d.getMonth() + 1).padStart(2, '0') + String(d.getDate()).padStart(2, '0');
  const key = 'ppos-seq-' + ymd, n = Number(store.get(key) || 0) + 1; store.set(key, String(n));
  return (S.prefix ? S.prefix + '-' : '') + ymd + '-' + String(n).padStart(3, '0');
}

async function done(type, tendered, ref) {
  const t = totals();
  let no = nextNo();
  for (let i = 0; i < 50 && await db.get(no); i++) no = nextNo();   // never overwrite a saved receipt
  const sale = {no, at: new Date().toISOString(), type, ref, tendered: r2(tendered), change: r2(tendered - t.total),
    sub: t.sub, disc: t.disc, discLabel: t.label, total: t.total, qty: t.qty, cashier: S.cashier,
    senior: disc && disc.kind === 'sr' ? {id: disc.id, name: disc.name} : null, demo: !licensed(),
    lines: ticket.map(l => ({id: l.id, name: IDX[l.id].name, price: IDX[l.id].price, qty: l.qty, ...(IDX[l.id].cost != null ? {cost: IDX[l.id].cost} : {})}))};
  const low = [];
  for (const l of sale.lines) {
    const it = IDX[l.id];
    if (it && it.track) { it.stock = r2(r2(it.stock) - l.qty); if (it.stock <= (it.low ?? S.lowDefault)) low.push(it.name + ' (' + Math.max(0, it.stock) + ' left)'); }
  }
  if (sale.lines.some(l => IDX[l.id] && IDX[l.id].track)) saveItems();
  try { await db.put(sale); queueSync(sale.no); } catch (e) { toast('The receipt could not be saved on this device: ' + (e && e.message)); }
  if (navigator.storage && navigator.storage.persist) navigator.storage.persist().catch(() => {});
  newSale();
  if (S.autoprint) printSale(sale);
  sheet('Sale complete', (bd, close, x) => {
    x.textContent = 'New sale';
    const again = el('button', {className: 'btn o', textContent: 'Print receipt'}), ns = el('button', {className: 'btn g', textContent: 'New sale'});
    again.onclick = () => printSale(sale); ns.onclick = close;
    bd.append(el('div', {className: 'big'}, [type === 'Cash' ? peso(sale.change) : peso(sale.total),
      el('small', {textContent: type === 'Cash' ? 'Change · cash received ' + peso(sale.tendered) : 'Paid by ' + type + (ref ? ' · ref ' + ref : '')})]),
      el('p', {className: 'note', textContent: 'Receipt #' + sale.no + (low.length ? ' · Low stock: ' + low.join(', ') : '')}),
      el('div', {className: 'row2'}, [again, ns]));
    setTimeout(() => ns.focus(), 60);
  });
}

// ---- receipt text + printing ----------------------------------------------------------------------------
const ascii = s => String(s).replace(/₱/g, 'P').replace(/×/g, 'x').replace(/[    ]/g, ' ').replace(/[‘’]/g, "'").replace(/[“”]/g, '"')
  .replace(/[–—−]/g, '-').replace(/·/g, '-').normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[^\x20-\x7e\n]/g, '');
const lr = (l, r, w) => { l = ascii(l); r = ascii(r); return l.slice(0, Math.max(0, w - r.length - 1)).padEnd(w - r.length) + r; };
const ctr = (s, w) => { s = ascii(s).slice(0, w); return ' '.repeat(Math.floor((w - s.length) / 2)) + s; };
const money = n => (n < 0 ? '-' : '') + 'P' + Math.abs(r2(n)).toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
const wrapw = (s, w) => { const out = []; let cur = ''; for (const word of ascii(s).split(' ')) { if ((cur + (cur ? ' ' : '') + word).length <= w) cur += (cur ? ' ' : '') + word; else { if (cur) out.push(cur); cur = word.slice(0, w); } } out.push(cur); return out; };
const when = d => new Date(d).toLocaleString('en-PH', {year: 'numeric', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit'});
const cols = () => (S.paper === '32' ? 32 : 48);
const textCols = () => (S.paper === '32' ? 32 : 42);   // browser print fits 42 columns on 80 mm paper

function header(w) {   // shop name ("@@H@@" = big), address lines, TIN
  const L = ['@@H@@' + (S.shop.name || 'Your shop name')];
  for (const x of S.shop.lines) if (x.trim()) L.push(...wrapw(x.trim(), w).map(y => ctr(y, w)));
  if (S.shop.tin) L.push(ctr('TIN ' + S.shop.tin, w));
  return L;
}
function receiptText(s, w) {
  const rule = '-'.repeat(w), L = [];
  if (s.demo) L.push(ctr('*** DEMO RECEIPT ***', w), '');
  L.push(...header(w), rule, 'Receipt #' + s.no, ascii(when(s.at)));
  if (s.cashier) L.push('Cashier: ' + ascii(s.cashier));
  L.push(rule);
  for (const l of s.lines) { L.push(...wrapw(l.name, w)); L.push(lr('  ' + l.qty + ' x ' + money(l.price), money(l.price * l.qty), w)); }
  L.push(rule);
  if (s.disc) { L.push(lr('Subtotal', money(s.sub), w)); L.push(lr(s.discLabel || 'Discount', '-' + money(s.disc), w)); }
  L.push('@@B@@' + lr('TOTAL', money(s.total), w));
  L.push(lr(s.type, money(s.tendered), w));
  if (s.ref) L.push(lr('  Ref', s.ref, w));
  if (s.type === 'Cash') L.push(lr('Change', money(s.change), w));
  if (s.senior) L.push(rule, 'SC/PWD ID: ' + ascii(s.senior.id), 'Name: ' + ascii(s.senior.name || '____________________'), '', 'Signature: ____________________');
  L.push(rule);
  if (S.shop.footer) L.push(...wrapw(S.shop.footer, w).map(x => ctr(x, w)));
  if (S.shop.notOfficial) L.push(ctr('This is not an official receipt', w));
  if (s.demo) L.push('', ctr('DEMO - purrfectdigital.online', w));
  return L;
}
function slipText(v, w) {
  const rule = '-'.repeat(w);
  const L = [...header(w), ctr(v.type === 'Void' ? '*** VOID ***' : '*** REFUND ***', w), '',
    'Receipt #' + v.no, 'Sold: ' + ascii(when(v.soldAt)), (v.type === 'Void' ? 'Voided: ' : 'Refunded: ') + ascii(when(new Date())), rule];
  for (const l of v.lines) { L.push(...wrapw(l.name, w)); L.push(lr('  ' + l.qty + ' x ' + money(l.price), '-' + money(l.amount), w)); }
  L.push(rule, '@@B@@' + lr(v.type === 'Void' ? 'VOIDED' : 'REFUNDED', money(v.amount), w), lr('Paid by', v.payment, w), rule);
  L.push(...wrapw('Reason: ' + v.reason, w));
  if (S.cashier) L.push('Done by: ' + ascii(S.cashier));
  L.push('', 'Signature: ____________________');
  return L;
}
const plain = (L, w) => L.map(l => l.startsWith('@@H@@') ? ctr(l.slice(5), w) : l.replace('@@B@@', '')).join('\n');

const logoCache = {};
async function logoBytes(dots) {   // the shop logo as an ESC/POS raster (GS v 0), centred, dithered to black dots
  if (!S.logo) return new Uint8Array(0);
  if (logoCache[dots]) return logoCache[dots];
  const img = await new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = S.logo; });
  const sc = Math.min((dots === 384 ? 240 : 300) / img.width, 150 / img.height);
  const lw = Math.max(8, Math.round(img.width * sc)), lh = Math.max(8, Math.round(img.height * sc));
  const cv = el('canvas', {width: dots, height: lh}), cx = cv.getContext('2d');
  cx.fillStyle = '#fff'; cx.fillRect(0, 0, dots, lh); cx.drawImage(img, (dots - lw) >> 1, 0, lw, lh);
  const px = cx.getImageData(0, 0, dots, lh).data, g = new Float32Array(dots * lh);
  for (let i = 0; i < g.length; i++) g[i] = 0.299 * px[i * 4] + 0.587 * px[i * 4 + 1] + 0.114 * px[i * 4 + 2];
  const row = dots >> 3, bits = new Uint8Array(row * lh);
  for (let y = 0; y < lh; y++) for (let x = 0; x < dots; x++) {   // Floyd-Steinberg
    const i = y * dots + x, old = g[i], nw = old < 128 ? 0 : 255, err = old - nw;
    if (!nw) bits[y * row + (x >> 3)] |= 0x80 >> (x & 7);
    if (x + 1 < dots) g[i + 1] += err * 7 / 16;
    if (y + 1 < lh) { if (x) g[i + dots - 1] += err * 3 / 16; g[i + dots] += err * 5 / 16; if (x + 1 < dots) g[i + dots + 1] += err / 16; }
  }
  const out = new Uint8Array(8 + bits.length);
  out.set([0x1d, 0x76, 0x30, 0, row & 255, row >> 8, lh & 255, lh >> 8]); out.set(bits, 8);
  return (logoCache[dots] = out);
}
async function escpos(L, w, withLogo) {
  const ESC = '\x1b', GS = '\x1d';
  let t = ESC + 'a0';
  for (const l of L) {
    if (l.startsWith('@@H@@')) t += ESC + 'a1' + GS + '!\x11' + ESC + 'E1' + ascii(l.slice(5)).slice(0, w >> 1) + ESC + 'E0' + GS + '!\x00\n' + ESC + 'a0';
    else if (l.startsWith('@@B@@')) t += GS + '!\x01' + ESC + 'E1' + ascii(l.slice(5)) + ESC + 'E0' + GS + '!\x00\n';
    else t += ascii(l) + '\n';
  }
  t += '\n\n\n' + GS + 'V\x42\x00';   // feed past the tear bar, then cut (printers without a cutter ignore the cut)
  const head = new TextEncoder().encode(ESC + '@' + ESC + 'a1');
  const logo = withLogo ? await logoBytes(w === 32 ? 384 : 576).catch(() => new Uint8Array(0)) : new Uint8Array(0);
  const body = new TextEncoder().encode((logo.length ? '\n' : '') + t);   // pure ASCII, so UTF-8 bytes = the printer's bytes
  const all = new Uint8Array(head.length + logo.length + body.length);
  all.set(head, 0); all.set(logo, head.length); all.set(body, head.length + logo.length);
  return all;
}

function sendRawBT(bytes) {
  return new Promise((resolve, reject) => {
    let ws;
    try { ws = new WebSocket(WS); } catch (e) { return reject(e); }
    ws.binaryType = 'arraybuffer';
    const t = setTimeout(() => { try { ws.close(); } catch (e) {} reject(new Error('timeout')); }, 4000);
    ws.onopen = () => { ws.send(bytes); setTimeout(() => { clearTimeout(t); ws.close(1000, 'done'); resolve(); }, 300); };
    ws.onerror = () => { clearTimeout(t); reject(new Error('no server')); };
  });
}

function browserPrint(L, withLogo) {
  const paper = S.paper === '32' ? 58 : 80, rc = $('#rc');
  document.documentElement.style.setProperty('--paper', paper + 'mm');
  document.documentElement.style.setProperty('--rcfont', paper === 58 ? '10px' : '11px');
  const w = textCols(), img = withLogo && S.logo ? el('img', {src: S.logo, alt: ''}) : null;
  const kids = [];
  for (const l of L) kids.push(l.startsWith('@@H@@') ? el('span', {className: 'h', textContent: l.slice(5)}) : document.createTextNode(l.replace('@@B@@', '') + '\n'));
  rc.replaceChildren(...(img ? [img] : []), ...kids, document.createTextNode('\n '));
  const go = () => {   // the page is exactly as long as the receipt, so the paper stops right after the last line
    rc.style.cssText = 'display:block;position:absolute;visibility:hidden;left:0;top:0;box-sizing:border-box;width:' + paper + 'mm;padding:3mm 3mm 0;'
      + 'font:' + (paper === 58 ? '10px' : '11px') + '/1.3 "IBM Plex Mono",monospace;white-space:pre-wrap';
    const mm = Math.ceil(rc.scrollHeight * 25.4 / 96) + 2;
    rc.removeAttribute('style');
    let st = document.getElementById('pagesize');
    if (!st) { st = el('style', {id: 'pagesize'}); document.head.append(st); }
    st.textContent = '@page{size:' + paper + 'mm ' + mm + 'mm;margin:0}';
    window.print();
  };
  if (img && !img.complete) { img.onload = go; img.onerror = go; return; }
  go();
}

// Direct Bluetooth printing (Web Bluetooth: Chrome on Android, Windows, Mac; BLE receipt printers).
// Printers that only speak classic Bluetooth print through the RawBT app instead.
const BT_SERVICES = ['000018f0-0000-1000-8000-00805f9b34fb', 'e7810a71-73ae-499d-8c15-faa9aef0c3f2', '49535343-fe7d-4ae5-8fa9-9fafd205e455',
  '0000ff00-0000-1000-8000-00805f9b34fb', '0000ffe0-0000-1000-8000-00805f9b34fb', '0000fee7-0000-1000-8000-00805f9b34fb', '0000af30-0000-1000-8000-00805f9b34fb'];
const bt = {
  dev: null, ch: null,
  supported: () => !!(navigator.bluetooth && navigator.bluetooth.requestDevice),
  known() { return !!(this.dev || store.get('ppos-bt-id')); },
  name() { return (this.dev && this.dev.name) || store.get('ppos-bt-name') || 'Bluetooth printer'; },
  async pick() {
    if (!this.supported()) throw new Error('this browser cannot use Bluetooth. Use Chrome');
    const d = await navigator.bluetooth.requestDevice({acceptAllDevices: true, optionalServices: BT_SERVICES});
    this.dev = d; this.ch = null;
    await this.open();
    store.set('ppos-bt-id', d.id); store.set('ppos-bt-name', d.name || 'Bluetooth printer');
    return this.name();
  },
  async find() {
    if (this.dev) return this.dev;
    const id = store.get('ppos-bt-id');
    if (id && navigator.bluetooth && navigator.bluetooth.getDevices) this.dev = (await navigator.bluetooth.getDevices()).find(d => d.id === id) || null;
    if (!this.dev) throw new Error('no printer connected yet');
    return this.dev;
  },
  async open() {
    const d = await this.find();
    if (this.ch && d.gatt.connected) return this.ch;
    const server = await d.gatt.connect();
    for (const svc of await server.getPrimaryServices()) {
      for (const c of await svc.getCharacteristics()) if (c.properties.writeWithoutResponse || c.properties.write) { this.ch = c; return c; }
    }
    throw new Error('this device has no printing channel');
  },
  async write(bytes) {
    const c = await this.open(), size = 180;   // small packets: many printers take no more per write
    for (let i = 0; i < bytes.length; i += size) {
      const part = bytes.slice(i, i + size);
      if (c.properties.writeWithoutResponse && c.writeValueWithoutResponse) { await c.writeValueWithoutResponse(part); await new Promise(r => setTimeout(r, 12)); }
      else await c.writeValue(part);
    }
  },
  forget() {
    try { if (this.dev && this.dev.gatt.connected) this.dev.gatt.disconnect(); } catch (e) {}
    this.dev = null; this.ch = null; store.del('ppos-bt-id'); store.del('ppos-bt-name');
  },
};
if (store.get('ppos-bt-id')) bt.open().catch(() => {});

async function printJob(bytesFn, browserFn, what) {
  const want = S.printer, n = S.copies || 1;
  if (want === 'bt' || (want === 'auto' && bt.known())) {
    try { const b = await bytesFn(); for (let i = 0; i < n; i++) await bt.write(b); toast(what + ' sent to ' + bt.name()); return; }
    catch (e) { if (want === 'bt') { toast('Bluetooth printer: ' + e.message + '. Open Printer to connect it.'); return; } }
  }
  if (want === 'auto' || want === 'rawbt') {
    try { const b = await bytesFn(); for (let i = 0; i < n; i++) await sendRawBT(b); toast(what + ' sent to the printer'); return; }
    catch (e) { if (want === 'rawbt') { toast('Printer app not reachable. Open Server for RawBT and try again.'); return; } }
  }
  browserFn();
}
const printSale = s => printJob(() => escpos(receiptText(s, cols()), cols(), true), () => browserPrint(receiptText(s, textCols()), true), 'Receipt');
const printSlip = v => printJob(() => escpos(slipText(v, cols()), cols(), false), () => browserPrint(slipText(v, textCols()), false), (v.type === 'Void' ? 'Void' : 'Refund') + ' slip');

// ---- owner PIN ----------------------------------------------------------------------------------------
let unlockedUntil = 0;
async function hashPin(pin, salt) {
  const b = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(salt + ':' + pin));
  return [...new Uint8Array(b)].map(x => x.toString(16).padStart(2, '0')).join('');
}
function guard(fn) {   // items, reports, settings, voids and refunds need the owner PIN when one is set
  if (!S.pin || Date.now() < unlockedUntil) return fn();
  sheet('Owner PIN', (bd, close) => {
    const pin = el('input', {type: 'password', inputMode: 'numeric', autocomplete: 'off', maxLength: 8, placeholder: '••••', ariaLabel: 'Owner PIN'});
    const err = el('p', {className: 'warn'}), ok = el('button', {className: 'btn g', textContent: 'Unlock'});
    const forgot = el('button', {className: 'btn o sm', textContent: 'Forgot the PIN?'});
    const go = async () => {
      if (await hashPin(pin.value, S.pin.salt) === S.pin.hash) { unlockedUntil = Date.now() + 10 * 60000; close(); fn(); }
      else { err.textContent = 'Wrong PIN.'; pin.value = ''; pin.focus(); }
    };
    ok.onclick = go; pin.onkeydown = e => { if (e.key === 'Enter') go(); };
    forgot.onclick = () => { close(); forgotPin(); };
    bd.append(el('p', {className: 'note', textContent: 'Items, reports, settings, voids and refunds need the owner PIN. The register itself stays open for your staff.'}), pin, err, ok, forgot);
    setTimeout(() => pin.focus(), 60);
  });
}
function forgotPin() {
  sheet('Reset the owner PIN', (bd, close) => {
    if (!licensed()) {
      const rm = el('button', {className: 'btn g', textContent: 'Remove the PIN'});
      rm.onclick = () => { S.pin = null; saveS(); close(); toast('PIN removed'); };
      bd.append(el('p', {textContent: 'This copy is still in demo mode, so the PIN can be removed right away.'}), rm);
      return;
    }
    const key = el('input', {placeholder: 'PDPOS-XXXX-XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false});
    const err = el('p', {className: 'warn'}), ok = el('button', {className: 'btn g', textContent: 'Remove the PIN'});
    ok.onclick = () => {
      if (key.value.toUpperCase().replace(/[^A-Z0-9]/g, '') !== LIC.key.replace(/-/g, '')) { err.textContent = 'That is not the license key of this copy.'; return; }
      S.pin = null; saveS(); close(); toast('PIN removed. Set a new one in Settings.');
    };
    bd.append(el('p', {className: 'note', textContent: 'Type the license key from the email you got after buying Purrfect POS.'}), el('label', {}, ['License key', key]), err, ok);
  });
}

// ---- receipts -----------------------------------------------------------------------------------------
const net = s => r2(s.total - (s.refunded || 0));
const lineNet = (l, s) => r2(l.price * l.qty * (s.sub ? s.total / s.sub : 1));   // the ticket discount, spread over the lines
const VOID_REASONS = ['Wrong item rung up', 'Customer changed their mind', 'Duplicate sale', 'Item not available', 'Product problem', 'Test sale', 'Other'];

function showReceipts() {
  let days = 30, rows = [];
  sheet('Receipts', (bd) => {
    const q = el('input', {type: 'search', placeholder: 'Find a receipt number, item or amount', autocomplete: 'off', ariaLabel: 'Find a receipt'});
    const list = el('div', {className: 'rlist'}), more = el('button', {className: 'btn o', textContent: 'Show 30 more days'});
    const draw = () => {
      const term = q.value.trim().toLowerCase();
      const xs = rows.filter(x => !term || [x.no, x.total, x.type, x.ref, ...x.lines.map(l => l.name)].join(' ').toLowerCase().includes(term));
      list.replaceChildren();
      if (!xs.length) { list.append(el('p', {className: 'none', textContent: rows.length ? 'No receipts match.' : 'No receipts in the last ' + days + ' days on this device.'})); return; }
      const groups = new Map();
      for (const x of xs) { const k = dayKey(x.at); if (!groups.has(k)) groups.set(k, []); groups.get(k).push(x); }
      for (const [k, g] of groups) {
        const ok = g.filter(x => !x.voided);
        list.append(el('div', {className: 'day'}, [el('span', {textContent: dayLabel(k)}), el('span', {textContent: ok.length + (ok.length === 1 ? ' receipt · ' : ' receipts · ') + peso(ok.reduce((a, x) => a + net(x), 0))})]));
        for (const x of g) {
          const b = el('button', {className: 'rrow'}, [el('span', {className: 'tm', textContent: timeLabel(x.at)}),
            el('span', {className: 'no'}, ['#' + x.no, el('small', {textContent: x.type + ' · ' + x.qty + (x.qty === 1 ? ' item' : ' items') + (x.senior ? ' · Sr/PWD' : '')
              + (x.voided ? ' · VOIDED' : x.refunded ? ' · refunded ' + peso(x.refunded) : '') + (x.demo ? ' · demo' : '')})]),
            el('span', {className: 'amt', textContent: peso(x.total)})]);
          if (x.voided) { b.style.opacity = '.55'; b.querySelector('.amt').style.textDecoration = 'line-through'; }
          b.onclick = () => showOne(x);
          list.append(b);
        }
      }
    };
    const load = async () => { rows = (await db.range(new Date(Date.now() - days * 864e5).toISOString(), '9999')).reverse(); draw(); };
    q.oninput = draw;
    more.onclick = () => { days += 30; load(); };
    bd.append(el('p', {className: 'note', textContent: 'Receipts saved on this device, newest first. Tap one to see it, print a copy, void or refund it.'}), q, list, more);
    load();
  });
}

function showOne(sale) {
  sheet('Receipt #' + sale.no, (bd, close) => {
    const pr = el('button', {className: 'btn g', textContent: 'Print copy'}), back = el('button', {className: 'btn o', textContent: 'Back'});
    pr.onclick = () => printSale(sale); back.onclick = close;
    const refunded = sale.refunded || 0, left = net(sale);
    if (sale.voided) bd.append(el('p', {className: 'warn', textContent: 'VOIDED · ' + (sale.voidReason || '')}));
    else if (refunded) bd.append(el('p', {className: 'warn', textContent: 'Refunded ' + peso(refunded) + (left > 0 ? ' · ' + peso(left) + ' left' : ' (all of it)')}));
    bd.append(el('div', {className: 'rprev', textContent: plain(receiptText(sale, textCols()), textCols())}), el('div', {className: 'row2'}, [back, pr]));
    if (!sale.voided && left > 0) {
      const vd = el('button', {className: 'btn o', textContent: 'Void'}), rf = el('button', {className: 'btn o', textContent: 'Refund'});
      vd.disabled = refunded > 0;
      vd.onclick = () => guard(() => { close(); voidOrRefund(sale, 'Void'); });
      rf.onclick = () => guard(() => { close(); voidOrRefund(sale, 'Refund'); });
      bd.append(el('div', {className: 'row2'}, [vd, rf]),
        el('p', {className: 'note', textContent: 'Void cancels the whole sale (for example a mistake). Refund gives money back for some or all items. Both print a slip, show in the sales report and put tracked stock back.'}));
    }
  });
}

function voidOrRefund(sale, type) {
  const refunded = sale.refunded || 0, left = net(sale), doneQty = sale.refundedQty || {};
  sheet((type === 'Void' ? 'Void' : 'Refund') + ' receipt #' + sale.no, (bd, close) => {
    const picks = sale.lines.map(l => ({l, k: l.id || l.name, max: l.qty - (doneQty[l.id || l.name] || 0), q: type === 'Void' ? l.qty : 0}));
    const amountOf = () => type === 'Void' ? sale.total : r2(Math.min(left, picks.reduce((a, p) => a + (p.q ? lineNet(p.l, sale) * p.q / p.l.qty : 0), 0)));
    const amt = el('div', {className: 'big'});
    const showAmt = () => amt.replaceChildren(peso(amountOf()), el('small', {textContent: (type === 'Void' ? 'whole receipt, paid by ' : 'to give back, paid by ') + sale.type}));
    if (type === 'Refund') {
      const list = el('div', {className: 'rlist'});
      for (const p of picks) {
        const out = el('output', {textContent: p.q}), minus = el('button', {textContent: '−', ariaLabel: 'One less'}), plus = el('button', {textContent: '+', ariaLabel: 'One more'});
        minus.onclick = () => { p.q = Math.max(0, p.q - 1); out.textContent = p.q; showAmt(); };
        plus.onclick = () => { p.q = Math.min(p.max, p.q + 1); out.textContent = p.q; showAmt(); };
        if (p.max <= 0) minus.disabled = plus.disabled = true;
        list.append(el('div', {className: 'rrow'}, [el('span', {className: 'no'}, [p.l.name, el('small', {textContent: p.l.qty + ' sold · ' + peso(lineNet(p.l, sale))
          + (p.max < p.l.qty ? ' · ' + (p.l.qty - p.max) + ' already refunded' : '')})]), el('span'), el('span', {className: 'stepper sm'}, [minus, out, plus])]));
      }
      const all = el('button', {className: 'btn o', textContent: 'Refund everything left'});
      all.onclick = () => { picks.forEach(p => { p.q = Math.max(0, p.max); }); list.querySelectorAll('output').forEach((o, i) => { o.textContent = picks[i].q; }); showAmt(); };
      bd.append(el('p', {className: 'note', textContent: 'Pick how many of each item to refund.' + (refunded ? ' Already refunded: ' + peso(refunded) + '.' : '')}), list, all);
    }
    showAmt();
    const why = el('select', {}, VOID_REASONS.map(r => new Option(r, r)));
    const more = el('input', {placeholder: 'Details (optional)', maxLength: 120});
    const err = el('p', {className: 'warn'});
    const go = el('button', {className: 'btn g', textContent: type === 'Void' ? 'Void receipt' : 'Refund'});
    go.onclick = async () => {
      const amount = amountOf();
      if (!(amount > 0)) { err.textContent = 'Pick at least one item to refund.'; return; }
      const reason = why.value + (more.value.trim() ? ': ' + more.value.trim() : '');
      const lines = type === 'Void' ? sale.lines.map(l => ({id: l.id, name: l.name, qty: l.qty, price: l.price, amount: lineNet(l, sale)}))
        : picks.filter(p => p.q).map(p => ({id: p.l.id, name: p.l.name, qty: p.q, price: p.l.price, amount: r2(lineNet(p.l, sale) * p.q / p.l.qty)}));
      go.disabled = true;
      try {
        const rec = (await db.get(sale.no)) || sale;
        if (type === 'Void') Object.assign(rec, {voided: true, voidReason: reason, voidAt: new Date().toISOString()});
        else {
          const rq = {...(rec.refundedQty || {})}; lines.forEach(l => { const k = l.id || l.name; rq[k] = (rq[k] || 0) + l.qty; });
          Object.assign(rec, {refunded: r2((rec.refunded || 0) + amount), refundedQty: rq, refunds: [...(rec.refunds || []), {at: new Date().toISOString(), amount, reason, lines}]});
        }
        await db.put(rec); queueSync(rec.no);
        let back = false;
        for (const l of lines) { const it = IDX[l.id]; if (it && it.track) { it.stock = r2(r2(it.stock) + l.qty); back = true; } }
        if (back) saveItems();
        render(); close();
        toast((type === 'Void' ? 'Receipt voided' : 'Refund of ' + peso(amount) + ' saved') + ' · printing slip');
        printSlip({type, no: sale.no, soldAt: sale.at, lines, amount, payment: sale.type, reason});
      } catch (e) { err.textContent = 'Could not save: ' + (e && e.message); go.disabled = false; }
    };
    bd.append(amt, el('label', {}, ['Reason', why]), more, err, go);
  });
}
$('#rcptBtn').onclick = showReceipts;

// ---- printer ------------------------------------------------------------------------------------------
const IFACE = {bt: 'Bluetooth', rawbt: 'Bluetooth through the RawBT app', browser: 'This device’s print dialog', auto: 'Automatic'};
function testPrint() {
  const L = ['@@H@@' + (S.shop.name || 'Purrfect POS'), ctr('Test print OK', cols()), ctr(ascii(when(new Date())), cols())];
  if (S.printer === 'browser') { browserPrint(L, true); return Promise.resolve(); }
  return escpos(L, cols(), true).then(b => (S.printer === 'rawbt' || (S.printer === 'auto' && !bt.known()) ? sendRawBT(b) : bt.write(b)));
}
function showPrinter() {
  sheet('Printer', (bd, close) => {
    const name = el('input', {value: S.printerName || 'Receipt printer', maxLength: 40});
    const iface = el('select', {}, [new Option('Bluetooth', 'bt'), new Option('Bluetooth through the RawBT app', 'rawbt'), new Option('This device’s print dialog', 'browser')]);
    iface.value = S.printer === 'auto' ? (bt.supported() ? 'bt' : 'browser') : S.printer;
    const dev = el('p', {className: 'note'}), search = el('button', {className: 'btn o', textContent: 'Search'});
    const devRow = el('div', {className: 'row2'}, [dev, search]);
    const help = el('p', {className: 'note'});
    const showDev = () => {
      devRow.hidden = iface.value !== 'bt';
      dev.textContent = !bt.supported() ? 'This browser cannot use Bluetooth. Use Chrome, or pick another option.' : bt.known() ? 'Printer: ' + bt.name() : 'No printer yet. Turn it on, then tap Search.';
      help.textContent = iface.value === 'bt' ? 'Works with most Bluetooth (BLE) receipt printers in Chrome on Android, Windows and Mac.'
        : iface.value === 'rawbt' ? 'For printers Chrome cannot find: install “RawBT” and “Server for RawBT” from the Play Store, pair the printer there, and keep the server running.'
        : 'Uses the normal print dialog: good for computers with a USB receipt printer, or to save receipts as PDF.';
    };
    iface.onchange = showDev; showDev();
    search.onclick = () => bt.pick().then(nm => { toast('Connected to ' + nm); if (!name.value || name.value === 'Receipt printer') name.value = nm; showDev(); })
      .catch(e => { if (e && e.name !== 'NotFoundError') toast('Could not connect: ' + (e.message || e)); showDev(); });
    const paper = el('select', {}, [new Option('58 mm (most small printers)', '32'), new Option('80 mm', '48')]); paper.value = S.paper;
    const cp = el('select', {}, [new Option('1 copy', '1'), new Option('2 copies', '2')]); cp.value = String(S.copies || 1);
    const ap = el('input', {type: 'checkbox', checked: S.autoprint});
    const collect = () => ({printerName: name.value.trim() || 'Receipt printer', printer: iface.value, paper: paper.value, copies: Number(cp.value), autoprint: ap.checked});
    const test = el('button', {className: 'btn o', textContent: 'Print test'});
    test.onclick = () => { const keep = {...S}; Object.assign(S, collect());
      testPrint().then(() => toast('Test sent')).catch(e => toast('Test failed: ' + (e.message || e))).finally(() => { S = Object.assign(S, {printerName: keep.printerName, printer: keep.printer, paper: keep.paper, copies: keep.copies, autoprint: keep.autoprint}); }); };
    const save = el('button', {className: 'btn g', textContent: 'Save'});
    save.onclick = () => { Object.assign(S, collect()); saveS(); close(); toast('Printer saved'); };
    const del = el('button', {className: 'btn o danger', textContent: 'Remove printer'});
    del.onclick = () => { bt.forget(); Object.assign(S, {printerName: '', printer: 'auto'}); saveS(); close(); toast('Printer removed'); };
    bd.append(el('label', {}, ['Name', name]), el('label', {}, ['Connect by', iface]), devRow, help, el('label', {}, ['Paper width', paper]),
      el('label', {}, ['Copies', cp]), el('label', {className: 'tog'}, [el('span', {textContent: 'Print receipts automatically'}), ap]),
      el('div', {className: 'row2'}, [test, save]), S.printerName || S.printer !== 'auto' ? del : null);
  });
}
$('#printerBtn').onclick = showPrinter;

// ---- items (owner) ------------------------------------------------------------------------------------
function showItems() {
  guard(() => sheet('Items', (bd) => {
    const add = el('button', {className: 'btn g', textContent: 'Add item'}), catB = el('button', {className: 'btn o', textContent: 'Categories'});
    const imp = el('button', {className: 'btn o', textContent: 'Import CSV'}), exp = el('button', {className: 'btn o', textContent: 'Export CSV'});
    const file = el('input', {type: 'file', accept: '.csv,text/csv', hidden: true});
    const q = el('input', {type: 'search', placeholder: 'Search items', autocomplete: 'off', ariaLabel: 'Search items'});
    const list = el('div', {className: 'rlist'});
    const samples = el('button', {className: 'btn o danger', textContent: 'Delete the sample items'});
    const draw = () => {
      const t = q.value.trim().toLowerCase(); list.replaceChildren();
      samples.hidden = !ITEMS.some(i => i.sample);
      for (const c of CATS) {
        const xs = sortItems(ITEMS.filter(i => i.cat === c && (!t || i.name.toLowerCase().includes(t))));
        if (!xs.length) continue;
        list.append(el('div', {className: 'day'}, [el('span', {textContent: c}), el('span', {textContent: xs.length + (xs.length === 1 ? ' item' : ' items')})]));
        for (const i of xs) {
          const b = el('button', {className: 'rrow'}, [el('span', {className: 'tm', textContent: peso(i.price)}),
            el('span', {className: 'no'}, [i.name, el('small', {textContent: [i.track ? 'Stock ' + r2(i.stock) : '', i.hidden ? 'Hidden' : '', i.sample ? 'Sample' : ''].filter(Boolean).join(' · ')})]),
            el('span', {className: 'amt', textContent: 'Edit'})]);
          if (i.hidden) b.style.opacity = '.55';
          b.onclick = () => editItem(i, draw);
          list.append(b);
        }
      }
      if (!ITEMS.length) list.append(el('p', {className: 'none', textContent: 'No items yet. Add them one by one, or import a CSV file with name, category and price columns.'}));
    };
    q.oninput = draw;
    add.onclick = () => editItem(null, draw);
    catB.onclick = () => showCats(draw);
    exp.onclick = () => download('purrfect-pos-items.csv', csv([['Name', 'Category', 'Price', 'Track stock', 'Stock', 'Low at', 'Hidden'],
      ...sortItems([...ITEMS]).map(i => [i.name, i.cat, i.price, i.track ? 'yes' : 'no', i.track ? r2(i.stock) : '', i.track ? (i.low ?? '') : '', i.hidden ? 'yes' : 'no'])]), 'text/csv');
    imp.onclick = () => file.click();
    file.onchange = async () => { const f = file.files[0]; file.value = ''; if (f) { try { toast(importItems(await f.text())); draw(); } catch (e) { toast(e.message); } } };
    samples.onclick = () => confirmBox('Delete the sample items?', 'The ' + ITEMS.filter(i => i.sample).length + ' sample items (Americano, Fries and so on) will be removed. Your own items stay.', 'Delete samples', () => {
      ITEMS.filter(i => i.sample).forEach(i => store.del('ppos-ph-' + i.id)); ITEMS = ITEMS.filter(i => !i.sample); saveItems(); buildCats(); render(); draw(); toast('Sample items deleted');
    });
    bd.append(el('div', {className: 'row2'}, [add, catB]), el('div', {className: 'row2'}, [imp, exp]), file, samples, q, list);
    draw();
  }));
}
$('#itemsBtn').onclick = showItems;

function editItem(i, after) {
  sheet(i ? 'Edit item' : 'Add item', (bd, close) => {
    const nm = el('input', {value: i ? i.name : '', maxLength: 60, placeholder: 'e.g. Iced Coffee'});
    const cat = el('input', {value: i ? i.cat : (catSel.value || CATS[0] || ''), maxLength: 40, placeholder: 'e.g. Drinks'});
    cat.setAttribute('list', 'ppos-cats');
    const dl = el('datalist', {id: 'ppos-cats'}, CATS.map(c => el('option', {value: c})));
    const pr = el('input', {type: 'number', inputMode: 'decimal', min: 0, step: '0.01', value: i ? i.price : '', placeholder: '0.00'});
    const cost = el('input', {type: 'number', inputMode: 'decimal', min: 0, step: '0.01', value: i && i.cost != null ? i.cost : '', placeholder: 'optional'});
    let color = i ? i.color : (ITEMS.find(x => x.cat === cat.value) || {}).color || COLORS[0];
    const sw = el('div', {className: 'swatches', role: 'radiogroup', ariaLabel: 'Tile colour'}, COLORS.map((c, n) => {
      const r = el('input', {type: 'radio', name: 'ppos-color', value: c, checked: c === color, ariaLabel: 'Colour ' + (n + 1)});
      r.onchange = () => { color = c; phBox(); };
      const s = el('span'); s.style.setProperty('--c', c);
      return el('label', {}, [r, s]);
    }));
    let photo = i ? photoOf(i.id) : '';
    const phWrap = el('div', {className: 'photo'}), pick = el('input', {type: 'file', accept: 'image/*', hidden: true});
    const phBtn = el('button', {className: 'btn o sm', textContent: 'Add photo'}), phDel = el('button', {className: 'btn o sm danger', textContent: 'Remove photo'});
    const phBox = () => {
      const pv = photo ? el('img', {src: photo, alt: ''}) : el('span', {className: 'ph0'});
      if (!photo) pv.style.setProperty('--c', color);
      phBtn.textContent = photo ? 'Change photo' : 'Add photo'; phDel.hidden = !photo;
      phWrap.replaceChildren(pv, phBtn, phDel);
    };
    phBtn.onclick = () => pick.click();
    phDel.onclick = () => { photo = ''; phBox(); };
    pick.onchange = async () => { const f = pick.files[0]; pick.value = ''; if (f) { try { photo = await squarePhoto(f); phBox(); } catch (e) { toast('That photo could not be read.'); } } };
    phBox();
    const track = el('input', {type: 'checkbox', checked: !!(i && i.track)});
    const stock = el('input', {type: 'number', inputMode: 'decimal', step: 'any', value: i && i.track ? r2(i.stock) : ''});
    const low = el('input', {type: 'number', inputMode: 'decimal', min: 0, step: 'any', value: i && i.low != null ? i.low : S.lowDefault});
    const stockRow = el('div', {className: 'row2'}, [el('label', {}, ['In stock now', stock]), el('label', {}, ['Warn when at or below', low])]);
    const syncTrack = () => { stockRow.hidden = !track.checked; }; track.onchange = syncTrack; syncTrack();
    const hid = el('input', {type: 'checkbox', checked: !!(i && i.hidden)});
    const err = el('p', {className: 'warn'}), save = el('button', {className: 'btn g', textContent: 'Save'});
    save.onclick = () => {
      const name = nm.value.trim(), price = pr.value === '' ? NaN : Number(pr.value);
      if (!name) { err.textContent = 'Give the item a name.'; nm.focus(); return; }
      if (!(price >= 0)) { err.textContent = 'Enter a price (0 is fine for free items).'; pr.focus(); return; }
      if (track.checked && stock.value === '') { err.textContent = 'Enter how many you have now.'; stock.focus(); return; }
      const cst = cost.value === '' ? null : Number(cost.value);
      if (cst != null && !(cst >= 0)) { err.textContent = 'Enter your cost as a number, or leave it empty.'; cost.focus(); return; }
      const it = i || {id: uid()};
      Object.assign(it, {name, cat: cat.value.trim() || 'Other', price: r2(price), color, hidden: hid.checked, track: track.checked});
      if (cst == null) delete it.cost; else it.cost = r2(cst);
      if (track.checked) { it.stock = r2(stock.value); it.low = low.value === '' ? S.lowDefault : r2(low.value); } else { delete it.stock; delete it.low; }
      delete it.sample;
      if (photo) { if (!store.set('ppos-ph-' + it.id, photo)) toast('Storage is full: the photo was not saved.'); } else store.del('ppos-ph-' + it.id);
      if (!i) ITEMS.push(it);
      saveItems(); buildCats(); render(); close(); toast(i ? 'Item saved' : 'Item added'); if (after) after();
    };
    const btns = [save];
    if (i) {
      const del = el('button', {className: 'btn o danger', textContent: 'Delete item'});
      del.onclick = () => confirmBox('Delete ' + i.name + '?', 'It disappears from the register. Past receipts keep it.', 'Delete', () => {
        ITEMS = ITEMS.filter(x => x !== i); store.del('ppos-ph-' + i.id); ticket = ticket.filter(l => l.id !== i.id);
        saveItems(); buildCats(); render(); close(); toast('Item deleted'); if (after) after();
      });
      btns.unshift(del);
    }
    bd.append(el('label', {}, ['Name', nm]), el('div', {className: 'row2'}, [el('label', {}, ['Category', cat]), el('label', {}, ['Price (₱)', pr])]), dl,
      el('label', {}, ['Your cost per piece (₱): for net profit in the back office', cost]),
      el('label', {}, ['Tile colour']), sw, el('label', {}, ['Photo (optional)']), phWrap, pick,
      el('label', {className: 'tog'}, [el('span', {textContent: 'Track stock'}), track]), stockRow,
      el('label', {className: 'tog'}, [el('span', {textContent: 'Hide from the register'}), hid]), err,
      el('div', {className: btns.length > 1 ? 'row2' : ''}, btns));
    if (!i) setTimeout(() => nm.focus(), 60);
  });
}

function squarePhoto(file, size = 200) {   // centre-cropped square JPEG, small enough for localStorage
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const s = Math.min(img.width, img.height), cv = el('canvas', {width: size, height: size}), cx = cv.getContext('2d');
      cx.fillStyle = '#fff'; cx.fillRect(0, 0, size, size);
      cx.drawImage(img, (img.width - s) / 2, (img.height - s) / 2, s, s, 0, 0, size, size);
      URL.revokeObjectURL(url); res(cv.toDataURL('image/jpeg', 0.72));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

function showCats(after) {
  sheet('Categories', (bd, close) => {
    const list = el('div', {className: 'rlist'});
    const draw = () => {
      list.replaceChildren();
      CATS.forEach((c, n) => {
        const up = el('button', {className: 'btn o sm', textContent: '↑', ariaLabel: 'Move ' + c + ' up', disabled: n === 0});
        const dn = el('button', {className: 'btn o sm', textContent: '↓', ariaLabel: 'Move ' + c + ' down', disabled: n === CATS.length - 1});
        const ren = el('button', {className: 'btn o sm', textContent: 'Rename'});
        const move = d => { const o = [...CATS]; [o[n], o[n + d]] = [o[n + d], o[n]]; S.catOrder = o; saveS(); refreshItems(); buildCats(); renderGrid(); draw(); if (after) after(); };
        up.onclick = () => move(-1); dn.onclick = () => move(1);
        ren.onclick = () => sheet('Rename ' + c, (bd2, close2) => {
          const to = el('input', {value: c, maxLength: 40}), ok = el('button', {className: 'btn g', textContent: 'Rename'});
          ok.onclick = () => {
            const nn = to.value.trim(); if (!nn || nn === c) { close2(); return; }
            ITEMS.forEach(i => { if (i.cat === c) i.cat = nn; }); S.catOrder = CATS.map(x => x === c ? nn : x); saveS(); saveItems(); buildCats(); render(); close2(); draw(); if (after) after();
          };
          bd2.append(el('p', {className: 'note', textContent: 'Every item in ' + c + ' moves to the new name. Use a name that already exists to merge two categories.'}), el('label', {}, ['New name', to]), ok);
        });
        list.append(el('div', {className: 'rrow'}, [el('span', {className: 'tm', textContent: plural(ITEMS.filter(i => i.cat === c).length, 'item')}), el('span', {className: 'no', textContent: c}),
          el('span', {className: 'row3'}, [up, dn, ren])]));
      });
      if (!CATS.length) list.append(el('p', {className: 'none', textContent: 'Categories appear here once you add items.'}));
    };
    bd.append(el('p', {className: 'note', textContent: 'The order here is the order on the register. A category is created when you type a new one on an item.'}), list);
    draw();
  });
}

// ---- CSV ----------------------------------------------------------------------------------------------
const csv = rows => '﻿' + rows.map(r => r.map(v => {
  let s = v == null ? '' : String(v);
  if (typeof v === 'string' && /^[=+\-@\t\r]/.test(s)) s = "'" + s;   // keep spreadsheet apps from running cell text as a formula
  return /[",\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
}).join(',')).join('\r\n');
function parseCsv(text) {
  const rows = [], t = text.replace(/^﻿/, '');
  let row = [], cell = '', q = false;
  for (let i = 0; i < t.length; i++) {
    const c = t[i];
    if (q) { if (c === '"') { if (t[i + 1] === '"') { cell += '"'; i++; } else q = false; } else cell += c; }
    else if (c === '"') q = true;
    else if (c === ',' || c === ';' || c === '\t') { row.push(cell); cell = ''; }
    else if (c === '\n' || c === '\r') { if (c === '\r' && t[i + 1] === '\n') i++; row.push(cell); rows.push(row); row = []; cell = ''; }
    else cell += c;
  }
  if (cell || row.length) { row.push(cell); rows.push(row); }
  return rows.filter(r => r.some(x => x.trim()));
}
function importItems(text) {
  const rows = parseCsv(text);
  if (rows.length < 2) throw new Error('The file has no rows. The first row should be the headings: Name, Category, Price.');
  const h = rows[0].map(x => x.trim().toLowerCase());
  const col = names => h.findIndex(x => names.includes(x));
  const ni = col(['name', 'item', 'item name', 'product']), ci = col(['category', 'cat', 'group']), pi = col(['price', 'selling price', 'amount']), si = col(['stock', 'qty', 'quantity', 'in stock']);
  if (ni < 0 || pi < 0) throw new Error('Need at least a Name column and a Price column in the first row.');
  let added = 0, updated = 0, skipped = 0;
  for (const r of rows.slice(1)) {
    const name = (r[ni] || '').trim().replace(/^'/, ''), price = Number(String(r[pi] || '').replace(/[₱P,\s]/g, ''));
    if (!name || !(price >= 0)) { skipped++; continue; }
    const cat = ci >= 0 && (r[ci] || '').trim() ? r[ci].trim() : 'Other';
    let it = ITEMS.find(i => i.name.toLowerCase() === name.toLowerCase());
    if (it) updated++; else { it = {id: uid(), color: (ITEMS.find(i => i.cat === cat) || {}).color || COLORS[(CATS.length + added) % COLORS.length]}; ITEMS.push(it); added++; }
    Object.assign(it, {name, cat, price: r2(price)}); delete it.sample;
    if (si >= 0 && String(r[si] || '').trim() !== '') { it.track = true; it.stock = r2(r[si]); if (it.low == null) it.low = S.lowDefault; }
  }
  saveItems(); buildCats(); render();
  return added + ' added, ' + updated + ' updated' + (skipped ? ', ' + skipped + ' rows skipped' : '');
}
function download(name, text, type) {
  const a = el('a', {href: URL.createObjectURL(new Blob([text], {type: type + ';charset=utf-8'})), download: name});
  document.body.append(a); a.click(); setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 1000);
}

// ---- sales report (owner) -----------------------------------------------------------------------------
const compact = n => n >= 1e6 ? (n / 1e6).toFixed(1).replace(/\.0$/, '') + 'M' : n >= 1000 ? (n / 1000).toFixed(1).replace(/\.0$/, '') + 'K' : String(Math.round(n));
const niceTop = m => { if (m <= 0) return 100; const p = 10 ** Math.floor(Math.log10(m)), f = m / p; return (f <= 1 ? 1 : f <= 2 ? 2 : f <= 2.5 ? 2.5 : f <= 5 ? 5 : 10) * p; };
const sod = d => new Date(d.getFullYear(), d.getMonth(), d.getDate());
const addDays = (d, n) => new Date(d.getFullYear(), d.getMonth(), d.getDate() + n);
const shortDay = d => d.toLocaleDateString('en-PH', {month: 'short', day: 'numeric'});

function columnChart(title, sub, buckets) {   // one series: net sales per hour or day. Columns <= 24px, 4px rounded tops, peak labelled.
  const top = niceTop(Math.max(0, ...buckets.map(b => b.value)));
  const peak = buckets.reduce((m, b, i) => b.value > (buckets[m] ? buckets[m].value : 0) ? i : m, -1);
  const tip = el('div', {className: 'tip', hidden: true});
  const colsBox = el('div', {className: 'cols'});
  colsBox.style.gridTemplateColumns = 'repeat(' + buckets.length + ',1fr)';
  for (const f of [0.5, 1]) { const g = el('span', {className: 'gl'}); g.style.bottom = (f * 100) + '%'; colsBox.append(g); }
  buckets.forEach((b, i) => {
    const h = Math.max(0, b.value) / top * 100;
    const c = el('button', {className: 'col' + (b.value > 0 ? '' : ' zero')}, [el('i')]);
    c.style.setProperty('--h', h + '%');
    c.setAttribute('aria-label', b.full + ': ' + peso(b.value) + (b.count ? ', ' + b.count + ' receipts' : ''));
    if (i === peak && b.value > 0) c.append(el('b', {className: 'pk', textContent: compact(b.value)}));
    const show = () => { const r = c.getBoundingClientRect(); tip.replaceChildren(el('b', {textContent: peso(b.value)}), el('span', {textContent: b.full + (b.count ? ' · ' + b.count + ' receipts' : '')}));
      tip.hidden = false; tip.style.left = (r.left + r.width / 2) + 'px'; tip.style.top = (r.bottom - r.height * h / 100) + 'px'; };
    const hide = () => { tip.hidden = true; };
    c.onpointerenter = show; c.onfocus = show; c.onpointerleave = hide; c.onblur = hide;
    colsBox.append(c);
  });
  const yax = el('div', {className: 'yax'}, [0, top / 2, top].map(v => { const s = el('span', {textContent: compact(v)}); s.style.bottom = (v / top * 100) + '%'; return s; }));
  const every = Math.ceil(buckets.length / 8);
  const xax = el('div', {className: 'xax'}, buckets.map((b, i) => el('span', {textContent: i % every === 0 ? b.tick : ''})));
  xax.style.gridTemplateColumns = 'repeat(' + buckets.length + ',1fr)';
  return el('figure', {className: 'chart'}, [el('figcaption', {}, [title, el('small', {textContent: sub})]), el('div', {className: 'plot'}, [yax, colsBox]), xax, tip]);
}

function showReports() {
  guard(() => sheet('Sales report', (bd) => {
    const RANGES = [['today', 'Today'], ['yesterday', 'Yesterday'], ['week', 'This week'], ['month', 'This month'], ['last', 'Last month'], ['custom', 'Pick dates']];
    const seg = el('div', {className: 'seg', role: 'group', ariaLabel: 'Period'});
    const from = el('input', {type: 'date'}), to = el('input', {type: 'date'});
    const custom = el('div', {className: 'row2', hidden: true}, [el('label', {}, ['From', from]), el('label', {}, ['To', to])]);
    const out = el('div', {className: 'rep'});
    let cur = 'today', data = null;
    const span = k => {
      const t = sod(new Date());
      if (k === 'today') return [t, addDays(t, 1)];
      if (k === 'yesterday') return [addDays(t, -1), t];
      if (k === 'week') { const s = addDays(t, -((t.getDay() + 6) % 7)); return [s, addDays(s, 7)]; }
      if (k === 'month') return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 1)];
      if (k === 'last') return [new Date(t.getFullYear(), t.getMonth() - 1, 1), new Date(t.getFullYear(), t.getMonth(), 1)];
      let a = from.value ? new Date(from.value + 'T00:00') : t, b = to.value ? new Date(to.value + 'T00:00') : a;
      if (b < a) [a, b] = [b, a];
      return [a, addDays(b, 1)];
    };
    const pick = async k => {
      cur = k;
      seg.querySelectorAll('button').forEach(b => b.setAttribute('aria-pressed', String(b.dataset.k === k)));
      custom.hidden = k !== 'custom';
      if (k === 'custom' && !from.value) { const t = new Date(); from.value = dayKey(addDays(t, -6)); to.value = dayKey(t); }
      const [a, b] = span(k);
      const rows = await db.range(a.toISOString(), b.toISOString());
      draw(rows, a, b);
    };
    for (const [k, lab] of RANGES) { const b = el('button', {textContent: lab}); b.dataset.k = k; b.onclick = () => pick(k); seg.append(b); }
    from.onchange = to.onchange = () => pick('custom');

    const draw = (rows, a, b) => {
      const ok = rows.filter(r => !r.voided), voided = rows.filter(r => r.voided);
      const gross = r2(ok.reduce((s, r) => s + r.sub, 0)), discounts = r2(ok.reduce((s, r) => s + (r.disc || 0), 0));
      const refunds = r2(ok.reduce((s, r) => s + (r.refunded || 0), 0)), netSales = r2(ok.reduce((s, r) => s + net(r), 0));
      const pays = {}, items = {};
      for (const r of ok) {
        const p = pays[r.type] || (pays[r.type] = {n: 0, amt: 0}); p.n++; p.amt = r2(p.amt + net(r));
        const rq = r.refundedQty || {};
        for (const l of r.lines) {
          const sold = l.qty - (rq[l.id || l.name] || 0); if (sold <= 0) continue;
          const it = items[l.name] || (items[l.name] = {qty: 0, amt: 0}); it.qty += sold; it.amt = r2(it.amt + sold * l.price);
        }
      }
      data = {rows, a, b};
      const days = Math.round((b - a) / 864e5);
      let buckets;
      if (days <= 1) {
        const hours = ok.map(r => new Date(r.at).getHours());
        const lo = Math.min(8, ...hours), hi = Math.max(20, ...hours);
        buckets = [];
        for (let hr = lo; hr <= hi; hr++) {
          const xs = ok.filter(r => new Date(r.at).getHours() === hr), lab = (hr % 12 || 12) + (hr < 12 ? 'a' : 'p');
          buckets.push({tick: lab, full: (hr % 12 || 12) + ':00 ' + (hr < 12 ? 'AM' : 'PM') + ' to ' + ((hr + 1) % 12 || 12) + ':00 ' + (hr + 1 < 12 || hr + 1 === 24 ? 'AM' : 'PM'), value: r2(xs.reduce((s, r) => s + net(r), 0)), count: xs.length});
        }
      } else if (days <= 62) {
        buckets = [];
        for (let d = new Date(a); d < b; d = addDays(d, 1)) {
          const k = dayKey(d), xs = ok.filter(r => dayKey(r.at) === k);
          buckets.push({tick: days <= 7 ? d.toLocaleDateString('en-PH', {weekday: 'short'}) : String(d.getDate()), full: dayLabel(k), value: r2(xs.reduce((s, r) => s + net(r), 0)), count: xs.length});
        }
      } else {
        buckets = [];
        for (let d = new Date(a.getFullYear(), a.getMonth(), 1); d < b; d = new Date(d.getFullYear(), d.getMonth() + 1, 1)) {
          const xs = ok.filter(r => { const t = new Date(r.at); return t.getFullYear() === d.getFullYear() && t.getMonth() === d.getMonth(); });
          buckets.push({tick: d.toLocaleDateString('en-PH', {month: 'short'}), full: d.toLocaleDateString('en-PH', {month: 'long', year: 'numeric'}), value: r2(xs.reduce((s, r) => s + net(r), 0)), count: xs.length});
        }
      }
      const tile = (label, value, small, cls) => el('div', {className: 'tl' + (cls ? ' ' + cls : '')}, [el('span', {textContent: label}), el('b', {textContent: value}), small ? el('small', {textContent: small}) : null]);
      const periodText = days <= 1 ? dayLabel(dayKey(a)) : shortDay(a) + ' to ' + shortDay(addDays(b, -1)) + ', ' + addDays(b, -1).getFullYear();
      const payRows = Object.entries(pays).sort((x, y) => y[1].amt - x[1].amt);
      const itemRows = Object.entries(items).sort((x, y) => y[1].amt - x[1].amt);
      const table = (heads, rows2) => el('table', {className: 't'}, [el('thead', {}, [el('tr', {}, heads.map(h => el('th', {textContent: h})))]),
        el('tbody', {}, rows2.map(r => el('tr', {}, r.map(v => el('td', {textContent: v})))))]);
      const cash = pays.Cash ? pays.Cash.amt : 0;
      out.replaceChildren(
        el('p', {className: 'note', textContent: periodText + (rows.some(r => r.demo) ? ' · includes demo sales' : '')}),
        el('div', {className: 'tiles'}, [
          tile('Net sales', peso(netSales), plural(ok.length, 'receipt') + (ok.length ? ' · average ' + peso(netSales / ok.length) : ''), 'hero'),
          tile('Gross sales', peso(gross), 'before discounts'), tile('Discounts', peso(discounts), ok.filter(r => r.senior).length + ' Sr/PWD'),
          tile('Refunds', peso(refunds), plural(ok.filter(r => r.refunded).length, 'receipt')), tile('Voided', peso(voided.reduce((s, r) => s + r.total, 0)), plural(voided.length, 'receipt')),
          tile('Cash expected', peso(cash), 'cash sales minus cash refunds')]),
        columnChart(days <= 1 ? 'Sales by hour' : days <= 62 ? 'Sales by day' : 'Sales by month', 'net sales', buckets),
        el('div', {className: 'two'}, [
          el('div', {}, [el('h3', {textContent: 'Payments'}), payRows.length ? table(['Type', 'Receipts', 'Amount'], payRows.map(([k, v]) => [k, v.n, peso(v.amt)])) : el('p', {className: 'note', textContent: 'No sales in this period.'})]),
          el('div', {}, [el('h3', {textContent: 'Items sold'}), itemRows.length ? table(['Item', 'Qty', 'Sales'], itemRows.slice(0, 12).map(([k, v]) => [k, v.qty, peso(v.amt)])) : el('p', {className: 'note', textContent: 'No items sold in this period.'}),
            itemRows.length > 12 ? el('p', {className: 'note', textContent: 'Top 12 of ' + itemRows.length + '. Export for the full list.'}) : null])]),
        el('div', {className: 'row2'}, [exportBtn('Export receipts (CSV)', () => exportReceipts(rows, a, b)), exportBtn('Export items sold (CSV)', () => download('items-sold-' + dayKey(a) + '.csv',
          csv([['Item', 'Qty sold', 'Sales (before ticket discounts)'], ...itemRows.map(([k, v]) => [k, v.qty, v.amt])]), 'text/csv'))]));
    };
    const exportBtn = (t, fn) => { const b = el('button', {className: 'btn o', textContent: t}); b.onclick = fn; return b; };
    bd.append(seg, custom, out);
    pick(cur);
  }, 'wide'));
}
function exportReceipts(rows, a) {
  download('receipts-' + dayKey(a) + '.csv', csv([['Receipt', 'Date', 'Time', 'Payment', 'Reference', 'Items', 'Subtotal', 'Discount', 'Discount type', 'Total', 'Refunded', 'Status', 'Cashier', 'SC/PWD ID', 'SC/PWD name', 'Lines'],
    ...rows.map(r => [r.no, dayKey(r.at), timeLabel(r.at), r.type, r.ref || '', r.qty, r.sub, r.disc || 0, r.discLabel || '', r.total, r.refunded || 0,
      r.voided ? 'Voided' : r.refunded ? 'Refunded' : 'Paid', r.cashier || '', r.senior ? r.senior.id : '', r.senior ? r.senior.name : '',
      r.lines.map(l => l.qty + 'x ' + l.name + ' @' + l.price).join('; ')])]), 'text/csv');
}
$('#repBtn').onclick = showReports;

// ---- open tickets ----------------------------------------------------------------------------------------
const held = () => jget('ppos-held', []);
function updHeld() { const n = held().length, b = $('#heldN'); b.hidden = !n; b.textContent = n; }
$('#holdBtn').onclick = () => {
  if (!ticket.length) { toast('Add items first, then save the ticket to finish it later.'); return; }
  sheet('Save ticket', (bd, close) => {
    const nm = el('input', {placeholder: 'e.g. Table 3, or the customer’s name', maxLength: 30});
    const ok = el('button', {className: 'btn g', textContent: 'Save ticket'});
    const go = () => {
      const h = held(); h.push({id: uid(), name: nm.value.trim() || 'Ticket ' + timeLabel(new Date()), at: new Date().toISOString(), lines: ticket.map(l => ({...l})), disc});
      jset('ppos-held', h); newSale(); close(); updHeld(); toast('Ticket saved. Open it again from the list icon.');
    };
    ok.onclick = go; nm.onkeydown = e => { if (e.key === 'Enter') go(); };
    bd.append(el('p', {className: 'note', textContent: 'Keep this order open (a table, or a customer who pays later) and start a new sale.'}), el('label', {}, ['Name', nm]), ok);
    setTimeout(() => nm.focus(), 60);
  });
};
$('#heldBtn').onclick = () => sheet('Open tickets', (bd, close) => {
  const h = held();
  if (!h.length) bd.append(el('p', {className: 'none', textContent: 'No open tickets. Use the bookmark button on the ticket to keep an order open for later.'}));
  for (const t of h) {
    const total = t.lines.reduce((a, l) => a + (IDX[l.id] ? IDX[l.id].price * l.qty : 0), 0), n = t.lines.reduce((a, l) => a + l.qty, 0);
    const b = el('button', {className: 'rrow'}, [el('span', {className: 'tm', textContent: timeLabel(t.at)}), el('span', {className: 'no'}, [t.name, el('small', {textContent: n + (n === 1 ? ' item' : ' items')})]), el('span', {className: 'amt', textContent: peso(total)})]);
    b.onclick = () => {
      const rest = held().filter(x => x.id !== t.id);
      if (ticket.length) rest.push({id: uid(), name: 'Ticket ' + timeLabel(new Date()), at: new Date().toISOString(), lines: ticket, disc});
      jset('ppos-held', rest); ticket = t.lines.filter(l => IDX[l.id]); disc = t.disc || null;
      close(); render(); updHeld(); $('#right').classList.add('open'); toast('Opened ' + t.name + (rest.length > h.length - 1 ? ' · the ticket you had open was saved' : ''));
    };
    bd.append(b);
  }
});

// ---- settings (owner) ---------------------------------------------------------------------------------
let installEvt = null;
addEventListener('beforeinstallprompt', e => { e.preventDefault(); installEvt = e; });
function install() {
  if (installEvt) { installEvt.prompt(); installEvt.userChoice.finally(() => { installEvt = null; }); return; }
  sheet('Install Purrfect POS', (bd) => bd.append(el('ol', {className: 'stepslist'}, [
    el('li', {textContent: 'Android: open this page in Chrome, tap the ⋮ menu, then “Install app” or “Add to Home screen”.'}),
    el('li', {textContent: 'iPhone or iPad: open it in Safari, tap Share, then “Add to Home Screen”.'}),
    el('li', {textContent: 'Windows or Mac: in Chrome or Edge, click the install icon at the right end of the address bar.'})]),
    el('p', {className: 'note', textContent: 'Installed, it opens like an app and works without internet.'})));
}

function showSettings() {
  guard(() => sheet('Settings', (bd, close) => {
    const name = el('input', {value: S.shop.name, maxLength: 40, placeholder: 'e.g. Kape ni Juan'});
    const lines = el('textarea', {value: S.shop.lines.join('\n'), placeholder: 'Address, phone, Facebook page (one per line)', maxLength: 240});
    const tin = el('input', {value: S.shop.tin, maxLength: 24, placeholder: 'optional'});
    const footer = el('input', {value: S.shop.footer, maxLength: 80});
    const notOff = el('input', {type: 'checkbox', checked: S.shop.notOfficial});
    let logo = S.logo;
    const logoWrap = el('div', {className: 'photo'}), lpick = el('input', {type: 'file', accept: 'image/*', hidden: true});
    const lBtn = el('button', {className: 'btn o sm'}), lDel = el('button', {className: 'btn o sm danger', textContent: 'Remove logo'});
    const lBox = () => { lBtn.textContent = logo ? 'Change logo' : 'Add logo'; lDel.hidden = !logo; logoWrap.replaceChildren(logo ? el('img', {src: logo, alt: 'Logo'}) : el('span', {className: 'ph0'}), lBtn, lDel); };
    lBtn.onclick = () => lpick.click(); lDel.onclick = () => { logo = ''; lBox(); };
    lpick.onchange = async () => { const f = lpick.files[0]; lpick.value = ''; if (f) { try { logo = await fitLogo(f); lBox(); } catch (e) { toast('That image could not be read.'); } } };
    lBox();
    const cashier = el('input', {value: S.cashier, maxLength: 30, placeholder: 'optional'});
    const prefix = el('input', {value: S.prefix, maxLength: 4, placeholder: 'e.g. A', autocapitalize: 'characters'});
    const pays = el('div', {className: 'chips'}, PAY_TYPES.map(p => el('label', {}, [el('input', {type: 'checkbox', value: p, checked: p === 'Cash' || S.pays.includes(p), disabled: p === 'Cash'}), p])));
    const sr = el('select', {}, [new Option('The whole ticket', 'all'), new Option('One piece of the highest-priced item', 'top')]); sr.value = S.srMode;
    const lowD = el('input', {type: 'number', inputMode: 'decimal', min: 0, step: 'any', value: S.lowDefault});
    const err = el('p', {className: 'warn'}), save = el('button', {className: 'btn g', textContent: 'Save settings'});
    save.onclick = () => {
      S.shop = {name: name.value.trim(), lines: lines.value.split('\n').map(x => x.trim()).filter(Boolean).slice(0, 5), tin: tin.value.trim(), footer: footer.value.trim(), notOfficial: notOff.checked};
      if (S.logo !== logo) { S.logo = logo; for (const k in logoCache) delete logoCache[k]; }
      S.cashier = cashier.value.trim(); S.prefix = prefix.value.trim().toUpperCase().replace(/[^A-Z0-9]/g, '');
      S.pays = [...pays.querySelectorAll('input:checked')].map(x => x.value); S.srMode = sr.value; S.lowDefault = Number(lowD.value) || 0;
      saveS(); applyShop(); render(); close(); toast('Settings saved');
    };
    const pinBtn = el('button', {className: 'btn o', textContent: S.pin ? 'Change or remove the owner PIN' : 'Set an owner PIN'}); pinBtn.onclick = () => { close(); setPin(); };
    const prBtn = el('button', {className: 'btn o', textContent: 'Printer'}); prBtn.onclick = () => { close(); showPrinter(); };
    const stBtn = el('button', {className: 'btn o', textContent: 'Staff and time clock · Pro'}); stBtn.onclick = () => { close(); showStaff(); };
    const inBtn = el('button', {className: 'btn o', textContent: 'Install as an app'}); inBtn.onclick = install;
    const bkBtn = el('button', {className: 'btn o', textContent: 'Back up'}), rsBtn = el('button', {className: 'btn o', textContent: 'Restore'});
    const rfile = el('input', {type: 'file', accept: '.json,application/json', hidden: true});
    bkBtn.onclick = () => backup().catch(e => toast('Backup failed: ' + e.message)); rsBtn.onclick = () => rfile.click();
    rfile.onchange = () => { const f = rfile.files[0]; rfile.value = ''; if (f) { close(); restore(f); } };
    const bkNote = el('p', {className: 'note', textContent: 'Everything is saved on this device only.'});
    db.count().then(n => { const at = store.get('ppos-backup-at'); bkNote.textContent = n + ' receipts and ' + ITEMS.length + ' items on this device. ' + (at ? 'Last backup: ' + when(at) + '.' : 'No backup yet: download one every week and keep it in Google Drive or email.'); });
    bd.append(el('h3', {textContent: 'Your shop'}), el('label', {}, ['Shop name (top of the receipt)', name]), el('label', {}, ['Receipt lines', lines]),
      el('div', {className: 'row2'}, [el('label', {}, ['TIN', tin]), el('label', {}, ['Cashier name', cashier])]),
      el('label', {}, ['Thank-you line', footer]), el('label', {}, ['Logo (prints on receipts)']), logoWrap, lpick,
      el('label', {className: 'tog'}, [el('span', {textContent: 'Print “This is not an official receipt”'}), notOff]),
      el('h3', {textContent: 'Selling'}), el('label', {}, ['Payment buttons']), pays, el('label', {}, ['Sr/PWD 20% applies to', sr]),
      el('div', {className: 'row2'}, [el('label', {}, ['Low-stock warning at', lowD]), el('label', {}, ['Receipt number prefix', prefix])]),
      el('p', {className: 'note', textContent: 'Give each phone or tablet its own prefix (A, B, …) so receipt numbers never repeat across devices.'}), err, save,
      el('h3', {textContent: 'Security and device'}), pinBtn, el('div', {className: 'row2'}, [prBtn, inBtn]), stBtn,
      el('h3', {textContent: 'Shop camera'}), camBoxSetting(),
      el('h3', {textContent: 'Online back office'}), officeBox(),
      el('h3', {textContent: 'Backup'}), bkNote, el('div', {className: 'row2'}, [bkBtn, rsBtn]), rfile,
      el('h3', {textContent: 'License'}), licenseBox(close),
      el('p', {className: 'note'}, ['Purrfect POS by ', el('a', {href: 'https://purrfectdigital.online/', target: '_blank', rel: 'noopener', textContent: 'Purrfect Digitalization'}),
        '. Help: ', el('a', {href: 'https://purrfectdigital.online/point-of-sale.html#help', target: '_blank', rel: 'noopener', textContent: 'guide and FAQ'}), '. Version ' + APP_V + '.']));
  }));
}
$('#setBtn').onclick = showSettings;

function camBoxSetting() {   // applies at once (no Save): Off / this device's webcam
  const sel = el('select', {}, [new Option('Off', ''), new Option('This device\'s webcam (live + record)', 'local')]);
  sel.value = S.cam || '';
  sel.onchange = () => {
    if (!sel.value && !camClose()) { sel.value = 'local'; return; }
    S.cam = sel.value; saveS(); store.set('ppos-cam-hide', ''); camSync();
    toast(S.cam ? 'Camera on: it shows in the upper right' : 'Camera off');
  };
  return el('div', {}, [el('label', {}, ['Camera', sel]),
    el('p', {className: 'note', textContent: 'Watch your counter in the corner of the POS with this computer\'s own webcam. Record saves video to a folder on this computer, a new file every 5 minutes; Motion records only when something moves and stops 30 seconds after things go still. Nothing is uploaded. Best on a computer in Chrome or Edge.'})]);
}

function officeBox() {
  if (!licensed()) return el('p', {className: 'note', textContent: 'Activate your license to check sales, staff and profit from any phone in the online back office.'});
  const on = el('input', {type: 'checkbox', checked: !!S.office}), status = el('p', {className: 'note'});
  const openB = el('button', {className: 'btn o', textContent: 'Open back office', disabled: !S.office});
  const paint = () => {
    const at = store.get(SYNC_AT), q = jget(SYNC_Q, []).length, err = store.get('ppos-sync-err');
    status.textContent = !S.office ? 'Off: your sales stay on this device only.'
      : (at ? 'Last sent ' + when(at) + '.' : 'Nothing sent yet.') + (q ? ' ' + plural(q, 'receipt') + ' waiting' + (navigator.onLine ? (err ? ' (' + err + ').' : '…') : ' for the internet.') : '');
    openB.disabled = !S.office;
  };
  on.onchange = async () => {
    if (on.checked) await officeStart(paint);
    else { S.office = false; saveS(); clearTimeout(syncTimer); jset(SYNC_Q, []); toast('Online back office off. What was already sent stays there.'); }
    paint();
  };
  openB.onclick = openOffice;
  paint();
  return el('div', {}, [el('label', {className: 'tog'}, [el('span', {textContent: 'Send sales, staff hours and stock to my back office'}), on]),
    el('p', {className: 'note', textContent: 'See today’s sales, who is at work and your net profit from any phone. Only you can open it: from here, or with a link we email you.'}),
    status, openB]);
}
async function officeStart(queued) {   // turns the back office on: the last 60 days go up first
  S.office = true; saveS();
  const rs = await db.range(new Date(Date.now() - 60 * 864e5).toISOString(), new Date(Date.now() + 864e5).toISOString());
  jset(SYNC_Q, rs.filter(r => !r.demo).map(r => r.no)); toast('Online back office on'); if (queued) queued();
  await syncNow();
}
// a licensed register asks once, so owners find the back office without looking in Settings (Vince, 5 Nov 2026: "IDK, fix this")
function officeAsk() {
  if (!licensed() || S.office || S.officeAsked || ticket.length || topVeil()) return;
  S.officeAsked = true; saveS();
  sheet('Online back office', (bd, close) => {
    const on = el('button', {className: 'btn g', textContent: 'Turn on'}), later = el('button', {className: 'btn o', textContent: 'Not now'});
    later.onclick = close;
    on.onclick = () => guard(async () => {
      on.disabled = true; await officeStart();
      bd.replaceChildren(el('p', {textContent: 'It’s on. Your sales, time clock and stock are on their way to your back office.'}),
        el('div', {className: 'row2'}, [el('button', {className: 'btn g', textContent: 'Open back office', onclick: () => { close(); openOffice(); }}),
          el('button', {className: 'btn o', textContent: 'Done', onclick: close})]));
    });
    bd.append(el('p', {textContent: 'New in Purrfect POS: see today’s sales, who is at work and your net profit from any phone, wherever you are.'}),
      el('p', {className: 'note', textContent: 'Your sales, time clock and stock are copied to your own back office. Only you can open it: from Settings › Online back office, or with a link we email you. You can turn it off there any time.'}),
      el('div', {className: 'row2'}, [on, later]));
  });
}
async function openOffice() {
  const w = window.open('about:blank', '_blank');   // opened in the tap itself, so no pop-up blocker stops it
  try {
    const r = await fetch(API, {method: 'POST', body: JSON.stringify({pos: 'officeOpen', key: LIC.key, dev: DEV})}).then(x => x.json());
    if (!r || !r.ok) throw new Error((r && r.error) || 'The back office could not be opened.');
    if (w) w.location.href = r.url; else location.href = r.url;
  } catch (e) { if (w) w.close(); toast(/fetch|network/i.test(String(e && e.message)) ? 'No internet connection.' : e.message); }
}

function fitLogo(file) {   // keep logos small: at most 512 px wide, PNG keeps transparency
  return new Promise((res, rej) => {
    const url = URL.createObjectURL(file), img = new Image();
    img.onload = () => {
      const sc = Math.min(1, 512 / img.width, 256 / img.height), w = Math.round(img.width * sc), h = Math.round(img.height * sc);
      const cv = el('canvas', {width: w, height: h}); cv.getContext('2d').drawImage(img, 0, 0, w, h);
      URL.revokeObjectURL(url); res(cv.toDataURL('image/png'));
    };
    img.onerror = () => { URL.revokeObjectURL(url); rej(new Error('bad image')); };
    img.src = url;
  });
}

function setPin() {
  sheet(S.pin ? 'Owner PIN' : 'Set an owner PIN', (bd, close) => {
    const a = el('input', {type: 'password', inputMode: 'numeric', maxLength: 8, autocomplete: 'new-password', placeholder: '4 to 8 digits'});
    const b = el('input', {type: 'password', inputMode: 'numeric', maxLength: 8, autocomplete: 'new-password', placeholder: 'same again'});
    const err = el('p', {className: 'warn'}), ok = el('button', {className: 'btn g', textContent: 'Save PIN'});
    ok.onclick = async () => {
      if (!/^\d{4,8}$/.test(a.value)) { err.textContent = 'Use 4 to 8 digits.'; return; }
      if (a.value !== b.value) { err.textContent = 'The two PINs are different.'; return; }
      const salt = uid(); S.pin = {salt, hash: await hashPin(a.value, salt)}; saveS(); unlockedUntil = Date.now() + 10 * 60000; close(); toast('Owner PIN saved');
    };
    bd.append(el('p', {className: 'note', textContent: 'With a PIN, staff can sell and print, but items, prices, reports, settings, voids and refunds need the PIN.'}),
      el('label', {}, ['New PIN', a]), el('label', {}, ['Type it again', b]), err, ok);
    if (S.pin) { const rm = el('button', {className: 'btn o danger', textContent: 'Remove the PIN'}); rm.onclick = () => { S.pin = null; saveS(); close(); toast('PIN removed'); }; bd.append(rm); }
    setTimeout(() => a.focus(), 60);
  });
}

async function backup() {
  const receipts = await db.all(), photos = {};
  for (const i of ITEMS) { const p = photoOf(i.id); if (p) photos[i.id] = p; }
  download('purrfect-pos-backup-' + dayKey(new Date()) + '.json',
    JSON.stringify({app: 'purrfect-pos', v: 2, at: new Date().toISOString(), settings: S, items: ITEMS, photos, held: held(), receipts,
      staff: STAFF, sched: SCHED, punches: PUNCH, ot: OT}), 'application/json');
  store.set('ppos-backup-at', new Date().toISOString());
  toast('Backup downloaded (' + receipts.length + ' receipts). Keep the file somewhere safe.');
}
async function restore(file) {
  let data;
  try { data = JSON.parse(await file.text()); } catch (e) { toast('That file is not a Purrfect POS backup.'); return; }
  if (!data || data.app !== 'purrfect-pos' || !Array.isArray(data.items)) { toast('That file is not a Purrfect POS backup.'); return; }
  confirmBox('Restore this backup?', 'From ' + when(data.at) + ': ' + data.items.length + ' items and ' + (data.receipts || []).length + ' receipts. Your items and settings here are replaced; receipts are added to the ones already on this device.', 'Restore', async () => {
    store.keys().filter(k => k.startsWith('ppos-ph-')).forEach(store.del);
    S = Object.assign({}, DEFAULTS, data.settings || {}); S.shop = Object.assign({}, DEFAULTS.shop, S.shop || {}); saveS();
    ITEMS = data.items; for (const [id, p] of Object.entries(data.photos || {})) store.set('ppos-ph-' + id, p);
    jset('ppos-held', data.held || []);
    if (Array.isArray(data.staff)) { STAFF = data.staff; SCHED = data.sched || {}; PUNCH = data.punches || []; OT = data.ot || []; saveStaff(); savePunch(); saveOT(); }   // Pro staff (v2 backups)
    try { await db.putAll(data.receipts || []); } catch (e) { toast('Some receipts could not be restored: ' + e.message); }
    for (const k in logoCache) delete logoCache[k];
    saveItems(); applyShop(); buildCats(); render(); updHeld(); toast('Backup restored');
  });
}

// ---- Pro: staff, time clock, overtime, schedule --------------------------------------------------------
// Purrfect POS Pro (₱1,500 one time, ₱300 until 31 Dec 2026): up to 3 staff with their own PIN, on up to 3 devices; a time clock,
// overtime that waits for the owner's OK, a weekly schedule and an hours report. Like sales, these records stay on this device.
// A base license sees what Pro adds and how to upgrade (the same key turns Pro); the demo lets anyone try it.
const PRO_MAX = 3, PRO_PRICE = PROMO ? '₱300' : '₱1,500', AV = ['#e65100', '#1565c0', '#2e7d32'];
const isPro = () => licensed() && LIC.tier === 'pro';
const proOpen = () => !licensed() || isPro();
let STAFF = jget('ppos-staff', []);     // [{id, name, role, pin: {salt, hash}}]
let SCHED = jget('ppos-sched', {});     // {staff id: 7 days, Sunday first: null (off) or {start: 'HH:MM', end: 'HH:MM'}}
let PUNCH = jget('ppos-punches', []);   // [{id, staff, in, out}] ISO times; out is null while clocked in
let OT = jget('ppos-ot', []);           // [{id, staff, day, hours, reason, status: 'waiting' | 'approved' | 'declined', at, decided}]
const saveStaff = () => { if (!jset('ppos-staff', STAFF) || !jset('ppos-sched', SCHED)) toast('This device is out of storage: staff were not saved.'); };
const savePunch = () => { if (!jset('ppos-punches', PUNCH)) toast('This device is out of storage: the time clock was not saved.'); syncSoon(5000); };
const saveOT = () => { jset('ppos-ot', OT); updOT(); };
const openPunch = id => PUNCH.find(p => p.staff === id && !p.out);
const staffOf = id => STAFF.find(s => s.id === id) || {name: 'Removed staff', role: ''};
const hhmm = t => { const [h, m] = t.split(':').map(Number); return timeLabel(new Date(2000, 0, 1, h, m)); };
const shortT = t => hhmm(t).replace(':00', '').replace(/\s?([AP])M/i, (x, a) => a.toLowerCase());     // '07:00' -> '7a'
const shiftOf = (id, d) => (SCHED[id] || [])[new Date(d).getDay()] || null;
const hrs = p => Math.max(0, ((p.out ? new Date(p.out) : new Date()) - new Date(p.in)) / 36e5);
const fmtH = h => (Math.round(h * 100) / 100).toLocaleString('en-PH', {maximumFractionDigits: 2}) + ' h';
function updOT() { const n = proOpen() ? OT.filter(o => o.status === 'waiting').length : 0, b = $('#otN'); b.hidden = !n; b.textContent = n; }
const avatar = s => el('span', {className: 'av', textContent: (s.name || '?').trim().charAt(0).toUpperCase()}, []);
const paintAv = (a, i) => { a.style.background = AV[i % AV.length]; return a; };
const proTag = () => el('span', {className: 'protag', textContent: licensed() ? 'PRO' : 'PRO · try it in the demo'});

function pinCheck(title, salt, hash, fn, note) {   // a staff member's own PIN
  sheet(title, (bd, close) => {
    const pin = el('input', {type: 'password', inputMode: 'numeric', autocomplete: 'off', maxLength: 8, placeholder: '••••', ariaLabel: 'PIN'});
    const err = el('p', {className: 'warn'}), ok = el('button', {className: 'btn g', textContent: 'OK'});
    const go = async () => { if (await hashPin(pin.value, salt) === hash) { close(); fn(); } else { err.textContent = 'Wrong PIN.'; pin.value = ''; pin.focus(); } };
    ok.onclick = go; pin.onkeydown = e => { if (e.key === 'Enter') go(); };
    bd.append(el('p', {className: 'note', textContent: note || 'Enter your PIN.'}), pin, err, ok);
    setTimeout(() => pin.focus(), 60);
  });
}

function showClock() {   // what staff use at the counter: no owner PIN, each person's own PIN
  if (!proOpen()) return proPitch();
  sheet('Time clock', (bd, close) => {
    const list = el('div', {className: 'rlist'});
    const draw = () => {
      list.replaceChildren();
      if (!STAFF.length) list.append(el('p', {className: 'none', textContent: 'No staff yet. Tap “Staff, schedule and overtime” to add up to ' + PRO_MAX + ' staff, each with their own PIN.'}));
      STAFF.forEach((s, i) => {
        const p = openPunch(s.id), sh = shiftOf(s.id, new Date());
        const sub = p ? 'In since ' + timeLabel(p.in) : sh ? 'Shift today ' + hhmm(sh.start) + '–' + hhmm(sh.end) : 'Off today';
        const io = el('button', {className: 'btn sm ' + (p ? 'o' : 'g'), textContent: p ? 'Clock out' : 'Clock in'});
        io.onclick = () => pinCheck(s.name, s.pin.salt, s.pin.hash, () => {
          if (p) { p.out = new Date().toISOString(); toast(s.name + ' clocked out at ' + timeLabel(p.out) + ' · ' + fmtH(hrs(p))); }
          else { PUNCH.push({id: uid(), staff: s.id, in: new Date().toISOString(), out: null}); toast(s.name + ' clocked in at ' + timeLabel(new Date())); }
          savePunch(); draw();
        }, (p ? 'Clock out' : 'Clock in') + ': enter your PIN.');
        const ot = el('button', {className: 'btn o sm', textContent: 'Overtime'});
        ot.onclick = () => pinCheck(s.name, s.pin.salt, s.pin.hash, () => requestOT(s, draw), 'Overtime request: enter your PIN.');
        list.append(el('div', {className: 'srow'}, [paintAv(avatar(s), i), el('span', {className: 'no'}, [s.name, el('small', {textContent: [s.role, sub].filter(Boolean).join(' · ')})]),
          el('span', {className: 'acts2'}, [ot, io])]));
      });
    };
    const own = el('button', {className: 'btn o', textContent: 'Staff, schedule and overtime'}); own.onclick = () => { close(); showStaff(); };
    bd.append(proTag(), list, own, el('p', {className: 'note', textContent: 'Each staff member clocks in and out with their own PIN. Overtime waits for the owner’s OK. These records stay on this device.'}));
    draw();
  });
}

function requestOT(s, after) {
  sheet('Overtime request', (bd, close) => {
    let h = 1; const out = el('output', {textContent: fmtH(h)});
    const minus = el('button', {textContent: '−', ariaLabel: 'Less'}), plus = el('button', {textContent: '+', ariaLabel: 'More'});
    minus.onclick = () => { h = Math.max(.5, h - .5); out.textContent = fmtH(h); }; plus.onclick = () => { h = Math.min(8, h + .5); out.textContent = fmtH(h); };
    const why = el('input', {placeholder: 'e.g. Inventory count', maxLength: 60});
    const send = el('button', {className: 'btn g', textContent: 'Send to the owner'});
    send.onclick = () => {
      OT.push({id: uid(), staff: s.id, day: dayKey(new Date()), hours: h, reason: why.value.trim(), status: 'waiting', at: new Date().toISOString()});
      saveOT(); close(); toast('Sent: the overtime waits for the owner’s OK'); if (after) after();
    };
    bd.append(el('p', {className: 'note', textContent: s.name + ' · today, ' + dayLabel(dayKey(new Date()))}), el('div', {className: 'stepper'}, [minus, out, plus]),
      el('label', {}, ['Reason', why]), send);
  });
}

function showStaff() {   // the owner's side: staff, overtime approvals, the weekly schedule and hours
  if (!proOpen()) return proPitch();
  guard(() => sheet('Staff', (bd) => {
    const otBox = el('div', {className: 'rlist'}), staffBox = el('div', {className: 'rlist'}), sched = el('div', {className: 'sched'}), hours = el('div');
    const add = el('button', {className: 'btn g', textContent: 'Add staff'});
    let period = 'week';
    const draw = () => {
      updOT();
      const waiting = OT.filter(o => o.status === 'waiting'), recent = OT.filter(o => o.status !== 'waiting').slice(-5).reverse();
      otBox.replaceChildren(...(waiting.length || recent.length ? [] : [el('p', {className: 'note', textContent: 'No overtime requests. Staff send them from the time clock.'})]));
      for (const o of [...waiting, ...recent]) {
        const s = staffOf(o.staff), i = STAFF.indexOf(s), info = fmtH(o.hours) + ' · ' + dayLabel(o.day) + (o.reason ? ' · ' + o.reason : '');
        const kids = [paintAv(avatar(s), Math.max(0, i)), el('span', {className: 'no'}, [s.name, el('small', {textContent: info})])];
        if (o.status === 'waiting') {
          const no = el('button', {className: 'btn o sm', textContent: 'Decline'}), yes = el('button', {className: 'btn g sm', textContent: 'Approve'});
          const decide = st => () => { o.status = st; o.decided = new Date().toISOString(); saveOT(); draw(); toast('Overtime ' + st + ' for ' + s.name); };
          no.onclick = decide('declined'); yes.onclick = decide('approved');
          kids.push(el('span', {className: 'acts2'}, [no, yes]));
        } else kids.push(el('span', {className: 'stat ' + o.status, textContent: o.status === 'approved' ? 'Approved' : 'Declined'}));
        otBox.append(el('div', {className: 'srow'}, kids));
      }
      staffBox.replaceChildren(...STAFF.map((s, i) => {
        const b = el('button', {className: 'srow'}, [paintAv(avatar(s), i), el('span', {className: 'no'}, [s.name, el('small', {textContent: s.role || 'Staff'})]), el('span', {className: 'amt', textContent: 'Edit'})]);
        b.onclick = () => editStaff(s, draw); return b;
      }));
      if (!STAFF.length) staffBox.append(el('p', {className: 'note', textContent: 'Add the people who work the counter. Each gets a PIN for the time clock.'}));
      add.hidden = STAFF.length >= PRO_MAX;
      const days = [1, 2, 3, 4, 5, 6, 0];                  // Monday first on screen; stored Sunday first like Date#getDay
      sched.replaceChildren(el('span'), ...days.map(d => el('span', {className: 'h', textContent: ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'][d]})));
      STAFF.forEach(s => {
        sched.append(el('span', {className: 'nm', textContent: s.name}));
        for (const d of days) {
          const sh = (SCHED[s.id] || [])[d], c = el('button', {className: sh ? 'on' : '', textContent: sh ? shortT(sh.start) + '–' + shortT(sh.end) : 'Off'});
          c.onclick = () => editShift(s, d, draw); sched.append(c);
        }
      });
      drawHours();
    };
    const seg = el('div', {className: 'seg'}, [['week', 'This week'], ['last', 'Last week'], ['month', 'This month']].map(([k, t]) => {
      const b = el('button', {textContent: t}); b.setAttribute('aria-pressed', k === period); b.onclick = () => { period = k; seg.querySelectorAll('button').forEach(x => x.setAttribute('aria-pressed', x === b)); drawHours(); }; return b;
    }));
    const range = () => {
      const t = new Date(), mon = addDays(t, -((t.getDay() + 6) % 7));
      if (period === 'month') return [new Date(t.getFullYear(), t.getMonth(), 1), new Date(t.getFullYear(), t.getMonth() + 1, 1)];
      return period === 'last' ? [addDays(mon, -7), mon] : [mon, addDays(mon, 7)];
    };
    const inRange = ([a, b], d) => { const x = new Date(d); return x >= a && x < b; };
    const exp = el('button', {className: 'btn o', textContent: 'Export hours (CSV)'});
    function drawHours() {
      const r = range(), ps = PUNCH.filter(p => inRange(r, p.in)), os = OT.filter(o => o.status === 'approved' && inRange(r, o.day + 'T12:00:00'));
      const rows = STAFF.map(s => { const mine = ps.filter(p => p.staff === s.id);
        return [s.name, new Set(mine.map(p => dayKey(p.in))).size, fmtH(mine.reduce((a, p) => a + hrs(p), 0)), fmtH(os.filter(o => o.staff === s.id).reduce((a, o) => a + o.hours, 0))]; });
      hours.replaceChildren(el('table', {className: 't'}, [el('thead', {}, [el('tr', {}, ['Staff', 'Days', 'Hours', 'OT approved'].map(h => el('th', {textContent: h})))]),
        el('tbody', {}, rows.length ? rows.map(r => el('tr', {}, r.map(v => el('td', {textContent: v})))) : [el('tr', {}, [el('td', {textContent: 'No staff yet'})])])]));
      exp.onclick = () => download('purrfect-pos-hours-' + dayKey(r[0]) + '.csv', csv([['Staff', 'Role', 'Date', 'Clock in', 'Clock out', 'Hours', 'Approved overtime (h)'],
        ...ps.map(p => { const s = staffOf(p.staff); return [s.name, s.role, dayKey(p.in), timeLabel(p.in), p.out ? timeLabel(p.out) : 'still in', r2(hrs(p)),
          r2(os.filter(o => o.staff === p.staff && o.day === dayKey(p.in)).reduce((a, o) => a + o.hours, 0))]; })]), 'text/csv');
    }
    add.onclick = () => editStaff(null, draw);
    bd.append(proTag(), el('h3', {textContent: 'Overtime requests'}), otBox, el('h3', {textContent: 'Staff (up to ' + PRO_MAX + ')'}), staffBox, add,
      el('h3', {textContent: 'Weekly schedule'}), el('p', {className: 'note', textContent: 'Tap a day to set the shift. The same week repeats until you change it.'}), sched,
      el('h3', {textContent: 'Hours'}), seg, hours, exp, el('p', {className: 'note', textContent: 'Hours come from the time clock on this device. Export them for payroll.'}));
    draw();
  }, 'wide'));
}

function editStaff(s, after) {
  sheet(s ? 'Edit ' + s.name : 'Add staff', (bd, close) => {
    const name = el('input', {value: s ? s.name : '', maxLength: 24, placeholder: 'e.g. Ana'}), role = el('input', {value: s ? s.role : '', maxLength: 24, placeholder: 'e.g. Cashier'});
    const a = el('input', {type: 'password', inputMode: 'numeric', maxLength: 8, autocomplete: 'new-password', placeholder: s ? 'leave empty to keep' : '4 to 8 digits'});
    const err = el('p', {className: 'warn'}), save = el('button', {className: 'btn g', textContent: 'Save'});
    save.onclick = async () => {
      const n = name.value.trim();
      if (!n) { err.textContent = 'Type a name.'; return; }
      if ((!s || a.value) && !/^\d{4,8}$/.test(a.value)) { err.textContent = 'The PIN is 4 to 8 digits.'; return; }
      if (!s && STAFF.length >= PRO_MAX) { err.textContent = 'Pro has up to ' + PRO_MAX + ' staff.'; return; }
      const x = s || {id: uid()}; x.name = n; x.role = role.value.trim();
      if (a.value) { const salt = uid(); x.pin = {salt, hash: await hashPin(a.value, salt)}; }
      if (!s) { STAFF.push(x); SCHED[x.id] = [null, null, null, null, null, null, null]; }
      saveStaff(); close(); after(); toast(n + ' saved');
    };
    bd.append(el('label', {}, ['Name', name]), el('label', {}, ['Role (optional)', role]), el('label', {}, [s ? 'New PIN' : 'PIN for the time clock', a]), err, save);
    if (s) {
      const rm = el('button', {className: 'btn o danger', textContent: 'Remove ' + s.name});
      rm.onclick = () => confirmBox('Remove ' + s.name + '?', 'Their past time clock records stay in the hours report.', 'Remove', () => {
        STAFF = STAFF.filter(x => x !== s); delete SCHED[s.id]; saveStaff(); close(); after();
      });
      bd.append(rm);
    }
    setTimeout(() => name.focus(), 60);
  });
}

function editShift(s, d, after) {
  const day = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'][d], cur = (SCHED[s.id] || [])[d];
  sheet(s.name + ' · ' + day, (bd, close) => {
    const start = el('input', {type: 'time', value: cur ? cur.start : '08:00'}), end = el('input', {type: 'time', value: cur ? cur.end : '17:00'});
    const all = el('input', {type: 'checkbox'}), err = el('p', {className: 'warn'});
    const put = v => { SCHED[s.id] = SCHED[s.id] || [null, null, null, null, null, null, null]; if (all.checked) [1, 2, 3, 4, 5].forEach(k => { SCHED[s.id][k] = v; }); SCHED[s.id][d] = v; saveStaff(); close(); after(); };
    const save = el('button', {className: 'btn g', textContent: 'Save shift'}), off = el('button', {className: 'btn o', textContent: 'Day off'});
    save.onclick = () => { if (!start.value || !end.value) { err.textContent = 'Set the start and end.'; return; } put({start: start.value, end: end.value}); };
    off.onclick = () => put(null);
    bd.append(el('div', {className: 'row2'}, [el('label', {}, ['Start', start]), el('label', {}, ['End', end])]),
      el('label', {className: 'tog'}, [el('span', {textContent: 'Also Monday to Friday'}), all]), err, el('div', {className: 'row2'}, [off, save]));
  });
}

function proPitch() {   // a base license: what Pro adds and how the same key turns Pro
  sheet('Purrfect POS Pro', (bd, close) => {
    const up = el('a', {className: 'btn g', href: UPGRADE + '=' + LIC.key, target: '_blank', rel: 'noopener', textContent: 'Upgrade · ' + PRO_PRICE + (PROMO ? ' (80% off)' : '')});
    const err = el('p', {className: 'warn'}), chk = el('button', {className: 'btn o', textContent: 'I upgraded: check now'});
    chk.onclick = async () => {
      chk.disabled = true; err.textContent = '';
      try { await activate(LIC.key); applyLicense(); if (isPro()) { close(); toast('Purrfect POS Pro is on'); } else err.textContent = 'This key is not Pro yet. We confirm each payment by hand, usually within a few hours between 8 AM and 10 PM.'; }
      catch (e) { err.textContent = e.message; } finally { chk.disabled = false; }
    };
    bd.append(el('span', {className: 'protag', textContent: 'PRO'}),
      el('ul', {className: 'stepslist'}, ['Up to 3 staff, each with their own PIN, on up to 3 phones, tablets or computers.', 'A time clock: staff clock in and out right on the register.',
        'Overtime that waits for your OK.', 'A weekly staff schedule, and an hours report you can export for payroll.'].map(t => el('li', {textContent: t}))),
      el('p', {className: 'note', textContent: (PROMO ? '₱300 one time until Dec 31 (80% off ₱1,500). ' : '₱1,500, one time. ') + 'Your same license key turns Pro, and everything on this device stays.'}),
      up, chk, err);
  });
}
$('#clockBtn').onclick = showClock;

// ---- license ------------------------------------------------------------------------------------------
const UPGRADE = 'https://purrfectdigital.online/point-of-sale.html#pro';
function licenseBox(closeParent) {
  if (licensed()) {
    const box = el('div', {className: 'lic'}, [el('p', {className: 'ok', textContent: '✓ Licensed' + (isPro() ? ' · Pro' : '') + (LIC.name ? ' to ' + LIC.name : '')}),
      el('p', {className: 'note', textContent: 'Key ' + LIC.key.slice(0, 6) + '••••-••••-' + LIC.key.slice(-4) + ' · activated ' + when(LIC.at) + (isPro() ? ' · up to 3 staff and 3 devices' : ' · 1 device')})]);
    if (!isPro()) { const b = el('button', {className: 'btn o', textContent: 'Purrfect POS Pro · ' + PRO_PRICE}); b.onclick = () => { if (closeParent) closeParent(); proPitch(); }; box.append(b); }
    return box;
  }
  const act = el('button', {className: 'btn g', textContent: 'Enter license key'}); act.onclick = () => { if (closeParent) closeParent(); showActivate(); };
  return el('div', {className: 'lic'}, [el('p', {textContent: 'Demo mode. A license (' + (PROMO ? '₱179 until Dec 31, 40% off ₱299' : '₱299, one time') + ') removes the DEMO marks from receipts.'}),
    el('div', {className: 'row2'}, [act, el('a', {className: 'btn o', href: BUY, target: '_blank', rel: 'noopener', textContent: 'Buy · ' + PRICE})])]);
}
async function activate(raw) {
  const c = String(raw || '').toUpperCase().replace(/[^A-Z0-9]/g, '');
  if (!/^PDPOS[A-Z0-9]{12}$/.test(c)) throw new Error('A license key looks like PDPOS-XXXX-XXXX-XXXX.');
  const key = 'PDPOS-' + c.slice(5, 9) + '-' + c.slice(9, 13) + '-' + c.slice(13, 17);
  let r;
  try { r = await fetch(API + '?pos=activate&key=' + encodeURIComponent(key) + '&dev=' + encodeURIComponent(DEV), {cache: 'no-store'}).then(x => x.json()); }
  catch (e) { throw new Error('No internet connection. Activating needs the internet once; after that the app works offline.'); }
  if (!r || !r.ok) throw new Error((r && r.error) || 'That key was not accepted.');
  LIC = {key, name: r.name || '', tier: r.tier === 'pro' ? 'pro' : 'base', at: (LIC && LIC.key === key && LIC.at) || new Date().toISOString()};
  jset('ppos-license', LIC); updOT();
}
function showActivate(prefill) {
  sheet('Activate Purrfect POS', (bd, close) => {
    const key = el('input', {value: prefill || '', placeholder: 'PDPOS-XXXX-XXXX-XXXX', autocomplete: 'off', autocapitalize: 'characters', spellcheck: false});
    const err = el('p', {className: 'warn'}), go = el('button', {className: 'btn g', textContent: 'Activate'});
    const run = async () => {
      go.disabled = true; go.textContent = 'Checking…'; err.textContent = '';
      try {
        await activate(key.value); close(); applyLicense();
        sheet('Purrfect POS is yours', (bd2, close2) => {
          const samples = ITEMS.some(i => i.sample);
          const setUp = el('button', {className: 'btn g', textContent: 'Set up my shop'}); setUp.onclick = () => { close2(); showSettings(); };
          bd2.append(el('p', {className: 'ok', textContent: '✓ Activated' + (LIC.name ? ' for ' + LIC.name : '') + '. Receipts no longer say DEMO.'}),
            el('ol', {className: 'stepslist'}, [el('li', {textContent: 'Settings: your shop name, address and logo for the receipt.'}),
              el('li', {textContent: 'Items: add your products' + (samples ? ' and delete the sample items' : '') + '.'}),
              el('li', {textContent: 'Printer: connect your receipt printer, then print a test.'})]), setUp);
        });
      } catch (e) { err.textContent = e.message; } finally { go.disabled = false; go.textContent = 'Activate'; }
    };
    go.onclick = run; key.onkeydown = e => { if (e.key === 'Enter') run(); };
    bd.append(el('p', {className: 'note', textContent: 'Your key is in the email we sent after confirming your payment. Activating needs the internet once; after that the app works offline.'}),
      el('label', {}, ['License key', key]), err, go, el('a', {className: 'btn o', href: BUY, target: '_blank', rel: 'noopener', textContent: 'No key yet? Buy one · ' + PRICE}));
    if (prefill) setTimeout(run, 250); else setTimeout(() => key.focus(), 60);
  });
}
$('#actBtn').onclick = () => showActivate();

function applyLicense() {
  $('#demoBar').hidden = licensed();
  $('#buyLink').textContent = 'Buy · ' + PRICE;
  if (PROMO) $('#demoBar .long').textContent = 'Demo mode: receipts print “DEMO”. Year-end promo: ₱179 instead of ₱299 until Dec 31.';
}
function applyShop() {
  $('#shopName').replaceChildren(S.shop.name || 'Purrfect POS', ...(S.shop.name ? [el('small', {textContent: 'Purrfect POS'})] : []));
  $('#logo').src = S.logo || 'icons/icon-192.png';
  document.title = (S.shop.name ? S.shop.name + ' · ' : '') + 'Purrfect POS';
}

function welcome() {
  sheet('Welcome to Purrfect POS', (bd, close) => {
    const tryB = el('button', {className: 'btn g', textContent: 'Try it with sample items'}); tryB.onclick = close;
    const keyB = el('button', {className: 'btn o', textContent: 'I have a license key'}); keyB.onclick = () => { close(); showActivate(); };
    bd.append(el('p', {textContent: 'A simple point of sale for your counter. It works without internet, and your sales stay on this device.'}),
      el('ol', {className: 'stepslist'}, [el('li', {textContent: 'Tap items to build a ticket, then Charge.'}), el('li', {textContent: 'Cash, GCash, Maya or card, with change worked out for you.'}),
        el('li', {textContent: 'Print the receipt, then see your sales in the report.'})]),
      tryB, keyB, el('a', {className: 'btn o', href: BUY, target: '_blank', rel: 'noopener', textContent: 'Buy Purrfect POS · ' + PRICE + (PROMO ? ' (40% off)' : '')}));
  });
  store.set('ppos-welcomed', '1');
}

// ---- shop camera (8 Nov 2026, from the café POS; Vince: "Add camera to POS first") ------------------------------------
// Settings > Shop camera turns on this device's own webcam, live in an upper-right widget. Record saves video to a folder
// picked on this computer (File System Access, handle kept in IndexedDB "ppos-cam") or, without one, to Downloads, with a
// new file every 5 minutes. Motion records only while something moves. Nothing is uploaded: the video stays on this device.
// The widget reopens after a reload unless closed; closing frees the webcam.
const CAM_QUIET = 30 * 1000, CAM_TICK = 500;   // Motion mode: stop after 30 s with no movement; look at the picture twice a second
const CAM_SPLIT = 5 * 60 * 1000;   // a new file every 5 min: a file is only complete once closed, so a crash or power cut loses at most 5 min
const camIco = d => '<svg viewBox="0 0 24 24"><path d="' + d + '"/></svg>';
let camBox = null, camStream = null, rec = null, camDir = null, motion = null;
const camMac = /Mac/.test(navigator.platform || navigator.userAgent) && navigator.maxTouchPoints < 2;   // a Mac, not an iPad
const camOn = () => S.cam === 'local';
function camSync() {
  $('#camBtn').hidden = !camOn();
  if (!camOn()) camClose(true);
  else if (!camBox && !store.get('ppos-cam-hide')) camOpen();
}
function camClose(quiet) {
  if (rec && !quiet && !confirm('Stop recording and close the camera?')) return false;
  motionOff(); recStop();
  if (camStream) { camStream.getTracks().forEach(t => t.stop()); camStream = null; }
  if (camBox) { camBox.remove(); camBox = null; }
  return true;
}
const camIdb = (mode, fn) => new Promise((res, rej) => {
  const r = indexedDB.open('ppos-cam', 1);
  r.onupgradeneeded = () => r.result.createObjectStore('kv');
  r.onerror = () => rej(r.error);
  r.onsuccess = () => { const tx = r.result.transaction('kv', mode), q = fn(tx.objectStore('kv')); tx.oncomplete = () => res(q.result); tx.onerror = () => rej(tx.error); };
});
const camDirReady = (window.indexedDB ? camIdb('readonly', st => st.get('dir')) : Promise.resolve(null)).then(h => { camDir = h || null; }, () => {});
function camPlace() {   // wide screens: docked at the top of the ticket column (covers nothing); phones: floating, upper right
  if (!camBox) return;
  if (matchMedia('(max-width:760px)').matches) { if (camBox.parentNode !== document.body) document.body.append(camBox); }
  else if (camBox.parentNode !== $('#right')) $('#right .bar').after(camBox);
  const v = camBox.querySelector('video'); if (v) v.play().catch(() => {});
}
function camOpen() {
  if (camBox) { if (camClose()) store.set('ppos-cam-hide', '1'); return; }
  store.set('ppos-cam-hide', '');
  const min = el('button', {ariaLabel: 'Minimise', title: 'Minimise'}), big = el('button', {ariaLabel: 'Enlarge', title: 'Enlarge'}), x = el('button', {ariaLabel: 'Close camera', title: 'Close'});
  min.innerHTML = camIco('M5 11h14v2H5z'); big.innerHTML = camIco('M4 4h6v2H6v4H4zm10 0h6v6h-2V6h-4zM4 14h2v4h4v2H4zm14 0h2v6h-6v-2h4z');
  x.innerHTML = camIco('M19 6.4 17.6 5 12 10.6 6.4 5 5 6.4 10.6 12 5 17.6 6.4 19 12 13.4 17.6 19 19 17.6 13.4 12z');
  const clock = el('span', {className: 'rec', hidden: true});
  const box = camBox = el('div', {className: 'cam', role: 'region', ariaLabel: 'Shop camera'}, [el('header', {}, [el('span', {textContent: 'Live camera'}), clock, min, big, x])]);
  camPlace();
  min.onclick = () => { box.classList.remove('big'); box.classList.toggle('min'); };
  big.onclick = () => { box.classList.remove('min'); box.classList.toggle('big'); };
  x.onclick = () => { if (camClose()) store.set('ppos-cam-hide', '1'); };
  const video = el('video', {autoplay: true, muted: true, playsInline: true});
  const msg = el('div', {className: 'msg', textContent: 'Starting the camera…'}), retry = el('button', {textContent: 'Retry'});
  const recBtn = el('button', {className: 'dot', textContent: 'Record', disabled: true}), where = el('span');
  const folder = el('button', {textContent: 'Folder', title: 'Choose the folder on this computer where recordings are saved'});
  folder.hidden = !window.showDirectoryPicker;
  const showWhere = () => { where.textContent = 'Saving to: ' + (camDir ? camDir.name : 'Downloads'); };
  showWhere(); camDirReady.then(showWhere);
  const motionBtn = el('button', {textContent: 'Motion', disabled: true, title: 'Record only when something moves; stops 30 s after it goes still'});
  box.append(msg, el('footer', {}, [where, folder, motionBtn, recBtn]));
  folder.onclick = async () => {
    try {
      const d = await showDirectoryPicker({id: 'shop-camera', mode: 'readwrite', startIn: 'videos'});
      camDir = d; await camIdb('readwrite', st => st.put(d, 'dir')); showWhere(); toast('Recordings will be saved in ' + d.name);
    } catch (e) { if (e.name !== 'AbortError') toast('Could not use that folder'); }
  };
  const ensureFolder = async () => {   // a folder with write permission, asked for during the click (needs it)
    if (!camDir && window.showDirectoryPicker) {
      await folder.onclick();
      if (!camDir) { toast('Choose a folder on this computer for the recordings'); return false; }
    }
    if (camDir) {
      let ok = await camDir.queryPermission({mode: 'readwrite'});
      if (ok !== 'granted') ok = await camDir.requestPermission({mode: 'readwrite'});
      if (ok !== 'granted') { toast('No permission to save in ' + camDir.name); return false; }
    }
    return true;
  };
  motionBtn.onclick = async () => {
    if (motion) { motionOff(true); store.set('ppos-cam-motion', ''); return; }
    if (!camStream || !(await ensureFolder())) return;
    store.set('ppos-cam-motion', '1'); motionOn(video, recBtn, motionBtn, clock);
  };
  recBtn.onclick = async () => {
    if (motion) return;
    if (rec) { recStop(); return; }
    if (!camStream) return;
    if (!camDir && window.showDirectoryPicker) {   // pick the folder first: files every 5 min to Downloads would stall behind Chrome's multiple-downloads prompt
      await folder.onclick();
      if (!camDir) { toast('Choose a folder on this computer for the recordings'); return; }
    }
    recBtn.disabled = true;
    try { await recStart(camStream, recBtn, clock); } catch (e) { toast('Could not start recording: ' + (e.message || e.name)); }
    recBtn.disabled = !camStream;
  };
  const stopped = text => { motionOff(); recStop(); camStream = null; recBtn.disabled = motionBtn.disabled = true; (video.isConnected ? video : msg).replaceWith(msg); msg.textContent = text; msg.append(el('br'), retry); };
  const start = async () => {
    if (camStream || box !== camBox) return;
    if (!msg.isConnected) video.replaceWith(msg);
    msg.textContent = 'Starting the camera…';
    try {
      if (!navigator.mediaDevices) throw Object.assign(new Error(), {name: 'NoMedia'});
      const st = await navigator.mediaDevices.getUserMedia({video: {width: {ideal: 1280}, height: {ideal: 720}}, audio: false});
      if (box !== camBox) { st.getTracks().forEach(t => t.stop()); return; }
      camStream = st; video.srcObject = st; msg.replaceWith(video); recBtn.disabled = motionBtn.disabled = false;
      if (store.get('ppos-cam-motion') && !motion) {   // Motion was on before a reload: resume if the folder is still allowed (no click to ask)
        const ok = !camDir ? !window.showDirectoryPicker : await camDir.queryPermission({mode: 'readwrite'}).then(p => p === 'granted', () => false);
        if (ok) motionOn(video, recBtn, motionBtn, clock); else toast('Tap Motion to start watching for movement again');
      }
      st.getVideoTracks()[0].onended = () => { if (box === camBox && camStream === st) stopped('The camera stopped (unplugged or taken by another app).'); };
    } catch (e) {
      if (box !== camBox) return;
      stopped(e.name === 'NoMedia' ? 'This browser can\'t open a camera here.'
        : e.name === 'NotAllowedError' ? 'Camera access is blocked. Click the camera icon in the address bar and choose Allow'
          + (camMac ? '. On a Mac, also turn on this browser in System Settings > Privacy & Security > Camera (then restart the browser)' : '') + ', then Retry.'
        : e.name === 'NotFoundError' ? 'No webcam found on this device.'
        : e.name === 'NotReadableError' ? 'The webcam is busy in another app (' + (camMac ? 'FaceTime, Photo Booth, Zoom' : 'Zoom or the Camera app') + '). Close it, then Retry.'
        : 'Could not open the camera (' + e.name + ').');
    }
  };
  retry.onclick = start;
  start();
}
// Motion mode (Vince, 8 Nov: "give option just to record if there are motion, if none, stop recording automatically").
// Twice a second a 96x54 grey copy of the picture is compared with the last one; a pixel "moved" if it changed by more
// than 25 levels. Movement = over 1.2% of pixels moved in two looks in a row (so a flicker or one noisy frame doesn't
// count). It starts a recording (same files and folder as Record) and stops it 30 s after the last movement.
function motionOn(video, recBtn, btn, clock) {
  motionOff();
  const cv = document.createElement('canvas'); cv.width = 96; cv.height = 54;
  const cx = cv.getContext('2d', {willReadFrequently: true});
  const m = motion = {btn, recBtn, prev: null, hits: 0, last: 0, starting: false};
  btn.textContent = 'Motion on'; btn.classList.add('on'); recBtn.disabled = true; recBtn.title = 'Turn Motion off to record by hand';
  m.timer = setInterval(() => {
    if (motion !== m || !camStream || video.readyState < 2) return;
    cx.drawImage(video, 0, 0, 96, 54);
    const px = cx.getImageData(0, 0, 96, 54).data, g = new Uint8Array(96 * 54);
    for (let i = 0; i < g.length; i++) g[i] = (px[i * 4] * 3 + px[i * 4 + 1] * 6 + px[i * 4 + 2]) / 10;
    let moved = 0;
    if (m.prev) for (let i = 0; i < g.length; i++) if (Math.abs(g[i] - m.prev[i]) > 25) moved++;
    m.prev = g;
    m.hits = moved / g.length > 0.012 ? m.hits + 1 : 0;
    const now = Date.now();
    if (m.hits >= 2) {
      m.last = now;
      if (!rec && !m.starting) {
        m.starting = true;
        recStart(camStream, recBtn, clock).catch(e => toast('Could not start recording: ' + (e.message || e.name))).finally(() => { m.starting = false; if (motion === m) recBtn.disabled = true; });
      }
    } else if (rec && !m.starting && now - m.last > CAM_QUIET) recStop();
  }, CAM_TICK);
}
function motionOff(stopRec) {
  const m = motion; if (!m) return;
  motion = null; clearInterval(m.timer);
  m.btn.textContent = 'Motion'; m.btn.classList.remove('on'); m.recBtn.title = ''; m.recBtn.disabled = !camStream;
  if (stopRec) recStop();
}
const recType = () => ['video/mp4;codecs=avc1.42E01E', 'video/mp4', 'video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm'].find(t => window.MediaRecorder && MediaRecorder.isTypeSupported(t)) || '';
const recName = ext => 'shop-camera_' + new Date().toLocaleString('sv-SE').replace(' ', '_').replace(/:/g, '-') + '.' + ext;   // this device's own clock
async function recFile(ext) {   // a writable file in the chosen folder, or null (then the recording goes to Downloads)
  if (!camDir) return null;
  let ok = await camDir.queryPermission({mode: 'readwrite'});
  if (ok !== 'granted') ok = await camDir.requestPermission({mode: 'readwrite'});
  if (ok !== 'granted') { toast('No permission for ' + camDir.name + ': saving to Downloads'); return null; }
  const name = recName(ext);
  return {name, dir: camDir.name, d: camDir, w: await (await camDir.getFileHandle(name, {create: true})).createWritable()};
}
const camWhere = text => { const w = camBox && camBox.querySelector('footer span'); if (w) w.textContent = text; };
async function recStart(stream, btn, clock, noDir) {
  const type = recType();
  if (!type) throw new Error('this browser can\'t record video');
  const ext = type.startsWith('video/mp4') ? 'mp4' : 'webm';
  const file = noDir ? null : await recFile(ext).catch(e => {
    toast('Can\'t save in ' + (camDir ? camDir.name : 'the folder') + ' (' + (e.name === 'NotFoundError' ? 'folder missing' : e.name) + '): recording to Downloads');
    return null;
  });
  if (stream !== camStream || rec) { if (file) file.w.abort(); return; }
  if (camDir && !file) camWhere('Saving to: Downloads (folder unavailable)');
  const r = {mr: new MediaRecorder(stream, {mimeType: type, videoBitsPerSecond: 2500000}), file, chunks: [], q: Promise.resolve(), t0: Date.now(), btn, clock, ext,
    name: file ? file.name : recName(ext)};
  r.mr.ondataavailable = e => {
    if (!e.data.size) return;
    if (!r.file) { r.chunks.push(e.data); return; }
    r.q = r.q.then(() => r.err || r.file.w.write(e.data)).catch(err => {   // first write error: tell, then keep recording to Downloads
      if (r.err) return; r.err = err;
      toast('Could not write to ' + r.file.dir + ' (' + (err.name || err) + '). Recording continues to Downloads.');
      camWhere('Saving to: Downloads (folder unavailable)');
      if (rec === r) { recStop(); recStart(stream, btn, clock, true).catch(() => toast('Recording stopped')); }
    });
  };
  r.mr.onerror = e => toast('Recording error: ' + ((e.error && e.error.name) || 'unknown'));
  r.mr.onstop = () => { if (rec === r) { recStop(); toast('Recording stopped unexpectedly. What was recorded has been saved.'); } recSave(r); };
  r.mr.start(1000);
  r.tick = setInterval(() => { const s = Math.floor((Date.now() - r.t0) / 1000); clock.textContent = '● ' + String(Math.floor(s / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); }, 500);
  r.split = setTimeout(() => {   // next file; keeps Downloads mode if the folder already failed
    if (rec !== r) return;
    recStop(); btn.disabled = true;
    recStart(stream, btn, clock, !r.file).catch(() => toast('Recording stopped: could not start the next file')).finally(() => { btn.disabled = !camStream || !!motion; });
  }, CAM_SPLIT);
  rec = r; btn.textContent = 'Stop'; btn.classList.add('on'); btn.classList.remove('dot'); clock.hidden = false; clock.textContent = '● 00:00';
}
function recStop() {
  const r = rec; if (!r) return;
  rec = null; clearInterval(r.tick); clearTimeout(r.split);
  if (r.mr.state !== 'inactive') r.mr.stop();   // onstop saves, after the last chunk
  r.btn.textContent = 'Record'; r.btn.classList.remove('on'); r.btn.classList.add('dot'); r.clock.hidden = true;
}
function recSave(r) {
  if (r.saved) return; r.saved = true;
  if (r.file) {
    r.q.then(() => { if (r.err) throw r.err; return r.file.w.close(); }).then(() => { if (!motion) toast('Saved ' + r.file.name + ' in ' + r.file.dir); }, () => {
      toast('Could not finish ' + r.file.name);
      r.file.w.abort().catch(() => {}).then(() => r.file.d.removeEntry(r.file.name)).catch(() => {});   // drop the empty file
    });
    return;
  }
  if (!r.chunks.length) return;
  const blob = new Blob(r.chunks, {type: r.mr.mimeType}), a = el('a', {href: URL.createObjectURL(blob), download: r.name});
  document.body.append(a); a.click(); a.remove(); setTimeout(() => URL.revokeObjectURL(a.href), 60000);
  if (!motion) toast('Saved ' + r.name + ' to Downloads');
}
addEventListener('beforeunload', e => { if (rec) { e.preventDefault(); e.returnValue = ''; } });
addEventListener('pagehide', () => { if (rec) recStop(); });   // best effort: finish the current file when the page goes away
$('#camBtn').onclick = camOpen;

// ---- mobile ticket panel + start --------------------------------------------------------------------------
$('#openTicket').onclick = () => $('#right').classList.add('open');
$('#closeTicket').onclick = () => $('#right').classList.remove('open');
const mq = matchMedia('(max-width:760px)'); const syncMq = () => { $('#closeTicket').hidden = !mq.matches; camPlace(); }; mq.addEventListener('change', syncMq); syncMq();

store.keys().filter(k => /^ppos-seq-\d{6}$/.test(k) && k.slice(9) < dayKey(addDays(new Date(), -3)).slice(2).replace(/-/g, '')).forEach(store.del);
applyShop(); applyLicense(); buildCats(); render(); updHeld(); updOT(); syncSoon(3000); setTimeout(officeAsk, 2500); camSync();
const hashKey = (location.hash.match(/key=([A-Za-z0-9-]+)/) || [])[1];
if (hashKey) {
  history.replaceState(null, '', location.pathname + location.search);
  if (!licensed()) showActivate(hashKey);
  else if (hashKey.toUpperCase() === LIC.key && !isPro())   // the "Pro is on" email opens the app with the key: pick up the upgrade
    activate(LIC.key).then(() => { applyLicense(); toast(isPro() ? 'Purrfect POS Pro is on' : 'This key is not Pro yet.'); }).catch(e => toast(e.message));
}
else if (!store.get('ppos-welcomed') && !licensed()) welcome();
// updates install themselves (owners shouldn't have to know): sw.js asks the server for fresh files on every load, the page looks for a
// new sw.js when it comes back to the screen and every 30 minutes, and when a new one takes over it reloads, but only after 20 seconds
// with no open ticket and no open window, so a sale is never cut off (the ticket survives a reload anyway)
if ('serviceWorker' in navigator) {
  const hadSW = !!navigator.serviceWorker.controller, loadedAt = Date.now();
  let updateReady = false, idleSince = 0;
  const look = () => navigator.serviceWorker.getRegistration().then(g => g && g.update()).catch(() => {});
  navigator.serviceWorker.register('sw.js').catch(() => {});
  navigator.serviceWorker.addEventListener('controllerchange', () => { if (hadSW && Date.now() - loadedAt > 15000) updateReady = true; });   // just opened: the files are fresh already
  document.addEventListener('visibilitychange', () => { if (!document.hidden) look(); });
  setInterval(look, 30 * 60000);
  setInterval(() => {
    if (!updateReady) return;
    if (ticket.length || topVeil() || rec) { idleSince = 0; return; }   // never reload in the middle of a sale or a recording
    if (!idleSince) idleSince = Date.now(); else if (Date.now() - idleSince >= 20000) location.reload();
  }, 5000);
}
