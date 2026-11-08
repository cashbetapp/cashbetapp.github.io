// CASHBET · cuenta opcional (Firebase: correo o Google). Con cuenta, los picks seguidos, el
// bankroll, el nombre y las preferencias se guardan en la nube y se ven en cualquier equipo.
// Sin cuenta la app funciona igual y la librería de Firebase ni siquiera se descarga.
const FB_CFG = {
  apiKey: "AIzaSyBMfr10eraDEdxCtOWLkQrKS-70OqptRnU",
  authDomain: "cashbet-2562a.firebaseapp.com",
  projectId: "cashbet-2562a",
  storageBucket: "cashbet-2562a.firebasestorage.app",
  messagingSenderId: "797897281390",
  appId: "1:797897281390:web:080d3f747e9652185a7b7f",
};
const FB_VER = "10.12.2";
const SYNC = ["seg", "bank", "nombre", "fmt", "tema"];
let FB = null, USER = null, fbCargando = null;
I.mail = '<rect x="3" y="5" width="18" height="14" rx="2"/><path d="m3 7 9 6 9-6"/>';
I.shieldOk = '<path d="M12 3 4 6v6c0 4.5 3.4 8.3 8 9 4.6-.7 8-4.5 8-9V6z"/><path d="m8.5 12 2.5 2.5 4.5-5"/>';
I.goog = '<path fill="#4285F4" stroke="none" d="M21.6 12.2c0-.7-.1-1.4-.2-2H12v3.8h5.4a4.6 4.6 0 0 1-2 3v2.5h3.2c1.9-1.7 3-4.3 3-7.3z"/><path fill="#34A853" stroke="none" d="M12 22c2.7 0 5-.9 6.6-2.4l-3.2-2.5c-.9.6-2 1-3.4 1-2.6 0-4.8-1.8-5.6-4.1H3.1v2.6A10 10 0 0 0 12 22z"/><path fill="#FBBC05" stroke="none" d="M6.4 14c-.2-.6-.3-1.3-.3-2s.1-1.4.3-2V7.4H3.1a10 10 0 0 0 0 9.2z"/><path fill="#EA4335" stroke="none" d="M12 6c1.5 0 2.8.5 3.8 1.5l2.9-2.9A10 10 0 0 0 3.1 7.4L6.4 10C7.2 7.7 9.4 6 12 6z"/>';

function cargarScript(src) {
  return new Promise((ok, no) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = no; document.head.appendChild(s); });
}
async function fb() {
  if (FB) return FB;
  if (!fbCargando) fbCargando = (async () => {
    const b = `https://www.gstatic.com/firebasejs/${FB_VER}/`;
    await cargarScript(b + "firebase-app-compat.js");
    await Promise.all([cargarScript(b + "firebase-auth-compat.js"), cargarScript(b + "firebase-firestore-compat.js")]);
    firebase.initializeApp(FB_CFG);
    const auth = firebase.auth(); auth.languageCode = "es";
    FB = { auth, db: firebase.firestore() };
    auth.onAuthStateChanged(alCambiarUsuario);
    try { await auth.getRedirectResult(); } catch (e) { toast(errTxt(e)); }
    return FB;
  })();
  return fbCargando;
}

// ---------------------------------------------------------------- sincronización
const docUsuario = () => FB.db.collection("usuarios").doc(USER.uid);
async function alCambiarUsuario(u) {
  const antes = USER;
  USER = u && (u.emailVerified || u.providerData.some((p) => p.providerId === "google.com")) ? u : null;
  store.set("cuenta", u ? 1 : 0);
  if (USER && !antes) {
    try {
      const snap = await docUsuario().get();
      const nube = snap.exists ? snap.data() : {};
      let cambio = false;
      // picks seguidos: se juntan los del celular y los de la nube
      const seg = Object.assign({}, nube.seg || {}, store.get("seg", {}));
      if (JSON.stringify(seg) !== JSON.stringify(store.get("seg", {}))) cambio = true;
      localStorage.setItem("cb_seg", JSON.stringify(seg));
      for (const k of ["bank", "nombre", "fmt", "tema"]) {
        if (nube[k] != null && JSON.stringify(nube[k]) !== JSON.stringify(store.get(k, null))) { localStorage.setItem("cb_" + k, JSON.stringify(nube[k])); cambio = true; }
      }
      if (!store.get("nombre", "") && USER.displayName) { localStorage.setItem("cb_nombre", JSON.stringify(USER.displayName.split(" ")[0])); cambio = true; }
      await subir();
      if (cambio && !sessionStorage.getItem("cb_sync")) { sessionStorage.setItem("cb_sync", "1"); location.reload(); return; }
    } catch (e) { console.warn("sync", e); }
  }
  if (location.hash.startsWith("#cuenta") && USER) location.hash = "#ajustes";
  else if (location.hash.startsWith("#ajustes")) { $("#app").dataset.tab = ""; route(); }
}
let subirT = null;
async function subir() {
  if (!USER) return;
  const d = { email: USER.email, at: firebase.firestore.FieldValue.serverTimestamp() };
  for (const k of SYNC) { const v = store.get(k, null); if (v != null) d[k] = v; }
  await docUsuario().set(d, { merge: true });
}
// cada vez que se guarda algo sincronizable, se sube (agrupado)
const _set = store.set;
store.set = (k, v) => { _set(k, v); if (USER && SYNC.includes(k)) { clearTimeout(subirT); subirT = setTimeout(() => subir().catch(() => {}), 800); } };

