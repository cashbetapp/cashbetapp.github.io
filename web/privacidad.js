I.eye = '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7S2 12 2 12z"/><circle cx="12" cy="12" r="3"/>';
I.lock = '<rect x="4" y="11" width="16" height="10" rx="2"/><path d="M8 11V7a4 4 0 0 1 8 0v4"/>';
// CASHBET · "Tus datos, tu decisión" (aviso de privacidad, se muestra una vez y queda en Perfil > Privacidad)
const PRIV_V = "3";

function privCuerpo() {
  const fila = (n, icon, t, s) => `<div class="prv_pvr"><div class="prv_pvi"><span>${ic(icon)}</span><small>${n}</small></div><div><b>${t}</b><p>${s}</p></div></div>`;
  return `<div class="prv_pvh"><div class="prv_pvt"><span class="prv_pvsh">${ic("shield")}</span><div><small>CASHBET · PRIVACIDAD</small><h2>Tus datos, tu decisión</h2></div></div>
      <p>CASHBET no usa analítica, publicidad ni rastreo. Para ver los picks necesitas una cuenta gratis (correo o Google).</p></div>
    <div class="prv_pvb">
      ${fila("01", "bars2", "Qué guardamos", "En este celular: los picks que sigues, tu bankroll, tu nombre, el tema y el formato de cuotas (y una copia en tu cuenta). No pedimos datos de pago ni apostamos en tu nombre.")}
      ${fila("02", "eye", "Qué no hacemos", "No usamos herramientas de analítica ni de seguimiento, no grabamos tu sesión y no compartimos datos con nadie. Para mostrarte la página, GitHub (donde está alojada) y Google Fonts (la letra) reciben tu dirección IP, como con cualquier sitio web.")}
      ${fila("03", "user", "Tu cuenta", "Guardamos tu nombre, tu correo, los picks que sigues, tu bankroll y tus preferencias en Firebase (Google) para que los veas en cualquier equipo. Solo tú puedes leerlos.")}
      ${fila("04", "lock", "Tu control", "Puedes borrar lo guardado en este celular desde Perfil &gt; Privacidad, y eliminar tu cuenta y sus datos de la nube desde Perfil cuando quieras. Nada de esto afecta los pronósticos.")}
    </div>`;
}

function avisoPriv() {
  if (store.get("priv", "") === PRIV_V || document.querySelector(".sheet.on")) return;
  openSheet(`<div class="prv_pvx">${privCuerpo()}<button class="prv_pvok" data-act="privok">Entendido</button>
    <div class="prv_pvn">Puedes volver a leer esto en Perfil &gt; Privacidad.</div></div>`);
  $(".sheet").classList.add("pk", "prv_pvs");
}

function privPagina() {
  return subTop("Privacidad") + `<div class="prv_pvx prv_pvpage">${privCuerpo()}
    <button class="prv_pvok" data-act="privborrar">Borrar mis datos de este celular</button>
    <div class="prv_pvn">Se borran los picks que sigues, tu bankroll, tu nombre y tus preferencias. Los pronósticos y el historial público no cambian.</div></div>`;
}

function actPriv(a) {
  if (a === "privok") { store.set("priv", PRIV_V); closeSheet(true); return true; }
  if (a === "privborrar") {
    if (!confirm("¿Borrar los picks que sigues, tu bankroll, tu nombre y tus preferencias de este celular?")) return true;
    try { Object.keys(localStorage).filter((k) => k.startsWith("cb_")).forEach((k) => localStorage.removeItem(k)); } catch (e) {}
    store.set("priv", PRIV_V);
    toast("Listo: se borraron tus datos de este celular");
    setTimeout(() => location.reload(), 900);
    return true;
  }
  return false;
}
