// 영종운수 스마트근무표 서비스 워커
// - 앱 셸(HTML/CSS/JS/아이콘)은 설치 시 미리 캐시(precache)하여 오프라인에서도 실행
// - 같은 출처 파일은 network-first (배포 즉시 반영, 실패 시 캐시)
// - CDN(SweetAlert2/iconify/폰트)은 stale-while-revalidate
// - GAS(script.google.com), 버스/날씨/AI 등 API 요청은 절대 캐시하지 않고 그대로 통과
// ※ 셸 파일을 수정하면 CACHE_VERSION을 올려 주세요.
const CACHE_VERSION = 'v1';
const SHELL_CACHE = `yjbus-shell-${CACHE_VERSION}`;
const CDN_CACHE = `yjbus-cdn-${CACHE_VERSION}`;

const SHELL_FILES = [
  './',
  'index.html',
  'offline.html',
  'manifest.json',
  'css/style.css',
  'js/gas-polyfill.js',
  'js/script_live_modal.js',
  'js/script_weather_msg.js',
  'js/script_gps_sim.js',
  'js/script_init_nav.js',
  'js/script_stats_view.js',
  'js/script_schedule_ui.js',
  'js/script_gateway_memo.js',
  'js/script_schedule.js',
  'js/script_board_memo.js',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'yeongjong.png'
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'code.iconify.design', 'fonts.googleapis.com', 'fonts.gstatic.com'];

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches.open(SHELL_CACHE).then((cache) => cache.addAll(SHELL_FILES)).then(() => self.skipWaiting())
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches.keys()
      .then((keys) => Promise.all(
        keys.filter((k) => k.startsWith('yjbus-') && k !== SHELL_CACHE && k !== CDN_CACHE).map((k) => caches.delete(k))
      ))
      .then(() => self.clients.claim())
  );
});

async function networkFirst(request, cacheName) {
  const cache = await caches.open(cacheName);
  try {
    const res = await fetch(request);
    if (res && res.ok) cache.put(request, res.clone());
    return res;
  } catch (err) {
    const cached = await cache.match(request, { ignoreSearch: request.mode === 'navigate' });
    if (cached) return cached;
    if (request.mode === 'navigate') {
      return (await cache.match('offline.html')) || Response.error();
    }
    throw err;
  }
}

async function staleWhileRevalidate(request, cacheName) {
  const cache = await caches.open(cacheName);
  const cached = await cache.match(request);
  const fetching = fetch(request)
    .then((res) => { if (res && (res.ok || res.type === 'opaque')) cache.put(request, res.clone()); return res; })
    .catch(() => cached);
  return cached || fetching;
}

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);

  if (url.origin === self.location.origin) {
    event.respondWith(networkFirst(request, SHELL_CACHE));
    return;
  }

  if (CDN_HOSTS.includes(url.hostname)) {
    event.respondWith(staleWhileRevalidate(request, CDN_CACHE));
  }
  // 그 외(GAS, 버스 API 등)는 respondWith 하지 않아 브라우저가 그대로 네트워크 처리
});
