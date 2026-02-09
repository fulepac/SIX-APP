const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// Obiettivi di default se il database è vuoto
const DEFAULT_OBJS = [
    { name: "ALFA", lat: 45.2377, lon: 8.8097 },
    { name: "BRAVO", lat: 45.2385, lon: 8.8105 },
    { name: "CHARLIE", lat: 45.2369, lon: 8.8115 },
    { name: "DELTA", lat: 45.2392, lon: 8.8085 },
    { name: "ECHO", lat: 45.2360, lon: 8.8075 }
];

let state = {
    isMaster: false, playerName: "", playerTeam: "", 
    playerMarker: null, autoCenter: true, selectedMode: "DOMINATION",
    targetObj: null, navLine: null, activeMarkers: []
};

let map;

// --- GESTIONE MASTER ---

function checkMasterPass() {
    if(document.getElementById("masterPass").value === "71325") {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        initMasterObjEditor();
    }
}

function initMasterObjEditor() {
    const container = document.getElementById("masterObjInputs");
    container.innerHTML = ""; // Pulisci
    DEFAULT_OBJS.forEach((obj, i) => {
        container.innerHTML += `
            <div class="obj-row-edit" id="row-obj-${i}">
                <input type="text" class="obj-name-in" value="${obj.name}" id="name-${i}">
                <input type="number" class="obj-coord-in" value="${obj.lat}" id="lat-${i}" step="0.0001">
                <input type="number" class="obj-coord-in" value="${obj.lon}" id="lon-${i}" step="0.0001">
            </div>
        `;
    });
}

function selectGameMode(m) {
    state.selectedMode = m;
    document.getElementById("btnDomination").className = m === 'DOMINATION' ? 'mode-btn active' : 'mode-btn';
    document.getElementById("btnRecon").className = m === 'RECON' ? 'mode-btn active' : 'mode-btn';
}

// --- CORE GIOCO ---

async function requestPermissions() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const res = await DeviceOrientationEvent.requestPermission();
            if (res === 'granted') window.addEventListener('deviceorientation', handleOrientation);
        } catch (e) {}
    } else {
        window.addEventListener('deviceorientation', handleOrientation);
    }
    startGame();
}

function handleOrientation(e) {
    let heading = e.webkitCompassHeading || (360 - e.alpha);
    if (heading) {
        const rotateEl = document.getElementById("map-rotate");
        if(rotateEl) rotateEl.style.transform = `rotate(${-heading}deg)`;
    }
}

function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME OPERATORE!");

    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "flex";

    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {subdomains:['mt0','mt1','mt2','mt3'], maxZoom: 21}).addTo(map);

    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if(!state.playerMarker) {
            state.playerMarker = L.circleMarker(pos, {radius: 9, color: '#fff', fillColor: '#007bff', fillOpacity: 1, weight: 3}).addTo(map);
            map.setView(pos, 19);
        } else {
            state.playerMarker.setLatLng(pos);
            if(state.autoCenter) map.panTo(pos);
        }
        if(state.targetObj) updateNavigationHUD();
    }, null, {enableHighAccuracy: true});

    map.on('dragstart', () => state.autoCenter = false);
    setInterval(sync, 4000);
}

// --- SINCRONIZZAZIONE ---

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key": SECRET_KEY}, cache: 'no-store' });
        let { record } = await res.json();
        
        const myPos = state.playerMarker.getLatLng();
        if(!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: myPos.lat, lon: myPos.lng, last: Date.now() };

        const captureTimeLimit = parseInt(document.getElementById("captureTime").value) || 180;
        
        record.objectives.forEach(obj => {
            const near = Object.values(record.players).filter(p => (Date.now() - p.last < 10000) && getDistance(p.lat, p.lon, obj.lat, obj.lon) < 15);
            const reds = near.some(p => p.team === 'RED');
            const blues = near.some(p => p.team === 'BLUE');

            if (reds && blues) { obj.contested = true; } 
            else {
                obj.contested = false;
                let activeTeam = reds ? 'RED' : (blues ? 'BLUE' : null);
                if (activeTeam && obj.owner !== activeTeam) {
                    obj.progress = (obj.progress || 0) + 4;
                    if (obj.progress >= captureTimeLimit) { obj.owner = activeTeam; obj.progress = 0; }
                } else { obj.progress = 0; }
            }
        });

        if(state.isMaster && record.game.mode === 'DOMINATION') {
            record.objectives.forEach(o => {
                if(o.owner === 'RED') record.game.scoreRed += 1;
                if(o.owner === 'BLUE') record.game.scoreBlue += 1;
            });
        }

        updateUI(record);
        await fetch(URL, { method: "PUT", headers: {"Content-Type": "application/json", "X-Master-Key": SECRET_KEY}, body: JSON.stringify(record) });
    } catch (e) {}
}

