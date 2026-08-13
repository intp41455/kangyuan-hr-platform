import { handleRequest } from './clientEngine.js';

const originalFetch = window.fetch.bind(window);

export function installFetchInterceptor() {
  window.fetch = async function(input, init = {}) {
    const url = typeof input === 'string' ? input : input.url;
    if (!url || !url.startsWith('/api/')) {
      return originalFetch(input, init);
    }
    const method = (init.method || 'GET').toUpperCase();
    const urlObj = new URL(url, window.location.origin);
    const path = urlObj.pathname;
    const query = Object.fromEntries(urlObj.searchParams);
    let body = null;
    if (init.body) {
      try { body = JSON.parse(init.body); } catch { body = init.body; }
    }
    const result = await handleRequest(method, path, body, query);
    return new Response(JSON.stringify(result), {
      status: result.ok ? 200 : 500,
      headers: { 'Content-Type': 'application/json' }
    });
  };
}