const ERR = {
  "auth/email-already-in-use": "Ese correo ya tiene cuenta. Toca \"Ya tengo una cuenta\".",
  "auth/invalid-email": "Ese correo no es válido.",
  "auth/weak-password": "La contraseña debe tener al menos 8 caracteres.",
  "auth/invalid-credential": "Correo o contraseña incorrectos.",
  "auth/wrong-password": "Correo o contraseña incorrectos.",
  "auth/user-not-found": "No hay una cuenta con ese correo.",
  "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
  "auth/network-request-failed": "Sin conexión. Revisa tu internet.",
  "auth/popup-closed-by-user": "Cerraste la ventana de Google.",
  "auth/unauthorized-domain": "Este sitio aún no está autorizado en Firebase.",
  "auth/operation-not-allowed": "Ese método de acceso no está activado en Firebase.",
  "auth/configuration-not-found": "Las cuentas todavía no están activadas. Intenta más tarde.",
};
const errTxt = (e) => ERR[e && e.code] || "No se pudo completar. Intenta otra vez.";

// ---------------------------------------------------------------- pantallas
function cuenta(arg) {
  if (!FB) fb().then(() => { $("#app").dataset.tab = ""; route(); }).catch(() => toast("No se pudo conectar. Revisa tu internet."));
  const atras = (go) => `<div class="ctop"><button class="cback" data-go="${go}" aria-label="Atrás">${ic("left")}</button></div>`;
  const pie = `<div class="cpie">Al continuar aceptas el uso de tus datos descrito en <a data-go="ajustes/privacidad">Privacidad</a>.</div>`;
  if (arg === "crear") return `<div class="cta">${atras("cuenta")}
      <h1 class="cth">¿Cuál es tu email?</h1><p class="ctp">Te enviaremos un enlace para confirmar que eres tú.</p>
      <label class="clab">Nombre</label><input class="cin" id="c_nom" autocomplete="given-name" placeholder="Tu nombre">
      <label class="clab">Email</label><input class="cin" id="c_mail" type="email" autocomplete="email" inputmode="email" placeholder="tu@email.com">
      <label class="clab">Contraseña</label><input class="cin" id="c_pass" type="password" autocomplete="new-password" placeholder="Al menos 8 caracteres">
      <button class="cbtn" data-act="c_crear">${ic("right")}Continuar</button>${pie}</div>`;
  if (arg === "entrar") return `<div class="cta">${atras("cuenta")}
      <h1 class="cth">Bienvenido<br><em>de nuevo.</em></h1><p class="ctp">Entra y sigue justo donde lo dejaste.</p>
      <label class="clab">Email</label><input class="cin" id="c_mail" type="email" autocomplete="email" inputmode="email" placeholder="tu@email.com">
      <label class="clab">Contraseña</label><input class="cin" id="c_pass" type="password" autocomplete="current-password" placeholder="Tu contraseña">
      <button class="clink" data-act="c_olvido">¿Olvidaste tu contraseña?</button>
      <button class="cbtn" data-act="c_entrar">${ic("right")}Entrar</button>
      <button class="cbtn2" data-act="c_google">${ic("goog")}Continuar con Google</button></div>`;
  if (arg === "verificar") return `<div class="cta">${atras("cuenta")}
      <span class="cico">${ic("mail")}</span><h1 class="cth">Revisa tu <em>correo.</em></h1>
      <p class="ctp">Te enviamos un enlace a <b>${esc((FB && FB.auth.currentUser && FB.auth.currentUser.email) || "tu correo")}</b>. Ábrelo para confirmar tu cuenta y vuelve aquí. Si no aparece, mira en Spam.</p>
      <button class="cbtn" data-act="c_listo">${ic("check")}Ya lo confirmé</button>
      <button class="cbtn2" data-act="c_reenviar">Reenviar el enlace</button></div>`;
  return `<div class="cta cini">${atras("ajustes")}
      <span class="cico">${ic("shieldOk")}</span>
      <h1 class="cth big">Crea tu<br><em>cuenta CASHBET.</em></h1>
      <p class="ctp">Gratis. Guarda tus picks seguidos y tu bankroll en la nube y míralos en cualquier celular o computador.</p>
      <button class="cbtn" data-go="cuenta/crear">${ic("mail")}Continuar con Email</button>
      <button class="cbtn2" data-act="c_google">${ic("goog")}Continuar con Google</button>
      <button class="cya" data-go="cuenta/entrar">Ya tengo una cuenta</button>${pie}</div>`;
}

