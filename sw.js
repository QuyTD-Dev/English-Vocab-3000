/* Service worker: cài web như app và học được khi không có mạng.
 *
 * - Trang (HTML): lấy mạng trước, mất mạng thì dùng bản đã lưu.
 * - File tĩnh có số phiên bản (?v=…), dữ liệu, biểu tượng: dùng bản đã lưu trước, chưa có mới tải.
 *   Khi lưu một phiên bản mới của file, các phiên bản cũ của cùng file được xóa.
 * - Danh sách file cần lưu sẵn được đọc từ index.html, nên không phải sửa file này khi đổi phiên bản.
 */
const CACHE = "vocab3000-v1";
const STATIC = [
  "./",
  "manifest.webmanifest",
  "icons/icon-192.png",
  "icons/icon-512.png",
  "icons/maskable-512.png",
  "icons/apple-touch-icon.png",
  "icons/favicon-32.png",
];

async function put(cache, request, response) {
  if (!response || !response.ok || response.type === "opaque") return;
  if (response.redirected) {
    // trình duyệt không cho dùng lại phản hồi "đã chuyển hướng" cho trang → lưu bản sạch
    response = new Response(await response.blob(), { status: 200, headers: response.headers });
  }
  const url = new URL(request.url || request);
  if (url.search) {
    // xóa các phiên bản cũ của cùng file (khác ?v=)
    for (const key of await cache.keys()) {
      const k = new URL(key.url);
      if (k.pathname === url.pathname && k.search !== url.search) await cache.delete(key);
    }
  }
  await cache.put(request, response);
}

async function precache(urls) {
  const cache = await caches.open(CACHE);
  await Promise.all(
    urls.map(async (u) => {
      try {
        const req = new Request(new URL(u, self.registration.scope), { cache: "no-cache" });
        if (await cache.match(req)) return;
        await put(cache, req, await fetch(req));
      } catch {
        /* bỏ qua file lỗi, lần sau thử lại */
      }
    })
  );
}

/** Đọc index.html để biết các file css/js đang dùng (kèm số phiên bản) */
async function assetsFromIndex() {
  try {
    const res = await fetch(new URL("./", self.registration.scope), { cache: "no-cache" });
    const html = await res.text();
    const cache = await caches.open(CACHE);
    await put(cache, new Request(new URL("./", self.registration.scope)), new Response(html, { headers: res.headers }));
    return [...html.matchAll(/(?:src|href)="([^"]+\?v=[^"]+)"/g)].map((m) => m[1]);
  } catch {
    return [];
  }
}

self.addEventListener("install", (event) => {
  event.waitUntil(
    (async () => {
      await precache([...STATIC.slice(1), ...(await assetsFromIndex())]);
      await self.skipWaiting();
    })()
  );
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    (async () => {
      for (const key of await caches.keys()) if (key.startsWith("vocab3000-") && key !== CACHE) await caches.delete(key);
      await self.clients.claim();
    })()
  );
});

// Trang gửi danh sách file dữ liệu (data/*.json?v=…) để lưu sẵn cho lúc offline
self.addEventListener("message", (event) => {
  if (event.data?.type === "precache" && Array.isArray(event.data.urls)) event.waitUntil(precache(event.data.urls));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (url.origin !== self.location.origin) return;

  if (req.mode === "navigate") {
    event.respondWith(
      (async () => {
        const cache = await caches.open(CACHE);
        try {
          const res = await fetch(req);
          await put(cache, new Request(new URL("./", self.registration.scope)), res.clone());
          return res;
        } catch {
          return (await cache.match(new URL("./", self.registration.scope))) || Response.error();
        }
      })()
    );
    return;
  }

  event.respondWith(
    (async () => {
      const cache = await caches.open(CACHE);
      const hit = await cache.match(req);
      if (hit) return hit;
      const res = await fetch(req);
      await put(cache, req, res.clone());
      return res;
    })()
  );
});
