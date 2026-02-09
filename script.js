const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

const DEFAULT_OBJS = [
    { name: "ALFA", lat: 45.2377, lon: 8.8097 },
    { name: "BRAVO", lat: 45.2385, lon: 8.8105 },
    { name: "CHARLIE", lat: 45.2369, lon: 8.8115 }
];

let state = { isMaster: false, playerMarker: null, autoCenter: true };
let map;

// --- BUSSOLA: FORZA ROTAZIONE ---
function handleOrientation(e) {
    let heading = e.webkitCompassHeading || (360 - e.alpha);
    if (heading) {
        const rotateEl = document.getElementById("map-rotate");
        if (rotateEl) rotateEl.style.transform = `rotate(${-heading}deg)`;
    }
}

// --- MASTER: MOSTRA LISTA OBIETTIVI ALL'ISTANTE ---
function checkMasterPass() {
    if (document.getElementById("masterPass").value === "71325") {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        
        const container = document.getElementById("masterObjInputs");
        // Se il contenitore è vuoto, lo riempio subito con i default
        if (container.innerHTML === "") {
            DEFAULT_OBJS.forEach(obj => addObjRow(obj.name, obj.lat, obj.lon));
        }
    }
}

function addObjRow(name = "", lat = "", lon = "") {
    const container = document.getElementById("masterObjInputs");
    const div = document.createElement("div");
    div.style.display = "flex";
    div.style.gap = "2px";
    div.style.marginBottom = "5px";
    div.className = "obj-row-edit";
    div.innerHTML = `
        <input type="text" class="in-name" value="${name}" placeholder="Nome" style="width:30%; color:lime; font-size:12px;">
        <input type="number" class="in-lat" value="${lat}" placeholder="Lat" style="width:35%; color:lime; font-size:12px;">
        <input type="number" class="in-lon" value="${lon}" placeholder="Lon" style="width:35%; color:lime; font-size:12px;">
    `;
    container.appendChild(div);
}

// --- PERMESSI E AVVIO ---
async function requestPermissions() {
    // Richiesta per iOS
    if (DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const response = await DeviceOrientationEvent.requestPermission();
        if (response === 'granted') {
            window.addEventListener('deviceorientation', handleOrientation);
        }
    } else {
        // Android e altri
        window.addEventListener('deviceorientation', handleOrientation);
    }
    startGame();
}

function startGame() {
    if (!document.getElementById("playerName").value) return alert("Metti il nome!");
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "flex";

    map = L.map('map', { zoomControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}').addTo(map);

    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if (!state.playerMarker) {
            state.playerMarker = L.circleMarker(pos, { radius: 8, color: '#fff', fillColor: '#007bff', fillOpacity: 1 }).addTo(map);
        } else {
            state.playerMarker.setLatLng(pos);
            if (state.autoCenter) map.panTo(pos);
        }
    }, null, { enableHighAccuracy: true });
}

async function resetDatabase() {
    if (!confirm("Reset?")) return;
    let objs = [];
    document.querySelectorAll(".obj-row-edit").forEach(row => {
        const n = row.querySelector(".in-name").value;
        const la = parseFloat(row.querySelector(".in-lat").value);
        const lo = parseFloat(row.querySelector(".in-lon").value);
        if (n && la) objs.push({ name: n, lat: la, lon: lo, owner: "LIBERO", progress: 0 });
    });

    const data = {
        game: { mode: "DOMINATION", scoreRed: 0, scoreBlue: 0, start: Date.now(), duration: 30 },
        players: {},
        objectives: objs
    };

    await fetch(URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY },
        body: JSON.stringify(data)
    });
    alert("PARTITA AVVIATA!");
}
