// Resolve shared assets relative to this script, including on committee pages.
(function () {
  const siteRoot = new URL('../', document.currentScript.src);

  async function loadNavbar() {
    const container = document.getElementById('navbar-container');
    if (!container) return;

    const bannerCSS = document.createElement('link');
    bannerCSS.rel = 'stylesheet';
    bannerCSS.href = new URL('css/banner.css', siteRoot).href;
    document.head.appendChild(bannerCSS);

    try {
      const response = await fetch(new URL('navbar.html', siteRoot));
      if (!response.ok) throw new Error(`Failed to load navbar: ${response.status}`);
      container.innerHTML = await response.text();
      container.querySelectorAll('[href], [src]').forEach(function (element) {
        ['href', 'src'].forEach(function (attribute) {
          const value = element.getAttribute(attribute);
          if (value) element.setAttribute(attribute, new URL(value, siteRoot).href);
        });
      });

      const navbar = container.querySelector('.site-navbar');
      const menu = navbar.querySelector('.nav-menu-wrap');
      const toggle = navbar.querySelector('.site-menu-toggle');
      const mobile = window.matchMedia('(max-width: 991px)');

      function updateMenuHeight() {
        // Keep every link reachable on short landscape screens.
        const availableHeight = Math.max(44, window.innerHeight - navbar.getBoundingClientRect().bottom - 8);
        menu.style.setProperty('--menu-max-height', `${availableHeight}px`);
      }
      function setOpen(open) {
        navbar.classList.toggle('menu-open', open);
        toggle.setAttribute('aria-expanded', String(open));
        toggle.setAttribute('aria-label', open ? 'Close navigation menu' : 'Open navigation menu');
        if (open) updateMenuHeight();
      }
      toggle.addEventListener('click', function () {
        setOpen(toggle.getAttribute('aria-expanded') !== 'true');
      });
      menu.addEventListener('click', function (event) {
        if (event.target.closest('a')) setOpen(false);
      });
      document.addEventListener('keydown', function (event) {
        if (event.key === 'Escape' && toggle.getAttribute('aria-expanded') === 'true') {
          setOpen(false);
          toggle.focus();
        }
      });
      document.addEventListener('click', function (event) {
        if (!navbar.contains(event.target)) setOpen(false);
      });
      window.addEventListener('resize', updateMenuHeight);
      window.addEventListener('scroll', updateMenuHeight, { passive: true });
      mobile.addEventListener('change', function () { setOpen(false); });

      const currentPath = window.location.pathname.replace(/\/$/, '/index.html');
      menu.querySelectorAll('a').forEach(function (link) {
        if (new URL(link.href).pathname === currentPath) link.setAttribute('aria-current', 'page');
      });
    } catch (error) {
      console.error('Error loading navbar:', error);
      const fallback = document.createElement('nav');
      fallback.className = 'navbar-fallback';
      fallback.setAttribute('aria-label', 'Main navigation');
      [['index.html', 'Home'], ['committees.html', 'Committees'], ['matrix.html', 'Matrix'], ['registration.html', 'Registration']].forEach(function ([path, label]) {
        const link = document.createElement('a');
        link.href = new URL(path, siteRoot).href;
        link.textContent = label;
        fallback.appendChild(link);
      });
      container.replaceChildren(fallback);
    }
  }
  if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', loadNavbar);
  } else {
    loadNavbar();
  }
})();
