// ================= STATO GLOBALE ================= 
let gameStarted = false;
let isMaster = false;
let gameTime = 0;
let timerInterval = null;

let playerName = "";
let playerTeam = "";
let playerMarker = null;

const operators = [];
let operatorsData = {}; // oggetti con posizioni e team

// ================= JSONBIN.IO =================
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// ================= MAPPA =================
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

// ================= OBIETTIVI PREDEFINITI =================
const objectives = [
  {name:"PF1", lat:45.238376, lon:8.810060, owner:null, operator:null, radius:6, marker:null},
  {name:"PF2", lat:45.237648, lon:8.810941, owner:null, operator:null, radius:6, marker:null},
  {name:"PF3", lat:45.238634, lon:8.808772, owner:null, operator:null, radius:6, marker:null},
  {name:"PF4", lat:45.237771, lon:8.809208, owner:null, operator:null, radius:6, marker:null},
  {name:"PF5", lat:45.237995, lon:8.808303, owner:null, operator:null, radius:6, marker:null}
];

// aggiunge i marker sulla mappa
objectives.forEach(obj => {
  obj.marker = L.circle([obj.lat, obj.lon], {
    radius: obj.radius,
    color: "white",
    fillOpacity: 0.4
  }).addTo(map).bindPopup(`${obj.name} - Libero`);
});

updateScoreboard();

// ================= FUNZIONI JSONBIN =================
async function fetchGameData() {
  try {
    const res = await fetch(JSONBIN_URL + "/latest", {
      headers: { "X-Master-Key": SECRET_KEY }
    });
    const data = await res.json();
    const record = data.record;

    // aggiorna operatori
    if(record.operators) {
      operators.length = 0;
      Object.keys(record.operators).forEach(name => {
        if(!operators.includes(name)) operators.push(name);
        operatorsData[name] = record.operators[name];
      });
    }

    // aggiorna marker operatori sulla mappa
    Object.values(operatorsData).forEach(op => {
      if(!op.marker) {
        op.marker = L.marker([op.lat, op.lon]).addTo(map).bindPopup(`${op.name} - ${op.team}`);
      } else {
        op.marker.setLatLng([op.lat, op.lon]);
      }
    });

    // aggiorna obiettivi
    if(record.objectives) {
      record.objectives.forEach((obj, idx) => {
        objectives[idx].owner = obj.owner;
        objectives[idx].operator = obj.operator;
        objectives[idx].marker.setStyle({color: obj.owner ? "red" : "white"});
        objectives[idx].marker.bindPopup(`${obj.name} - ${obj.owner ? obj.operator : "Libero"}`);
      });
    }

    updateScoreboard();
    updateOperatorsList();

  } catch(e) { console.log("Errore fetch:", e); }
}

async function updateGameData() {
  try {
    const body = JSON.stringify({
      operators: operatorsData,
      objectives: objectives.map(o => ({name:o.name, owner:o.owner, operator:o.operator}))
    });
    await fetch(JSONBIN_URL, {
      method: 'PUT',
      headers: {
        "X-Master-Key": SECRET_KEY,
        "Content-Type": "application/json"
      },
      body
    });
  } catch(e) { console.log("Errore update:", e); }
}

// ================= START / JOIN GAME =================
function startGame() {
  playerName = document.getElementById("playerName").value.trim();
  playerTeam = document.getElementById("teamSelect").value;
  isMaster = document.getElementById("isMaster").checked;

  if(!playerName) { alert("Inserisci nome"); return; }

  if(isMaster) {
    const min = parseInt(document.getElementById("gameDuration").value);
    if(!min) { alert("Il master deve impostare il tempo"); return; }
    gameTime = min * 60;
    startTimer();
  }

  gameStarted = true;
  lockInputs();
  addOperator();
  updateGameData();
}

function joinGame() {
  playerName = document.getElementById("playerName").value.trim();
  playerTeam = document.getElementById("teamSelect").value;

  if(!playerName) { alert("Inserisci il nome"); return; }

  gameStarted = true;
  lockInputs();
  addOperator();
  updateGameData();
}

// ================= TIMER =================
function startTimer() {
  timerInterval = setInterval(() => {
    if(gameTime <= 0) {
      clearInterval(timerInterval);
      document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
      gameStarted = false;
      return;
    }
    gameTime--;
    const m = Math.floor(gameTime/60);
    const s = gameTime % 60;
    document.getElementById("timer").innerText = `⏱️ Tempo: ${m}:${s.toString().padStart(2,"0")}`;
  }, 1000);
}

// ================= FERMA PARTITA (Master) =================
function stopGame() {
  if(!isMaster) { alert("Solo il Master può fermare la partita!"); return; }
  gameStarted = false;
  clearInterval(timerInterval);
  document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
  updateGameData();
}

// ================= GPS =================
navigator.geolocation.watchPosition(
  pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;
    document.getElementById("status").innerText = `📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;

    if(!playerMarker) {
      playerMarker = L.marker([lat, lon]).addTo(map);
    } else {
      playerMarker.setLatLng([lat, lon]);
    }

    // aggiorna posizione e salva
    operatorsData[playerName] = {name: playerName, team: playerTeam, lat, lon};
    updateGameData();
  },
  () => { document.getElementById("status").innerText = "❌ GPS non disponibile"; },
  {enableHighAccuracy:true}
);

// ================= UI =================
function updateScoreboard() {
  const sb = document.getElementById("scoreboard");
  sb.innerHTML = "";
  objectives.forEach(o => {
    const li = document.createElement("li");
    li.innerText = o.owner ? `${o.name} - Team ${o.owner} (${o.operator})` : `${o.name} - Libero`;
    sb.appendChild(li);
  });
}

function updateOperatorsList() {
  const ul = document.getElementById("operators");
  ul.innerHTML = "";
  operators.forEach(op => {
    const li = document.createElement("li");
    li.innerText = op;
    ul.appendChild(li);
  });
}

function addOperator() {
  if(!operators.includes(playerName)) {
    operators.push(playerName + (isMaster ? " 👑" : ""));
  }
  updateOperatorsList();
}

function lockInputs() {
  document.getElementById("playerName").disabled = true;
  document.getElementById("teamSelect").disabled = true;
  document.getElementById("gameDuration").disabled = true;
  document.getElementById("isMaster").disabled = true;
}

function resetPlayer() {
  location.reload();
}

// ================= AGGIORNA OGNI 1.5 SECONDI =================
setInterval(() => {
  if(gameStarted) fetchGameData();
}, 1500);
