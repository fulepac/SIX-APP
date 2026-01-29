const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let allyMarkers = {}; 
let objMarkers = [];
let map;

function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'] }).addTo(map);
}

function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
    }
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME");

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";

    // Fix fondamentale per far apparire la mappa e far partire il tempo
    setTimeout(() => {
        map.invalidateSize();
        navigator.geolocation.getCurrentPosition(p => {
            const pos = [p.coords.latitude, p.coords.longitude];
            map.setView(pos, 18);
            state.playerMarker = L.marker(pos).addTo(map).bindTooltip("IO", {permanent:true});
            sync(); // Prima sincronizzazione forzata
        }, () => alert("GPS NECESSARIO"), {enableHighAccuracy:true});
    }, 500);

    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        
        if(state.playerMarker) {
            record.players[state.playerName] = {
                team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now()
            };
        }

        if(state.isMaster && !record.game.started) {
            record.game.started = true;
            record.game.start = Date.now(); // Fissa l'inizio tempo
            record.game.score = {RED:0, BLUE:0};
            record.objectives = [{name:"ALPHA", lat:state.playerMarker.getLatLng().lat + 0.0002, lon:state.playerMarker.getLatLng().lng, owner:"LIBERO"}];
        }

        if(state.isMaster || state.playerMarker) {
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    // Gestione Timer
    if(r.game.start) {
        const diff = Math.floor((Date.now() - r.game.start) / 1000);
        const m = Math.floor(diff / 60);
        const s = diff % 60;
        document.getElementById("timer").innerText = `⏱️ ${m}:${s.toString().padStart(2,'0')}`;
    }

    const banner = document.getElementById("gameStatusBanner");
    banner.innerText = r.game.started ? "OPERAZIONE ATTIVA" : "SISTEMA PRONTO";
    banner.className = r.game.started ? "status-banner status-active" : "status-banner";

    // Pulisci e disegna
    objMarkers.forEach(m => map.removeLayer(m)); objMarkers = [];
    
    // Squadra
    const pList = document.getElementById("playerList"); pList.innerHTML = "";
    Object.entries(r.players).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000 && p.team === state.playerTeam) {
            pList.innerHTML += `<li>${name} <span>ONLINE</span></li>`;
            if(name !== state.playerName) {
                objMarkers.push(L.circleMarker([p.lat, p.lon], {radius:7, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
            }
        }
    });

    // Obiettivi
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    r.objectives.forEach(obj => {
        sb.innerHTML += `<li>${obj.name}: ${obj.owner}</li>`;
        objMarkers.push(L.circle([obj.lat, obj.lon], {radius:15, color: obj.owner==='RED'?'red':obj.owner==='BLUE'?'cyan':'white'}).addTo(map));
    });
}

function reloadMap() { map.invalidateSize(); }
function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }
async function resetBin() { if(confirm("RESET TOTALE?")) { await fetch(URL, {method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{started:false}, players:{}, objectives:[]})}); location.reload(); }}
window.onload = initMap;
