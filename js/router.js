/**
 * Hash router. Routes are declared as patterns with `:param` segments,
 * e.g. '/subject/:id'. The first match wins; '*' is the fallback.
 */
export function createRouter(routes, mount) {
  function parse() {
    const raw = location.hash.replace(/^#/, '') || '/';
    const parts = raw.split('/').filter(Boolean);

    for (const [pattern, handler] of Object.entries(routes)) {
      if (pattern === '*') continue;
      const pp = pattern.split('/').filter(Boolean);
      if (pp.length !== parts.length) continue;
      const params = {};
      let ok = true;
      for (let i = 0; i < pp.length; i++) {
        if (pp[i].startsWith(':')) params[pp[i].slice(1)] = decodeURIComponent(parts[i]);
        else if (pp[i] !== parts[i]) { ok = false; break; }
      }
      if (ok) return { handler, params, path: raw };
    }
    return { handler: routes['*'], params: {}, path: raw };
  }

  async function render() {
    const { handler, params, path } = parse();
    mount.innerHTML = '';
    for (const a of document.querySelectorAll('.topbar nav a')) {
      const href = a.getAttribute('href').replace(/^#/, '');
      const active = href === path || (href !== '/' && path.startsWith(href));
      if (active) a.setAttribute('aria-current', 'page');
      else a.removeAttribute('aria-current');
    }
    scrollTo(0, 0);
    if (handler) await handler(mount, params);
  }

  addEventListener('hashchange', render);
  return { render };
}
