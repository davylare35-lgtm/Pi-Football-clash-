// ==========================================
// 1. INITIALISATION & DONNÉES GLOBALES
// ==========================================
let piUser = null;
let clubNote = parseInt(localStorage.getItem('pfc_note')) || 65;
let defis = JSON.parse(localStorage.getItem('pfc_defis')) || [
  { id: 1, club: "Lions de Dakar", date: "Aujourd'hui", heure: "20:00", mise: 0 },
  { id: 2, club: "Aigles de Carthage", date: "Aujourd'hui", heure: "21:30", mise: 0.5 }
];
let matchsProgrammes = JSON.parse(localStorage.getItem('pfc_prog')) || [];
let coupeInscrits = 6;
let inscritCoupe = false;

// Initialisation sécurisée du SDK Pi Network
document.addEventListener("DOMContentLoaded", () => {
  if (window.Pi) {
    try {
      window.Pi.init({ version: "2.0", sandbox: true }); // Passez sandbox à false en production
    } catch (e) {
      console.warn("Erreur init Pi SDK :", e);
    }
  }
  majInterfaceClub();
  afficherDefis();
  afficherProgrammes();
  initJoystick();
  dessinerTerrainStatique();
  setInterval(verifierAlarmes, 10000);
});

// ==========================================
// 2. NAVIGATION ENTRE LES ONGLETS
// ==========================================
function showTab(tabName) {
  const sections = ['duels', 'terrain', 'tournoi', 'equipe'];
  sections.forEach(sec => {
    const elSec = document.getElementById('sec-' + sec);
    const elTab = document.getElementById('tab-' + sec);
    if (elSec) elSec.classList.add('hidden');
    if (elTab) elTab.classList.remove('active');
  });

  const activeSec = document.getElementById('sec-' + tabName);
  const activeTab = document.getElementById('tab-' + tabName);
  if (activeSec) activeSec.classList.remove('hidden');
  if (activeTab) activeTab.classList.add('active');

  if (tabName === 'terrain' && !matchEnCours) {
    dessinerTerrainStatique();
  }
}

// ==========================================
// 3. CONNEXION PI NETWORK & PAIEMENTS
// ==========================================
function connecterPi() {
  if (!window.Pi) {
    alert("⚠️ Veuillez ouvrir l'application dans le Pi Browser pour connecter votre compte Pi.");
    return;
  }

  const scopes = ['username', 'payments'];
  window.Pi.authenticate(scopes, onIncompletePaymentFound)
    .then(function(auth) {
      piUser = auth.user;
      document.getElementById('user-status').textContent = "✅ Connecté : @" + piUser.username;
      const btn = document.getElementById('btn-login');
      btn.textContent = "@" + piUser.username;
      btn.style.background = "#059669";
      btn.style.color = "#fff";
    })
    .catch(function(error) {
      console.error(error);
      alert("Connexion annulée ou impossible. Vérifiez que vous êtes sur Pi Browser.");
    });
}

function onIncompletePaymentFound(payment) {
  console.log("Paiement incomplet détecté :", payment);
}

function executerPaiementPi(montant, memo, onSuccessCallback) {
  if (montant <= 0) {
    onSuccessCallback();
    return;
  }

  if (!window.Pi || !piUser) {
    const simuler = confirm(`Mode Invité / Hors Pi Browser.\nVoulez-vous simuler le paiement de ${montant} Pi pour "${memo}" ?`);
    if (simuler) onSuccessCallback();
    return;
  }

  window.Pi.createPayment({
    amount: parseFloat(montant),
    memo: memo,
    metadata: { app: "PiFootballClash" }
  }, {
    onReadyForServerApproval: function(paymentId) {
      console.log("Approbation serveur requise :", paymentId);
    },
    onReadyForServerCompletion: function(paymentId, txid) {
      console.log("Transaction terminée :", txid);
      onSuccessCallback();
    },
    onCancel: function(paymentId) {
      alert("Paiement annulé.");
    },
    onError: function(error, payment) {
      console.error("Erreur paiement :", error);
      alert("Erreur lors du paiement Pi.");
    }
  });
}

// ==========================================
// 4. GESTION DES DUELS & INVITATIONS
// ==========================================
function creerDefi() {
  const club = document.getElementById('in-equipe').value.trim();
  const date = document.getElementById('in-date').value;
  const heure = document.getElementById('in-heure').value;
  const mise = parseFloat(document.getElementById('in-mise').value);

  if (!club) {
    alert("Veuillez entrer le nom de votre club !");
    return;
  }

  const finaliserCreation = () => {
    const nouveauDefi = {
      id: Date.now(),
      club: club,
      date: date || "Aujourd'hui",
      heure: heure || "Immédiat",
      mise: mise
    };

    defis.unshift(nouveauDefi);
    localStorage.setItem('pfc_defis', JSON.stringify(defis));
    afficherDefis();

    document.getElementById('in-equipe').value = "";
    alert("✅ Votre invitation de duel a été publiée !");
  };

  executerPaiementPi(mise, `Inscription Duel : ${club}`, finaliserCreation);
}

