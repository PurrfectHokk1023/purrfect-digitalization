// Copied 6 Nov 2026 from purrfect-digitalization-site/point-of-sale.src.html (the Purrfect POS checkout's receipt step), for the
// Purrfect Hokkaido mobile bar payment page (pay-bar.html). The reader loads the site's shared Tesseract from /vendor/tesseract-5.1.1/.
// Keep the two copies in step when the checks change.
// The receipt step of both checkouts (Nov 2026). The buyer pays our GCash QR (the café's soundbox QR exactly as printed: they type the
// amount), screenshots the receipt and adds it here. Tesseract (vendor/tesseract-5.1.1, loaded on the pay step, runs in the buyer's
// browser) reads it, and a receipt counts only when every check passes:
//   amount    read from the receipt; together the receipts must reach the price, else the step asks for the rest (same QR, typed)
//   time      the receipt's date and time (Manila) must fall between shortly before this checkout's pay step and now
//   ref       a reference number on the receipt (GCash's 13-digit Ref. No., or a Maya or bank one)
//   original  no AI or photo-editor marks in the file, and the pixels of a real screenshot: its flat areas are perfectly even, where
//             AI images and photos of a screen have grain
// Whether our name shows on the receipt is only noted for the owner. A receipt that fails can still go as a manual check. None of this
// proves a payment (a careful fake can pass): the screenshots and the checks go with the order (PosOrders.gs posShots_), and the owner
// still finds the payment in GCash before confirming.
const RCPT = (() => {
  const OCR = '/vendor/tesseract-5.1.1/', MON = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec'];
  const EVEN_MIN = 0.6;   // share of perfectly even flat blocks below which a picture isn't taken as an original screenshot
  const cents = n => Math.round(n * 100);
  const peso = n => '₱' + n.toLocaleString('en-PH', {minimumFractionDigits: 2, maximumFractionDigits: 2});
  const when = t => {   // a timestamp as Manila time: "Nov 5, 2026 6:12 PM"
    const d = new Date(t + 8 * 3600e3), h = d.getUTCHours(), m = MON[d.getUTCMonth()];
    return m[0].toUpperCase() + m.slice(1) + ' ' + d.getUTCDate() + ', ' + d.getUTCFullYear() + ' ' + ((h + 11) % 12 + 1) + ':' + String(d.getUTCMinutes()).padStart(2, '0') + (h < 12 ? ' AM' : ' PM');
  };
  const stamp = tm => tm.timed ? when(tm.at) : when(tm.at).replace(/ \d+:\d\d [AP]M$/, '');

  // the reader: one Tesseract worker, made on first use. Page mode 4 (one column of lines) keeps a label and its amount on one line.
  const STAGE = {'loading tesseract core': 'Getting the reader ready', 'initializing tesseract': 'Getting the reader ready', 'loading language traineddata': 'Getting the reader ready',
    'initializing api': 'Getting the reader ready', 'recognizing text': 'Reading the receipt'};
  let worker = null, onStage = null;
  const script = src => new Promise((ok, no) => { const s = document.createElement('script'); s.src = src; s.onload = ok; s.onerror = no; document.head.append(s); });
  const reader = () => worker || (worker = (window.Tesseract ? Promise.resolve() : script(OCR + 'tesseract.min.js'))
    .then(() => Tesseract.createWorker('eng', 1, {workerPath: OCR + 'worker.min.js', corePath: OCR, langPath: OCR, workerBlobURL: false,
      logger: m => { if (onStage && STAGE[m.status]) onStage(STAGE[m.status] + (m.progress > 0 && m.progress < 1 ? ' ' + Math.round(m.progress * 100) + '%' : '') + '…'); }}))
    .then(w => w.setParameters({tessedit_pageseg_mode: '4'}).then(() => w))
    .catch(e => { worker = null; throw e; }));

  // The amount paid: an "Amount" line beats a "Total" line (a bank fee is added to the total, not paid to us), else the value the
  // receipt shows most often. Fee, balance and discount lines never count. A label alone on a line counts for the line under it (Maya).
  const AMT = /(^|[^\d.,])(\d{1,3}(?:,\d{3})+|\d{1,6})[.,](\d{2})(?!\d|[.,]\d)/g;
  const SKIP = /fee|charge|balance|discount|cash ?back|points|voucher|limit|rebate/i;
  const parse = text => {
    const found = [];
    let above = '';
    for (const raw of String(text).split('\n')) {
      const hits = [...raw.matchAll(AMT)].map(m => Number(m[2].replace(/,/g, '') + '.' + m[3])), label = above + ' ' + raw;
      above = hits.length ? '' : raw;
      if (hits.length && !SKIP.test(label)) hits.forEach(v => found.push({v, label}));
    }
    if (!found.length) return null;
    const amount = found.filter(f => /amount|amt\b/i.test(f.label) && !/total/i.test(f.label)), total = found.filter(f => /total|paid|sent|payment|transfer/i.test(f.label));
    const pool = amount.length ? amount : total.length ? total : found, seen = {};
    pool.forEach(f => { seen[f.v] = (seen[f.v] || 0) + 1; });
    return pool.map(f => f.v).sort((a, b) => seen[b] - seen[a] || b - a)[0];
  };
  // The receipt's reference number: what follows a "Reference No." / "Ref. No." / "Reference ID" label on its line, or on the next line
  // when the label ends its line. A label inside a sentence (GCash: "You may present reference / number below…") has no number after it
  // and is skipped. Else GCash's 13-digit pattern (1234 567 890123) anywhere. Groups of 3+ letters/digits join up (Maya: 6C5A 9F12 77B3);
  // a short stray token after the number doesn't. Real GCash QR payments (5 Nov 2026) have a 9-digit Ref. No. with a copy icon after it.
  const refOf = text => {
    const lines = String(text).split('\n'), LABEL = /\bref(?:erence)?\s*\.?\s*(?:n[o0]|number|num|id|#)?\s*\.?\s*[:#]?\s*/i;
    const take = s => {
      let out = '';
      for (const t of String(s || '').trim().split(/[\s-]+/)) {
        if (!/^[A-Za-z0-9]+$/.test(t) || !/\d/.test(t) || (out && t.length < 3) || (out + t).length > 20) break;
        out += t;
      }
      return out.length >= 6 ? out.toUpperCase() : '';
    };
    for (let i = 0; i < lines.length; i++) {
      const m = lines[i].match(LABEL);
      if (!m) continue;
      const rest = lines[i].slice(m.index + m[0].length), got = take(rest) || (!rest.trim() && take(lines.slice(i + 1).find(l => l.trim())));
      if (got) return got;
    }
    const g = String(text).match(/(?:^|\D)(\d{4}) ?(\d{3}) ?(\d{6})(?!\d)/);
    return g ? g[1] + g[2] + g[3] : '';
  };
  // GCash puts a copy icon right after the Ref. No., and the reader takes it for one more digit ("2494718270" for 249471827). The icon
  // sits much farther from the last digit than the digits sit from each other, so a long number whose last character is that far out
  // loses it.
  const dropIcons = data => {
    let text = data.text;
    for (const w of data.words || []) {
      const sy = w.symbols || [];
      if (!/^[A-Za-z0-9]{7,}$/.test(w.text) || sy.length !== w.text.length) continue;
      const gaps = sy.slice(1).map((x, i) => x.bbox.x0 - sy[i].bbox.x1), last = gaps.pop(), mid = [...gaps].sort((x, y) => x - y)[gaps.length >> 1];
      if (gaps.length >= 4 && last > 6 && last > 2.5 * Math.max(mid, 1) && last > Math.max(...gaps) + 4) text = text.replace(w.text, w.text.slice(0, -1));
    }
    return text;
  };
  // The receipt's date and time (Manila) as {at, timed}, or null. Dates like "Nov 5, 2026", "5 Nov 2026", "2026-11-05" or "11/05/2026"
  // (month first, as PH apps write it, unless the first number can't be a month). The time is the first one after the date: the phone's
  // status-bar clock comes before it. No time on the receipt: noon that day, timed false.
  const timeOf = text => {
    const s = String(text), M = '(jan|feb|mar|apr|may|jun|jul|aug|sep|oct|nov|dec)[a-z]*\\.?';
    let m, y, mo, d;
    if ((m = s.match(new RegExp('\\b' + M + '\\s+(\\d{1,2}),?\\s+(\\d{4})', 'i')))) [mo, d, y] = [MON.indexOf(m[1].toLowerCase()), +m[2], +m[3]];
    else if ((m = s.match(new RegExp('\\b(\\d{1,2})\\s+' + M + ',?\\s+(\\d{4})', 'i')))) [d, mo, y] = [+m[1], MON.indexOf(m[2].toLowerCase()), +m[3]];
    else if ((m = s.match(/\b(20\d\d)-(\d\d)-(\d\d)\b/))) [y, mo, d] = [+m[1], +m[2] - 1, +m[3]];
    else if ((m = s.match(/\b(\d{1,2})\/(\d{1,2})\/(20\d\d|\d\d)\b/))) { const a = +m[1], b = +m[2]; [mo, d] = a > 12 ? [b - 1, a] : [a - 1, b]; y = m[3].length === 2 ? 2000 + +m[3] : +m[3]; }
    if (!m || !(mo >= 0 && mo < 12) || !(d >= 1 && d <= 31) || y < 2020) return null;
    const end = m.index + m[0].length, times = [...s.matchAll(/\b(\d{1,2}):(\d{2})(?::\d{2})?\s?([ap])?\.?m?\b/gi)].filter(t => +t[1] < 24 && +t[2] < 60);
    const t = times.find(x => x.index >= end) || times.filter(x => x.index < m.index).pop();
    let h = t ? +t[1] : 12;
    if (t && t[3]) h = h % 12 + (t[3].toLowerCase() === 'p' ? 12 : 0);
    return {at: Date.UTC(y, mo, d, h - 8, t ? +t[2] : 0), timed: !!t};
  };
  // Our name on the receipt (GCash shows "HokkaidoIceCream"). The big title often comes out mangled ("H lokkai dolceCrec am"), so:
  // letters only, the usual OCR swaps undone (l, 1, | for i; 0 for o), and one wrong letter allowed.
  const payeeOf = text => {
    const s = String(text).toLowerCase().replace(/[l1|!]/g, 'i').replace(/0/g, 'o').replace(/[^a-z]/g, '');
    return ['hokkaido', 'icecream', 'vicente', 'amandac'].some(w => {
      for (let i = 0; i + w.length <= s.length; i++) {
        let bad = 0;
        for (let k = 0; k < w.length && bad < 2; k++) if (s[i + k] !== w[k]) bad++;
        if (bad < 2) return true;
      }
      return false;
    });
  };
  const read = async (canvas, stage) => {
    onStage = stage;
    try {
      const {data} = await (await reader()).recognize(canvas), text = dropIcons(data);
      return {amount: parse(text), ref: refOf(text), tm: timeOf(text), payee: payeeOf(text)};
    } finally { onStage = null; }
  };

  // Marks in the file that a phone screenshot never has: AI content credentials or labels, or a photo editor's name.
  const MARKS = [[/c2pa|trainedAlgorithmicMedia|Made with Google AI|DALL.?E|OpenAI|Midjourney|Stable ?Diffusion|Firefly|Imagen|Ideogram/i, 'the file says an AI tool made it'],
    [/Photoshop|Lightroom|Snapseed|PicsArt|Canva|GIMP|Pixelmator|Affinity Photo|Fotor|Pixlr|Polarr|Meitu|Facetune|PhotoDirector/i, 'the file says it was edited in a photo editor']];
  const marks = async file => {
    const part = async (a, b) => new TextDecoder('latin1').decode(await file.slice(a, b).arrayBuffer());
    const text = (await part(0, 524288)) + (await part(Math.max(0, file.size - 65536), file.size));
    return MARKS.filter(([re]) => re.test(text)).map(([, why]) => why);
  };
  // Share of the nearly flat 8x8 blocks that are perfectly even (one color), or null when the picture has too few flat areas to tell
  const evenness = im => {
    const k = Math.min(1, Math.sqrt(6e6 / (im.naturalWidth * im.naturalHeight))), c = fit(im, im.naturalWidth * k, im.naturalHeight * k);
    const w = c.width, h = c.height, px = c.getContext('2d').getImageData(0, 0, w, h).data;
    let flat = 0, even = 0;
    for (let by = 0; by + 8 <= h; by += 8) for (let bx = 0; bx + 8 <= w; bx += 8) {
      let r0 = 255, r1 = 0, g0 = 255, g1 = 0, b0 = 255, b1 = 0;
      for (let y = by; y < by + 8; y++) for (let i = (y * w + bx) * 4, e = i + 32; i < e; i += 4) {
        const r = px[i], g = px[i + 1], b = px[i + 2];
        if (r < r0) r0 = r; if (r > r1) r1 = r; if (g < g0) g0 = g; if (g > g1) g1 = g; if (b < b0) b0 = b; if (b > b1) b1 = b;
      }
      const range = Math.max(r1 - r0, g1 - g0, b1 - b0);
      if (range <= 24) { flat++; if (!range) even++; }
    }
    return flat < 300 ? null : even / flat;
  };
  const load = file => new Promise((ok, no) => { const im = new Image(); im.onload = () => ok(im); im.onerror = no; im.src = URL.createObjectURL(file); });
  const fit = (im, maxW, maxH) => {
    const k = Math.min(1, maxW / im.naturalWidth, maxH / im.naturalHeight), c = document.createElement('canvas'), g = c.getContext('2d');
    c.width = Math.max(1, Math.round(im.naturalWidth * k)); c.height = Math.max(1, Math.round(im.naturalHeight * k));
    g.fillStyle = '#fff'; g.fillRect(0, 0, c.width, c.height); g.drawImage(im, 0, 0, c.width, c.height);
    return c;
  };
  const digest = async file => {
    try { return [...new Uint8Array(await crypto.subtle.digest('SHA-256', await file.arrayBuffer()))].map(b => b.toString(16).padStart(2, '0')).join(''); }
    catch (e) { return file.name + ':' + file.size + ':' + file.lastModified; }
  };

  // One receipt step inside `form` (.rc-pick, .rc-list, .rc-sum, .rc-top, .rc-manual, the gcashRef field).
  // opts: {due() in pesos, since() = when this checkout's pay step first showed (ms), or nothing}.
  const step = (form, opts) => {
    const $q = s => form.querySelector(s), list = $q('.rc-list'), sum = $q('.rc-sum'), top = $q('.rc-top'), pick = $q('.rc-pick input'), man = $q('.rc-manual');
    const refIn = form.elements.gcashRef, errEl = $q('.err'), manText = man.textContent;
    let items = [], manual = false, autoRef = '', queue = Promise.resolve();
    const live = () => items.filter(x => !x.dup);
    const state = () => {
      const due = opts.due(), done = live().filter(x => !x.busy), good = done.filter(x => x.amount != null && !x.flags.length);
      const paid = good.reduce((s, x) => s + cents(x.amount), 0) / 100;
      return {due, paid, rest: (cents(due) - cents(paid)) / 100, busy: items.some(x => x.busy), bad: done.filter(x => x.amount == null || x.flags.length),
        count: done.length, last: Math.max(0, ...good.filter(x => x.tm && x.tm.timed).map(x => x.tm.at))};
    };
    const row = x => {
      const li = document.createElement('li'), im = new Image(), t = document.createElement('div'), b = document.createElement('b'), sm = document.createElement('small'), del = document.createElement('button');
      li.className = x.dup ? 'dup' : !x.busy && (x.amount == null || x.flags.length) ? 'bad' : '';
      im.src = x.img; im.alt = '';
      t.append(b, sm);
      if (x.busy) { const sp = document.createElement('span'); sp.className = 'spin'; sp.setAttribute('aria-hidden', 'true'); b.append(sp, x.stage || 'Checking the receipt…'); }
      else if (x.dup) { b.textContent = 'Already added'; sm.textContent = 'Same Ref. No. as another screenshot, so it isn’t counted twice.'; }
      else if (x.amount == null) { b.textContent = 'Amount not found'; sm.textContent = x.err || 'Use the GCash receipt screenshot that shows the amount, date and Ref. No.'; }
      else {
        const f = document.createElement('small');
        b.textContent = peso(x.amount); sm.textContent = (x.tm ? stamp(x.tm) : 'No date') + ' · ' + (x.ref ? 'Ref. No. ' + x.ref : 'No Ref. No.');
        f.className = x.flags.length ? 'rc-flag' : 'rc-ok';
        f.textContent = x.flags.length ? '⚠ ' + x.flags.join('; ').replace(/^./, c => c.toUpperCase()) : '✓ Amount, date, Ref. No. and screenshot check out';
        t.append(f);
      }
      del.type = 'button'; del.className = 'rc-x'; del.textContent = '×'; del.setAttribute('aria-label', 'Remove this screenshot');
      del.onclick = () => { items = items.filter(y => y !== x); paint(); };
      li.append(im, t, del);
      return li;
    };
    const paint = () => {
      list.replaceChildren(...items.map(row));
      const s = state();
      top.hidden = true; sum.hidden = false; sum.className = 'rc-sum';
      if (s.busy) sum.textContent = 'Checking your receipt…';
      else if (s.bad.length) {
        const why = [...new Set(s.bad.flatMap(x => x.amount == null ? ['we couldn’t read the amount'] : x.flags))];
        sum.className = 'rc-sum warn';
        sum.textContent = 'We couldn’t verify ' + (s.bad.length > 1 ? 'some of your receipts' : 'this receipt') + ': ' + why.join('; ') + '. Add the original GCash screenshot, or send it for a manual check below.';
      } else if (s.count && s.paid >= s.due) {
        sum.className = 'rc-sum ok';
        sum.textContent = '✓ Verified: ' + peso(s.paid) + ' paid' + (s.last ? ' ' + when(s.last) : '') + '. '
          + (s.paid > s.due ? 'That’s ' + peso(-s.rest) + ' more than the price: message us on Facebook if you want it back.' : 'You can send it now.');
      } else if (s.paid > 0) {
        sum.textContent = peso(s.paid) + ' of ' + peso(s.due) + ' received. Please pay the remaining ' + peso(s.rest) + ': scan the same QR, type ' + s.rest.toFixed(2) + ', then add that receipt too.';
        top.hidden = false; top.querySelector('.amtbig').textContent = 'Type ' + peso(s.rest);
      } else if (manual) sum.textContent = 'We’ll check your payment by hand. Add your receipt if you have it, and type the reference number.';
      else sum.hidden = true;
    };
    const add = async file => {
      errEl.textContent = '';
      const hash = await digest(file);
      if (items.some(x => x.hash === hash)) { errEl.textContent = 'You already added this screenshot.'; return; }
      let im;
      try { im = await load(file); } catch (e) { errEl.textContent = 'That picture could not be opened. Add a screenshot (PNG or JPG) of your GCash receipt.'; return; }
      const x = {hash, busy: true, amount: null, ref: '', tm: null, flags: [], notes: [], img: fit(im, 900, 2000).toDataURL('image/jpeg', .8)}, page = fit(im, 1080, 4000);
      let even = null, marked = [];
      try { even = evenness(im); marked = await marks(file); } catch (e) { /* the reading still runs */ }
      URL.revokeObjectURL(im.src);
      items.push(x); paint();
      try { Object.assign(x, await read(page, t => { x.stage = t; paint(); })); }
      catch (e) { x.err = 'We couldn’t check it on this device. Send it for a manual check below.'; }
      x.busy = false;
      if (!items.includes(x)) return;
      if (x.amount != null) {
        const now = Date.now(), lo = Math.max((opts.since() || now - 3 * 3600e3) - 30 * 60e3, now - 3 * 864e5), hi = now + 10 * 60e3;
        if (!x.tm) x.flags.push('no date or time on it');
        else if (x.tm.at + (x.tm.timed ? 0 : 12 * 3600e3) < lo) x.flags.push('it was paid before this order (' + stamp(x.tm) + ')');
        else if (x.tm.at - (x.tm.timed ? 0 : 12 * 3600e3) > hi) x.flags.push('its date is in the future (' + stamp(x.tm) + ')');
        if (!x.ref) x.flags.push('no Ref. No. on it');
        x.flags.push(...marked);
        if (even != null && even < EVEN_MIN) x.flags.push('it doesn’t look like an original screenshot (grainy, like an AI image or a photo of a screen)');
        if (!x.payee) x.notes.push('our name isn’t on it');
      }
      if (x.ref && live().some(y => y !== x && y.ref === x.ref)) x.dup = true;
      const first = live().find(y => y.ref);
      if (first && (!refIn.value.trim() || refIn.value === autoRef)) refIn.value = autoRef = first.ref;
      paint();
    };
    pick.onchange = () => { [...pick.files].forEach(f => { queue = queue.then(() => add(f)).catch(() => {}); }); pick.value = ''; };
    man.onclick = () => { manual = !manual; man.textContent = manual ? 'Use the automatic check instead' : manText; paint(); if (manual) refIn.focus(); };
    return {
      // why the order can't go yet ('' = it can): every receipt verified and together at least the price, unless the buyer asked for a manual check
      problem: () => {
        const s = state();
        if (s.busy) return 'One moment: we’re still checking your receipt.';
        if (manual) return '';
        if (!s.count) return 'Add a screenshot of your GCash receipt first, or send it for a manual check.';
        if (s.bad.length) return 'We couldn’t verify your receipt. Add the original GCash screenshot, or send it for a manual check.';
        if (s.paid < s.due) return 'Your receipts show ' + peso(s.paid) + ' of ' + peso(s.due) + '. Please pay the remaining ' + peso(s.rest) + ' and add that receipt.';
        return '';
      },
      manual: () => manual,
      shots: () => live().map(x => ({img: x.img, amount: x.amount, ref: x.ref, time: x.tm ? stamp(x.tm) : '', flags: x.flags, notes: x.notes})),
      reset: () => { items = []; manual = false; autoRef = ''; man.textContent = manText; paint(); },
    };
  };
  return {step, warm: () => { reader().catch(() => {}); }, parse, refOf, timeOf, dropIcons, payeeOf};
})();
