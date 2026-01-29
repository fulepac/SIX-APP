const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
let activeObjMarkers = [];

// 1. GESTIONE UI MASTER (Questa DEVE funzionare subito)
function toggleMasterTools() {
    const check = document.getElementById("isMaster");
    const tools = document.getElementById("masterTools");
    tools.style.display = check.checked ? "block" : "none";
}

// 2. CONTROLLO SERVER ALL'AVVIO
async function checkStatus() {
    const banner = document.getElementById("status");
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key": SECRET_KEY}, cache: 'no-store' });
        const data = await res.json();
        if (data.record.game?.started) {
            banner.innerText = "⚠️ PARTITA IN CORSO";
            banner.style.color = "red";
        } else {
            banner.innerText = "✅ SERVER DISPONIBILE";
            banner.style.color = "#00ff00";
        }
    } catch (e) {
        banner.innerText = "❌ ERRORE CONNESSIONE";
        banner.style.color = "orange";
    }
}

// 3. GENERAZIONE SLOT
function initSlots() {
    const container = document.getElementById("objSlotContainer");
    if (!container) return;
    const defaults = [{n:"ALFA", la:45.238376, lo:8.810060}, {n:"BRAVO", la:45.237648, lo:8.810941}];
    for(let i=0; i<10; i++) {
        const d = defaults[i] || {n:`OBJ${i+1}`, la:0, lo:0};
        container.innerHTML += `
            <div class="obj-slot" style="display:flex; gap:2px; margin-bottom:2px;">
                <input type="checkbox" class="act" ${i<2?'checked':''}>
                <input type="text" class="nm" value="${d.n}" style="width:40px; font-size:10px;">
                <input type="number" class="lt" value="${d.la}" style="width:70px; font-size:10px;">
                <input type="number" class="ln" value="${d.lo}" style="width:70px; font-size:10px;">
            </div>`;
    }
}

// 4. MAPPA E BUSSOLA
const map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

function handleOrientation(e) {
    let heading = e.webkitCompassHeading || (360 - e.alpha);
    if (heading) {
        document.getElementById("map-rotate-wrapper").style.transform = `rotate(${-heading}deg)`;
        document.getElementById("compass-needle").style.transform = `rotate(${-heading}deg)`;
    }
}

// 5. AVVIO
async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;

    if (!state.playerName) return alert("Inserisci il tuo nome!");
    if (state.isMaster && document.getElementById("masterPass").value !== "71325") return alert("Password Master Errata!");

    // Permessi Bussola
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().catch(() => console.log("Permesso negato"));
    }
    window.addEventListener('deviceorientation', handleOrientation);

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";

    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo]).addTo(map).bindTooltip("TU", {permanent:true});
        else state.playerMarker.setLatLng([la,lo]);
    }, null, {enableHighAccuracy:true});

    setInterval(sync, 4000);
}

// 6. LOGICA E SYNC
async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        let { record } = await res.json();
        
        if (state.isMaster) {
            if (!record.game.started) {
                record.game.started = true;
                record.objectives = [];
                const slots = document.querySelectorAll(".obj-slot");
                slots.forEach(s => {
                    if (s.querySelector(".act").checked) {
                        record.objectives.push({
                            name: s.querySelector(".nm").value,
                            lat: parseFloat(s.querySelector(".lt").value),
                            lon: parseFloat(s.querySelector(".ln").value),
                            owner: "LIBERO", start: null
                        });
                    }
                });
            }
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    activeObjMarkers.forEach(m => map.removeLayer(m));
    activeObjMarkers = [];
    
    (r.objectives || []).forEach(obj => {
        sb.innerHTML += `<li>${obj.name}: ${obj.owner}</li>`;
        let col = obj.owner === "RED" ? "red" : obj.owner === "BLUE" ? "cyan" : "white";
        activeObjMarkers.push(L.circle([obj.lat, obj.lon], {radius:20, color:col}).addTo(map));
    });
}

function centerMap() { if(state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

async function resetBin() {
    if(!confirm("Vuoi resettare il server?")) return;
    const initialData = { game: {started: false}, players: {}, objectives: [] };
    await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(initialData)});
    location.reload();
}

window.onload = () => {
    initSlots();
    checkStatus();
};
