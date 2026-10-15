/* ============================================================================
   main.js - nav -> WinBox windows.

   Progressive enhancement: the nav links are real <a href="#sec-..."> links,
   so without JavaScript they jump to the real section. With JavaScript we
   intercept and open a terminal window containing a clone of that section.

   Cloning (rather than moving) means closing a window never destroys content,
   and the original sections stay in the DOM for crawlers.
   ========================================================================== */

(function () {
  'use strict';

  var TITLES = {
    about: 'About Me',
    projects: 'Projects',
    books: 'Books',
    certifications: 'Certifications',
    contact: 'Contact Me'
  };

  /* Frame colours. Focused window gets a green edge, unfocused goes grey. */
  var BG_FOCUS = '#2f5c3f';
  var BG_BLUR = '#1a1a1a';

  var open = null; /* single active window */

  /* ------------------------------------------------------------- geometry */

  /* WinBox v0.1.8 applies width/height/left/top as inline pixel values, so
     everything here is a number. The old code passed width:'400px' with
     left:250, which put the window off-screen on any phone. */
  function geometry() {
    var vw = window.innerWidth;
    var vh = window.innerHeight;
    var mobile = vw <= 700;

    var width = mobile
      ? Math.round(vw * 0.92)
      : Math.min(560, Math.round(vw * 0.86));

    var height = mobile
      ? Math.round(vh * 0.70)
      : Math.min(620, Math.round(vh * 0.74));

    var left = Math.max(0, Math.round((vw - width) / 2));
    var top = mobile
      ? Math.max(10, Math.round((vh - height) / 2))
      : Math.max(40, Math.round((vh - height) / 2));

    return { width: width, height: height, left: left, top: top };
  }

  /* ----------------------------------------------------------------- open */

  function closeOpen() {
    if (open && typeof open.close === 'function') {
      try { open.close(); } catch (e) { /* already gone */ }
    }
    open = null;
  }

  function openSection(key) {
    var section = document.getElementById('sec-' + key);
    if (!section) return false;

    closeOpen();

    var g = geometry();

    open = new WinBox(Object.assign({
      title: (TITLES[key] || key) + ' - akash',
      html: section.innerHTML,
      width: g.width,
      height: g.height,
      left: g.left,
      top: g.top,
      padding: 0,
      background: BG_BLUR,
      onfocus: function () { this.setBackground(BG_FOCUS); },
      onblur: function () { this.setBackground(BG_BLUR); }
    }, {}));

    if (open && typeof open.on === 'function') {
      open.on('closed', function () { open = null; });
    }

    return true;
  }

  /* ----------------------------------------------------------------- wire */

  document.addEventListener('DOMContentLoaded', function () {

    var links = document.querySelectorAll('nav a[data-win]');

    Array.prototype.forEach.call(links, function (a) {
      a.addEventListener('click', function (e) {
        // Let modified clicks (new tab, etc.) behave like plain links.
        if (e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
        e.preventDefault();
        var key = a.getAttribute('data-win');
        if (openSection(key)) {
          history.replaceState(null, '', '#sec-' + key);
        }
      });
    });

    /* Escape closes the focused window. Without this, a window could only be
       dismissed with the mouse. */
    document.addEventListener('keydown', function (e) {
      if (e.key === 'Escape' || e.key === 'Esc') closeOpen();
    });

    /* Re-centre an open window when the viewport changes, so rotating a phone
       does not leave the window hanging off-screen. */
    var resizeTimer;
    window.addEventListener('resize', function () {
      if (!open) return;
      clearTimeout(resizeTimer);
      resizeTimer = setTimeout(function () {
        if (!open) return;
        var g = geometry();
        if (typeof open.resize === 'function') {
          open.resize(g.width + 'px', g.height + 'px', 'top');
          open.setPosition(g.left + 'px', g.top + 'px');
        }
      }, 150);
    });

    /* Deep link: /#sec-books opens that window once content has rendered. */
    var hash = (location.hash || '').replace('#sec-', '');
    if (hash && TITLES[hash]) {
      var attempt = function (tries) {
        if (openSection(hash)) return;
        if (tries > 0) setTimeout(function () { attempt(tries - 1); }, 200);
      };
      attempt(6); /* wait for the Notion/fallback content to render first */
    }
  });
})();