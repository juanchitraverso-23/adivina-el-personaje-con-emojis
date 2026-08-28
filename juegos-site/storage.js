// Polyfill de window.storage.get/set, para que los juegos (programados
// originalmente contra el storage de artifacts de claude.ai) sincronicen
// salas de verdad entre celulares distintos, hablando con la mini API
// /api/kv/:clave del Worker (respaldada por Cloudflare Workers KV).
//
// Firma idéntica a la que ya usan los juegos:
//   await window.storage.get(clave, true)  -> { value: "..." } | null
//   await window.storage.set(clave, valor, true) -> void
(function () {
  // Arma un Error con .status (y .quotaExceeded si es un 429 de cuota
  // agotada) a partir de una respuesta no-ok, leyendo el texto del cuerpo
  // que ahora manda el Worker (antes se perdía y todos los errores se veían
  // iguales, aunque la causa real fuera un límite diario de Cloudflare KV
  // en vez de un problema de red pasajero).
  async function errorFor(res, label) {
    let bodyText = "";
    try {
      bodyText = await res.text();
    } catch {}
    const err = new Error(label + " falló: " + res.status + (bodyText ? " — " + bodyText : ""));
    err.status = res.status;
    err.quotaExceeded = res.status === 429;
    return err;
  }

  async function get(key) {
    const res = await fetch("/api/kv/" + encodeURIComponent(key));
    if (res.status === 404) return null;
    if (!res.ok) throw await errorFor(res, "storage.get");
    const value = await res.text();
    return { value };
  }

  async function set(key, value) {
    const res = await fetch("/api/kv/" + encodeURIComponent(key), {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: value,
    });
    if (!res.ok) throw await errorFor(res, "storage.set");
  }

  // Lista todas las claves guardadas bajo un prefijo (p. ej. todas las salas
  // de un juego), con su valor ya resuelto. Sirve para mostrar "salas
  // abiertas ahora" sin necesitar el código de memoria.
  async function list(prefix) {
    const res = await fetch("/api/kv-list/" + encodeURIComponent(prefix));
    if (!res.ok) throw await errorFor(res, "storage.list");
    return res.json(); // [{ key, value }]
  }

  // Contador persistente (nunca vence, a diferencia de las claves de sala).
  // incrementCounter suma "by" (1 por default) y devuelve el total nuevo;
  // getCounter solo lee el total actual. Uso: contar entradas de jugadores
  // en la home, entre otros contadores que hagan falta a futuro.
  async function incrementCounter(name, by) {
    const res = await fetch("/api/counter/" + encodeURIComponent(name) + "/increment", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ by: by || 1 }),
    });
    if (!res.ok) throw await errorFor(res, "incrementCounter");
    return parseInt(await res.text(), 10);
  }
  async function getCounter(name) {
    const res = await fetch("/api/counter/" + encodeURIComponent(name));
    if (!res.ok) throw await errorFor(res, "getCounter");
    return parseInt(await res.text(), 10);
  }

  // Mensaje corto y claro para mostrar en la UI cuando falla cualquier
  // operación de storage — distingue "se acabó la cuota gratis de hoy" (un
  // límite de cuenta, no un bug) de cualquier otro error.
  function friendlyErrorMessage(err) {
    if (err && err.quotaExceeded) {
      return "Se alcanzó el límite de uso gratuito de hoy. Probá de nuevo más tarde.";
    }
    return "No se pudo conectar a la sala. Probá de nuevo.";
  }

  window.storage = { get, set, list, incrementCounter, getCounter, friendlyErrorMessage };
})();
