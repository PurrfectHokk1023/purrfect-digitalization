/* Alamin PH: static single-page app over the JSON in data/ (built by build/build.py). */
const $app = document.getElementById('app');
const tip = document.getElementById('tip');
const cache = {};
const ELECTION_2028 = new Date('2028-05-08T07:00:00+08:00');
const POS_RANK = ['Governor', 'Vice Governor', 'Representative', 'Board Member', 'Mayor', 'Vice Mayor', 'Councilor'];

const get = (path) => cache[path] || (cache[path] = fetch('data/' + path).then((r) => {
  if (!r.ok) throw new Error(path + ' ' + r.status);
  return r.json();
}));
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const fmt = (n) => Number(n || 0).toLocaleString('en-PH');
const peso = (n) => {
  n = Number(n || 0);
  if (n >= 1e12) return '₱' + (n / 1e12).toFixed(2) + 'T';
  if (n >= 1e9) return '₱' + (n / 1e9).toFixed(n >= 1e10 ? 1 : 2) + 'B';
  if (n >= 1e6) return '₱' + (n / 1e6).toFixed(1) + 'M';
  return '₱' + fmt(Math.round(n));
};
const initials = (n) => { const w = n.split(' ').filter((x) => /^[A-ZÑ]/.test(x) && !/^[A-Z]\.$/.test(x)); return (w[0]?.[0] || '') + (w.length > 1 ? w[w.length - 1][0] : ''); };
const daysTo2028 = () => Math.max(0, Math.ceil((ELECTION_2028 - Date.now()) / 864e5));
const term = (y, pos) => `${y}–${+y + (/^(President|Vice President|Senator)$/.test(pos) ? 6 : 3)}`;

let PHOTOS = {};
const photoUrl = (file, w) => `https://commons.wikimedia.org/wiki/Special:FilePath/${encodeURIComponent(file)}?width=${w}`;
function avatar(id, name, size = 34) {
  const ph = PHOTOS[id];
  const st = size !== 34 ? ` style="width:${size}px;height:${size}px;font-size:${Math.round(size / 3)}px"` : '';
  return ph ? `<span class="av"${st}><img src="${photoUrl(ph[0], size * 2)}" alt="" loading="lazy" referrerpolicy="no-referrer" onerror="this.remove()"></span>`
    : `<span class="av"${st}>${esc(initials(name))}</span>`;
}
function personCard(r, extra = '') {
  return `<a class="person" href="#/person/${r.i}">${avatar(r.i, r.n)}
    <span class="who"><b>${esc(r.n)}</b><span>${esc(r.p)}${r.pt ? ' · ' + esc(r.pt) : ''}${extra}</span></span></a>`;
}
function showTip(e, html) { tip.innerHTML = html; tip.hidden = false; moveTip(e); }
function moveTip(e) { tip.style.left = Math.min(e.clientX + 14, innerWidth - 270) + 'px'; tip.style.top = (e.clientY + 14) + 'px'; }
function hideTip() { tip.hidden = true; }

function drawMap(el, geo, { onClick, label, selected } = {}) {
  const w = 600, h = 760;
  const proj = d3.geoMercator().fitSize([w, h], geo);
  const path = d3.geoPath(proj);
  const svg = d3.select(el).append('svg').attr('viewBox', `0 0 ${w} ${h}`).attr('role', 'img');
  svg.selectAll('path').data(geo.features).join('path')
    .attr('d', path)
    .classed('on', (d) => selected && d.properties.c === selected)
    .on('mousemove', (e, d) => showTip(e, label(d)))
    .on('mouseleave', hideTip)
    .on('click', (e, d) => { hideTip(); onClick && onClick(d); });
  svg.proj = proj;
  return svg;
}

/* ---------- search ---------- */
function searchBox(placeholder = 'Search an official, city or municipality…') {
  const id = 's' + Math.random().toString(36).slice(2, 7);
  setTimeout(() => {
    const input = document.getElementById(id), out = document.getElementById(id + 'r');
    if (!input) return;
    let idx, places;
    input.addEventListener('focus', async () => { [idx, places] = await Promise.all([get('search.json'), get('places.json')]); }, { once: true });
    input.addEventListener('input', async () => {
      [idx, places] = await Promise.all([get('search.json'), get('places.json')]);
      const q = input.value.trim().toLowerCase();
      if (q.length < 2) { out.hidden = true; return; }
      const words = q.split(/\s+/);
      const placeHits = Object.entries(places).filter(([, [n]]) => n.toLowerCase().includes(q)).slice(0, 6)
        .map(([c, [n, pc]]) => `<a href="#/${pc ? 'm' : 'p'}/${c}"><span>${esc(n)}</span><small>${pc ? esc(places[pc]?.[0] || '') : 'Province'}</small></a>`);
      const hits = [];
      for (const r of idx) {
        const n = r[0].toLowerCase();
        if (words.every((w) => n.includes(w))) { hits.push(r); if (hits.length > 40) break; }
      }
      hits.sort((a, b) => b[3] - a[3]);
      const peopleHits = hits.slice(0, 14).map(([n, i, p, y, pc]) =>
        `<a href="#/person/${i}"><span>${esc(n)}</span><small>${esc(p)} ${y}<br>${esc(places[pc]?.[0] || '')}</small></a>`);
      out.innerHTML = placeHits.concat(peopleHits).join('') || '<a><span class="muted">No match</span></a>';
      out.hidden = false;
    });
    document.addEventListener('click', (e) => { if (!e.target.closest('.search')) out.hidden = true; });
  });
  return `<div class="search"><input id="${id}" type="search" placeholder="${esc(placeholder)}" autocomplete="off"><div class="results" id="${id}r" hidden></div></div>`;
}

