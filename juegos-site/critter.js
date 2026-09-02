// Easter egg: cada tanto, un bichito pixelado estilo arcade/SNES de los 90
// cruza la pantalla de punta a punta y desaparece — un homenaje discreto,
// sin apuro, nada que interrumpa el juego (pointer-events: none, z-index
// bajo el contenido interactivo, respeta prefers-reduced-motion). Personajes
// 100% originales (no son Sonic/Mario/etc., son un fantasma, un dino y un
// platito volador propios), dibujados en bloques tipo pixel-art con <rect>.
//
// Se incluye igual que storage.js: <script src="./critter.js"></script> (o
// "../critter.js" desde cada juego) al final del <body>. No depende de nada
// más del sitio — solo toca el DOM (agrega su propio <style> y una capa
// fixed) y no usa window.storage ni ningún estado de sala.
(function () {
  if (window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
  // No hace falta en pantallas angostas donde ya hay poco lugar de sobra,
  // pero igual se ve bien en mobile — se deja andar en todos los tamaños.

  var STYLE_ID = "jx-critter-style";
  if (!document.getElementById(STYLE_ID)) {
    var style = document.createElement("style");
    style.id = STYLE_ID;
    style.textContent = [
      ".jx-critter-layer { position: fixed; inset: 0; z-index: 3; pointer-events: none; overflow: hidden; }",
      ".jx-critter-run { position: absolute; bottom: 7vh; pointer-events: auto; cursor: pointer; }",
      ".jx-critter-poof { position: fixed; font-size: 30px; opacity: 1; z-index: 3; animation: jx-critter-poof 0.4s ease-out forwards; pointer-events: none; }",
      "@keyframes jx-critter-poof { from { transform: scale(0.6); opacity: 1; } to { transform: scale(1.8); opacity: 0; } }",
      ".jx-critter-face { display: block; }",
      ".jx-critter-bounce { display: block; }",
      ".jx-critter-bounce svg { display: block; shape-rendering: crispEdges; filter: drop-shadow(0 4px 0 rgba(0,0,0,0.35)); }",
      "@keyframes jx-critter-run-r { from { transform: translateX(-18vw); } to { transform: translateX(118vw); } }",
      "@keyframes jx-critter-run-l { from { transform: translateX(118vw); } to { transform: translateX(-18vw); } }",
      "@keyframes jx-critter-bob { 0%, 100% { transform: translateY(0); } 50% { transform: translateY(-7px); } }",
      "@keyframes jx-critter-hover { 0%, 100% { transform: translateY(0) rotate(-2deg); } 50% { transform: translateY(-10px) rotate(2deg); } }",
      "@keyframes jx-critter-legs { 0%, 100% { transform: rotate(-16deg); } 50% { transform: rotate(16deg); } }",
      "@keyframes jx-critter-blink { 0%, 100% { opacity: 1; } 50% { opacity: 0.25; } }",
      ".jx-legs { transform-box: fill-box; transform-origin: 50% 0%; animation: jx-critter-legs 0.32s ease-in-out infinite; }",
      ".jx-lights rect { animation: jx-critter-blink 1s ease-in-out infinite; }",
      ".jx-lights rect:nth-child(2) { animation-delay: 0.2s; }",
      ".jx-lights rect:nth-child(3) { animation-delay: 0.4s; }",
    ].join("\n");
    document.head.appendChild(style);
  }

  // ---------- Los 3 bichitos, en SVG bloque por bloque (nada de curvas:
  // eso es lo que los hace leer como pixel-art). Cada uno devuelve el
  // markup del <svg> y si tiene "patas" (para la animación de correr) o
  // "luces" (para el parpadeo del platito). ----------
  function ghostSvg() {
    return (
      '<svg viewBox="0 0 40 40" width="56" height="56">' +
      '<rect x="10" y="4" width="20" height="4" fill="#B983FF"/>' +
      '<rect x="6" y="8" width="28" height="20" fill="#B983FF"/>' +
      '<rect x="6" y="28" width="4" height="6" fill="#B983FF"/>' +
      '<rect x="14" y="28" width="4" height="6" fill="#B983FF"/>' +
      '<rect x="22" y="28" width="4" height="6" fill="#B983FF"/>' +
      '<rect x="30" y="28" width="4" height="6" fill="#B983FF"/>' +
      '<rect x="12" y="15" width="6" height="7" fill="#F3EEFF"/>' +
      '<rect x="22" y="15" width="6" height="7" fill="#F3EEFF"/>' +
      '<rect x="14" y="18" width="3" height="4" fill="#1B1035"/>' +
      '<rect x="24" y="18" width="3" height="4" fill="#1B1035"/>' +
      '<rect x="17" y="24" width="6" height="2" fill="#7a4fc9"/>' +
      "</svg>"
    );
  }
  function dinoSvg() {
    return (
      '<svg viewBox="0 0 40 40" width="56" height="56">' +
      '<g class="jx-legs">' +
      '<rect x="10" y="30" width="5" height="6" fill="#2CAE68"/>' +
      '<rect x="22" y="30" width="5" height="6" fill="#2CAE68"/>' +
      "</g>" +
      '<rect x="8" y="16" width="20" height="14" fill="#3DDC84"/>' +
      '<rect x="20" y="8" width="12" height="10" fill="#3DDC84"/>' +
      '<rect x="4" y="20" width="6" height="6" fill="#3DDC84"/>' +
      '<rect x="24" y="4" width="4" height="4" fill="#F0454B"/>' +
      '<rect x="18" y="6" width="4" height="4" fill="#F0454B"/>' +
      '<rect x="27" y="12" width="3" height="3" fill="#1B1035"/>' +
      '<rect x="10" y="20" width="16" height="4" fill="#a9f2c8"/>' +
      "</svg>"
    );
  }
  function ufoSvg() {
    return (
      '<svg viewBox="0 0 40 40" width="60" height="60">' +
      '<rect x="14" y="6" width="12" height="8" fill="#FFC93D" opacity="0.85"/>' +
      '<rect x="17" y="3" width="6" height="4" fill="#fff8d8" opacity="0.9"/>' +
      '<rect x="4" y="16" width="32" height="6" fill="#FF9F1C"/>' +
      '<rect x="0" y="14" width="8" height="4" fill="#FF9F1C"/>' +
      '<rect x="32" y="14" width="8" height="4" fill="#FF9F1C"/>' +
      '<g class="jx-lights">' +
      '<rect x="8" y="22" width="4" height="4" fill="#FFD23F"/>' +
      '<rect x="18" y="22" width="4" height="4" fill="#FFD23F"/>' +
      '<rect x="28" y="22" width="4" height="4" fill="#FFD23F"/>' +
      "</g>" +
      "</svg>"
    );
  }
  var CRITTERS = [
    { svg: ghostSvg, legs: false, bob: "jx-critter-bob", h: "9vh" },
    { svg: dinoSvg, legs: true, bob: "jx-critter-bob", h: "7vh" },
    { svg: ufoSvg, legs: false, bob: "jx-critter-hover", h: "22vh" },
  ];

  function spawnCritter() {
    var layer = document.querySelector(".jx-critter-layer");
    if (!layer) {
      layer = document.createElement("div");
      layer.className = "jx-critter-layer";
      document.body.appendChild(layer);
    }
    var pick = CRITTERS[Math.floor(Math.random() * CRITTERS.length)];
    var goingRight = Math.random() < 0.5;
    var duration = 9 + Math.random() * 6; // 9-15s cruzando la pantalla

    var run = document.createElement("div");
    run.className = "jx-critter-run";
    run.style.bottom = pick.h;
    run.style.animation =
      (goingRight ? "jx-critter-run-r" : "jx-critter-run-l") + " " + duration + "s linear forwards";

    var face = document.createElement("div");
    face.className = "jx-critter-face";
    face.style.transform = goingRight ? "scaleX(-1)" : "scaleX(1)";

    var bounce = document.createElement("div");
    bounce.className = "jx-critter-bounce";
    bounce.style.animation = pick.bob + " " + (pick.legs ? "0.32s" : "1.6s") + " ease-in-out infinite";
    bounce.innerHTML = pick.svg();

    face.appendChild(bounce);
    run.appendChild(face);
    layer.appendChild(run);

    // Se puede tocar: no hace nada por sí solo (critter.js no sabe nada del
    // resto del sitio, a propósito — ver el comentario grande de arriba),
    // pero avisa con un evento genérico en `window` para que quien quiera
    // (por ejemplo Bloques en Cadena, modo Guerra) reaccione como le
    // parezca. Un "poof" a modo de feedback y el bichito desaparece ya.
    run.addEventListener("click", function () {
      var rect = run.getBoundingClientRect();
      var poof = document.createElement("div");
      poof.className = "jx-critter-poof";
      poof.style.left = rect.left + rect.width / 2 - 15 + "px";
      poof.style.top = rect.top + rect.height / 2 - 15 + "px";
      poof.textContent = "✨";
      document.body.appendChild(poof);
      setTimeout(function () {
        poof.remove();
      }, 450);
      run.remove();
      window.dispatchEvent(new CustomEvent("jx-critter-tap"));
    });

    setTimeout(function () {
      run.remove();
    }, duration * 1000 + 200);
  }

  function scheduleNext() {
    // Cada tanto, sin apuro: entre 45s y 2min y medio. No es un elemento
    // central del juego, es un guiño — que sea una sorpresa, no un molesto
    // metrónomo.
    var delay = 45000 + Math.random() * 105000;
    setTimeout(function () {
      spawnCritter();
      scheduleNext();
    }, delay);
  }

  // Primer bichito: un poco de suspenso (no aparece apenas carga la
  // página), después sigue el ciclo normal.
  setTimeout(scheduleNext, 12000 + Math.random() * 18000);
})();
