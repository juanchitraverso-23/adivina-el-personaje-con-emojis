// Polyfill de window.storage.get/set, para que los juegos (programados
// originalmente contra el storage de artifacts de claude.ai) sincronicen
// salas de verdad entre celulares distintos, hablando con la mini API
// /api/kv/:clave del Worker (respaldada por Cloudflare Workers KV).
//
// Firma idéntica a la que ya usan los juegos:
//   await window.storage.get(clave, true)  -> { value: "..." } | null
//   await window.storage.set(clave, valor, true) -> void
(function () {
  async function get(key) {
    const res = await fetch("/api/kv/" + encodeURIComponent(key));
    if (res.status === 404) return null;
    if (!res.ok) throw new Error("storage.get falló: " + res.status);
    const value = await res.text();
    return { value };
  }

  async function set(key, value) {
    const res = await fetch("/api/kv/" + encodeURIComponent(key), {
      method: "PUT",
      headers: { "Content-Type": "text/plain" },
      body: value,
    });
    if (!res.ok) throw new Error("storage.set falló: " + res.status);
  }

  // Lista todas las claves guardadas bajo un prefijo (p. ej. todas las salas
  // de un juego), con su valor ya resuelto. Sirve para mostrar "salas
  // abiertas ahora" sin necesitar el código de memoria.
  async function list(prefix) {
    const res = await fetch("/api/kv-list/" + encodeURIComponent(prefix));
    if (!res.ok) throw new Error("storage.list falló: " + res.status);
    return res.json(); // [{ key, value }]
  }

  window.storage = { get, set, list };
})();
