const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = {
    isMaster: false, playerName: "", playerTeam: "", 
    playerMarker: null, autoCenter: true, 
    targetObj: null, navLine: null, activeMarkers: []
};
let map;

function checkMasterPass() {
    if (document.getElementById("masterPass").value === "71325") {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
    }
}

async function requestPermissions() {
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const res = await DeviceOrientationEvent.requestPermission();
            if (res === 'granted') window.addEventListener('deviceorientation', (e) => {
                let heading = e.webkitCompassHeading || (360 - e.alpha);
                if (heading) document.getElementById("map-rotate").style.transform = `rotate(${-heading}deg)`;
            });
        } catch (e) {}
    } else {
        window.addEventListener('deviceorientation', (e) => {
            let heading = e.webkitCompassHeading || (360 - e.alpha);
            if (heading) document.getElementById("map-rotate").style.transform = `rotate(${-heading}deg)`;
        });
    }
    startGame();
}

function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if (!state.playerName) return alert("INSERISCI NOME!");

    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "flex";

    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}').addTo(map);

    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if (!state.playerMarker) {
            state.playerMarker = L.circleMarker(pos, { radius: 9, color: '#fff', fillColor: '#007bff', fillOpacity: 1 }).addTo(map);
            map.setView(pos, 19);
        } else {
            state.playerMarker.setLatLng(pos);
            if (state.autoCenter) map.panTo(pos);
        }
        if (state.targetObj) updateNavHUD();
    }, null, { enableHighAccuracy: true });

    map.on('dragstart', () => state.autoCenter = false);
    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: { "X-Master-Key": SECRET_KEY }, cache: 'no-store' });
        let { record } = await res.json();
        
        const myPos = state.playerMarker.getLatLng();
        if (!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: myPos.lat, lon: myPos.lng, last: Date.now() };

        // Calcolo catture (se sei entro 15 metri da un OB)
        record.objectives.forEach(obj => {
            const dist = getDist(myPos.lat, myPos.lng, obj.lat, obj.lon);
            if (dist < 15) {
                if (obj.owner !== state.playerTeam) {
                    obj.progress = (obj.progress || 0) + 4;
                    if (obj.progress >= 180) { obj.owner = state.playerTeam; obj.progress = 0; }
                }
            }
        });

        // Punteggio (Solo il Master calcola per evitare conflitti)
        if (state.isMaster) {
            record.objectives.forEach(o => {
                if (o.owner === 'RED') record.game.scoreRed += 1;
                if (o.owner === 'BLUE') record.game.scoreBlue += 1;
            });
        }

        updateUI(record);
        await fetch(URL, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY }, body: JSON.stringify(record) });
    } catch (e) {}
}

function updateUI(r) {
    const remain = (r.game.duration * 60) - Math.floor((Date.now() - r.game.start) / 1000);
    document.getElementById("timer").innerText = remain > 0 ? `⏱️ ${Math.floor(remain/60)}:${(remain%60).toString().padStart(2,'0')}` : "FINE";
    document.getElementById("score").innerText = `R: ${Math.floor(r.game.scoreRed/10)} | B: ${Math.floor(r.game.scoreBlue/10)}`;
    
    state.activeMarkers.forEach(m => map.removeLayer(m));
    state.activeMarkers = [];

    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    r.objectives.forEach(obj => {
        let color = obj.owner === 'RED' ? '#f00' : (obj.owner === 'BLUE' ? '#0ff' : '#fff');
        let li = document.createElement("li");
        li.style.color = color;
        li.innerHTML = `[${obj.owner}] ${obj.name}`;
        li.onclick = () => startNav(obj);
        sb.appendChild(li);
        state.activeMarkers.push(L.circle([obj.lat, obj.lon], { radius: 15, color: color, weight: 2, fillOpacity: 0.3 }).addTo(map));
    });

    const pl = document.getElementById("playerList");
    pl.innerHTML = "";
    Object.entries(r.players).forEach(([name, p]) => {
        if (Date.now() - p.last < 30000 && p.team === state.playerTeam && name !== state.playerName) {
            pl.innerHTML += `<li>${name} (${getDist(p.lat, p.lon, state.playerMarker.getLatLng().lat, state.playerMarker.getLatLng().lng)}m)</li>`;
            state.activeMarkers.push(L.circleMarker([p.lat, p.lon], { radius: 6, color: p.team === 'RED' ? 'red' : 'cyan', fillOpacity: 1 }).addTo(map));
        }
    });
}

async function resetDatabase() {
    if (!confirm("AVVIARE NUOVA MISSIONE?")) return;
    let objs = [];
    document.querySelectorAll(".obj-row-edit").forEach(row => {
        const inputs = row.querySelectorAll("input");
        objs.push({ name: inputs[0].value.toUpperCase(), lat: parseFloat(inputs[1].value), lon: parseFloat(inputs[2].value), owner: "LIBERO", progress: 0 });
    });

    const data = {
        game: { scoreRed: 0, scoreBlue: 0, start: Date.now(), duration: parseInt(document.getElementById("gameDuration").value) || 30 },
        players: {},
        objectives: objs
    };
    await fetch(URL, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY }, body: JSON.stringify(data) });
    alert("CONFIGURAZIONE INVIATA!");
}

function getDist(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) * Math.sin(dLat / 2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function startNav(obj) {
    state.targetObj = obj;
    document.getElementById("nav-overlay").style.display = "flex";
}

function stopNavigation() {
    state.targetObj = null;
    if (state.navLine) map.removeLayer(state.navLine);
    document.getElementById("nav-overlay").style.display = "none";
}

function updateNavHUD() {
    const p1 = state.playerMarker.getLatLng();
    const d = getDist(p1.lat, p1.lng, state.targetObj.lat, state.targetObj.lon);
    document.getElementById("nav-text").innerText = `${state.targetObj.name}: ${d}m`;
    if (state.navLine) map.removeLayer(state.navLine);
    state.navLine = L.polyline([p1, [state.targetObj.lat, state.targetObj.lon]], { color: 'yellow', weight: 3, dashArray: '10, 10' }).addTo(map);
}

function centerMap() { state.autoCenter = true; map.panTo(state.playerMarker.getLatLng()); }