/* ---------- pages ---------- */
async function home() {
  const [stats, provs, geo, dyn] = await Promise.all([get('stats.json'), get('provinces.json'), get('geo/provinces.json'), get('dynasties.json')]);
  const byCode = Object.fromEntries(provs.map((p) => [p.c, p]));
  $app.innerHTML = `
  <div class="hero">
    <div>
      <span class="chip sun">☀ Free, sourced and non-partisan</span>
      <h1 style="margin-top:14px">See who runs<br><span class="hl">your town.</span></h1>
      <p class="lead">Every elected official from the Senate down to your city hall since 2001, the family names sharing seats, who switched offices, and the DPWH contracts built where you live.</p>
      ${searchBox()}
      <div class="stats">
        <div class="stat blue"><span>Elected officials (2025 term)</span><b>${fmt(stats.officials_now)}</b></div>
        <div class="stat"><span>Cities and municipalities mapped</span><b>${fmt(stats.munis)}</b></div>
        <div class="stat"><span>DPWH contracts, 2016–2025</span><b>${fmt(stats.contracts)}</b></div>
        <div class="stat red"><span>Days to the May 2028 elections</span><b>${fmt(daysTo2028())}</b></div>
      </div>
    </div>
    <div class="mapbox" id="map"><span class="mapnote muted">Tap a province</span></div>
  </div>
  <section class="grid g4">
    <a class="card feat" href="#/national"><span class="chip gray">National</span><h3 style="margin-top:10px">President, VP and the 24 senators</h3><p class="muted">Who was elected, by party, in every cycle since 2016.</p></a>
    <a class="card feat" href="#/families"><span class="chip gray">Families</span><div class="big">${fmt(dyn.length)}</div><p class="muted">surname groups holding 2+ seats in one province this term.</p></a>
    <a class="card feat" href="#/changes"><span class="chip gray">Seat changes</span><div class="big">${fmt(stats.relative_successions)}</div><p class="muted">times a governor or mayor seat passed to someone with the same family name since 2004.</p></a>
    <a class="card feat" href="#/spending"><span class="chip gray">DPWH</span><div class="big">${fmt(stats.contracts)}</div><p class="muted">public works contracts, with contractor, cost and status, placed on the map.</p></a>
  </section>
  <section class="card">
    <div class="flex between"><h2>All provinces</h2><span class="muted">${provs.length} provinces and Metro Manila districts</span></div>
    <div class="toolbar"><input id="pf" type="search" placeholder="Filter provinces"></div>
    <div class="tscroll"><table><thead><tr><th>Province</th><th>Governor (2025)</th><th class="num">Towns</th><th class="num">Families 2+ seats</th><th class="num">DPWH contracts</th><th class="num">Contract value</th></tr></thead>
    <tbody id="pt"></tbody></table></div>
  </section>`;
  const rows = (q) => provs.filter((p) => p.n.toLowerCase().includes(q)).map((p) =>
    `<tr><td><a href="#/p/${p.c}">${esc(p.n)}</a></td><td>${esc(p.gov || '—')}</td><td class="num">${p.m}</td><td class="num">${p.fam}</td><td class="num">${fmt(p.dpn)}</td><td class="num">${peso(p.dp)}</td></tr>`).join('');
  const pt = document.getElementById('pt'); pt.innerHTML = rows('');
  document.getElementById('pf').addEventListener('input', (e) => { pt.innerHTML = rows(e.target.value.toLowerCase()); });
  drawMap(document.getElementById('map'), geo, {
    label: (d) => { const p = byCode[d.properties.c]; return p ? `<b>${esc(p.n)}</b><br>Governor: ${esc(p.gov || '—')}<br>${p.m} towns · ${peso(p.dp)} DPWH` : ''; },
    onClick: (d) => { location.hash = '#/p/' + d.properties.c; },
  });
}

function officialsBlock(list, title) {
  if (!list || !list.length) return '';
  return `<h3>${esc(title)}</h3><div class="people">${list.map((r) => personCard(r)).join('')}</div>`;
}
function familiesBlock(fams, where) {
  const now = fams.filter((f) => f.now >= 2).sort((a, b) => b.now - a.now);
  if (!now.length) return `<p class="muted">No surname holds two or more seats in ${esc(where)} this term.</p>`;
  return `<div class="tscroll"><table><thead><tr><th>Surname</th><th class="num">Seats now</th><th class="num">People since 2001</th><th class="num">First seen</th></tr></thead><tbody>
    ${now.map((f) => `<tr><td><b>${esc(f.sn)}</b> ${f.common ? '<span class="chip gray">common surname</span>' : ''}</td><td class="num">${f.now}</td><td class="num">${f.people}</td><td class="num">${f.since}</td></tr>`).join('')}
  </tbody></table></div>`;
}
function historyBlock(cycles, skipLatest = true) {
  return Object.keys(cycles).sort((a, b) => b - a).filter((y) => !(skipLatest && y === '2025')).map((y) => {
    const list = cycles[y];
    const top = list.filter((r) => r.p !== 'Councilor' && r.p !== 'Board Member');
    const rest = list.filter((r) => r.p === 'Councilor' || r.p === 'Board Member');
    return `<details class="cycle"><summary>${term(+y)} <span class="muted">· ${top.map((r) => `${r.p}: ${r.n}`).join(' · ')}</span></summary>
      <div class="people" style="margin-top:10px">${top.concat(rest).map((r) => personCard(r)).join('')}</div></details>`;
  }).join('');
}

