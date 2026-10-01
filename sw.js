// 영종운수 스마트근무표 서비스 워커
// - 앱 셸(HTML/CSS/JS/아이콘)은 설치 시 미리 캐시(precache)하여 오프라인에서도 실행
// - 같은 출처 파일은 network-first (배포 즉시 반영, 실패 시 캐시)
// - CDN(SweetAlert2/iconify/폰트)은 stale-while-revalidate
// - GAS(script.google.com), 버스/날씨/AI 등 API 요청은 절대 캐시하지 않고 그대로 통과
// ※ 셸 파일을 수정하면 CACHE_VERSION을 올려 주세요.
const CACHE_VERSION = 'v56';
const SHELL_CACHE = `yjbus-shell-${CACHE_VERSION}`;
const CDN_CACHE = `yjbus-cdn-${CACHE_VERSION}`;

const SHELL_FILES = [
  './',
  'index.html',
  'offline.html',
  'manifest.json',
  'css/style.css',
  'js/gas-polyfill.js',
  'js/script_std_calc.js',
  'js/script_live_modal.js',
  'js/script_weather_msg.js',
  'js/script_gps_sim.js',
  'js/script_init_nav.js',
  'js/script_driving_habit.js',
  'js/script_emergency.js',
  'js/script_stats_view.js',
  'js/script_schedule_ui.js',
  'js/script_gateway_memo.js',
  'js/script_schedule.js',
  'js/script_board_memo.js',
  'js/script_daily_roster.js',
  'js/script_difficulty.js',
  'js/firebase-config.js',
  'js/app-config.js',
  'js/push_fcm.js',
  'js/script_local_alarm.js',
  'sounds/start_alarm.mp3',
  'icons/icon-192.png',
  'icons/icon-512.png',
  'icons/icon-maskable-512.png',
  'icons/logo-128.png',
  'yeongjong.png'
];

const CDN_HOSTS = ['cdn.jsdelivr.net', 'www.gstatic.com', 'code.iconify.design', 'fonts.googleapis.com', 'fonts.gstatic.com'];

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
    // cache:'no-cache' → 브라우저 HTTP 캐시(GitHub Pages 기본 10분)를 쓰기 전에 서버에 변경 여부를 확인
    const res = await fetch(request, { cache: 'no-cache' });
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

// ================================================================
// 🔔 FCM 백그라운드 푸시 (앱이 닫혀 있어도 수신)
// - Firebase SDK 로딩에 실패해도 오프라인 캐시 기능은 영향받지 않도록 try/catch 처리
// - 발송 서버는 data 메시지({title, body, url, tag})로 보내는 것을 권장 (notification 페이로드는 FCM이 자동 표시)
// ================================================================
try {
  importScripts('js/firebase-config.js');
  importScripts(
    `https://www.gstatic.com/firebasejs/${self.FIREBASE_SDK_VERSION}/firebase-app-compat.js`,
    `https://www.gstatic.com/firebasejs/${self.FIREBASE_SDK_VERSION}/firebase-messaging-compat.js`
  );
  firebase.initializeApp(self.FIREBASE_CONFIG);
  const messaging = firebase.messaging();
  messaging.onBackgroundMessage((payload) => {
    if (payload.notification) return; // notification 페이로드는 SDK가 이미 표시함
    const d = payload.data || {};
    return self.registration.showNotification(d.title || '영종운수', {
      body: d.body || '',
      icon: 'icons/icon-192.png',
      badge: 'icons/icon-192.png',
      tag: d.tag || 'yjbus-push',
      data: { url: d.url || './' }
    });
  });
} catch (err) {
  console.warn('[SW] FCM 초기화 실패:', err);
}

self.addEventListener('notificationclick', (event) => {
  event.notification.close();
  const target = new URL((event.notification.data && event.notification.data.url) || './', self.registration.scope).href;
  event.waitUntil(
    self.clients.matchAll({ type: 'window', includeUncontrolled: true }).then((list) => {
      for (const c of list) {
        if (c.url.startsWith(self.registration.scope) && 'focus' in c) return c.focus();
      }
      return self.clients.openWindow(target);
    })
  );
});
