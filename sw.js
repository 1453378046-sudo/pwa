const SW_VERSION = '5.0.1';
const CACHE_NAME = `self-system-${SW_VERSION}`;
const PRECACHE_URLS = [
    './',
    'index.html',
    'manifest.json',
    'styles/main.css?v=4.8',
    'styles/gk.css?v=1.3',
    'styles/pdf-viewer.css?v=1.1',
    'scripts/app.js?v=5.0',
    'scripts/todo-calendar.js?v=1.3',
    'scripts/pdf-viewer.js',
    'vendor/fontawesome/css/all.min.css',
    'vendor/fontawesome/webfonts/fa-solid-900.woff2',
    'vendor/fontawesome/webfonts/fa-regular-400.woff2',
    'vendor/fontawesome/webfonts/fa-brands-400.woff2',
    'vendor/epubjs/epub.min.js',
    'vendor/pdfjs/pdf.min.mjs',
    'vendor/pdfjs/pdf.worker.min.mjs'
];

// 安装事件
self.addEventListener('install', event => {
    event.waitUntil(
        caches.open(CACHE_NAME)
            .then(cache => {
                const requests = PRECACHE_URLS.map((url) => new Request(url, { cache: 'reload' }));
                return cache.addAll(requests);
            })
    );
    self.skipWaiting();
});

// 激活事件
self.addEventListener('activate', event => {
    event.waitUntil(
        (async () => {
            const cacheNames = await caches.keys();
            await Promise.all(
                cacheNames.map(cacheName => {
                    if (cacheName !== CACHE_NAME) return caches.delete(cacheName);
                    return null;
                })
            );
            await self.clients.claim();
        })()
    );
});

self.addEventListener('message', (event) => {
    const type = event?.data?.type;
    if (type === 'SKIP_WAITING') {
        self.skipWaiting();
    }
});

function isHtmlRequest(request) {
    if (!request) return false;
    if (request.mode === 'navigate') return true;
    const accept = request.headers.get('accept') || '';
    return accept.includes('text/html');
}

function isStaticAsset(url) {
    const pathname = url.pathname || '';
    return (
        pathname.endsWith('.js') ||
        pathname.endsWith('.css') ||
        pathname.endsWith('.mjs') ||
        pathname.endsWith('.woff2') ||
        pathname.endsWith('.woff') ||
        pathname.endsWith('.ttf') ||
        pathname.endsWith('.svg') ||
        pathname.endsWith('.png') ||
        pathname.endsWith('.jpg') ||
        pathname.endsWith('.jpeg') ||
        pathname.endsWith('.webp')
    );
}

async function cacheFirst(request) {
    const cached = await caches.match(request, { ignoreSearch: true });
    if (cached) return cached;
    const response = await fetch(request);
    if (shouldCacheResponse(request, response)) {
        const cache = await caches.open(CACHE_NAME);
        cache.put(request, response.clone());
    }
    return response;
}

async function networkFirst(request) {
    try {
        const response = await fetch(request);
        if (shouldCacheResponse(request, response)) {
            const cache = await caches.open(CACHE_NAME);
            cache.put(request, response.clone());
        }
        return response;
    } catch {
        const cached = await caches.match(request, { ignoreSearch: true });
        if (cached) return cached;
        if (isHtmlRequest(request)) {
            const fallback = await caches.match('index.html', { ignoreSearch: true });
            if (fallback) return fallback;
        }
        return new Response('', { status: 504 });
    }
}

function shouldCacheResponse(request, response) {
    if (!response) return false;
    if (response.status !== 200) return false;
    if (!(response.type === 'basic' || response.type === 'cors' || response.type === 'opaque')) return false;
    const url = new URL(request.url);
    if (!isStaticAsset(url) && !isHtmlRequest(request)) return false;
    const contentLength = Number(response.headers.get('content-length') || 0);
    if (Number.isFinite(contentLength) && contentLength > 1_000_000) return false;
    return true;
}

self.addEventListener('fetch', event => {
    const request = event.request;
    const url = new URL(request.url);
    
    // 跳过非GET请求
    if (request.method !== 'GET') {
        return;
    }

    if (request.headers.get('range')) {
        event.respondWith(fetch(request));
        return;
    }

    if (isHtmlRequest(request)) {
        event.respondWith(networkFirst(request));
        return;
    }

    if (url.origin === self.location.origin && isStaticAsset(url)) {
        event.respondWith(cacheFirst(request));
        return;
    }

    event.respondWith(networkFirst(request));
});