function updateUI(r) {
    const elapsed = Math.floor((Date.now() - r.game.start) / 1000);
    const remain = (r.game.duration * 60) - elapsed;
    document.getElementById("timer").innerText = remain > 0 ? `⏱️ ${Math.floor(remain/60)}:${(remain%60).toString().padStart(2,'0')}` : "FINE";
    
    document.getElementById("scoreRed").innerText = Math.floor(r.game.scoreRed/10);
    document.getElementById("scoreBlue").innerText = Math.floor(r.game.scoreBlue/10);
    
    state.activeMarkers.forEach(m => map.removeLayer(m));
    state.activeMarkers = [];

    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    r.objectives.forEach(obj => {
        let color = obj.owner === 'RED' ? '#f00' : (obj.owner === 'BLUE' ? '#0ff' : '#fff');
        if(obj.contested) color = 'yellow';
        
        let li = document.createElement("li");
        li.style.borderLeft = `5px solid ${color}`;
        li.style.paddingLeft = "10px";
        li.innerHTML = `<b>${obj.name}</b><br><small>${obj.contested ? 'CONTESO' : obj.owner}</small>`;
        li.onclick = () => startNavigation(obj);
        sb.appendChild(li);

        state.activeMarkers.push(L.circle([obj.lat, obj.lon], {radius: 15, color: color, weight: 2, fillOpacity: 0.3}).addTo(map));
    });

    const pl = document.getElementById("playerList");
    pl.innerHTML = "";
    Object.entries(r.players).forEach(([name, p]) => {
        if(Date.now() - p.last < 30000 && p.team === state.playerTeam && name !== state.playerName) {
            const d = getDistance(p.lat, p.lon, state.playerMarker.getLatLng().lat, state.playerMarker.getLatLng().lng);
            pl.innerHTML += `<li>${name} (${d}m)</li>`;
            state.activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius: 6, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
        }
    });
}

// --- RESET DATABASE CON GESTIONE OB ---

async function resetDatabase() {
    if(!confirm("ATTENZIONE: Questo sovrascriverà i nomi e le posizioni degli obiettivi. Procedere?")) return;

    // Leggi i nuovi dati dagli input del Master
    let newObjectives = [];
    for(let i=0; i < DEFAULT_OBJS.length; i++) {
        const name = document.getElementById(`name-${i}`).value.trim().toUpperCase();
        const lat = parseFloat(document.getElementById(`lat-${i}`).value);
        const lon = parseFloat(document.getElementById(`lon-${i}`).value);
        if(name) {
            newObjectives.push({ name, lat, lon, owner: "LIBERO", progress: 0 });
        }
    }

    const initialData = {
        game: { 
            mode: state.selectedMode, 
            scoreRed: 0, scoreBlue: 0, 
            start: Date.now(), 
            duration: parseInt(document.getElementById("gameDuration").value) 
        },
        players: {},
        objectives: newObjectives
    };

    try {
        await fetch(URL, {
            method: "PUT",
            headers: {"Content-Type": "application/json", "X-Master-Key": SECRET_KEY},
            body: JSON.stringify(initialData)
        });
        alert("CONFIGURAZIONE CARICATA CON SUCCESSO!");
    } catch (e) {
        alert("Errore durante il caricamento.");
    }
}

// --- UTILITY ---

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function startNavigation(obj) {
    state.targetObj = obj;
    document.getElementById("nav-overlay").style.display = "flex";
    updateNavigationHUD();
}

function stopNavigation() {
    state.targetObj = null;
    if(state.navLine) map.removeLayer(state.navLine);
    document.getElementById("nav-overlay").style.display = "none";
}

function updateNavigationHUD() {
    if(!state.targetObj || !state.playerMarker) return;
    const p1 = state.playerMarker.getLatLng();
    const p2 = [state.targetObj.lat, state.targetObj.lon];
    const dist = getDistance(p1.lat, p1.lng, p2[0], p2[1]);
    document.getElementById("nav-text").innerText = `NAV: ${state.targetObj.name} - ${dist}m`;
    if(state.navLine) map.removeLayer(state.navLine);
    state.navLine = L.polyline([p1, p2], {color: 'yellow', weight: 3, dashArray: '10, 10'}).addTo(map);
}

function centerMap() {
    state.autoCenter = true;
    if(state.playerMarker) map.panTo(state.playerMarker.getLatLng());
}
