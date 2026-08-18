// Worker chiquito: sirve el sitio estático (juegos-site/) y expone una mini
// API de guardado tipo "cajón" (GET/PUT por clave) respaldada por Workers KV,
// para que los juegos puedan sincronizar el estado de una sala entre celulares.
//
// Los juegos ya vienen programados esperando `window.storage.get/set` (así
// funcionaba en el sandbox de artifacts de claude.ai). El polyfill en
// juegos-site/storage.js reimplementa esa misma función hablando con
// /api/kv/:clave, así que la lógica de cada juego no necesita tocarse.

const MAX_VALUE_BYTES = 100 * 1024; // 100KB por sala, de sobra para el estado de un juego
const ROOM_TTL_SECONDS = 6 * 60 * 60; // las salas se autolimpian a las 6hs de inactividad

function withCors(resp) {
  const headers = new Headers(resp.headers);
  headers.set("Access-Control-Allow-Origin", "*");
  headers.set("Access-Control-Allow-Methods", "GET, PUT, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(resp.body, { status: resp.status, headers });
}

export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // Lista las salas abiertas: todas las claves que empiezan con el prefijo
    // dado, con su valor ya resuelto (para que el cliente pueda filtrar por
    // fase "lobby" sin tener que pedir sala por sala). Uso: navegar salas sin
    // necesitar el código de memoria — sigue habiendo códigos para compartir,
    // esto es solo una forma más fácil de encontrar una sala familiar.
    if (url.pathname.startsWith("/api/kv-list/")) {
      if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));
      if (request.method !== "GET") return withCors(new Response("Method not allowed", { status: 405 }));

      const prefix = decodeURIComponent(url.pathname.slice("/api/kv-list/".length));
      if (!prefix) return withCors(new Response("Falta el prefijo", { status: 400 }));

      const listed = await env.ROOMS.list({ prefix, limit: 50 });
      const entries = await Promise.all(
        listed.keys.map(async (k) => {
          const value = await env.ROOMS.get(k.name);
          return value === null ? null : { key: k.name, value };
        })
      );
      return withCors(
        new Response(JSON.stringify(entries.filter(Boolean)), {
          headers: { "content-type": "application/json; charset=utf-8" },
        })
      );
    }

    if (url.pathname.startsWith("/api/kv/")) {
      const key = decodeURIComponent(url.pathname.slice("/api/kv/".length));
      if (!key) return withCors(new Response("Falta la clave", { status: 400 }));

      if (request.method === "OPTIONS") {
        return withCors(new Response(null, { status: 204 }));
      }

      if (request.method === "GET") {
        const value = await env.ROOMS.get(key);
        if (value === null) return withCors(new Response("Not found", { status: 404 }));
        return withCors(new Response(value, { headers: { "content-type": "text/plain; charset=utf-8" } }));
      }

      if (request.method === "PUT") {
        const body = await request.text();
        if (body.length > MAX_VALUE_BYTES) {
          return withCors(new Response("Estado de sala demasiado grande", { status: 413 }));
        }
        await env.ROOMS.put(key, body, { expirationTtl: ROOM_TTL_SECONDS });
        return withCors(new Response("ok"));
      }

      return withCors(new Response("Method not allowed", { status: 405 }));
    }

    // Todo lo demás: servir los archivos estáticos del sitio tal cual.
    return env.ASSETS.fetch(request);
  },
};
