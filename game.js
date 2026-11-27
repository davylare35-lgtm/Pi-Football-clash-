const Pi = window.Pi;
if (Pi) { try { Pi.init({ version: "2.0", sandbox: true }); } catch(e) {} }

let userPi = JSON.parse(localStorage.getItem("pfc_user")) || null;
let noteClub = parseInt(localStorage.getItem("pfc_note")) || 65;
const aujourdhui = new Date().toISOString().slice(0, 10);
let defis = JSON.parse(localStorage.getItem("pfc_defis")) || [
  { id: 101, equipe: "FC Barcelone Pi", date: aujourdhui, heure: "23:59", mise: "0.5" },
  { id: 102, equipe: "Accra Stars (Entraînement)", date: aujourdhui, heure: "23:59", mise: "0" }
];
let programmes = JSON.parse(localStorage.getItem("pfc_prog")) || [];
let inscrits = 6;
let matchProgActif = null;
let enjeuActuel = 0;

if (userPi) appliquerConnexionUI(userPi);

function appliquerConnexionUI(u) {
  document.getElementById("user-status").textContent = "Connecté : @" + u.username;
  document.getElementById("user-status").style.color = "#34d399";
  document.getElementById("btn-login").textContent = "✓ @" + u.username;
  document.getElementById("team-a-name").textContent = u.username;
}

function showTab(id) {
  ["duels", "terrain", "tournoi", "equipe"].forEach(function(t) {
    document.getElementById("sec-" + t).classList.add("hidden");
    document.getElementById("tab-" + t).classList.remove("active");
  });
  document.getElementById("sec-" + id).classList.remove("hidden");
  document.getElementById("tab-" + id).classList.add("active");
  if (id === "terrain" && !running) startMatch("ENTRAÎNEMENT", "IA Club", 0);
}

async function connecterPi() {
  if (!Pi) { alert("Ouvrez ce jeu dans le Pi Browser pour vous connecter."); return; }
  try {
    const auth = await Pi.authenticate(["username", "payments"], function(p) {
      fetch("/api/complete", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ paymentId: p.identifier, txid: p.transaction?.txid || "" }) });
    });
    userPi = auth.user;
    localStorage.setItem("pfc_user", JSON.stringify(userPi));
    appliquerConnexionUI(userPi);
  } catch (e) { alert("Connexion Pi impossible : " + (e.message || e)); }
}

function payerPi(montant, memo, okCallback) {
  if (!userPi) {
    alert("Veuillez d'abord vous connecter avec votre compte Pi.");
    connecterPi();
    return;
  }
  Pi.createPayment({ amount: montant, memo: memo, metadata: { user: userPi.username } }, {
    onReadyForServerApproval: function(pid) {
      fetch("/api/approve", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ paymentId: pid }) });
    },
    onReadyForServerCompletion: function(pid, txid) {
      fetch("/api/complete", { method: "POST", headers: {"Content-Type":"application/json"}, body: JSON.stringify({ paymentId: pid, txid: txid }) }).then(okCallback);
    },
    onCancel: function() { alert("Transaction annulée."); },
    onError: function(e) { alert("Erreur paiement : " + (e.message || e)); }
  });
}

function creerDefi() {
  const eq = document.getElementById("in-equipe").value.trim();
  const dt = document.getElementById("in-date").value;
  const hr = document.getElementById("in-heure").value;
  const ms = document.getElementById("in-mise").value;
  if (!eq || !dt || !hr) { alert("Remplissez le nom du club, la date et l'heure."); return; }

  const publier = function() {
    defis.unshift({ id: Date.now(), equipe: eq, date: dt, heure: hr, mise: ms });
    localStorage.setItem("pfc_defis", JSON.stringify(defis));
    document.getElementById("in-equipe").value = "";
    renderUI();
    alert("Invitation publiée ! Dès qu'elle est acceptée et que l'heure sonne (" + hr + "), le match pourra être lancé.");
  };

  if (parseFloat(ms) > 0) payerPi(parseFloat(ms), "Invitation Duel " + eq, publier);
  else publier();
}

function accepterInvitation(id) {
  const idx = defis.findIndex(d => d.id === id);
  if (idx === -1) return;
  const defi = defis[idx];

  const valider = function() {
    defis.splice(idx, 1);
    localStorage.setItem("pfc_defis", JSON.stringify(defis));
    const advNom = userPi ? "@" + userPi.username : "Challenger Pi";
    programmes.unshift({ id: defi.id, equipeA: defi.equipe, equipeB: advNom, date: defi.date, heure: defi.heure, mise: defi.mise, autoLance: false });
    localStorage.setItem("pfc_prog", JSON.stringify(programmes));
    renderUI();
    verifierHeureMatchs();
  };

  if (parseFloat(defi.mise) > 0) payerPi(parseFloat(defi.mise), "Duel vs " + defi.equipe, valider);
  else valider();
}

function verifierHeureMatchs() {
  const maintenant = new Date();
  let alerte = null;

  programmes.forEach(function(m) {
    const cible = new Date(m.date + "T" + m.heure + ":00");
    m.estPret = (cible - maintenant) <= 0;
    if (m.estPret) {
      alerte = m;
      if (!m.autoLance) {
        m.autoLance = true;
        localStorage.setItem("pfc_prog", JSON.stringify(programmes));
        matchProgActif = m;
        declencherMatchProgramme();
      }
    }
  });

  const banner = document.getElementById("alarm-banner");
  if (alerte) {
    matchProgActif = alerte;
    banner.classList.remove("hidden");
    document.getElementById("alarm-text").textContent = alerte.equipeA + " vs " + alerte.equipeB + " (" + alerte.heure + ")";
  } else {
    banner.classList.add("hidden");
  }
  renderProgrammes();
}

