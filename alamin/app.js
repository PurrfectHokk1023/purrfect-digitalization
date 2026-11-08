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

function personCard(r, extra = '') {
  return `<a class="person" href="#/person/${r.i}"><span class="av">${esc(initials(r.n))}</span>
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
  const [bucket, places] = await Promise.all([get(`people/${Math.floor(id / 1000)}.json`), get('places.json')]);
  const p = bucket[id];
  if (!p) { $app.innerHTML = '<p class="pad">Not found.</p>'; return; }
  const place = (pc, mc) => mc ? `<a href="#/m/${mc}">${esc(places[mc]?.[0] || '')}</a>, <a href="#/p/${pc}">${esc(places[pc]?.[0] || '')}</a>` : pc ? `<a href="#/p/${pc}">${esc(places[pc]?.[0] || '')}</a>` : 'Nationwide';
  const last = p.c[p.c.length - 1];
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › Official</div>
  <div class="flex"><span class="av" style="width:56px;height:56px;font-size:18px">${esc(initials(p.n))}</span><div><h1 style="margin:0">${esc(p.n)}</h1><div class="muted">${esc(p.f)}</div></div></div>
  <section class="grid g2">
    <div class="card"><h2>Elected seats</h2><div class="timeline">
      ${p.c.slice().reverse().map(([pos, y, pc, mc, party]) => `<div class="t"><b>${esc(pos)}</b> · ${term(y, pos)}<br><span class="muted">${place(pc, mc)}${party ? ' · ' + esc(party) : ''}</span></div>`).join('')}
    </div></div>
    <div class="card"><h2>Record</h2>
      <p>${p.c.length} winning ${p.c.length === 1 ? 'race' : 'races'} on record since 2001. Latest: <b>${esc(last[0])}</b>, ${term(last[1], last[0])}.</p>
      <p class="note">Built from COMELEC winners lists. People are matched by full name within a province, so two people with the same full name may be merged, and a name spelled differently in one year may show as two people.</p>
      <h3 style="margin-top:16px">Statement of assets (SALN)</h3>
      <p class="muted">Not yet available here. SALNs of national officials can be requested from the Office of the Ombudsman.</p>
    </div>
  </section>`;
}

async function national() {
  const n = await get('national.json');
  $app.innerHTML = `
  <div class="crumbs"><a href="#/">Philippines</a> › National</div>
  <h1>National officials</h1>
  <section class="grid g2">
    <div class="card">${officialsBlock(n.president, 'President, 2022–2028')}<div style="margin-top:12px">${officialsBlock(n.vp, 'Vice President, 2022–2028')}</div></div>
    <div class="card"><h3>Senate</h3><p class="muted">Senators elected in 2022 serve to 2028; those elected in 2025 serve to 2031. Shown as elected; later vacancies are not reflected.</p></div>
  </section>
  <section class="card"><h2>Senators elected 2025 and 2022</h2><div class="grid g3">${n.senators.map((r) => personCard(r, ` · elected ${r.y}`)).join('')}</div></section>
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
    <div class="card"><h2>Maps and place codes</h2>
      <p>PSA's Philippine Standard Geographic Code (PSGC) with 2023 boundaries from <a href="https://github.com/faeldon/philippines-json-maps" target="_blank" rel="noopener">faeldon/philippines-json-maps</a>. Town names in the election data are matched to PSGC by name within the province; a handful of renamed or split towns (for example Don Victoriano Chiongbian) are not on the map yet.</p></div>
    <div class="card"><h2>How to read this</h2>
      <p><b>Families</b> groups officials by surname within a province. It does not prove kinship, and common surnames are flagged. <b>Seat changes</b> list successions where the new office holder shares the surname (or middle name) of the outgoing one, and people who won a different office in the next election.</p>
      <p>This site is non-partisan. It shows public records, not allegations. If a record is wrong, tell us at <a href="mailto:purrfecthokkaidocafe@gmail.com">purrfecthokkaidocafe@gmail.com</a>.</p></div>
  </section>
  <section class="card"><h2>Coming next</h2><p class="muted">Barangay officials, SALN summaries of national officials, PhilGEPS contracts by local government, bills and laws by legislator, and community reports.</p></section>`;
}

/* ---------- router ---------- */
const routes = [
  [/^#?\/?$/, home], [/^#\/p\/(\d+)$/, province], [/^#\/m\/(\d+)$/, town], [/^#\/person\/(\d+)$/, person],
  [/^#\/national$/, national], [/^#\/families$/, families], [/^#\/changes$/, changes], [/^#\/spending$/, spending], [/^#\/about$/, about],
];
async function route() {
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