function afficherDefis() {
  const conteneur = document.getElementById('liste-defis');
  if (!conteneur) return;

  if (defis.length === 0) {
    conteneur.innerHTML = `<p style="font-size:12px;color:#94a3b8">Aucune invitation ouverte pour le moment.</p>`;
    return;
  }

  conteneur.innerHTML = defis.map(d => {
    const badge = d.mise === 0
      ? `<span class="badge-free">Amical (Gratuit)</span>`
      : `<span class="badge-pi" style="background:#f59e0b;color:#000;padding:2px 6px;border-radius:4px;font-size:10px;font-weight:800">Mise : ${d.mise} Pi</span>`;

    return `
      <div class="card" style="display:flex;justify-content:space-between;align-items:center;margin-bottom:8px;padding:10px">
        <div>
          <div style="font-weight:800;font-size:14px">🛡️ ${d.club}</div>
          <div style="font-size:11px;color:#94a3b8">📅 ${d.date} à ${d.heure} • ${badge}</div>
        </div>
        <button type="button" class="btn-pi" onclick="accepterDefi(${d.id})">Défier</button>
      </div>
    `;
  }).join('');
}

function accepterDefi(id) {
  const defi = defis.find(d => d.id === id);
  if (!defi) return;

  const lancer = () => {
    defis = defis.filter(d => d.id !== id);
    localStorage.setItem('pfc_defis', JSON.stringify(defis));
    afficherDefis();

    if (defi.heure !== "Immédiat" && defi.date !== "Aujourd'hui") {
      matchsProgrammes.push(defi);
      localStorage.setItem('pfc_prog', JSON.stringify(matchsProgrammes));
      afficherProgrammes();
      alert(`⏱️ Match programmé contre ${defi.club} le ${defi.date} à ${defi.heure} !`);
    } else {
      startMatch(defi.mise > 0 ? `DUEL ${defi.mise} PI` : 'MATCH AMICAL', defi.club, defi.mise);
    }
  };

  executerPaiementPi(defi.mise, `Rejoindre Duel contre ${defi.club}`, lancer);
}

function afficherProgrammes() {
  const box = document.getElementById('box-programmes');
  const liste = document.getElementById('liste-programmes');
  if (!box || !liste) return;

  if (matchsProgrammes.length === 0) {
    box.classList.add('hidden');
    return;
  }

  box.classList.remove('hidden');
  liste.innerHTML = matchsProgrammes.map(m => `
    <div class="card" style="display:flex;justify-content:space-between;align-items:center;padding:8px;margin-bottom:6px;border-left:3px solid #fbbf24">
      <div style="font-size:12px"><strong>Vs ${m.club}</strong> (${m.date} - ${m.heure})</div>
      <button type="button" class="btn-pi" style="font-size:11px;padding:4px 8px" onclick="startMatch('DUEL PROGRAMMÉ', '${m.club}', ${m.mise})">Jouer</button>
    </div>
  `).join('');
}

function verifierAlarmes() {
  if (matchsProgrammes.length > 0) {
    const banner = document.getElementById('alarm-banner');
    const txt = document.getElementById('alarm-text');
    if (banner && txt) {
      txt.textContent = `Votre match contre ${matchsProgrammes[0].club} est prêt !`;
      banner.classList.remove('hidden');
    }
  }
}

function declencherMatchProgramme() {
  if (matchsProgrammes.length === 0) return;
  const match = matchsProgrammes.shift();
  localStorage.setItem('pfc_prog', JSON.stringify(matchsProgrammes));
  afficherProgrammes();
  document.getElementById('alarm-banner').classList.add('hidden');
  startMatch('DUEL OFFICIEL', match.club, match.mise);
}

// ==========================================
// 5. TOURNOI COUPE 8 & BOUTIQUE DU CLUB
// ==========================================
function rejoindreCoupe() {
  if (inscritCoupe) {
    alert("Vous êtes déjà inscrit à cette Coupe Express !");
    return;
  }

  executerPaiementPi(1, "Inscription Coupe Express 8", () => {
    inscritCoupe = true;
    coupeInscrits++;
    document.getElementById('coupe-count').textContent = `${coupeInscrits} / 8 inscrits`;
    const btn = document.getElementById('btn-coupe');
    btn.textContent = "✅ Inscrit (En attente du dernier joueur)";
    btn.style.background = "#059669";

    document.getElementById('coupe-arbre').innerHTML = `
      <div style="color:#e2e8f0;line-height:1.6">
        <div>🔹 Quart 1 : <strong>Mon Club</strong> vs FC Bamako</div>
        <div>🔹 Quart 2 : Lions Pi vs Abidjan Stars</div>
        <div>🔹 Quart 3 : Dakar United vs Cotonou FC</div>
        <div>🔹 Quart 4 : Kinshasa City vs <em>(1 place libre...)</em></div>
      </div>
    `;
  });
}

function acheterPack(nomPack, prix, bonusNote) {
  executerPaiementPi(prix, `Achat ${nomPack}`, () => {
    clubNote = Math.min(99, clubNote + bonusNote);
    localStorage.setItem('pfc_note', clubNote);
    majInterfaceClub();
    alert(`🎉 Félicitations ! ${nomPack} activé. La note de votre club est maintenant de ${clubNote}/100 !`);
  });
}

function majInterfaceClub() {
  const el = document.getElementById('club-note');
  if (!el) return;
  let rang = "Académie";
  if (clubNote >= 85) rang = "Élite Mondiale";
  else if (clubNote >= 75) rang = "Division Pro";
  el.textContent = `${rang} (${clubNote}/100)`;
}

// ==========================================
// 6. MOTEUR DE JEU (CANVAS & JOYSTICK)
// ==========================================
let matchEnCours = false;
let matchInterval = null;
let animFrame = null;
let tempsRestant = 60;
let scoreA = 0;
let scoreB = 0;
let sprint = false;
let miseActuelle = 0;