function declencherMatchProgramme() {
  if (!matchProgActif) return;
  const m = matchProgActif;
  showTab("terrain");
  startMatch(parseFloat(m.mise) > 0 ? "DUEL " + m.mise + " PI" : "DUEL AMICAL", m.equipeA + " vs " + m.equipeB, parseFloat(m.mise));
}

function lancerMatchDirect(id) {
  const m = programmes.find(p => p.id === id);
  if (!m) return;
  matchProgActif = m;
  declencherMatchProgramme();
}

setInterval(verifierHeureMatchs, 3000);

function rejoindreCoupe() {
  if (inscrits >= 8) return;
  payerPi(1, "Coupe Express 8", function() {
    inscrits = 8;
    document.getElementById("coupe-count").textContent = "8 / 8 (COMPLET)";
    document.getElementById("btn-coupe").textContent = "✓ Inscrit au tournoi";
    const moi = userPi ? "@" + userPi.username : "Mon Club";
    document.getElementById("coupe-arbre").innerHTML = `
      <div style="background:#0f172a;padding:10px;border-radius:8px;border:1px solid #f59e0b;margin-bottom:6px;">
        <div style="color:#fbbf24;font-weight:700;margin-bottom:6px;">Quart 1 : ${moi} vs FC Barcelone Pi</div>
        <button type="button" class="badge-free" onclick="showTab('terrain');startMatch('QUART COUPE', 'FC Barcelone Pi', 1)">Jouer mon Quart</button>
      </div>
      <div style="padding:5px 0;">Quart 2 : Accra Stars vs Lions de l'Atlas</div>
      <div style="padding:5px 0;">Quart 3 : Éléphants Pi vs Aigles de Carthage</div>
      <div style="padding:5px 0;">Quart 4 : Real Pi Madrid vs Bayern Crypto</div>
    `;
  });
}

function acheterPack(nom, prix, bonus) {
  payerPi(prix, nom, function() {
    noteClub = Math.min(99, noteClub + bonus);
    localStorage.setItem("pfc_note", noteClub);
    renderUI();
    alert("Amélioration activée : " + nom);
  });
}

function renderProgrammes() {
  const box = document.getElementById("box-programmes");
  const list = document.getElementById("liste-programmes");
  if (programmes.length === 0) { box.classList.add("hidden"); return; }
  box.classList.remove("hidden");
  list.innerHTML = programmes.map(function(m) {
    const btnHtml = m.estPret
      ? `<button type="button" class="badge-ready" onclick="lancerMatchDirect(${m.id})">⚽ COUP D'ENVOI</button>`
      : `<span style="font-size:11px;color:#fbbf24;font-weight:700;">⏳ Prévu à ${m.heure}</span>`;
    return `<div class="prog-item">
      <div>
        <div style="font-size:13px;font-weight:800;color:#fff;">⚔️ ${m.equipeA} vs ${m.equipeB}</div>
        <div style="font-size:11px;color:#cbd5e1;margin-top:2px;">📅 ${m.date} à ${m.heure}</div>
      </div>
      ${btnHtml}
    </div>`;
  }).join("");
}

function renderUI() {
  const rang = noteClub >= 85 ? "Élite" : (noteClub >= 75 ? "Pro" : "Académie");
  document.getElementById("club-note").textContent = rang + " (" + noteClub + "/100)";
  document.getElementById("liste-defis").innerHTML = defis.map(function(d) {
    const pay = parseFloat(d.mise) > 0;
    return `<div class="defi-item">
      <div>
        <div style="font-size:13px;font-weight:700;">⚽ ${d.equipe}</div>
        <div style="font-size:11px;color:#94a3b8;margin-top:2px;">📅 ${d.date} à ${d.heure}</div>
      </div>
      <button type="button" class="${pay ? 'badge-pi' : 'badge-free'}" onclick="accepterInvitation(${d.id})">
        Accepter (${pay ? d.mise + ' Pi' : 'Gratuit'})
      </button>
    </div>`;
  }).join("");
  renderProgrammes();
}

const canvas = document.getElementById("stade");
const ctx = canvas.getContext("2d");
const P = { x: 26, y: 34, w: 308, h: 382 };
let running = false, scA = 0, scB = 0, timeLeft = 60, timerId = null, tick = 0, celeb = 0, sprint = false;

let joy = { x: 0, y: 0 }, drag = false;
const jZone = document.getElementById("joy-zone"), jKnob = document.getElementById("joy-knob");
function moveJoy(e) {
  if (!drag) return;
  const r = jZone.getBoundingClientRect();
  const cx = e.touches ? e.touches.clientX : e.clientX;
  const cy = e.touches ? e.touches.clientY : e.clientY;
  let dx = cx - (r.left + r.width/2), dy = cy - (r.top + r.height/2);
  const dist = Math.hypot(dx, dy), max = 34;
  if (dist > max) { dx = (dx/dist)*max; dy = (dy/dist)*max; }
  jKnob.style.transform = `translate(${dx}px, ${dy}px)`;
  joy.x = dx / max; joy.y = dy / max;
}
jZone.addEventListener("pointerdown", e => { drag = true; jZone.setPointerCapture(e.pointerId); moveJoy(e); });
jZone.addEventListener("pointermove", moveJoy);
jZone.addEventListener("pointerup", () => { drag = false; jKnob.style.transform = "translate(0,0)"; joy = {x:0, y:0}; });

let ball = { x: 180, y: 225, vx: 0, vy: 0 };
let teamA = [
  { role:"GK", x:180, y:402, hx:180, hy:402, c:"#f59e0b", s:"#0f172a", skin:"#8d5524", step:0 },