function tarjetaCuenta() {
  if (USER) return `<div class="ajcard cuser"><span class="av">${esc(((USER.displayName || USER.email || "C")[0]).toUpperCase())}</span><div><b>${esc(USER.displayName || store.get("nombre", "") || "Tu cuenta")}</b><small>${esc(USER.email || "")} · sincronizado en la nube</small></div></div>
    <div class="ajlist"><button class="ajrow" data-act="c_salir"><span class="oi">${ic("left")}</span><div><b>Cerrar sesión</b><small>Tus datos quedan guardados en tu cuenta</small></div>${ic("right")}</button>
    <button class="ajrow" data-act="c_borrar"><span class="oi">${ic("x")}</span><div><b>Eliminar mi cuenta</b><small>Borra la cuenta y sus datos de la nube</small></div>${ic("right")}</button></div>`;
  return `<button class="ccard" data-go="cuenta"><span class="cico sm">${ic("shieldOk")}</span><div><b>Crea tu cuenta gratis</b><small>Guarda tus picks y tu bankroll en la nube</small></div>${ic("right")}</button>`;
}

const val = (id) => (document.getElementById(id) || {}).value || "";
function actCuentaSync(a) {
  if (!a || !a.startsWith("c_")) return false;
  actCuenta(a);
  return true;
}
async function actCuenta(a) {
  try {
    const { auth } = await fb();
    if (a === "c_crear") {
      const nom = val("c_nom").trim(), mail = val("c_mail").trim(), pass = val("c_pass");
      if (!nom) return toast("Escribe tu nombre"), true;
      if (pass.length < 8) return toast("La contraseña debe tener al menos 8 caracteres"), true;
      const r = await auth.createUserWithEmailAndPassword(mail, pass);
      await r.user.updateProfile({ displayName: nom });
      store.set("nombre", nom);
      await r.user.sendEmailVerification({ url: location.origin + location.pathname + "#cuenta/verificar" });
      location.hash = "#cuenta/verificar";
    } else if (a === "c_entrar") {
      const r = await auth.signInWithEmailAndPassword(val("c_mail").trim(), val("c_pass"));
      if (!r.user.emailVerified) { await r.user.sendEmailVerification(); location.hash = "#cuenta/verificar"; toast("Confirma tu correo: te enviamos el enlace"); }
      else toast("Bienvenido de nuevo");
    } else if (a === "c_google") {
      const p = new firebase.auth.GoogleAuthProvider();
      try { await auth.signInWithPopup(p); toast("Sesión iniciada"); }
      catch (e) { if (/popup-blocked|operation-not-supported|cancelled-popup/.test(e.code || "")) await auth.signInWithRedirect(p); else throw e; }
    } else if (a === "c_olvido") {
      const mail = val("c_mail").trim();
      if (!mail) return toast("Escribe tu correo arriba"), true;
      await auth.sendPasswordResetEmail(mail); toast("Te enviamos un enlace para cambiar la contraseña");
    } else if (a === "c_reenviar") {
      if (auth.currentUser) { await auth.currentUser.sendEmailVerification(); toast("Enlace reenviado"); }
    } else if (a === "c_listo") {
      if (!auth.currentUser) { location.hash = "#cuenta/entrar"; return true; }
      await auth.currentUser.reload();
      if (auth.currentUser.emailVerified) { await alCambiarUsuario(auth.currentUser); toast("¡Cuenta confirmada!"); }
      else toast("Todavía no aparece confirmada. Abre el enlace del correo.");
    } else if (a === "c_salir") {
      await auth.signOut(); USER = null; store.set("cuenta", 0); toast("Sesión cerrada"); $("#app").dataset.tab = ""; route();
    } else if (a === "c_borrar") {
      if (!confirm("¿Eliminar tu cuenta y los datos guardados en la nube? En este celular quedan tus datos locales.")) return true;
      await docUsuario().delete(); await auth.currentUser.delete();
      USER = null; store.set("cuenta", 0); toast("Cuenta eliminada"); $("#app").dataset.tab = ""; route();
    }
  } catch (e) {
    if (e && e.code === "auth/requires-recent-login") toast("Por seguridad, cierra sesión, vuelve a entrar e inténtalo de nuevo.");
    else toast(errTxt(e));
    console.warn(e);
  }
  return true;
}

// si ya tenía cuenta en este celular, se reconecta al abrir (sin cuenta no se descarga Firebase)
if (store.get("cuenta", 0)) fb().catch(() => {});
