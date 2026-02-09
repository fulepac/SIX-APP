const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// Obiettivi di base caricati subito se non ce ne sono
const DEFAULT_OBJS = [
    { name: "ALFA", lat: 45.2377, lon: 8.8097 },
    { name: "BRAVO", lat: 45.2385, lon: 8.8105 },
    { name: "CHARLIE", lat: 45.2369, lon: 8.8115 },
    { name: "DELTA", lat: 45.2392, lon: 8.8085 },
    { name: "ECHO", lat: 45.2360, lon: 8.8075 }
];

let state = {
    isMaster: false, playerName: "", playerTeam: "", playerMarker: null,
    autoCenter: true, selectedMode: "DOMINATION", targetObj: null, navLine: null,
    activeMarkers: []
};
let map;

// --- FUNZIONE CRUCIALE: POPOLA LISTA MASTER ---
function checkMasterPass() {
    if(document.getElementById("masterPass").value === "71325") {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        
        // Se la lista è vuota, carichiamo i default per permettere l'edit
        const container = document.getElementById("masterObjInputs");
        if(container.innerHTML.trim() === "") {
            DEFAULT_OBJS.forEach(obj => addObjRow(obj.name, obj.lat, obj.lon));
        }
    }
}

function addObjRow(name="", lat="", lon="") {
    const div = document.createElement("div");
    div.className = "obj-row-edit";
    div.innerHTML = `
        <input type="text" placeholder="Nome" class="in-name" value="${name}" style="width:30%">
        <input type="number" placeholder="Lat" class="in-lat" value="${lat}" style="width:35%" step="0.000001">
        <input type="number" placeholder="Lon" class="in-lon" value="${lon}" style="width:35%" step="0.000001">
    `;
    document.getElementById("masterObjInputs").appendChild(div);
}

function selectGameMode(m) {
    state.selectedMode = m;
    document.querySelectorAll('.mode-btn').forEach(b => b.classList.remove('active'));
    if(m === 'DOMINATION') document.getElementById('btnDomination').classList.add('active');
    else document.getElementById('btnRecon').classList.add('active');
}

// --- LOGICA GIOCO ---
async function requestPermissions() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try { await DeviceOrientationEvent.requestPermission(); } catch(e){}
    }
    window.addEventListener('deviceorientation', (e) => {
        let h = e.webkitCompassHeading || (360 - e.alpha);
        if(h) {
            const el = document.getElementById("map-rotate");
            if(el) el.style.transform = `rotate(${-h}deg)`;
        }
    });
    startGame();
}