async function province(code) {
  const [p, geo] = await Promise.all([get(`p/${code}.json`), get(`geo/p/${code}.json`).catch(() => null)]);
  const now = (p.cycles['2025'] || []).sort((a, b) => POS_RANK.indexOf(a.p) - POS_RANK.indexOf(b.p));
  const byCode = Object.fromEntries(p.munis.map((m) => [m.c, m]));
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › ${esc(p.rn || '')} › ${esc(p.n)}</div>
  <div class="flex between"><h1>${esc(p.n)}</h1><span class="chip">${p.munis.length} cities and municipalities</span></div>
  <div class="hero" style="padding-top:8px;align-items:start">
    <div>
      ${searchBox('Search in the Philippines…')}
      <section>${officialsBlock(now.filter((r) => r.p !== 'Board Member'), 'Provincial officials, 2025–2028')}</section>
      <section>${officialsBlock(now.filter((r) => r.p === 'Board Member'), 'Provincial board')}</section>
    </div>
    <div class="mapbox" id="map"><span class="mapnote muted">Tap a town</span></div>
  </div>
  <section class="card" id="projects"><div class="flex between"><h2 style="margin:0">DPWH projects in ${esc(p.n)}</h2><span class="muted" id="pjc">Loading projects…</span></div></section>
  <section class="card"><h2>Cities and municipalities</h2>
    <div class="tscroll"><table><thead><tr><th>Town</th><th>Mayor (2025)</th><th class="num">DPWH contracts</th><th class="num">Value</th></tr></thead><tbody>
    ${p.munis.map((m) => `<tr><td><a href="#/m/${m.c}">${esc(m.n)}</a></td><td>${esc(m.mayor || '—')}</td><td class="num">${fmt(m.dpn)}</td><td class="num">${peso(m.dp)}</td></tr>`).join('')}
    </tbody></table></div></section>
  <section class="card"><h2>Surnames holding 2+ seats across ${esc(p.n)} now</h2>
    <p class="note">Counts every governor, vice governor, representative, board member, mayor, vice mayor and councilor in the province with the same surname. A shared surname is not proof of kinship.</p>
    ${familiesBlock(p.families, p.n)}</section>
  <section class="card"><h2>Provincial officials before 2025</h2>${historyBlock(p.cycles)}</section>`;
  if (geo) drawMap(document.getElementById('map'), geo, {
    label: (d) => { const m = byCode[d.properties.c]; return `<b>${esc(d.properties.n)}</b>${m ? `<br>Mayor: ${esc(m.mayor || '—')}<br>${fmt(m.dpn)} DPWH contracts · ${peso(m.dp)}` : ''}`; },
    onClick: (d) => { location.hash = '#/m/' + d.properties.c; },
  });
  projectsBlock(code, geo, p);
}

const STATUS = { 'On-Going': ['#d97706', 'On-going'], 'Completed': ['#15803d', 'Completed'], 'Not Yet Started': ['#0038a8', 'Not yet started'],
  'For Procurement': ['#7c3aed', 'For procurement'], 'Terminated': ['#ce1126', 'Terminated'] };
const DOC_LABEL = { A: 'Notice of award', P: 'Notice to proceed', C: 'Contract' };
const docUrl = (d) => d[1] === '|' ? d.slice(2) : 'https://www.dpwh.gov.ph/dpwh/sites/default/files/webform/civil_works/' + d.slice(1).split('/').map(encodeURIComponent).join('/');
function satTile(lat, lon, z = 17) {
  const n = 2 ** z, x = Math.floor((lon + 180) / 360 * n), r = lat * Math.PI / 180;
  const y = Math.floor((1 - Math.log(Math.tan(r) + 1 / Math.cos(r)) / Math.PI) / 2 * n);
  return `https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/${z}/${y}/${x}`;
}
function projectCard(r, places, asof) {
  const [cid, desc, cat, st, prog, budget, paid, contractor, yr, start, expiry, mun, lat, lon, photos, docs] = r;
  const [col, label] = STATUS[st] || ['#64748b', st || 'Unknown'];
  const late = st === 'On-Going' && expiry && expiry < asof;
  const pct = prog == null ? null : Math.max(0, Math.min(100, prog));
  return `<article class="pj">
    ${lat ? `<a class="pjimg" href="https://www.google.com/maps/@${lat},${lon},400m/data=!3m1!1e3" target="_blank" rel="noopener" title="Open the site in Google Maps satellite view">
      <img src="${satTile(lat, lon)}" alt="Satellite view of the project site" loading="lazy" referrerpolicy="no-referrer"><span class="pin"></span><small>Satellite view of the site</small></a>`
      : `<div class="pjimg none"><span>No coordinates published</span></div>`}
    <div class="pjbody">
      <div class="flex" style="gap:6px"><span class="chip" style="background:${col}1f;color:${col}">${esc(label)}</span>${late ? '<span class="chip amber">Past target date</span>' : ''}<span class="chip gray">${esc(cat)}</span>${yr ? `<span class="chip gray">${yr}</span>` : ''}</div>
      <h3 class="pjt" title="${esc(desc)}">${esc(desc)}</h3>
      <div class="muted" style="font-size:13px">${mun ? `<a href="#/m/${mun}">${esc(places[mun]?.[0] || '')}</a> · ` : ''}${esc(cid)}${contractor ? ' · ' + esc(contractor) : ''}</div>
      ${pct != null ? `<div class="prog"><div style="width:${pct}%;background:${col}"></div></div><div class="flex between" style="font-size:12.5px"><span>${pct.toFixed(pct % 1 ? 1 : 0)}% done</span><span class="muted">${start ? 'Started ' + esc(start) : ''}${expiry ? ' · target ' + esc(expiry) : ''}</span></div>` : ''}
      <div class="flex between" style="margin-top:6px"><span><b>${peso(budget)}</b> <small class="muted">contract</small></span><span class="muted" style="font-size:13px">${paid ? peso(paid) + ' paid' : ''}</span></div>
      <div class="pjlinks"><a href="https://transparency.dpwh.gov.ph/projects/${esc(cid)}" target="_blank" rel="noopener">DPWH page${photos ? ` (${photos} site photos)` : ''}</a>${(docs || []).map((d) => `<a href="${esc(docUrl(d))}" target="_blank" rel="noopener">${DOC_LABEL[d[0]]}</a>`).join('')}</div>
    </div></article>`;
}
async function projectsBlock(code, geo, p) {
  const box = document.getElementById('projects');
  const [pj, places] = await Promise.all([get(`pj/${code}.json`).catch(() => null), get('places.json')]);
  if (!box) return;
  if (!pj || !pj.rows.length) { document.getElementById('pjc').textContent = 'No DPWH projects with a location in this province.'; return; }
  const order = ['On-Going', 'Not Yet Started', 'For Procurement', 'Completed', 'Terminated'];
  const years = [...new Set(pj.rows.map((r) => r[8]).filter(Boolean))].sort((a, b) => b - a);
  const asof = pj.asof || '2025-11-26';
  const late = pj.rows.filter((r) => r[3] === 'On-Going' && r[10] && r[10] < asof).length;
  box.innerHTML = `<div class="flex between"><h2 style="margin:0">DPWH projects in ${esc(p.n)}</h2><span class="muted">${fmt(pj.rows.length)} projects · status as of ${new Date(asof + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' })} · tap a status to filter</span></div>
    <div class="grid g4 pjstats" style="margin:14px 0">${order.filter((k) => pj.s[k]).map((k) => `<button class="stat pjs" data-s="${k}" style="border-left:5px solid ${STATUS[k][0]}"><span>${STATUS[k][1]}<br><small class="muted">${peso(pj.s[k][1])}</small></span><b>${fmt(pj.s[k][0])}</b></button>`).join('')}
      ${late ? `<button class="stat pjs" data-s="late" style="border-left:5px solid var(--flag-red)"><span>On-going past target date<br><small class="muted">on that date</small></span><b>${fmt(late)}</b></button>` : ''}</div>
    <div class="grid g2" style="align-items:start">
      <div class="mapbox" id="pjmap"><span class="mapnote muted">Dots = project sites · tap one</span></div>
      <div><div class="toolbar" style="margin-top:0"><input id="pq" type="search" placeholder="Search project, barangay or contractor">
        <select id="ps"><option value="">Any status</option>${order.filter((k) => pj.s[k]).map((k) => `<option value="${k}">${STATUS[k][1]}</option>`).join('')}<option value="late">Past target date</option></select>
        <select id="pm"><option value="">All towns</option>${p.munis.map((m) => `<option value="${m.c}">${esc(m.n)}</option>`).join('')}</select>
        <select id="py"><option value="">All years</option>${years.map((y) => `<option>${y}</option>`).join('')}</select>
        <select id="po"><option value="new">Newest first</option><option value="big">Largest first</option><option value="slow">Least progress (on-going)</option></select></div>
        <div class="legend">${order.filter((k) => pj.s[k]).map((k) => `<span><i style="background:${STATUS[k][0]}"></i>${STATUS[k][1]}</span>`).join('')}</div>
        <p class="note" style="margin-top:10px">Status, progress and amounts as published on the DPWH Transparency Portal, captured ${esc(asof)} (the portal may show newer figures). Thumbnails are satellite imagery of the published coordinates (Esri World Imagery), not DPWH site photos, which the portal does not publish openly; the DPWH page link opens the official record. "Past target date" means the published expiry date had passed by the capture date while the status still read on-going; the contract may have been extended, and it is not a finding of delay or fault.</p></div>
    </div>
    <div class="pjgrid" id="pjl"></div>
    <div class="flex" style="margin-top:12px"><button class="btn" id="pmore">Show more</button><span class="muted" id="pcount"></span></div>`;
  let svg = null;
  if (geo) {
    svg = drawMap(document.getElementById('pjmap'), geo, { label: (d) => `<b>${esc(d.properties.n)}</b>`, onClick: (d) => { document.getElementById('pm').value = d.properties.c; limit = 24; render(); } });
    svg.selectAll('path').style('fill', 'var(--blue-soft)');
  }
  let limit = 24;
  const filtered = () => {
    const q = document.getElementById('pq').value.toLowerCase(), st = document.getElementById('ps').value, m = document.getElementById('pm').value,
      y = document.getElementById('py').value, o = document.getElementById('po').value;
    let rows = pj.rows.filter((r) => (!st || (st === 'late' ? r[3] === 'On-Going' && r[10] && r[10] < asof : r[3] === st)) && (!m || String(r[11]) === m)
      && (!y || String(r[8]) === y) && (!q || (r[1] + ' ' + r[7] + ' ' + r[0]).toLowerCase().includes(q)));
    if (o === 'big') rows = rows.slice().sort((a, b) => b[5] - a[5]);
    else if (o === 'slow') rows = rows.filter((r) => r[3] === 'On-Going').sort((a, b) => (a[4] ?? 0) - (b[4] ?? 0));
    else rows = rows.slice().sort((a, b) => (b[9] || '').localeCompare(a[9] || '') || b[5] - a[5]);
    return rows;
  };
  const render = () => {
    const rows = filtered();
    document.getElementById('pjl').innerHTML = rows.slice(0, limit).map((r) => projectCard(r, places, asof)).join('') || '<p class="muted">No projects match.</p>';
    document.getElementById('pcount').textContent = `Showing ${Math.min(limit, rows.length)} of ${fmt(rows.length)}`;
    document.getElementById('pmore').hidden = rows.length <= limit;
    if (svg) {
      const pts = rows.filter((r) => r[12]).slice(0, 4000);
      svg.selectAll('circle').data(pts, (r) => r[0]).join('circle')
        .attr('cx', (r) => svg.proj([r[13], r[12]])[0]).attr('cy', (r) => svg.proj([r[13], r[12]])[1]).attr('r', 2.6)
        .attr('fill', (r) => (STATUS[r[3]] || ['#64748b'])[0]).attr('stroke', 'white').attr('stroke-width', 0.5).style('cursor', 'pointer')
        .on('mousemove', (e, r) => showTip(e, `<b>${esc(r[1].slice(0, 90))}${r[1].length > 90 ? '…' : ''}</b><br>${esc((STATUS[r[3]] || [0, r[3]])[1])}${r[4] != null ? ' · ' + Math.round(r[4]) + '%' : ''} · ${peso(r[5])}`))
        .on('mouseleave', hideTip)
        .on('click', (e, r) => { hideTip(); document.getElementById('pq').value = r[0]; limit = 24; render(); document.getElementById('pjl').scrollIntoView({ behavior: 'smooth', block: 'start' }); });
    }
  };
  ['pq', 'ps', 'pm', 'py', 'po'].forEach((id) => document.getElementById(id).addEventListener('input', () => { limit = 24; render(); }));
  box.querySelectorAll('.pjs').forEach((b) => b.addEventListener('click', () => { document.getElementById('ps').value = b.dataset.s; limit = 24; render(); }));
  document.getElementById('pmore').addEventListener('click', () => { limit += 24; render(); });
  render();
}

async function town(code) {
  const m = await get(`m/${code}.json`);
  const now = (m.cycles['2025'] || []);
  const exec = now.filter((r) => r.p !== 'Councilor'), council = now.filter((r) => r.p === 'Councilor');
  const yrs = Object.entries(m.dp.years); const maxY = Math.max(1, ...yrs.map(([, v]) => v[1]));
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › ${esc(m.rn || '')} › <a href="#/p/${m.pc}">${esc(m.pn)}</a> › ${esc(m.n)}</div>
  <div class="flex between"><h1>${esc(m.n)}</h1><span class="chip">${esc(m.pn)}</span></div>
  <section class="grid g2">
    <div class="card">${officialsBlock(exec, 'Your local government, 2025–2028')}
      <div style="margin-top:14px">${officialsBlock(council, 'Sangguniang Bayan / Panlungsod')}</div>
      ${now.length ? '' : '<p class="muted">No 2025 winners on record for this town.</p>'}
      <p class="note" style="margin-top:14px">Barangay officials are not included yet.</p></div>
    <div class="card">${officialsBlock(m.prov_now.filter((r) => r.p !== 'Board Member'), `${m.pn}: governor and district representatives`)}
      <section><h3>Surnames sharing seats now</h3>${familiesBlock(m.families, m.pn)}</section></div>
  </section>
  <section class="card"><div class="flex between"><h2>DPWH contracts in ${esc(m.n)}</h2><span class="chip">${fmt(m.dp.n)} contracts · ${peso(m.dp.total)}</span></div>
    ${yrs.length ? `<div class="bars" style="margin:12px 0 6px">${yrs.map(([y, [n, v]]) => `<div class="barrow"><span>${y}</span><div class="b" style="width:${(v / maxY * 100).toFixed(1)}%"></div><span class="v">${peso(v)} · ${n}</span></div>`).join('')}</div>
    <div class="toolbar"><input id="cq" type="search" placeholder="Search description or contractor"><select id="cy"><option value="">All years</option>${yrs.map(([y]) => `<option>${y}</option>`).join('')}</select><select id="cs"><option value="">Any status</option><option>Completed</option><option>On-Going</option><option>Not Yet Started</option><option>Terminated</option></select></div>
    <div class="tscroll"><table><thead><tr><th>Year</th><th>Project</th><th>Contractor</th><th>Status</th><th class="num">Cost</th></tr></thead><tbody id="ct"></tbody></table></div>
    <div class="flex" style="margin-top:10px"><button class="btn" id="cm">Show more</button><span class="muted" id="cc"></span></div>`
    : '<p class="muted">No DPWH contracts placed in this town. Contracts with no coordinates or that span several towns may be missing.</p>'}
    <p class="note" style="margin-top:12px">Placed by project coordinates from the DPWH transparency data. Amounts are contract costs, not money released. A listing is not a finding of irregularity.</p>
  </section>
  <section class="card"><h2>Past officials</h2>${historyBlock(m.cycles)}</section>`;
  if (!yrs.length) return;
  let limit = 50;
  const render = () => {
    const q = document.getElementById('cq').value.toLowerCase(), y = document.getElementById('cy').value, s = document.getElementById('cs').value;
    const rows = m.dp.rows.filter((r) => (!y || String(r[6]) === y) && (!s || r[4] === s) && (!q || (r[1] + ' ' + r[2]).toLowerCase().includes(q)));
    document.getElementById('ct').innerHTML = rows.slice(0, limit).map((r) =>
      `<tr><td>${r[6]}</td><td>${esc(r[1])}<br><small class="muted">${esc(r[0])} · ${esc(r[7] || '')}</small></td><td>${esc(r[2])}</td><td>${esc(r[4] || '')}${r[5] != null && r[4] !== 'Completed' ? ` <small class="muted">${Math.round(r[5])}%</small>` : ''}</td><td class="num">${peso(r[3])}</td></tr>`).join('');
    document.getElementById('cc').textContent = `Showing ${Math.min(limit, rows.length)} of ${fmt(rows.length)}`;
    document.getElementById('cm').hidden = rows.length <= limit;
  };
  ['cq', 'cy', 'cs'].forEach((id) => document.getElementById(id).addEventListener('input', () => { limit = 50; render(); }));
  document.getElementById('cm').addEventListener('click', () => { limit += 100; render(); });
  render();
}

async function person(id) {
  const [bucket, places, sd] = await Promise.all([get(`people/${Math.floor(id / 1000)}.json`), get('places.json'), get('saln.json')]);
  const p = bucket[id];
  if (!p) { $app.innerHTML = '<p class="pad">Not found.</p>'; return; }
  const place = (pc, mc) => mc ? `<a href="#/m/${mc}">${esc(places[mc]?.[0] || '')}</a>, <a href="#/p/${pc}">${esc(places[pc]?.[0] || '')}</a>` : pc ? `<a href="#/p/${pc}">${esc(places[pc]?.[0] || '')}</a>` : 'Nationwide';
  const last = p.c[p.c.length - 1];
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › Official</div>
  <div class="flex">${avatar(id, p.n, 96)}<div><h1 style="margin:0">${esc(p.n)}</h1><div class="muted">${esc(p.f)}</div>
    ${PHOTOS[id] ? `<small class="muted">Photo: <a href="https://commons.wikimedia.org/wiki/File:${encodeURIComponent(PHOTOS[id][0])}" target="_blank" rel="noopener">Wikimedia Commons</a> · <a href="https://www.wikidata.org/wiki/${PHOTOS[id][1]}" target="_blank" rel="noopener">Wikidata</a></small>` : ''}</div></div>
  <section class="grid g2">
    <div class="card"><h2>Elected seats</h2><div class="timeline">
      ${p.c.slice().reverse().map(([pos, y, pc, mc, party, v]) => `<div class="t"><b>${esc(pos)}</b> · ${term(y, pos)}<br><span class="muted">${place(pc, mc)}${party ? ' · ' + esc(party) : ''}${v ? ` · <b class="votes">${fmt(v)} votes</b>` : ''}</span></div>`).join('')}
    </div></div>
    <div class="card"><h2>Record</h2>
      <p>${p.c.length} winning ${p.c.length === 1 ? 'race' : 'races'} on record since 2001. Latest: <b>${esc(last[0])}</b>, ${term(last[1], last[0])}.</p>
      <p class="note">Built from COMELEC winners lists. People are matched by full name within a province, so two people with the same full name may be merged, and a name spelled differently in one year may show as two people.</p>
    </div>
  </section>
  <section class="card" id="vmap" hidden></section>
  <section class="card"><h2>Statement of assets, liabilities and net worth (SALN)</h2>${salnBlock(p.saln, sd.sources)}</section>`;
  voteMap(id, p, places);
}

async function voteMap(id, p, places) {
  const races = await get(`votes/${id}.json`).catch(() => null);
  const box = document.getElementById('vmap');
  if (!races || !races.length || !box) return;
  box.hidden = false;
  box.innerHTML = `<div class="flex between"><h2 style="margin:0">Where the votes came from</h2>
    <select id="vr" class="btn">${races.map((r, i) => `<option value="${i}">${esc(r.p)} ${r.y}</option>`).join('')}</select></div>
    <div class="grid g2" style="margin-top:12px;align-items:start"><div class="mapbox" id="vm"></div>
    <div><div class="stat blue"><span>Total votes</span><b id="vt"></b></div>
    <div id="vl"></div>
    <h3 style="margin-top:16px">Strongest towns</h3><div id="vtop" class="tscroll"></div>
    <p class="note" style="margin-top:12px">Shading is the estimated share of voters in each town who voted for ${esc(p.n)}: their votes divided by the votes cast in that town's biggest single-seat race (president, governor or mayor). Totals are summed from per-town results in OpenHalalan and may differ slightly from COMELEC's official canvass.</p></div></div>`;
  const draw = async (r) => {
    const pcs = [...new Set(Object.keys(r.m).map((mc) => places[mc]?.[1]).filter(Boolean))];
    const national = ['President', 'Vice President', 'Senator'].includes(r.p);
    let geo;
    if (national || pcs.length > 3) geo = await get('geo/munis.json');
    else {
      const parts = await Promise.all(pcs.map((pc) => get(`geo/p/${pc}.json`).catch(() => null)));
      geo = { type: 'FeatureCollection', features: parts.filter(Boolean).flatMap((g) => g.features) };
    }
    document.getElementById('vt').textContent = fmt(r.t);
    const vals = Object.values(r.m).map((v) => v[1]).filter((v) => v != null).sort((a, b) => a - b);
    const hi = vals.length ? vals[Math.floor(vals.length * 0.98)] || vals[vals.length - 1] : 100;
    const color = d3.scaleSequential(d3.interpolateYlOrRd).domain([0, Math.max(hi, 1)]);
    const el = document.getElementById('vm'); el.innerHTML = '';
    const svg = drawMap(el, geo, {
      label: (d) => { const v = r.m[d.properties.c]; const nm = places[d.properties.c]?.[0] || ''; return v ? `<b>${esc(nm)}</b><br>${fmt(v[0])} votes${v[1] != null ? ` · ≈${v[1]}% of voters` : ''}` : `<b>${esc(nm)}</b><br>No votes on record`; },
      onClick: (d) => { if (places[d.properties.c]) location.hash = '#/m/' + d.properties.c; },
    });
    svg.selectAll('path').style('fill', (d) => { const v = r.m[d.properties.c]; return v && v[1] != null ? color(v[1]) : v ? '#cfd6e4' : 'var(--line)'; }).style('stroke-width', national ? 0.15 : 0.6);
    document.getElementById('vl').innerHTML = `<div class="ramp" style="background:linear-gradient(90deg,${[0, .25, .5, .75, 1].map((t) => color(t * Math.max(hi, 1))).join(',')})"></div>
      <div class="flex between muted" style="font-size:12px"><span>0%</span><span>≈ share of voters</span><span>${Math.round(hi)}%+</span></div>`;
    const top = Object.entries(r.m).filter(([, v]) => v[1] != null).sort((a, b) => b[1][1] - a[1][1]).slice(0, 8);
    document.getElementById('vtop').innerHTML = `<table><tbody>${top.map(([mc, v]) => `<tr><td><a href="#/m/${mc}">${esc(places[mc]?.[0] || mc)}</a><br><small class="muted">${esc(places[places[mc]?.[1]]?.[0] || '')}</small></td><td class="num">${fmt(v[0])}</td><td class="num"><b>${v[1]}%</b></td></tr>`).join('')}</tbody></table>`;
  };
  document.getElementById('vr').addEventListener('input', (e) => draw(races[+e.target.value]));
  draw(races[0]);
}

const asof = (y, d) => d ? new Date(d + 'T00:00:00').toLocaleDateString('en-PH', { year: 'numeric', month: 'short', day: 'numeric' }) : 'Dec 31, ' + y;
function salnBlock(rows, sources) {
  if (!rows || !rows.length) return `<p class="muted">No published SALN summary on file for this official. Alamin PH has the Senate summaries (2019, 2020, 2024) and House summaries (2015–2018). Others can be requested from the Office of the Ombudsman or the official's chamber.</p>`;
  const max = Math.max(...rows.map((r) => r[4]), 1);
  return `<div class="bars" style="margin:6px 0 14px">${rows.map(([y, d, a, l, n]) => `<div class="barrow"><span>${y}</span><div class="b" style="width:${Math.max(0, n / max * 100).toFixed(1)}%;background:var(--flag-yellow)"></div><span class="v">${peso(n)}</span></div>`).join('')}</div>
  <div class="tscroll"><table><thead><tr><th>As of</th><th>Chamber</th><th class="num">Assets</th><th class="num">Liabilities</th><th class="num">Net worth</th><th>Source</th></tr></thead><tbody>
  ${rows.slice().reverse().map(([y, d, a, l, n, si, ch]) => `<tr><td>${asof(y, d)}</td><td>${esc(ch)}</td><td class="num">${peso(a)}</td><td class="num">${peso(l)}</td><td class="num"><b>${peso(n)}</b></td><td><a href="${esc(sources[si][1])}" target="_blank" rel="noopener">${esc(sources[si][0])}</a></td></tr>`).join('')}
  </tbody></table></div>
  <p class="note" style="margin-top:10px">Totals as declared by the official in the published summary. Declared values are often acquisition cost, not market value. A SALN is a self-declaration, not an audit.</p>`;
}

async function salnPage() {
  const sd = await get('saln.json');
  const years = [...new Set(sd.rows.map((r) => r.y))].sort((a, b) => b - a);
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › SALN</div>
  <h1>SALN records</h1>
  <p class="muted" style="max-width:780px">Declared assets, liabilities and net worth of senators and House members, from the official summary tables each chamber published. Only rows where assets minus liabilities equals the stated net worth are shown, so misread numbers are left out.</p>
  <div class="toolbar"><select id="sc"><option value="">Senate and House</option><option>Senate</option><option>House</option></select>
    <select id="sy">${years.map((y) => `<option>${y}</option>`).join('')}<option value="">All years</option></select>
    <input id="sq" type="search" placeholder="Name or district"><select id="so"><option value="n">Highest net worth</option><option value="-n">Lowest net worth</option><option value="l">Highest liabilities</option><option value="nm">Name A–Z</option></select></div>
  <div class="card tscroll"><table><thead><tr><th>#</th><th>Official</th><th>Chamber · as of</th><th class="num">Assets</th><th class="num">Liabilities</th><th class="num">Net worth</th></tr></thead><tbody id="st"></tbody></table></div>
  <div class="flex" style="margin-top:12px"><button class="btn" id="sm">Show more</button><span class="muted" id="sn"></span></div>
  <section class="card"><h2>Sources</h2><ul>${sd.sources.map(([label, url]) => `<li><a href="${esc(url)}" target="_blank" rel="noopener">${esc(label)}</a></li>`).join('')}</ul>
  <p class="note">House figures were read from the scanned summary PDFs with text recognition and checked row by row. Senate 2024 figures are as tallied by GMA News from the senators' released SALNs; some are as of June 30, 2025. Party-list representatives are listed but not linked to a profile.</p></section>`;
  let limit = 100;
  const render = () => {
    const c = document.getElementById('sc').value, y = document.getElementById('sy').value, q = document.getElementById('sq').value.toLowerCase(), o = document.getElementById('so').value;
    let rows = sd.rows.filter((r) => (!c || r.ch === c) && (!y || String(r.y) === y) && (!q || (r.nm + ' ' + (r.d || '') + ' ' + r.w).toLowerCase().includes(q)));
    rows = rows.slice().sort(o === 'n' ? (a, b) => b.n - a.n : o === '-n' ? (a, b) => a.n - b.n : o === 'l' ? (a, b) => b.l - a.l : (a, b) => a.nm.localeCompare(b.nm));
    document.getElementById('st').innerHTML = rows.slice(0, limit).map((r, i) => `<tr><td class="muted">${i + 1}</td>
      <td>${r.i != null ? `<a href="#/person/${r.i}">${esc(r.nm)}</a>` : esc(r.nm)}${r.w ? `<br><small class="muted">${esc(r.w)}</small>` : ''}</td>
      <td>${esc(r.ch)}<br><small class="muted">${asof(r.y, r.asof)}</small></td><td class="num">${peso(r.a)}</td><td class="num">${peso(r.l)}</td><td class="num"><b>${peso(r.n)}</b></td></tr>`).join('');
    document.getElementById('sn').textContent = `${fmt(rows.length)} records`;
    document.getElementById('sm').hidden = rows.length <= limit;
  };
  ['sc', 'sy', 'sq', 'so'].forEach((id) => document.getElementById(id).addEventListener('input', () => { limit = 100; render(); }));
  document.getElementById('sm').addEventListener('click', () => { limit += 200; render(); });
  render();
}

async function national() {
  const n = await get('national.json');
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › National</div>
  <h1>National officials</h1>
  <section class="grid g2">
    <div class="card">${officialsBlock(n.president.map((r) => ({ ...r, pt: r.pt + (r.v ? ' · ' + fmt(r.v) + ' votes' : '') })), 'President, 2022–2028')}<div style="margin-top:12px">${officialsBlock(n.vp.map((r) => ({ ...r, pt: r.pt + (r.v ? ' · ' + fmt(r.v) + ' votes' : '') })), 'Vice President, 2022–2028')}</div></div>
    <div class="card"><h3>Senate</h3><p class="muted">Senators elected in 2022 serve to 2028; those elected in 2025 serve to 2031. Shown as elected; later vacancies are not reflected.</p></div>
  </section>
  <section class="card"><h2>Senators elected 2025 and 2022</h2><div class="grid g3">${n.senators.map((r) => personCard(r, ` · ${r.y}${r.v ? ` · ${fmt(r.v)} votes` : ''}`)).join('')}</div>
    <p class="note" style="margin-top:12px">Tap a senator to see a map of where their votes came from.</p></section>
  <section class="card"><h2>Earlier national races</h2>
    ${Object.keys(n.history).sort((a, b) => b - a).map((y) => `<details class="cycle"><summary>${y}</summary><div class="grid g3" style="margin-top:10px">${n.history[y].map((r) => personCard(r)).join('')}</div></details>`).join('')}
    <p class="note">National winners are available from 2016 onward in the source data.</p></section>`;
}

async function families() {
  const [dyn, provs] = await Promise.all([get('dynasties.json'), get('provinces.json')]);
  const pn = Object.fromEntries(provs.map((p) => [p.c, p.n]));
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › Families</div>
  <h1>Surnames sharing seats</h1>
  <p class="muted" style="max-width:760px">Surname groups with two or more elected seats in the same province for the 2025–2028 term, counting governor, vice governor, representative, board member, mayor, vice mayor and councilor. A shared surname is not proof of kinship, and common surnames are flagged.</p>
  <div class="toolbar"><input id="fq" type="search" placeholder="Surname"><select id="fp"><option value="">All provinces</option>${provs.map((p) => `<option value="${p.c}">${esc(p.n)}</option>`).join('')}</select><label class="muted"><input type="checkbox" id="fc"> Hide common surnames</label></div>
  <div class="grid g2" id="fl"></div><div class="flex" style="margin-top:12px"><button class="btn" id="fm">Show more</button></div>`;
  let limit = 30;
  const render = () => {
    const q = document.getElementById('fq').value.toLowerCase(), pc = document.getElementById('fp').value, hc = document.getElementById('fc').checked;
    const rows = dyn.filter((d) => (!q || d.sn.toLowerCase().includes(q)) && (!pc || String(d.pc) === pc) && !(hc && d.common));
    document.getElementById('fl').innerHTML = rows.slice(0, limit).map((d) => `
      <div class="card"><div class="flex between"><h3 style="margin:0">${esc(d.sn)} <span class="muted">· <a href="#/p/${d.pc}">${esc(pn[d.pc] || '')}</a></span></h3>
      <span class="chip ${d.common ? 'gray' : 'amber'}">${d.now} seats now</span></div>
      <p class="muted" style="margin:6px 0 10px">${d.people} people with this surname won here since ${d.since}${d.common ? ' · common surname' : ''}</p>
      <div class="people">${d.seats.map((r) => personCard(r)).join('')}</div></div>`).join('') || '<p class="muted">No match.</p>';
    document.getElementById('fm').hidden = rows.length <= limit;
  };
  ['fq', 'fp', 'fc'].forEach((id) => document.getElementById(id).addEventListener('input', () => { limit = 30; render(); }));
  document.getElementById('fm').addEventListener('click', () => { limit += 30; render(); });
  render();
}

async function changes() {
  const [ch, places] = await Promise.all([get('changes.json'), get('places.json')]);
  const where = (c) => c.mc ? `<a href="#/m/${c.mc}">${esc(places[c.mc]?.[0] || '')}</a>, ${esc(places[c.pc]?.[0] || '')}` : c.pc ? `<a href="#/p/${c.pc}">${esc(places[c.pc]?.[0] || '')}</a>` : 'Nationwide';
  const years = [...new Set(ch.map((c) => c.y))].sort((a, b) => b - a);
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › Seat changes</div>
  <h1>Seat changes</h1>
  <p class="muted" style="max-width:760px"><b>Same family name took the seat:</b> a governor, vice governor, mayor or vice mayor seat passed to a different person who shares the outgoing official's surname, or whose middle name is that surname. <b>Switched office:</b> the same person won a different office in the next election.</p>
  <div class="toolbar"><select id="ck"><option value="relative">Same family name took the seat</option><option value="switch">Switched office</option></select>
    <select id="cy">${years.map((y) => `<option>${y}</option>`).join('')}<option value="">All years</option></select><input id="cq" type="search" placeholder="Name or place"></div>
  <div class="card tscroll"><table><thead><tr><th>Year</th><th>Change</th><th>Where</th></tr></thead><tbody id="cl"></tbody></table></div>
  <div class="flex" style="margin-top:12px"><button class="btn" id="cmore">Show more</button><span class="muted" id="ccount"></span></div>`;
  let limit = 60;
  const render = () => {
    const k = document.getElementById('ck').value, y = document.getElementById('cy').value, q = document.getElementById('cq').value.toLowerCase();
    const rows = ch.filter((c) => c.k === k && (!y || String(c.y) === y) && (!q || JSON.stringify([c.from, c.to, c.who, places[c.mc]?.[0], places[c.pc]?.[0]]).toLowerCase().includes(q)));
    document.getElementById('cl').innerHTML = rows.slice(0, limit).map((c) => c.k === 'relative'
      ? `<tr><td>${c.y}</td><td>${esc(c.seat)}: <a href="#/person/${c.from[0]}">${esc(c.from[1])}</a> → <a href="#/person/${c.to[0]}">${esc(c.to[1])}</a></td><td>${where(c)}</td></tr>`
      : `<tr><td>${c.y}</td><td><a href="#/person/${c.who[0]}">${esc(c.who[1])}</a>: ${esc(c.from)} → ${esc(c.to)}</td><td>${where(c)}</td></tr>`).join('');
    document.getElementById('ccount').textContent = `${fmt(rows.length)} on record`;
    document.getElementById('cmore').hidden = rows.length <= limit;
  };
  ['ck', 'cy', 'cq'].forEach((id) => document.getElementById(id).addEventListener('input', () => { limit = 60; render(); }));
  document.getElementById('cmore').addEventListener('click', () => { limit += 120; render(); });
  render();
}

async function spending() {
  const s = await get('spending.json');
  const yrs = Object.entries(s.years); const maxY = Math.max(...yrs.map(([, v]) => v[1]));
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › DPWH spending</div>
  <h1>DPWH contracts, 2016–2025</h1>
  <section class="grid g3">
    <div class="card"><span class="muted">Contracts</span><div class="feat"><span class="big">${fmt(s.total[0])}</span></div></div>
    <div class="card"><span class="muted">Total contract cost</span><div class="feat"><span class="big">${peso(s.total[1])}</span></div></div>
    <div class="card"><span class="muted">Placed in a city or town</span><div class="feat"><span class="big">${Math.round(s.placed[0] / s.total[0] * 100)}%</span></div><small class="muted">${fmt(s.placed[0])} contracts</small></div>
  </section>
  <section class="card"><h2>By contract year</h2><div class="bars">${yrs.map(([y, [n, v]]) => `<div class="barrow"><span>${y}</span><div class="b" style="width:${(v / maxY * 100).toFixed(1)}%"></div><span class="v">${peso(v)} · ${fmt(n)}</span></div>`).join('')}</div></section>
  <section class="grid g2">
    <div class="card"><h2>Largest contractors by value</h2><div class="tscroll"><table><thead><tr><th>Contractor (lead)</th><th class="num">Contracts</th><th class="num">Value</th></tr></thead><tbody>
      ${s.contractors.slice(0, 40).map(([n, c, v]) => `<tr><td>${esc(n)}</td><td class="num">${fmt(c)}</td><td class="num">${peso(v)}</td></tr>`).join('')}</tbody></table></div></div>
    <div class="card"><h2>Provinces by placed contract value</h2><div class="tscroll"><table><thead><tr><th>Province</th><th class="num">Contracts</th><th class="num">Value</th></tr></thead><tbody>
      ${s.provinces.slice(0, 40).map(([c, n, k, v]) => `<tr><td><a href="#/p/${c}">${esc(n)}</a></td><td class="num">${fmt(k)}</td><td class="num">${peso(v)}</td></tr>`).join('')}</tbody></table></div></div>
  </section>
  <p class="note">Contract costs as published in DPWH's contract lists, not amounts released or paid. Joint ventures are counted under the first-listed contractor. Being listed is not a finding of irregularity.</p>`;
}

function about() {
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › Sources</div>
  <h1>Sources and method</h1>
  <section class="grid g2">
    <div class="card"><h2>Elected officials</h2>
      <p><a href="https://robertrleung.github.io/OpenHalalan/" target="_blank" rel="noopener">OpenHalalan</a> winners file, 2001–2025: governor, vice governor, board member, representative, mayor, vice mayor and councilor, plus president, vice president and senators from 2016. Built from COMELEC's lists of elected candidates and ballot results. Licensed under the Open Database License (ODbL) 1.0; the derived data on this site is available under the same license.</p>
      <p class="muted">Barangay officials and party-list representatives are not included yet. Names are shown as printed on the ballot, which for 2016 onward often includes a nickname.</p></div>
    <div class="card"><h2>DPWH contracts</h2>
      <p>DPWH contract lists 2016–2025 as compiled in <a href="https://github.com/csiiiv/dpwh-contracts-dashboard" target="_blank" rel="noopener">csiiiv/dpwh-contracts-dashboard</a> (MIT), placed in a city or municipality using project coordinates from the DPWH transparency data as matched to PSGC codes in <a href="https://github.com/csiiiv/dpwh_coor2psgc_geomapping" target="_blank" rel="noopener">csiiiv/dpwh_coor2psgc_geomapping</a>. Related work: <a href="https://budget.bettergov.ph" target="_blank" rel="noopener">BetterGov.PH Budget</a>.</p></div>
    <div class="card"><h2>SALN</h2>
      <p>Official summary tables of declared assets, liabilities and net worth: the Senate's 2019 and 2020 tables (via the Internet Archive, since the Senate site is down) and the House's 2015–2018 summary reports. Senators' 2024 figures are from the SALNs released in October 2025 as tallied by GMA News. Scanned tables were read with text recognition; only rows where assets minus liabilities equals net worth are published. See also <a href="https://saln-tracker-ph.netlify.app" target="_blank" rel="noopener">SALN Tracker Philippines</a>.</p></div>
    <div class="card"><h2>Votes</h2>
      <p>Per-town vote counts from OpenHalalan's <a href="https://github.com/RobertRLeung/OpenHalalan" target="_blank" rel="noopener">NLE_Vote_Counts</a> file (ODbL 1.0): complete for 2016, 2019, 2022 and 2025, partial for 2010 and 2013. Totals are summed across towns (plus overseas for national races) and can differ slightly from COMELEC's official canvass.</p></div>
    <div class="card"><h2>Photos</h2>
      <p>Portraits come from <a href="https://commons.wikimedia.org" target="_blank" rel="noopener">Wikimedia Commons</a> through <a href="https://www.wikidata.org" target="_blank" rel="noopener">Wikidata</a>, under each file's own free license (credited and linked on every official's page). A photo is shown only when the name, Jr./Sr., middle initial and office on Wikidata agree with the election record; otherwise initials are shown.</p></div>
    <div class="card"><h2>Maps and place codes</h2>
      <p>PSA's Philippine Standard Geographic Code (PSGC) with 2023 boundaries from <a href="https://github.com/faeldon/philippines-json-maps" target="_blank" rel="noopener">faeldon/philippines-json-maps</a>. Town names in the election data are matched to PSGC by name within the province; a handful of renamed or split towns (for example Don Victoriano Chiongbian) are not on the map yet.</p></div>
    <div class="card"><h2>How to read this</h2>
      <p><b>Families</b> groups officials by surname within a province. It does not prove kinship, and common surnames are flagged. <b>Seat changes</b> list successions where the new office holder shares the surname (or middle name) of the outgoing one, and people who won a different office in the next election.</p>
      <p>This site is non-partisan. It shows public records, not allegations. If a record is wrong, tell us at <a href="mailto:purrfecthokkaidocafe@gmail.com">purrfecthokkaidocafe@gmail.com</a>.</p></div>
  </section>
  <section class="card"><h2>Coming next</h2><p class="muted">Barangay officials, SALNs of the President, Vice President and Cabinet, PhilGEPS contracts by local government, bills and laws by legislator, and community reports.</p></section>`;
}

/* ---------- router ---------- */
const routes = [
  [/^#?\/?$/, home], [/^#\/p\/(\d+)$/, province], [/^#\/m\/(\d+)$/, town], [/^#\/person\/(\d+)$/, person],
  [/^#\/national$/, national], [/^#\/families$/, families], [/^#\/changes$/, changes], [/^#\/spending$/, spending], [/^#\/saln$/, salnPage], [/^#\/about$/, about],
];
async function route() {
  if (!route.photos) route.photos = get('photos.json').then((p) => { PHOTOS = p; }).catch(() => {});
  await route.photos;
  const h = location.hash || '#/';
  document.getElementById('nav').classList.remove('open');
  document.querySelectorAll('nav a').forEach((a) => a.classList.toggle('on', a.getAttribute('href') === h || (h.length > 2 && a.getAttribute('href') !== '#/' && h.startsWith(a.getAttribute('href')))));
  hideTip();
  for (const [re, fn] of routes) {
    const m = h.match(re);
    if (m) {
      $app.innerHTML = '<p class="muted pad">Loading…</p>';
      try { await fn(m[1] && +m[1]); } catch (e) { console.error(e); $app.innerHTML = `<p class="pad">Could not load this page (${esc(e.message)}).</p>`; }
      scrollTo(0, 0);
      return;
    }
  }
  $app.innerHTML = '<p class="pad">Page not found. <a href="#/">Go to the map</a>.</p>';
}
document.getElementById('menuBtn').addEventListener('click', () => document.getElementById('nav').classList.toggle('open'));
addEventListener('hashchange', route);
route();
