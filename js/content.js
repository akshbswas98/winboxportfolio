/* ============================================================================
   content.js - loads portfolio content.

   Production path : GET /api/content  -> Netlify Function -> Notion API
   Fallback path   : GET content/fallback.json  (static, committed to the repo)

   The fallback is what makes the site degrade instead of blanking out if the
   function or Notion is unavailable. Same shape as the live response.

   Exposes:  window.PortfolioContent = { data, load }
   ========================================================================== */

(function () {
  'use strict';

  var ENDPOINT = '/api/content';
  var FALLBACK_FILE = 'content/fallback.json';

  /* ---------------------------------------------------------------- fetch */

  function getJSON(url) {
    return fetch(url, { headers: { Accept: 'application/json' } }).then(function (res) {
      if (!res.ok) throw new Error('HTTP ' + res.status + ' for ' + url);
      return res.json();
    });
  }

  function load() {
    return getJSON(ENDPOINT)
      .catch(function () {
        // Degrade, never blank out.
        return getJSON(FALLBACK_FILE).then(function (d) {
          d.__stale = true;
          return d;
        });
      })
      .then(function (data) {
        window.PortfolioContent.data = data;
        document.body.dataset.content = data.__stale ? 'cached' : 'live';
        return data;
      });
  }

  /* --------------------------------------------------------------- helpers */

  function el(tag, className, text) {
    var node = document.createElement(tag);
    if (className) node.className = className;
    if (text != null) node.textContent = text;
    return node;
  }

  function link(href, text) {
    var a = el('a', null, text);
    a.href = href;
    a.target = '_blank';
    a.rel = 'noopener noreferrer';
    return a;
  }

  function clear(node) {
    while (node.firstChild) node.removeChild(node.firstChild);
  }

  function renderList(mountId, items, build, emptyMsg) {
    var mount = document.getElementById(mountId);
    if (!mount) return;
    clear(mount);

    if (!items || !items.length) {
      mount.appendChild(el('p', 'note', emptyMsg));
      return;
    }
    items.forEach(function (item) { mount.appendChild(build(item)); });
  }

  /* -------------------------------------------------------------- projects */

  function renderProjects(list) {
    renderList('projects-mount', list, function (p) {
      var card = el('div', 'card');

      var title = el('h3', null, p.title);
      if (p.featured) title.appendChild(el('span', 'chip', 'featured'));
      card.appendChild(title);

      if (p.summary) card.appendChild(el('p', 'sub', p.summary));
      if (p.description) card.appendChild(el('p', 'desc', p.description));

      if (p.stack && p.stack.length) {
        var chips = el('div', 'chips');
        p.stack.forEach(function (s) { chips.appendChild(el('span', 'chip', s)); });
        card.appendChild(chips);
      }

      var links = el('div', 'links');
      if (p.repo) links.appendChild(link(p.repo, '-> repo'));
      if (p.live) links.appendChild(link(p.live, '-> live'));
      if (p.caseStudy) links.appendChild(link(p.caseStudy, '-> case study'));
      if (links.childNodes.length) card.appendChild(links);

      return card;
    }, 'No projects listed yet.');
  }

  /* ----------------------------------------------------------------- books */

  function renderBooks(list) {
    renderList('books-mount', list, function (b) {
      var card = el('div', 'card');

      var top = el('div', 'book-top');
      top.appendChild(el('span', 'title', b.title));
      if (b.author) top.appendChild(el('span', 'author', b.author));
      card.appendChild(top);

      var value = Math.max(0, Math.min(100, Number(b.progress) || 0));

      var prog = el('div', 'prog');
      var track = el('div', 'track');
      track.setAttribute('role', 'progressbar');
      track.setAttribute('aria-valuemin', '0');
      track.setAttribute('aria-valuemax', '100');
      track.setAttribute('aria-valuenow', String(value));
      track.setAttribute('aria-label', b.title + ' progress');

      var fill = el('div', 'fill');
      track.appendChild(fill);
      prog.appendChild(track);
      prog.appendChild(el('span', 'pct', value + '%'));
      card.appendChild(prog);

      if (b.note) {
        var l = el('div', 'links');
        l.appendChild(link(b.note, '-> notes'));
        card.appendChild(l);
      }

      // Animate the bar in after paint.
      requestAnimationFrame(function () { fill.style.width = value + '%'; });
      return card;
    }, 'Not reading anything right now.');
  }

  /* ------------------------------------------------------- certifications */

  function renderCerts(list) {
    renderList('certs-mount', list, function (c) {
      var row = el('div', 'card cert');

      row.appendChild(el('div', 'mark', '✓'));

      var body = el('div', 'body');
      body.appendChild(el('div', 'name', c.title));

      var bits = [c.issuer, c.cred, c.expires ? 'expires ' + c.expires : 'no expiry'];
      body.appendChild(el('div', 'meta', bits.filter(Boolean).join('  |  ')));

      if (c.url) {
        var l = el('div', 'links');
        l.appendChild(link(c.url, '-> verify'));
        body.appendChild(l);
      }
      row.appendChild(body);

      var expired = c.expires && new Date(c.expires) < new Date();
      row.appendChild(el('span', 'tag' + (expired ? ' expired' : ''), expired ? 'expired' : 'active'));

      return row;
    }, 'No certifications listed yet.');
  }

  /* ----------------------------------------------------------------- init */

  function render(data) {
    renderProjects(data.projects || []);
    renderBooks(data.books || []);
    renderCerts(data.certifications || []);
  }

  window.PortfolioContent = { data: null, load: load, render: render };

  document.addEventListener('DOMContentLoaded', function () {
    load()
      .then(render)
      .catch(function () {
        render({ projects: [], books: [], certifications: [] });
      });
  });
})();