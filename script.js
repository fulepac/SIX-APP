const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325"; // La tua password

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let allyMarkers = {}; 
let activeMarkers = [];
let map;

// 1. Inizializzazione Mappa (Google Satellite)
function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains:['mt0','mt1','mt2','mt3'],
        maxZoom: 21
    }).addTo(map);
}

// 2. Controllo Password Master
function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        document.getElementById("masterPass").style.borderColor = "yellow";
        loadCurrentConfig(); // Carica obiettivi dal server negli slot
    }
}

// 3. Carica obiettivi esistenti dal Bin negli slot Master
async function loadCurrentConfig() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        const container = document.getElementById("objSlotContainer");
        container.innerHTML = "";
        
        if(record.objectives) {
            record.objectives.forEach(obj => {
                container.innerHTML += `<div class="obj-slot">
                    <input type="checkbox" class="s-active" checked>
                    <input type="text" class="s-name" value="${obj.name}">
                    <input type="text" class="s-lat" value="${obj.lat}">
                    <input type="text" class="s-lon" value="${obj.lon}">
                </div>`;
            });
        }
    } catch(e) { console.error("Errore caricamento obiettivi"); }
}

// 4. Avvio Partita
async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME OPERATORE");

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";

    setTimeout(() => {
        map.invalidateSize();
        navigator.geolocation.getCurrentPosition(p => {
            const pos = [p.coords.latitude, p.coords.longitude];
            map.setView(pos, 18);
            state.playerMarker = L.marker(pos).addTo(map).bindTooltip("IO", {permanent:true});
        }, null, {enableHighAccuracy:true});
    }, 600);

    setInterval(sync, 4000);
}

// 5. Sincronizzazione Server
async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        
        if(state.playerMarker) {
            if(!record.players) record.players = {};
            record.players[state.playerName] = {
                team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now()
            };
        }

        // Se Master avvia, legge i nuovi slot, altrimenti mantiene i vecchi obiettivi
        if(state.isMaster && !record.game.started) {
            record.game.started = true;
            record.game.durationMin = parseInt(document.getElementById("gameDuration").value) || 30;
            record.game.endTime = Date.now() + (record.game.durationMin * 60000);
            
            // Aggiorna obiettivi solo se modificati dal Master in questa sessione
            record.objectives = [];
            document.querySelectorAll(".obj-slot").forEach(s => {
                if(s.querySelector(".s-active").checked) {
                    record.objectives.push({
                        name: s.querySelector(".s-name").value,
                        lat: parseFloat(s.querySelector(".s-lat").value),
                        lon: parseFloat(s.querySelector(".s-lon").value),
                        owner: "LIBERO"
                    });
                }
            });
        }

        if(state.isMaster || state.playerMarker) {
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e) {}
}

// 6. Aggiornamento Interfaccia e Countdown
function updateUI(r) {
    // Countdown
    if(r.game.endTime) {
        const diff = r.game.endTime - Date.now();
        if(diff > 0) {
            const m = Math.floor(diff / 60000);
            const s = Math.floor((diff % 60000) / 1000);
            document.getElementById("timer").innerText = `⏱️ ${m}:${s.toString().padStart(2,'0')}`;
        } else {
            document.getElementById("timer").innerText = "FINE GARA";
        }
    }

    const banner = document.getElementById("gameStatusBanner");
    banner.innerText = r.game.started ? "OPERAZIONE IN CORSO" : "ATTESA AVVIO MASTER";
    banner.className = r.game.started ? "status-banner status-active" : "status-banner";

    // Pulisci marker vecchi
    activeMarkers.forEach(m => map.removeLayer(m));
    activeMarkers = [];
    
    // Disegna Compagni (Fog of War)
    const pList = document.getElementById("playerList"); pList.innerHTML = "";
    Object.entries(r.players || {}).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000 && p.team === state.playerTeam) {
            pList.innerHTML += `<li>${name} <span>ONLINE</span></li>`;
            if(name !== state.playerName) {
                activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius:7, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
            }
        }
    });

    // Disegna Obiettivi Persistenti
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    (r.objectives || []).forEach(obj => {
        sb.innerHTML += `<li>${obj.name}: <strong>${obj.owner}</strong></li>`;
        activeMarkers.push(L.circle([obj.lat, obj.lon], {radius:15, color: obj.owner==='RED'?'red':obj.owner==='BLUE'?'cyan':'white'}).addTo(map));
    });
}

// 7. Reset Sicuro (Mantiene obiettivi)
async function resetBin() { 
    if(!confirm("FERMARE LA PARTITA? GLI OBIETTIVI RIMARRANNO SALVATI.")) return;
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        record.game.started = false;
        record.game.endTime = null;
        record.players = {}; // Pulisce solo i giocatori
        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        location.reload();
    } catch(e) { alert("Errore Reset"); }
}

function reloadMap() { map.invalidateSize(); }
function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }
window.onload = initMap;
