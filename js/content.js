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

  /* Accepts any YouTube URL shape and returns the 11-character video ID. */
  function ytId(u) {
    if (!u) return null;
    var m = String(u).match(
      /(?:youtu\.be\/|youtube\.com\/(?:watch\?v=|embed\/|shorts\/|live\/))([A-Za-z0-9_-]{11})/
    );
    return m ? m[1] : null;
  }

  /* ---------------------------------------------------------------- lightbox */

  var lightbox = null;
  var lightboxOpener = null;

  function closeLightbox() {
    if (!lightbox) return;
    if (lightbox.parentNode) lightbox.parentNode.removeChild(lightbox);
    lightbox = null;
    document.body.classList.remove('has-lightbox');
    if (lightboxOpener && lightboxOpener.focus) lightboxOpener.focus();
    lightboxOpener = null;
  }

  /* Click-to-play thumbnail. Embedding the real player lazily means the page
     never loads YouTube's iframe weight unless the visitor asks for it. */
  function openLightbox(id, title) {
    closeLightbox();
    lightboxOpener = document.activeElement;

    var box = el('div', 'lightbox');
    box.setAttribute('role', 'dialog');
    box.setAttribute('aria-modal', 'true');
    box.setAttribute('aria-label', title || 'Project video');

    var frame = el('div', 'lightbox-frame');
    var iframe = document.createElement('iframe');
    // youtube-nocookie avoids setting tracking cookies until the visitor plays.
    iframe.src = 'https://www.youtube-nocookie.com/embed/' + id + '?autoplay=1&rel=0';
    iframe.title = title || 'YouTube video player';
    iframe.allow =
      'accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share';
    iframe.allowFullscreen = true;
    frame.appendChild(iframe);
    box.appendChild(frame);

    var close = el('button', 'lightbox-close', 'close  [Esc]');
    close.type = 'button';
    close.addEventListener('click', closeLightbox);
    box.appendChild(close);

    // Click the backdrop to dismiss.
    box.addEventListener('mousedown', function (e) {
      if (e.target === box) closeLightbox();
    });

    document.body.appendChild(box);
    document.body.classList.add('has-lightbox');
    lightbox = box;
    close.focus();
  }

  function renderProjects(list) {
    renderList('projects-mount', list, function (p) {
      var card = el('div', 'card');

      /* cover was in the data shape from the start but was never drawn */
      if (p.cover) {
        var shot = el('img', 'cover');
        shot.src = p.cover;
        shot.alt = p.title + ' screenshot';
        shot.loading = 'lazy';
        card.appendChild(shot);
      }

      var title = el('h3', null, p.title);
      if (p.featured) title.appendChild(el('span', 'chip', 'featured'));
      card.appendChild(title);

      if (p.summary) card.appendChild(el('p', 'sub', p.summary));
      if (p.description) card.appendChild(el('p', 'desc', p.description));

      /* Video projects get a click-to-play thumbnail instead of a bare link.
         The handler is delegated from document (see init) and the video id
         travels in a data- attribute, because WinBox renders each window from
         section.innerHTML -- a string. That rebuilds the button as a brand new
         node, so a listener bound directly to the original would never fire. */
      var vid = ytId(p.video);
      if (vid) {
        var wrap = el('div', 'video');
        var thumb = el('button', 'video-thumb');
        thumb.type = 'button';
        thumb.setAttribute('aria-label', 'Play video: ' + p.title);
        thumb.setAttribute('data-yt-id', vid);
        thumb.setAttribute('data-yt-title', p.title);

        var img = document.createElement('img');
        img.src = 'https://i.ytimg.com/vi/' + vid + '/mqdefault.jpg';
        img.alt = '';
        img.loading = 'lazy';
        thumb.appendChild(img);

        var play = el('span', 'video-play');
        play.setAttribute('aria-hidden', 'true');
        thumb.appendChild(play);

        wrap.appendChild(thumb);
        if (p.videoCredit) wrap.appendChild(el('p', 'video-credit', p.videoCredit));
        card.appendChild(wrap);
      }

      if (p.stack && p.stack.length) {
        var chips = el('div', 'chips');
        p.stack.forEach(function (s) { chips.appendChild(el('span', 'chip', s)); });
        card.appendChild(chips);
      }

      var links = el('div', 'links');
      if (p.repo) links.appendChild(link(p.repo, '-> repo'));
      /* If it is not a recognisable YouTube URL, fall back to a plain link
         rather than silently dropping the field. */
      if (p.video && !ytId(p.video)) links.appendChild(link(p.video, '-> video'));
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

  /* ----------------------------------------------------------------- blogs */

  function renderBlogs(list) {
    renderList('blogs-mount', list, function (b) {
      var card = el('div', 'card blog');

      if (b.cover) {
        var shot = el('img', 'cover');
        shot.src = b.cover;
        shot.alt = '';
        shot.loading = 'lazy';
        card.appendChild(shot);
      }

      var head = el('div', 'blog-head');
      head.appendChild(el('h3', null, b.title));

      var meta = [];
      if (b.date) meta.push(b.date);
      if (b.readingTime) meta.push(b.readingTime + ' min read');
      if (meta.length) head.appendChild(el('div', 'meta', meta.join('   |   ')));
      card.appendChild(head);

      if (b.summary) card.appendChild(el('p', 'desc', b.summary));

      if (b.tags && b.tags.length) {
        var chips = el('div', 'chips');
        b.tags.forEach(function (t) { chips.appendChild(el('span', 'chip', '#' + t)); });
        card.appendChild(chips);
      }

      if (b.url) {
        var l = el('div', 'links');
        l.appendChild(link(b.url, '-> read'));
        card.appendChild(l);
      }
      return card;
    }, 'No posts yet.');
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
    renderBlogs(data.blogs || []);
    renderCerts(data.certifications || []);

    /* main.js clones a section's HTML when a window opens, so a window opened
       before this ran would keep the "loading..." placeholder forever.
       Announce the render so an open window can re-sync. */
    document.dispatchEvent(new CustomEvent('portfolio:content'));
  }

  /* main.js owns the Escape key. It needs to know whether the lightbox is
       open, because Escape should dismiss the video and leave the window
       behind it standing. Exposed here rather than given a second
       keydown listener: two listeners on document race, and whichever runs
       first removes the state the other one checks. */
  window.PortfolioContent = {
    data: null,
    load: load,
    render: render,
    isLightboxOpen: function () { return !!lightbox; },
    closeLightbox: closeLightbox
  };

  document.addEventListener('DOMContentLoaded', function () {
    /* Delegated so it works on both the page-flow copy and the WinBox clone. */
    document.addEventListener('click', function (e) {
      var t = e.target;
      if (!t || !t.closest) return;
      var btn = t.closest('.video-thumb');
      if (!btn) return;
      var id = btn.getAttribute('data-yt-id');
      if (!id) return;
      e.preventDefault();
      openLightbox(id, btn.getAttribute('data-yt-title'));
    });

    load()
      .then(render)
      .catch(function () {
        render({ projects: [], books: [], blogs: [], certifications: [] });
      });
  });
})();