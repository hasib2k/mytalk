const CACHE_NAME = 'mytalk-v2';

// Install — take over immediately.
self.addEventListener('install', () => {
  self.skipWaiting();
});

// Activate — drop old caches and claim open clients so the new SW is in charge.
self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) => Promise.all(keys.filter((k) => k !== CACHE_NAME).map((k) => caches.delete(k))))
      .then(() => self.clients.claim()),
  );
});

// Fetch — stay out of the way of page loads. Navigations (HTML documents) and
// API calls go straight to the network so a slow/blocked resource can NEVER
// hang a page load. Only same-origin static assets are cached (network-first).
self.addEventListener('fetch', (event) => {
  const req = event.request;
  if (req.method !== 'GET') return;
  if (req.mode === 'navigate') return; // never intercept HTML navigations
  if (req.url.includes('/api/')) return;

  let url;
  try {
    url = new URL(req.url);
  } catch {
    return;
  }
  if (url.origin !== self.location.origin) return; // only our own assets

  event.respondWith(
    fetch(req)
      .then((response) => {
        if (response.ok) {
          const clone = response.clone();
          caches.open(CACHE_NAME).then((cache) => cache.put(req, clone));
        }
        return response;
      })
      .catch(() => caches.match(req)),
  );
});
