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
  headers.set("Access-Control-Allow-Methods", "GET, PUT, POST, OPTIONS");
  headers.set("Access-Control-Allow-Headers", "Content-Type");
  return new Response(resp.body, { status: resp.status, headers });
}

export default {
  async fetch(request, env) {
    try {
      return await handle(request, env);
    } catch (err) {
      // La causa casi segura de cualquier excepción acá adentro es que se
      // agotó alguna cuota diaria gratuita de Workers KV (get/put/list son
      // las únicas operaciones que hace este Worker, y ninguna otra parte
      // del código tira excepciones sin capturarlas ya). Antes esto volvía
      // un 500 crudo, y el cliente lo mostraba como "no se pudo conectar,
      // probá de nuevo" — un mensaje que suena a error de red pasajero
      // cuando en realidad es un límite de cuenta que recién se resetea a
      // la medianoche UTC. Devolver 429 con un mensaje claro le permite a
      // storage.js (y a la UI de cada juego) mostrar algo más preciso.
      return withCors(
        new Response("Se alcanzó el límite de uso gratuito de hoy. Probá de nuevo más tarde.", { status: 429 })
      );
    }
  },
};

async function handle(request, env) {
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

  // Contador persistente (sin vencimiento, a diferencia de las salas que se
  // autolimpian a las 6hs): lo usa la home para mostrar cuánta gente jugó
  // en total. Cada "entrada" a un juego suma, aunque sea el mismo celu
  // entrando de nuevo o a otro juego — así lo pidió el dueño del sitio.
  if (url.pathname.startsWith("/api/counter/")) {
    if (request.method === "OPTIONS") return withCors(new Response(null, { status: 204 }));

    const rest = url.pathname.slice("/api/counter/".length); // "<nombre>" o "<nombre>/increment"
    const parts = rest.split("/");
    const name = decodeURIComponent(parts[0] || "");
    const isIncrement = parts[1] === "increment";
    if (!name) return withCors(new Response("Falta el nombre del contador", { status: 400 }));
    const key = "counter:" + name;

    if (isIncrement && request.method === "POST") {
      let by = 1;
      let setTo = null;
      try {
        const body = await request.json();
        if (body && Number.isFinite(body.by) && body.by > 0 && body.by <= 100) by = Math.floor(body.by);
        if (body && Number.isFinite(body.set) && body.set >= 0) setTo = Math.floor(body.set);
      } catch {}
      const next = setTo !== null ? setTo : (parseInt((await env.ROOMS.get(key)) || "0", 10) || 0) + by;
      await env.ROOMS.put(key, String(next)); // sin expirationTtl: este queda para siempre
      return withCors(new Response(String(next), { headers: { "content-type": "text/plain" } }));
    }

    if (!isIncrement && request.method === "GET") {
      const current = parseInt((await env.ROOMS.get(key)) || "0", 10) || 0;
      return withCors(new Response(String(current), { headers: { "content-type": "text/plain" } }));
    }

    return withCors(new Response("Method not allowed", { status: 405 }));
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
}
