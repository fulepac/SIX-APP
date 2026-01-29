const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325"; // Password ripristinata

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let allyMarkers = {}; 
let activeMarkers = [];
let map;

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep() {
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 900; g.gain.value = 0.1;
    o.start(); o.stop(audioCtx.currentTime + 0.2);
}

// Inizializzazione Mappa con Google Satellite
function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains:['mt0','mt1','mt2','mt3']
    }).addTo(map);
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

    setTimeout(() => {
        map.invalidateSize(); 
        navigator.geolocation.getCurrentPosition(p => {
            const pos = [p.coords.latitude, p.coords.longitude];
            map.setView(pos, 18);
            state.playerMarker = L.marker(pos).addTo(map).bindTooltip("IO", {permanent:true});
        });
    }, 500);

    setInterval(sync, 4000);
}

function reloadMap() { map.invalidateSize(); }
function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        
        if(state.playerMarker) {
            record.players[state.playerName] = {
                team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now()
            };
        }

        if(state.isMaster) {
            if(!record.game.started) {
                record.game.started = true;
                record.objectives = [{name:"ALPHA", lat:state.playerMarker.getLatLng().lat + 0.0002, lon:state.playerMarker.getLatLng().lng, owner:"LIBERO"}];
            }
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    activeMarkers.forEach(m => map.removeLayer(m));
    activeMarkers = [];
    
    // VISIBILITÀ: Solo compagni di squadra
    Object.entries(r.players).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000 && p.team === state.playerTeam && name !== state.playerName) {
            let m = L.circleMarker([p.lat, p.lon], {radius:7, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map);
            activeMarkers.push(m);
        }
    });

    r.objectives.forEach(obj => {
        let m = L.circle([obj.lat, obj.lon], {radius:15, color: obj.owner==='RED'?'red':obj.owner==='BLUE'?'cyan':'white'}).addTo(map);
        activeMarkers.push(m);
    });
}

window.onload = initMap;