function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("Inserisci Nome Operatore!");

    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "flex";

    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}').addTo(map);

    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if(!state.playerMarker) {
            state.playerMarker = L.circleMarker(pos, {radius: 8, color: '#fff', fillColor: '#007bff', fillOpacity: 1}).addTo(map);
            map.setView(pos, 19);
        } else {
            state.playerMarker.setLatLng(pos);
            if(state.autoCenter) map.panTo(pos);
        }
        if(state.targetObj) updateNavHUD();
    }, null, {enableHighAccuracy: true});

    map.on('dragstart', () => state.autoCenter = false);
    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key": SECRET_KEY}, cache: 'no-store' });
        let { record } = await res.json();
        
        const myPos = state.playerMarker.getLatLng();
        if(!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: myPos.lat, lon: myPos.lng, last: Date.now() };

        const capTime = parseInt(document.getElementById("captureTime").value) || 180;
        
        record.objectives.forEach(obj => {
            const near = Object.values(record.players).filter(p => (Date.now() - p.last < 10000) && getDist(p.lat, p.lon, obj.lat, obj.lon) < 15);
            const reds = near.some(p => p.team === 'RED');
            const blues = near.some(p => p.team === 'BLUE');

            if(reds && blues) obj.contested = true;
            else {
                obj.contested = false;
                let activeTeam = reds ? 'RED' : (blues ? 'BLUE' : null);
                if(activeTeam && obj.owner !== activeTeam) {
                    obj.progress = (obj.progress || 0) + 4;
                    if(obj.progress >= capTime) { obj.owner = activeTeam; obj.progress = 0; }
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
    } catch(e){}
}

function updateUI(r) {
    const elapsed = Math.floor((Date.now() - r.game.start) / 1000);
    const remain = (r.game.duration * 60) - elapsed;
    document.getElementById("timer").innerText = remain > 0 ? `⏱️ ${Math.floor(remain/60)}:${(remain%60).toString().padStart(2,'0')}` : "FINE";
    document.getElementById("scoreRed").innerText = Math.floor(r.game.scoreRed/10);
    document.getElementById("scoreBlue").innerText = Math.floor(r.game.scoreBlue/10);
    
    state.activeMarkers.forEach(m => map.removeLayer(m));
    state.activeMarkers = [];

    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    r.objectives.forEach(obj => {
        let col = obj.owner==='RED'?'#f44':(obj.owner==='BLUE'?'#4df':'#fff');
        if(obj.contested) col = 'yellow';
        
        let li = document.createElement("li");
        li.style.borderLeft = `4px solid ${col}`;
        li.style.paddingLeft = "8px";
        li.innerHTML = `<b>${obj.name}</b> - <span style="color:${col}">${obj.contested?'CONTESO':obj.owner}</span>`;
        li.onclick = () => { state.targetObj = obj; document.getElementById("nav-overlay").style.display="flex"; updateNavHUD(); };
        sb.appendChild(li);

        state.activeMarkers.push(L.circle([obj.lat, obj.lon], {radius: 15, color: col, fillOpacity: 0.2, weight: 1}).addTo(map));
    });

    const pl = document.getElementById("playerList"); pl.innerHTML = "";
    Object.entries(r.players).forEach(([n, p]) => {
        if(Date.now()-p.last < 30000 && p.team === state.playerTeam && n !== state.playerName) {
            const d = getDist(p.lat, p.lon, state.playerMarker.getLatLng().lat, state.playerMarker.getLatLng().lng);
            pl.innerHTML += `<li>${n} (${d}m)</li>`;
            state.activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius: 5, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
        }
    });
}

async function resetDatabase() {
    if(!confirm("Vuoi azzerare la partita e caricare i nuovi obiettivi?")) return;
    let objs = [];
    document.querySelectorAll(".obj-row-edit").forEach(row => {
        const name = row.querySelector(".in-name").value.toUpperCase();
        const lat = parseFloat(row.querySelector(".in-lat").value);
        const lon = parseFloat(row.querySelector(".in-lon").value);
        if(name && !isNaN(lat) && !isNaN(lon)) {
            objs.push({name, lat, lon, owner:"LIBERO", progress:0});
        }
    });

    if(objs.length === 0) return alert("Inserisci almeno un obiettivo valido!");

    const data = {
        game: { mode: state.selectedMode, scoreRed: 0, scoreBlue: 0, start: Date.now(), duration: parseInt(document.getElementById("gameDuration").value) },
        players: {},
        objectives: objs
    };
    await fetch(URL, { method: "PUT", headers: {"Content-Type": "application/json", "X-Master-Key": SECRET_KEY}, body: JSON.stringify(data) });
    alert("PARTITA AVVIATA!");
}

function getDist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2-lat1)*Math.PI/180;
    const dLon = (lon2-lon1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(lat1*Math.PI/180)*Math.cos(lat2*Math.PI/180)*Math.sin(dLon/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function updateNavHUD() {
    if(!state.targetObj || !state.playerMarker) return;
    const d = getDist(state.playerMarker.getLatLng().lat, state.playerMarker.getLatLng().lng, state.targetObj.lat, state.targetObj.lon);
    document.getElementById("nav-text").innerText = `${state.targetObj.name}: ${d}m`;
    if(state.navLine) map.removeLayer(state.navLine);
    state.navLine = L.polyline([state.playerMarker.getLatLng(), [state.targetObj.lat, state.targetObj.lon]], {color:'yellow', weight: 2, dashArray:'5,10'}).addTo(map);
}

function stopNavigation() { state.targetObj = null; if(state.navLine) map.removeLayer(state.navLine); document.getElementById("nav-overlay").style.display="none"; }
function centerMap() { state.autoCenter = true; if(state.playerMarker) map.panTo(state.playerMarker.getLatLng()); }
