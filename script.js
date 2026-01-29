const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_CORRECT = "71325"; 

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let allyMarkers = {}; 
let activeMarkers = [];
let lastOwners = {};

const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function beep() {
    const o = audioCtx.createOscillator(); const g = audioCtx.createGain();
    o.connect(g); g.connect(audioCtx.destination);
    o.frequency.value = 900; g.gain.value = 0.1;
    o.start(); o.stop(audioCtx.currentTime + 0.2);
}

// Setup Mappa
const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

function checkMasterPass() {
    const input = document.getElementById("masterPass").value;
    if(input === PWD_CORRECT) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        document.getElementById("masterPass").style.background = "#004400";
        document.getElementById("mainBtn").innerText = "▶ AVVIA PARTITA (MASTER)";
    }
}

function reloadMap() { map.eachLayer(l => { if(l instanceof L.TileLayer) l.redraw(); }); map.invalidateSize(); }
function centerMap() { if (state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

function updateTeamLabels() {
    document.getElementById("optTeam1").innerText = (document.getElementById("team1Name").value || "RED") + " (ROSSO)";
    document.getElementById("optTeam2").innerText = (document.getElementById("team2Name").value || "BLUE") + " (BLU)";
}

function initSlotUI() {
    const container = document.getElementById("objSlotContainer");
    const DEFAULTS = [{n:"PF1", la:45.238376, lo:8.810060}, {n:"PF2", la:45.237648, lo:8.810941}, {n:"PF3", la:45.238634, lo:8.808772}];
    container.innerHTML = "";
    for (let i = 0; i < 10; i++) {
        const d = DEFAULTS[i] || { n: `OBJ${i+1}`, la: 0, lo: 0 };
        container.innerHTML += `<div class="obj-slot">
            <input type="checkbox" class="s-active" ${i<3?'checked':''}>
            <input type="text" class="s-name" value="${d.n}">
            <input type="text" class="s-lat" value="${d.la}">
            <input type="text" class="s-lon" value="${d.lo}">
        </div>`;
    }
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME OPERATORE!");
    if(audioCtx.state === 'suspended') audioCtx.resume();

    document.getElementById("menu").style.display="none"; 
    document.getElementById("game-ui").style.display="block";
    
    // IMPORTANTE: Forza il caricamento grafico della mappa
    setTimeout(() => { map.invalidateSize(); }, 600);

    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) {
            state.playerMarker = L.marker([la,lo]).addTo(map).bindTooltip("IO", {permanent:true});
            map.setView([la,lo], 18);
        } else state.playerMarker.setLatLng([la,lo]);
    }, () => alert("GPS NON DISPONIBILE"), {enableHighAccuracy:true});

    setInterval(sync, 4000);
}

async function sync() {
    if(!state.playerMarker) return;
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        
        const banner = document.getElementById("gameStatusBanner");
        banner.innerText = record.game.started ? "OPERAZIONE IN CORSO" : "ATTESA MASTER...";
        banner.className = record.game.started ? "status-banner status-active" : "status-banner";
        
        if(!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now() };
        
        if(state.isMaster) {
            if(!record.game.started) {
                record.game.started = true;
                record.game.teamNames = { RED: document.getElementById("team1Name").value, BLUE: document.getElementById("team2Name").value };
                record.game.conquerTime = (parseInt(document.getElementById("conquerTime").value)||3) * 60000;
                record.objectives = [];
                document.querySelectorAll(".obj-slot").forEach(s => {
                    if(s.querySelector(".s-active").checked) {
                        record.objectives.push({ name: s.querySelector(".s-name").value, lat: parseFloat(s.querySelector(".s-lat").value), lon: parseFloat(s.querySelector(".s-lon").value), owner: "LIBERO" });
                    }
                });
            }
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e) {
        document.getElementById("gameStatusBanner").innerText = "ERRORE CONNESSIONE";
    }
}

function updateUI(r) {
    const t1 = r.game.teamNames?.RED || "RED";
    const t2 = r.game.teamNames?.BLUE || "BLUE";
    document.getElementById("score").innerHTML = `🔴 ${t1}: ${r.game.score.RED} | 🔵 ${t2}: ${r.game.score.BLUE}`;
    
    // VISIBILITÀ: Solo compagni di squadra
    const pList = document.getElementById("playerList"); pList.innerHTML = "";
    Object.entries(r.players).forEach(([name, p]) => {
        if(Date.now() - p.last < 15000 && p.team === state.playerTeam) {
            pList.innerHTML += `<li>${name} <span>ONLINE</span></li>`;
            if(name !== state.playerName) {
                if(!allyMarkers[name]) allyMarkers[name] = L.circleMarker([p.lat, p.lon], {radius:7, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map);
                else allyMarkers[name].setLatLng([p.lat, p.lon]);
            }
        } else {
            // Rimuovi se offline o nemico
            if(allyMarkers[name]) { map.removeLayer(allyMarkers[name]); delete allyMarkers[name]; }
        }
    });

    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    activeMarkers.forEach(m => map.removeLayer(m)); activeMarkers = [];
    r.objectives.forEach(obj => {
        if(lastOwners[obj.name] && lastOwners[obj.name] !== obj.owner) beep();
        lastOwners[obj.name] = obj.owner;
        const oName = obj.owner === "RED" ? t1 : (obj.owner === "BLUE" ? t2 : "LIBERO");
        sb.innerHTML += `<li>${obj.name}: <strong>${oName}</strong></li>`;
        activeMarkers.push(L.circle([obj.lat, obj.lon], {radius:15, color: obj.owner==='RED'?'red':obj.owner==='BLUE'?'cyan':'white'}).addTo(map));
    });
}

async function resetBin() { 
    if(!state.isMaster) return;
    if(confirm("VUOI CANCELLARE TUTTO E RESETTARE IL SERVER?")) { 
        await fetch(URL, {method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{started:false, score:{RED:0,BLUE:0}}, players:{}, objectives:[]})}); 
        location.reload(); 
    }
}
window.onload = initSlotUI;
