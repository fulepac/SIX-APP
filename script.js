// ================= STATO GLOBALE =================
let gameStarted = false;
let isMaster = false;
let gameTime = 0;
let timerInterval = null;

let playerName = "";
let playerTeam = "";
let playerMarker = null;

// ================= BIN CONFIG =================
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/696d4940ae596e708fe53514`;

// ================= MAPPA =================
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png", { maxZoom: 19 }).addTo(map);

// ================= OBIETTIVI =================
const objectives = [
  {name:"PF1", lat:45.238376, lon:8.810060, owner:null, operator:null, radius:6, marker:null},
  {name:"PF2", lat:45.237648, lon:8.810941, owner:null, operator:null, radius:6, marker:null},
  {name:"PF3", lat:45.238634, lon:8.808772, owner:null, operator:null, radius:6, marker:null},
  {name:"PF4", lat:45.237771, lon:8.809208, owner:null, operator:null, radius:6, marker:null},
  {name:"PF5", lat:45.237995, lon:8.808303, owner:null, operator:null, radius:6, marker:null}
];

objectives.forEach(obj => {
  obj.marker = L.circle([obj.lat, obj.lon], {
    radius: obj.radius,
    color: 'white',
    fillOpacity: 0.4
  }).addTo(map).bindPopup(`${obj.name} - Libero`);
});

// ================= OPERATORS =================
const operators = {}; // {nome: {lat, lon, team, marker}}

// ================= TIMER =================
function startTimer() {
  timerInterval = setInterval(() => {
    if(gameTime <= 0){
      clearInterval(timerInterval);
      gameStarted = false;
      document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
      return;
    }
    gameTime--;
    const m = Math.floor(gameTime/60);
    const s = gameTime%60;
    document.getElementById("timer").innerText = `⏱️ Tempo: ${m}:${s.toString().padStart(2,"0")}`;
  },1000);
}

// ================= START/STOP GAME =================
function startGame(){
  playerName = document.getElementById("playerName").value.trim();
  playerTeam = document.getElementById("teamSelect").value;
  isMaster = document.getElementById("isMaster").checked;

  if(!playerName){ alert("Inserisci nome"); return; }

  if(isMaster){
    const min = parseInt(document.getElementById("gameDuration").value);
    if(!min){ alert("Il master deve impostare il tempo"); return; }
    gameTime = min*60;
    startTimer();
    gameStarted = true;
  }

  lockInputs();
  updateMyPosition(); // invia subito la posizione iniziale
}

function stopGame(){
  if(!isMaster){ alert("Solo il Master può fermare la partita"); return; }
  clearInterval(timerInterval);
  gameStarted = false;
  document.getElementById("timer").innerText = "⛔ PARTITA TERMINATA";
}

// ================= LOCK INPUT =================
function lockInputs(){
  document.getElementById("playerName").disabled = true;
  document.getElementById("teamSelect").disabled = true;
  document.getElementById("gameDuration").disabled = true;
  document.getElementById("isMaster").disabled = true;
}

function resetPlayer(){ location.reload(); }

// ================= GPS =================
navigator.geolocation.watchPosition(
  pos => {
    const lat = pos.coords.latitude;
    const lon = pos.coords.longitude;

    document.getElementById("status").innerText = `📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
    if(!playerMarker){ playerMarker = L.marker([lat, lon]).addTo(map); }
    else{ playerMarker.setLatLng([lat, lon]); }

    updateMyPosition(lat, lon);
  },
  () => { document.getElementById("status").innerText = "❌ GPS non disponibile"; },
  {enableHighAccuracy:true}
);

// ================= BIN SYNC =================
async function updateMyPosition(lat=0, lon=0){
  if(!gameStarted) return;
  try{
    const res = await fetch(JSONBIN_URL + "/latest", { headers: { "X-Master-Key": SECRET_KEY } });
    let data = await res.json();
    let record = data.record;

    // aggiorno operatore corrente
    record.operators = record.operators || [];
    const index = record.operators.findIndex(o=>o.name===playerName);
    if(index>=0){
      record.operators[index] = {name:playerName, team:playerTeam, lat:lat, lon:lon};
    }else{
      record.operators.push({name:playerName, team:playerTeam, lat:lat, lon:lon});
    }

    // aggiorno obiettivi (se master può gestire conquiste, ecc)
    record.objectives = objectives.map(o=>({
      name:o.name, lat:o.lat, lon:o.lon, owner:o.owner, operator:o.operator, radius:o.radius
    }));

    await fetch(JSONBIN_URL, {
      method:'PUT',
      headers:{ "X-Master-Key":SECRET_KEY, "Content-Type":"application/json" },
      body: JSON.stringify(record)
    });
  }catch(e){ console.log(e); }
}

// ================= FETCH PERIODICO =================
setInterval(async ()=>{
  try{
    const res = await fetch(JSONBIN_URL + "/latest", { headers: { "X-Master-Key": SECRET_KEY } });
    let data = await res.json();
    let record = data.record;

    // aggiornamento operatori
    const ul = document.getElementById("operators");
    ul.innerHTML="";
    record.operators.forEach(o=>{
      ul.innerHTML += `<li>${o.name} - ${o.team}</li>`;
      if(o.name!==playerName){
        if(!operators[o.name]){
          operators[o.name] = {marker:L.marker([o.lat,o.lon]).addTo(map)};
        }else{
          operators[o.name].marker.setLatLng([o.lat,o.lon]);
        }
      }
    });

    // aggiornamento obiettivi
    record.objectives.forEach((obj,i)=>{
      objectives[i].owner=obj.owner;
      objectives[i].operator=obj.operator;
      let color = obj.owner? (obj.owner==="ALFA"?"blue":"red"):"white";
      objectives[i].marker.setStyle({color:color});
      objectives[i].marker.bindPopup(obj.owner? `${obj.name} - ${obj.operator}`:`${obj.name} - Libero`);
    });

    // aggiorno scoreboard
    const sb = document.getElementById("scoreboard");
    sb.innerHTML="";
    objectives.forEach(o=>{
      sb.innerHTML += `<li>${o.name} - ${o.owner? o.owner+" - "+o.operator:"Libero"}</li>`;
    });
  }catch(e){ console.log(e); }
}, 1500);
