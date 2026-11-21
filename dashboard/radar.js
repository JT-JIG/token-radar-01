// Token Radar's dashboard. It reads window.RADAR (written beside dashboard/ by main.ts) and
// renders the ranked board, the set-aside and live-token views, the model section and a
// per-protocol detail panel. No network: every number it shows is in data.js.
//
// The page recomputes every row's implied value from the snapshot figures with the same
// arithmetic main.ts ran, and the detail view shows the check against the number board.json
// carries, so the page and the board are visibly the same model.
(function () {
  'use strict';

  var DATA = window.RADAR;
  if (!DATA) return;
  var state = { q: '', category: 'all', chain: 'all', watchlistOnly: false, sort: 'implied', dir: -1, tab: 'board', selected: null };

  var usd = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD', maximumFractionDigits: 0 });
  function fmtUsd(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    if (Math.abs(n) >= 1e9) return '$' + (n / 1e9).toFixed(2) + 'B';
    if (Math.abs(n) >= 1e6) return '$' + (n / 1e6).toFixed(1) + 'M';
    if (Math.abs(n) >= 1e3) return '$' + Math.round(n / 1e3) + 'K';
    return usd.format(n);
  }
  function fmtPct(n) {
    if (n === null || n === undefined || !isFinite(n)) return 'n/a';
    return (n > 0 ? '+' : '') + n.toFixed(2) + '%';
  }
  function fmtAge(days) {
    if (days === null || days === undefined) return 'unknown';
    if (days >= 365) return (days / 365).toFixed(1) + 'y';
    return Math.max(0, Math.round(days)) + 'd';
  }
  function fmtMult(n) {
    return n.toFixed(3) + 'x';
  }
  function $(id) { return document.getElementById(id); }

  // The model in one function: the same arithmetic main.ts ran, from the same figures.
  function impliedOf(row) {
    var m = DATA.model;
    var growth = Math.min(m.growth_cap, Math.max(m.growth_floor, row.change_7d === null || row.change_7d === undefined ? 0 : row.change_7d));
    var growthMult = 1 + (growth / 100) * m.growth_weight;
    var age = row.age_days === null || row.age_days === undefined ? m.unknown_age_days : row.age_days;
    var maturity = m.maturity_floor + Math.sqrt(Math.min(Math.max(age, 0), m.maturity_days) / m.maturity_days) * m.maturity_range;
    return Math.max(1, Math.round(row.tvl_usd * row.multiple * growthMult * maturity));
  }

  function el(tag, attrs) {
    var node = document.createElement(tag);
    if (attrs) {
      Object.keys(attrs).forEach(function (k) {
        if (k === 'class') node.className = attrs[k];
        else if (k === 'text') node.textContent = attrs[k];
        else if (k.slice(0, 2) === 'on') node.addEventListener(k.slice(2), attrs[k]);
        else if (attrs[k] !== null && attrs[k] !== undefined) node.setAttribute(k, attrs[k]);
      });
    }
    for (var i = 2; i < arguments.length; i++) {
      var child = arguments[i];
      if (child === null || child === undefined) continue;
      if (Array.isArray(child)) child.forEach(function (c) { if (c) node.appendChild(c); });
      else if (typeof child === 'string') node.appendChild(document.createTextNode(child));
      else node.appendChild(child);
    }
    return node;
  }

  function readHash() {
    state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false;
    state.sort = 'implied'; state.tab = 'board'; state.selected = null;
    var params = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (params.get('q')) state.q = params.get('q');
    if (params.get('category')) state.category = params.get('category');
    if (params.get('chain')) state.chain = params.get('chain');
    if (params.get('wl') === '1') state.watchlistOnly = true;
    if (params.get('sort')) state.sort = params.get('sort');
    if (params.get('tab')) state.tab = params.get('tab');
    if (params.get('p')) state.selected = params.get('p');
  }
  function writeHash() {
    var params = new URLSearchParams();
    if (state.q) params.set('q', state.q);
    if (state.category !== 'all') params.set('category', state.category);
    if (state.chain !== 'all') params.set('chain', state.chain);
    if (state.watchlistOnly) params.set('wl', '1');
    if (state.sort !== 'implied') params.set('sort', state.sort);
    if (state.tab !== 'board') params.set('tab', state.tab);
    if (state.selected) params.set('p', state.selected);
    var next = params.toString();
    window.history.replaceState(null, '', next ? '#' + next : window.location.pathname + window.location.search);
  }

  function filteredRows() {
    var q = state.q.trim().toLowerCase();
    return DATA.rows.filter(function (r) {
      if (state.watchlistOnly && !r.on_watchlist) return false;
      if (state.category !== 'all' && (r.category || 'Other') !== state.category) return false;
      if (state.chain !== 'all' && (r.chains || []).indexOf(state.chain) < 0) return false;
      if (!q) return true;
      var hay = [r.name, r.slug, r.category, (r.chains || []).join(' ')].join(' ').toLowerCase();
      return hay.indexOf(q) >= 0;
    });
  }
  function sortedRows(list) {
    var key = state.sort;
    return list.slice().sort(function (a, b) {
      var av, bv;
      if (key === 'name') { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
      else if (key === 'tvl') { av = a.tvl_usd; bv = b.tvl_usd; }
      else if (key === 'growth') { av = a.change_7d === null ? -Infinity : a.change_7d; bv = b.change_7d === null ? -Infinity : b.change_7d; }
      else if (key === 'age') { av = a.age_days === null ? Infinity : a.age_days; bv = b.age_days === null ? Infinity : b.age_days; }
      else { av = a.implied_value_usd; bv = b.implied_value_usd; }
      if (av < bv) return -state.dir;
      if (av > bv) return state.dir;
      return a.slug < b.slug ? -1 : a.slug > b.slug ? 1 : 0;
    });
  }

  function renderStats() {
    $('meta-snapshot').textContent = 'Snapshot ' + DATA.as_of;
    $('meta-model').textContent = DATA.model_version + ' model';
    $('stat-watchlist').textContent = DATA.watchlist_size + ' / ' + DATA.watchlist_size;
    $('stat-rows').textContent = String(DATA.board_size);
    $('stat-early').textContent = DATA.early_size + ' below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor';
    $('stat-total').textContent = fmtUsd(DATA.total_implied_usd);
    $('stat-aside').textContent = String(DATA.set_aside_size);
  }

  function fillSelects() {
    var cats = Array.from(new Set(DATA.rows.map(function (r) { return r.category || 'Other'; }))).sort();
    var catSel = $('category');
    cats.forEach(function (c) { catSel.appendChild(el('option', { value: c, text: c })); });
    catSel.value = state.category;
    var chains = Array.from(new Set(DATA.rows.reduce(function (acc, r) { return acc.concat(r.chains || []); }, []))).sort();
    var chainSel = $('chain');
    chains.forEach(function (c) { chainSel.appendChild(el('option', { value: c, text: c })); });
    chainSel.value = state.chain;
    $('q').value = state.q;
    $('sort').value = state.sort;
    $('watchlist-only').checked = state.watchlistOnly;
  }

  function renderBoard() {
    var list = sortedRows(filteredRows());
    $('count').textContent = list.length + ' of ' + DATA.board_size + ' rows shown';
    var tbody = $('board-body');
    tbody.textContent = '';
    $('board-empty').classList.toggle('hidden', list.length !== 0);
    var max = DATA.rows.length ? DATA.rows[0].implied_value_usd || 1 : 1;
    list.forEach(function (r) {
      var growthClass = r.change_7d === null ? '' : r.change_7d >= 0 ? 'pos' : 'neg';
      var tr = el('tr', {
        class: state.selected === r.slug ? 'selected' : '',
        tabindex: '0',
        onclick: function () { openDetail(r.slug); },
        onkeydown: function (e) { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); openDetail(r.slug); } }
      },
        el('td', { class: 'num', text: String(r.rank) }),
        el('td', null, el('div', { class: 'name' },
          el('b', { text: r.name }),
          el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') })
        )),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + growthClass, text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtAge(r.age_days) }),
        el('td', null, el('div', { class: 'implied' },
          el('div', { class: 'bar', 'aria-hidden': 'true' }, el('i', { style: 'width:' + Math.max(3, Math.round((r.implied_value_usd / max) * 100)) + '%' })),
          el('span', { class: 'num', text: fmtUsd(r.implied_value_usd) })
        )),
        el('td', null, el('span', { class: 'badge ' + (r.on_watchlist ? 'watch' : 'early'), text: r.on_watchlist ? 'WATCHLIST' : 'EARLY' }))
      );
      tbody.appendChild(tr);
    });
    // Sort arrows on the headers. Rank and implied value are one sort, so the arrow
    // shows on the implied-value header only.
    var headers = document.querySelectorAll('#board-table thead th');
    var keys = ['implied', 'name', 'tvl', 'growth', 'age', 'implied', null];
    var labels = ['Rank', 'Protocol', 'TVL', '7d', 'Age', 'Implied value', 'Board'];
    headers.forEach(function (th, i) {
      var label = labels[i];
      if (keys[i] && state.sort === keys[i] && i !== 0) label += state.dir < 0 ? ' ▼' : ' ▲';
      th.textContent = label;
      th.style.cursor = keys[i] ? 'pointer' : '';
    });
  }

  function renderAside() {
    var tbody = $('aside-body');
    tbody.textContent = '';
    DATA.set_aside.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: r.category || 'Other' }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { text: r.reason })
      ));
    });
  }

  function renderLive() {
    var tbody = $('live-body');
    tbody.textContent = '';
    DATA.live.forEach(function (r) {
      tbody.appendChild(el('tr', null,
        el('td', null, el('div', { class: 'name' }, el('b', { text: r.name }), el('span', { class: 'sub', text: (r.category || 'Other') + ' on ' + (r.chains && r.chains.length ? r.chains.slice(0, 2).join(', ') : 'an unnamed chain') }))),
        el('td', { class: 'num', text: fmtUsd(r.tvl_usd) }),
        el('td', { class: 'num ' + (r.change_7d !== null && r.change_7d >= 0 ? 'pos' : 'neg'), text: fmtPct(r.change_7d) }),
        el('td', { class: 'num', text: fmtUsd(r.mcap_usd) }),
        el('td', { class: 'num', text: r.mcap_tvl_ratio === null ? 'n/a' : fmtMult(r.mcap_tvl_ratio) })
      ));
    });
  }

  function renderModel() {
    var tbody = $('calibration-body');
    tbody.textContent = '';
    var entries = Object.keys(DATA.calibration.by_category).map(function (cat) {
      return { category: cat, multiple: DATA.calibration.by_category[cat].multiple, live_count: DATA.calibration.by_category[cat].live_count };
    }).sort(function (a, b) { return b.multiple - a.multiple; });
    entries.forEach(function (e) {
      tbody.appendChild(el('tr', null,
        el('td', { text: e.category }),
        el('td', { class: 'num', text: fmtMult(e.multiple) }),
        el('td', { class: 'num', text: String(e.live_count) })
      ));
    });
    tbody.appendChild(el('tr', null,
      el('td', { text: 'Market-wide median (fallback for categories with fewer than ' + DATA.model.min_live_per_category + ' live protocols)' }),
      el('td', { class: 'num', text: fmtMult(DATA.calibration.global_multiple) }),
      el('td', { class: 'num', text: String(DATA.calibration.global_live_count) })
    ));
    $('coverage-text').textContent =
      'The board covers all ' + DATA.watchlist_size + ' watchlist protocols and adds ' + DATA.early_size +
      ' pre-token protocols below the $' + Math.round(DATA.floor_usd / 1e6) + 'M floor — ' + DATA.board_size +
      ' rows in all. ' + DATA.set_aside_size + ' pre-token protocols are set aside (see the Set aside tab), and ' +
      DATA.live_size + ' live-token protocols are shown with their market caps.';
  }

  function openDetail(slug) {
    var row = null;
    for (var i = 0; i < DATA.rows.length; i++) { if (DATA.rows[i].slug === slug) { row = DATA.rows[i]; break; } }
    if (!row) return;
    state.selected = slug;
    writeHash();
    renderBoard();
    var panel = $('detail');
    panel.textContent = '';
    panel.classList.remove('hidden');
    var recomputed = impliedOf(row);
    var matches = recomputed === row.implied_value_usd;
    var multNote = row.multiple_source === 'category'
      ? (row.category || 'Other') + ' median, ' + row.live_count + ' live protocols'
      : 'market-wide median, ' + row.live_count + ' live protocols';
    var chainList = (row.chains && row.chains.length)
      ? row.chains.slice(0, 4).join(', ') + (row.chains.length > 4 ? ' + ' + (row.chains.length - 4) + ' more' : '')
      : 'an unnamed chain';
    var notes = [];
    if (row.change_7d === null) notes.push('Seven-day growth is unreported for this protocol, so the model counts it as 0%.');
    if (row.age_days === null) notes.push('No listing date is recorded, so the model uses ' + DATA.model.unknown_age_days + ' days of age.');
    if (row.on_watchlist) notes.push('On the snapshot\'s watchlist: at least $' + Math.round(DATA.floor_usd / 1e6) + 'M of TVL and no token on record.');
    panel.appendChild(el('div', { class: 'detail-head' },
      el('div', null,
        el('span', { class: 'rankline', text: 'Rank ' + row.rank + ' of ' + DATA.board_size }),
        el('h2', { text: row.name }),
        el('p', { class: 'sub', text: (row.category || 'Other') + ' on ' + chainList })
      ),
      el('button', { class: 'close', type: 'button', 'aria-label': 'Close details', text: 'Close', onclick: closeDetail })
    ));
    panel.appendChild(el('div', { class: 'big-label' }, 'Implied value'));
    panel.appendChild(el('div', { class: 'big num' }, fmtUsd(row.implied_value_usd)));
    var breakdown = el('table', { class: 'breakdown' });
    var bbody = el('tbody');
    [
      ['TVL', fmtUsd(row.tvl_usd)],
      ['Multiple', fmtMult(row.multiple) + ' (' + multNote + ')'],
      ['7-day growth', fmtPct(row.change_7d)],
      ['Growth mult.', String(row.growth_multiplier)],
      ['Age, no token', fmtAge(row.age_days)],
      ['Maturity mult.', String(row.maturity_multiplier)]
    ].forEach(function (pair) {
      bbody.appendChild(el('tr', null, el('th', { scope: 'row', text: pair[0] }), el('td', { class: 'num', text: pair[1] })));
    });
    breakdown.appendChild(bbody);
    panel.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Model breakdown' }),
      breakdown,
      el('p', { class: 'check-line' },
        'This page recomputes the row as ' + fmtUsd(recomputed) + ' — ',
        matches ? el('span', { class: 'ok', text: 'matches board.json ✓' }) : el('span', { class: 'bad', text: 'differs from board.json' }),
        '.'
      )
    ));
    panel.appendChild(el('section', { class: 'detail-section' },
      el('h3', { text: 'Farm plan' }),
      el('ol', { class: 'steps' }, row.farm_steps.map(function (s) {
        var at = s.indexOf(' Cost: ');
        var action = at >= 0 ? s.slice(0, at) : s;
        var tail = at >= 0 ? s.slice(at + 1) : '';
        return el('li', null, el('b', { text: action }), el('span', { class: 'cost', text: tail }));
      }))
    ));
    if (notes.length) {
      panel.appendChild(el('p', { class: 'note' }, notes.join(' ')));
    }
    panel.scrollTop = 0;
  }

  function closeDetail() {
    state.selected = null;
    $('detail').classList.add('hidden');
    writeHash();
    renderBoard();
  }

  function switchTab(tab) {
    state.tab = tab;
    document.querySelectorAll('.tab').forEach(function (b) { b.classList.toggle('active', b.getAttribute('data-tab') === tab); });
    ['board', 'aside', 'live', 'model'].forEach(function (t) { $('view-' + t).classList.toggle('hidden', t !== tab); });
    writeHash();
  }

  function bind() {
    $('q').addEventListener('input', function () { state.q = $('q').value; writeHash(); renderBoard(); });
    $('category').addEventListener('change', function () { state.category = $('category').value; writeHash(); renderBoard(); });
    $('chain').addEventListener('change', function () { state.chain = $('chain').value; writeHash(); renderBoard(); });
    $('sort').addEventListener('change', function () { state.sort = $('sort').value; state.dir = state.sort === 'name' ? 1 : -1; writeHash(); renderBoard(); });
    $('watchlist-only').addEventListener('change', function () { state.watchlistOnly = $('watchlist-only').checked; writeHash(); renderBoard(); });
    $('clear-filters').addEventListener('click', function () {
      state.q = ''; state.category = 'all'; state.chain = 'all'; state.watchlistOnly = false;
      $('q').value = ''; $('category').value = 'all'; $('chain').value = 'all'; $('watchlist-only').checked = false;
      writeHash(); renderBoard();
    });
    document.querySelectorAll('.tab').forEach(function (b) {
      b.addEventListener('click', function () { switchTab(b.getAttribute('data-tab')); });
    });
    document.querySelectorAll('#board-table thead th').forEach(function (th, i) {
      var keys = ['implied', 'name', 'tvl', 'growth', 'age', 'implied', null];
      var key = keys[i];
      if (!key) return;
      th.addEventListener('click', function () {
        if (state.sort === key) state.dir = -state.dir;
        else { state.sort = key; state.dir = key === 'name' ? 1 : -1; }
        $('sort').value = state.sort;
        writeHash(); renderBoard();
      });
    });
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' && state.selected) closeDetail();
    });
    // Deep links work without a reload: a hash change re-reads the filters and the
    // selected protocol (writeHash uses replaceState, so it never fires this itself).
    window.addEventListener('hashchange', function () {
      var prev = state.selected;
      readHash();
      $('q').value = state.q;
      $('category').value = state.category;
      $('chain').value = state.chain;
      $('watchlist-only').checked = state.watchlistOnly;
      $('sort').value = state.sort;
      switchTab(state.tab);
      renderBoard();
      if (state.selected && state.selected !== prev) openDetail(state.selected);
      else if (!state.selected && prev) closeDetail();
    });
  }

  readHash();
  renderStats();
  fillSelects();
  renderBoard();
  renderAside();
  renderLive();
  renderModel();
  switchTab(state.tab);
  bind();
  if (state.selected) openDetail(state.selected);
})();
