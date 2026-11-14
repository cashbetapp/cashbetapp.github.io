// Perfil: editar nombre y foto (pedido del usuario 2026-11-13). La foto se reduce a 256 px (JPEG) en el
// celular y se guarda en store "foto"; con cuenta se sincroniza como el nombre (SYNC en cuenta.js).
I.cam = '<path d="M4 8h3l2-3h6l2 3h3v11H4z"/><circle cx="12" cy="13" r="3.5"/>';
const fotoPerfil = () => store.get("foto", "");
const nombrePerfil = () => store.get("nombre", "") || (typeof USER !== "undefined" && USER && USER.displayName) || "";

function avatarHtml(cls = "av") {
  const f = fotoPerfil(), n = nombrePerfil() || (typeof USER !== "undefined" && USER && USER.email) || "C";
  return f ? `<span class="${cls} conf"><img src="${esc(f)}" alt=""></span>` : `<span class="${cls}">${esc(n[0].toUpperCase())}</span>`;
}

function perfilEditar() {
  const f = fotoPerfil();
  return subTop("Editar perfil") + `<div class="pkcard pfed">
    <div class="pfav">${avatarHtml("av pfbig")}</div>
    <div class="pfbtns">
      <label class="bigbtn pfcam">${ic("cam")}<span>${f ? "Cambiar foto" : "Poner foto"}</span><input type="file" accept="image/*" id="pfoto" hidden></label>
      ${f ? `<button class="pill" data-act="pfquitar">Quitar foto</button>` : ""}
    </div>
    <div class="fl" style="margin-top:16px">TU NOMBRE</div>
    <input class="inp" id="pfnom" maxlength="24" placeholder="Cómo quieres que te llamemos" value="${esc(nombrePerfil())}">
    <button class="bigbtn" data-act="pfok" style="margin-top:10px">Guardar</button>
    <div class="ajnote" style="margin-top:12px">Tu foto y tu nombre se guardan ${typeof USER !== "undefined" && USER ? "en tu cuenta (los ves en cualquier celular)" : "en este celular"}. Nadie más los ve.</div>
  </div>`;
}

// reduce la imagen a un cuadrado de 256 px centrado (pesa ~20 KB)
function fotoReducida(file) {
  return new Promise((ok, no) => {
    const url = URL.createObjectURL(file), im = new Image();
    im.onload = () => {
      const S = 256, c = document.createElement("canvas"); c.width = c.height = S;
      const lado = Math.min(im.naturalWidth, im.naturalHeight);
      const x = (im.naturalWidth - lado) / 2, y = (im.naturalHeight - lado) / 2;
      const g = c.getContext("2d"); g.imageSmoothingQuality = "high";
      g.drawImage(im, x, y, lado, lado, 0, 0, S, S);
      URL.revokeObjectURL(url); ok(c.toDataURL("image/jpeg", 0.82));
    };
    im.onerror = () => { URL.revokeObjectURL(url); no(new Error("imagen")); };
    im.src = url;
  });
}
document.addEventListener("change", async (e) => {
  if (e.target.id !== "pfoto" || !e.target.files || !e.target.files[0]) return;
  try { store.set("foto", await fotoReducida(e.target.files[0])); toast("Foto actualizada"); rerender(); }
  catch (err) { toast("No se pudo leer esa imagen"); }
});

function actFoto(a) {
  if (a === "pfquitar") { store.set("foto", ""); toast("Foto quitada"); rerender(); return true; }
  if (a === "pfok") {
    const n = ($("#pfnom") && $("#pfnom").value || "").trim().slice(0, 24);
    store.set("nombre", n);
    try { if (typeof USER !== "undefined" && USER && n) USER.updateProfile({ displayName: n }); } catch (e) {}
    toast("Perfil guardado"); location.hash = "ajustes"; return true;
  }
  return false;
}

// enganches: página "ajustes/perfil", fila "Editar perfil", tarjeta con la foto y foto en la barra superior
(function () {
  const base = ajustes;
  ajustes = function (arg) {
    if (arg === "perfil" || arg === "nombre") return perfilEditar();
    let h = base(arg);
    if (arg) return h;
    // la tarjeta del perfil muestra la foto y abre "Editar perfil"
    h = h.replace(/<div class="ajcard( cuser)?"><span class="av">[^<]*<\/span>/, (m, c) => `<div class="ajcard${c || ""} pfcard" data-go="ajustes/perfil">${avatarHtml()}`);
    if (nombrePerfil()) h = h.replace(/(<div class="ajcard[^"]*pfcard"[^>]*>.*?<div><b>)[^<]*(<\/b>)/, (m, a, b) => a + esc(nombrePerfil()) + b);
    const fila = `<button class="ajrow" data-go="ajustes/perfil"><span class="oi">${ic("pen")}</span><div><b>Editar perfil</b><small>Tu nombre y tu foto</small></div>${ic("right")}</button>`;
    h = h.replace(/<button class="ajrow" data-go="ajustes\/nombre">.*?<\/button>/, "");
    return h.replace('<div class="ajsec">AJUSTES</div><div class="ajlist">', '<div class="ajsec">AJUSTES</div><div class="ajlist">' + fila);
  };
})();

// foto en el botón de perfil de la barra superior (todas las pantallas dibujan su propia barra)
function fotoEnBarra() {
  const f = fotoPerfil();
  document.querySelectorAll('.top .icb[data-go="ajustes"]').forEach((b) => {
    const tiene = b.querySelector("img.avt");
    if (f && (!tiene || tiene.getAttribute("src") !== f)) b.innerHTML = `<img class="avt" src="${esc(f)}" alt="">`;
    else if (!f && tiene) b.innerHTML = ic("user");
  });
}
new MutationObserver(() => fotoEnBarra()).observe(document.documentElement, { childList: true, subtree: true });
