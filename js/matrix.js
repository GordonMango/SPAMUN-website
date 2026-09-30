// Renders the country matrix straight from the published Google Sheet,
// so edits to the sheet show up on the site without touching this page.
(function () {
  const SHEET_URL = 'https://docs.google.com/spreadsheets/d/e/2PACX-1vR93KDkX0gRcpfFJYxI-dFWT1s1oLJS-ewhi8C1h0kAXNtGXsfbJSJJIlYfpdssG4_f0-PiC14t0zTJ/pub';

  // One entry per sheet tab. The gid is the number after "gid=" in the tab's URL.
  const COMMITTEES = [
    { id: 'sochum', short: 'SOCHUM', name: 'Social, Humanitarian and Cultural Committee', gid: '1404903540', page: 'committees/sochum.html' },
    { id: 'hoc', short: 'HOC', name: 'House of Commons', gid: '144146565', page: 'committees/hoc.html' },
    { id: 'disec', short: 'DISEC', name: 'Disarmament and International Security Committee', gid: '1929785971', page: 'committees/DISEC.html' },
    { id: 'fjcc', short: 'FJCC', name: 'Fictional Joint Crisis Committee', gid: '697871594', page: 'committees/jcc.html' },
    { id: 'unsc', short: 'UNSC', name: 'United Nations Security Council', gid: '1711334723', page: 'committees/unsc.html' }
  ];

  // Internal tracking columns that stay in the sheet and never appear on the site.
  const PRIVATE_COLUMN = /assigned|note|research|email|contact/i;
  const FILTERS = [
    { id: 'all', label: 'All' },
    { id: 'open', label: 'Available' },
    { id: 'taken', label: 'Assigned' }
  ];

  const root = document.getElementById('matrix-app');
  if (!root) return;

  const data = {};
  const state = { active: COMMITTEES[0].id, filter: 'all', query: '' };

  function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
  }

  function parseCSV(text) {
    const rows = [];
    let row = [];
    let cell = '';
    let quoted = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (quoted) {
        if (ch === '"' && text[i + 1] === '"') { cell += '"'; i++; }
        else if (ch === '"') quoted = false;
        else cell += ch;
      } else if (ch === '"') {
        quoted = true;
      } else if (ch === ',') {
        row.push(cell);
        cell = '';
      } else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell);
        rows.push(row);
        row = [];
        cell = '';
      } else {
        cell += ch;
      }
    }
    if (cell || row.length) { row.push(cell); rows.push(row); }
    return rows.map(function (r) { return r.map(function (c) { return c.trim(); }); });
  }

  // A tab holds one or more side-by-side tables (FJCC has two). Each table is a
  // run of adjacent header cells in the row that contains "Availability".
  function readTables(rows) {
    const headerIndex = rows.findIndex(function (r) { return r.some(function (c) { return /^availab/i.test(c); }); });
    if (headerIndex < 0) return [];
    const header = rows[headerIndex];
    const body = rows.slice(headerIndex + 1);
    const spans = [];
    header.forEach(function (cell, i) {
      if (!cell) return;
      const last = spans[spans.length - 1];
      if (last && last.end === i - 1) last.end = i;
      else spans.push({ start: i, end: i });
    });

    return spans.map(function (span) {
      const cols = [];
      for (let i = span.start; i <= span.end; i++) if (!PRIVATE_COLUMN.test(header[i])) cols.push(i);
      const pick = function (pattern) { return cols.find(function (i) { return pattern.test(header[i]); }); };
      const hasData = function (i) { return body.some(function (r) { return r[i]; }); };
      const status = pick(/^availab|^status$/i);
      const rank = pick(/significance|relevance|priority|rank/i);
      const group = pick(/party|bloc|alliance|group/i);
      const detail = pick(/role|portfolio|title/i);
      const used = [status, rank, group, detail];
      const free = cols.filter(function (i) { return !used.includes(i) && hasData(i); });
      const name = free.find(function (i) { return /country|character|representative|delegation|position|name/i.test(header[i]); }) ?? free[0];
      if (status === undefined || name === undefined) return null;

      const at = function (r, i) { return i === undefined ? '' : r[i] || ''; };
      return {
        title: spans.length > 1 && headerIndex > 0 ? rows[headerIndex - 1][span.start] || '' : '',
        rankLabel: rank === undefined ? '' : header[rank],
        items: body.filter(function (r) { return r[name]; }).map(function (r) {
          return {
            name: r[name],
            detail: at(r, detail),
            group: at(r, group),
            rank: parseInt(at(r, rank), 10) || 0,
            status: at(r, status) || 'Available'
          };
        })
      };
    }).filter(function (table) { return table && table.items.length; });
  }

  function isOpen(item) { return /^(available|open)$/i.test(item.status); }

  function normalize(text) {
    return text.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
  }

  function load(committee) {
    const url = SHEET_URL + '?gid=' + committee.gid + '&single=true&output=csv';
    return fetch(url, { cache: 'no-cache' })
      .then(function (response) {
        if (!response.ok) throw new Error('Sheet request failed: ' + response.status);
        return response.text();
      })
      .then(function (text) {
        const tables = readTables(parseCSV(text));
        if (!tables.length) throw new Error('No matrix rows found');
        const items = tables.flatMap(function (t) { return t.items; });
        data[committee.id] = {
          tables: tables,
          total: items.length,
          open: items.filter(isOpen).length,
          maxRank: Math.max(3, ...items.map(function (i) { return i.rank; })),
          rankLabel: (tables.find(function (t) { return t.rankLabel; }) || {}).rankLabel || ''
        };
      })
      .catch(function (error) {
        console.error(error);
        data[committee.id] = { error: true };
      });
  }

  // Static structure: committee tabs, then one panel whose contents swap.
  const tabList = el('div', 'matrix-tabs');
  tabList.setAttribute('role', 'tablist');
  tabList.setAttribute('aria-label', 'Committees');

  const panel = el('div', 'matrix-panel');
  panel.id = 'matrix-panel';
  panel.setAttribute('role', 'tabpanel');

  const head = el('div', 'matrix-panel-head');
  const headText = el('div');
  const title = el('h2', 'matrix-panel-title');
  const summary = el('p', 'matrix-panel-summary');
  headText.append(title, summary);
  const detailsLink = el('a', 'matrix-committee-link');
  head.append(headText, detailsLink);

  const controls = el('div', 'matrix-controls');
  const filterGroup = el('div', 'matrix-filters');
  filterGroup.setAttribute('role', 'group');
  filterGroup.setAttribute('aria-label', 'Filter by availability');
  const filterButtons = FILTERS.map(function (filter) {
    const button = el('button', 'matrix-filter');
    button.type = 'button';
    button.dataset.filter = filter.id;
    button.append(el('span', '', filter.label), el('span', 'matrix-filter-count'));
    button.addEventListener('click', function () {
      state.filter = filter.id;
      renderResults();
    });
    filterGroup.append(button);
    return button;
  });

  const search = el('input', 'matrix-search');
  search.type = 'search';
  search.placeholder = 'Search this committee';
  search.setAttribute('aria-label', 'Search positions in this committee');
  search.addEventListener('input', function () {
    state.query = search.value;
    renderResults();
  });
  controls.append(filterGroup, search);

  const legend = el('p', 'matrix-legend');
  const results = el('div', 'matrix-results');
  const announcer = el('p', 'matrix-sr-only');
  announcer.setAttribute('aria-live', 'polite');

  panel.append(head, controls, legend, results, announcer);

  const tabs = COMMITTEES.map(function (committee) {
    const tab = el('button', 'matrix-tab');
    tab.type = 'button';
    tab.id = 'matrix-tab-' + committee.id;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-controls', panel.id);
    tab.append(el('span', 'matrix-tab-name', committee.short), el('span', 'matrix-tab-count', 'Loading…'));
    tab.addEventListener('click', function () { select(committee.id, false); });
    tabList.append(tab);
    return tab;
  });

  tabList.addEventListener('keydown', function (event) {
    const index = COMMITTEES.findIndex(function (c) { return c.id === state.active; });
    const moves = { ArrowRight: index + 1, ArrowDown: index + 1, ArrowLeft: index - 1, ArrowUp: index - 1, Home: 0, End: COMMITTEES.length - 1 };
    if (!(event.key in moves)) return;
    event.preventDefault();
    const next = (moves[event.key] + COMMITTEES.length) % COMMITTEES.length;
    select(COMMITTEES[next].id, true);
  });

  root.replaceChildren(tabList, panel);

  function rankDots(rank, max, label) {
    const dots = el('span', 'matrix-rank');
    dots.setAttribute('role', 'img');
    dots.setAttribute('aria-label', label + ' ' + rank + ' of ' + max);
    dots.title = label + ': ' + rank + ' of ' + max;
    for (let i = 0; i < max; i++) dots.append(el('span', i < rank ? 'is-on' : ''));
    return dots;
  }

  function card(item, info) {
    const open = isOpen(item);
    const li = el('li', 'matrix-card ' + (open ? 'is-open' : 'is-taken'));
    li.append(el('span', 'matrix-card-name', item.name));
    if (item.detail) li.append(el('span', 'matrix-card-detail', item.detail));
    const meta = el('div', 'matrix-card-meta');
    if (item.rank) meta.append(rankDots(item.rank, info.maxRank, info.rankLabel || 'Significance'));
    meta.append(el('span', 'matrix-badge', item.status));
    li.append(meta);
    return li;
  }

  function renderTabs() {
    COMMITTEES.forEach(function (committee, i) {
      const active = committee.id === state.active;
      const info = data[committee.id];
      tabs[i].setAttribute('aria-selected', String(active));
      tabs[i].tabIndex = active ? 0 : -1;
      tabs[i].querySelector('.matrix-tab-count').textContent =
        !info ? 'Loading…' : info.error ? 'Unavailable' : info.open + ' available';
    });
  }

  function renderPanel() {
    const committee = COMMITTEES.find(function (c) { return c.id === state.active; });
    const info = data[committee.id];
    panel.setAttribute('aria-labelledby', 'matrix-tab-' + committee.id);
    title.textContent = committee.name + ' (' + committee.short + ')';
    detailsLink.href = committee.page;
    detailsLink.textContent = 'Committee details →';

    const ready = info && !info.error;
    controls.hidden = !ready;
    summary.textContent = ready ? info.open + ' of ' + info.total + ' positions available' : '';
    legend.hidden = !(ready && info.rankLabel && info.tables.some(function (t) { return t.items.some(function (i) { return i.rank; }); }));
    if (!legend.hidden) {
      legend.replaceChildren(rankDots(info.maxRank, info.maxRank, info.rankLabel), el('span', '', info.rankLabel + ': more dots mean a more central role in debate'));
    }
    renderResults();
  }

  function renderResults() {
    const info = data[state.active];
    results.replaceChildren();

    if (!info) {
      results.append(el('p', 'matrix-message', 'Loading positions…'));
      return;
    }
    if (info.error) {
      const message = el('p', 'matrix-message', 'We couldn’t load this committee right now. ');
      const link = el('a', '', 'View the matrix in Google Sheets');
      link.href = SHEET_URL + 'html';
      link.target = '_blank';
      link.rel = 'noopener noreferrer';
      message.append(link);
      results.append(message);
      return;
    }

    const counts = { all: info.total, open: info.open, taken: info.total - info.open };
    filterButtons.forEach(function (button) {
      button.setAttribute('aria-pressed', String(button.dataset.filter === state.filter));
      button.querySelector('.matrix-filter-count').textContent = counts[button.dataset.filter];
    });

    const query = normalize(state.query.trim());
    const matches = function (item) {
      if (state.filter === 'open' && !isOpen(item)) return false;
      if (state.filter === 'taken' && isOpen(item)) return false;
      return !query || normalize(item.name + ' ' + item.detail + ' ' + item.group).includes(query);
    };

    let shown = 0;
    const blocks = el('div', 'matrix-blocks');
    info.tables.forEach(function (table) {
      const items = table.items.filter(matches);
      if (!items.length) return;
      shown += items.length;

      const block = el('section', 'matrix-block');
      if (table.title) block.append(el('h3', 'matrix-block-title', table.title));

      // Rows sharing a group (e.g. HOC party) are listed together, in sheet order.
      const groups = new Map();
      items.forEach(function (item) {
        if (!groups.has(item.group)) groups.set(item.group, []);
        groups.get(item.group).push(item);
      });
      groups.forEach(function (groupItems, groupName) {
        if (groupName) block.append(el('h4', 'matrix-group-title', groupName));
        const list = el('ul', 'matrix-grid');
        groupItems.forEach(function (item) { list.append(card(item, info)); });
        block.append(list);
      });
      blocks.append(block);
    });

    results.append(shown ? blocks : el('p', 'matrix-message', 'No positions match your search.'));
    announcer.textContent = shown + (shown === 1 ? ' position' : ' positions') + ' shown';
  }

  function select(id, focus) {
    if (!COMMITTEES.some(function (c) { return c.id === id; })) return;
    state.active = id;
    history.replaceState(null, '', '#' + id);
    renderTabs();
    renderPanel();
    if (focus) document.getElementById('matrix-tab-' + id).focus();
  }

  const fromHash = location.hash.slice(1).toLowerCase();
  if (COMMITTEES.some(function (c) { return c.id === fromHash; })) state.active = fromHash;
  window.addEventListener('hashchange', function () { select(location.hash.slice(1).toLowerCase(), false); });

  renderTabs();
  renderPanel();
  COMMITTEES.forEach(function (committee) {
    load(committee).then(function () {
      renderTabs();
      if (committee.id === state.active) renderPanel();
    });
  });
})();
