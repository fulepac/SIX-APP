const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null, autoCenter: true, targetObj: null, navLine: null, activeMarkers: [] };
let map;

// 1. GESTIONE MASTER
function checkMasterPass() {
    if (document.getElementById("masterPass").value === "71325") {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
    }
}

// 2. BUSSOLA E AVVIO
async function initApp() {
    state.playerName = document.getElementById("playerName").value.toUpperCase();
    if (!state.playerName) return alert("INSERISCI NOME!");
    state.playerTeam = document.getElementById("teamSelect").value;

    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        const res = await DeviceOrientationEvent.requestPermission();
        if (res === 'granted') window.addEventListener('deviceorientation', (e) => {
            let h = e.webkitCompassHeading || (360 - e.alpha);
            if (h) document.getElementById("map-rotate").style.transform = `rotate(${-h}deg)`;
        });
    } else {
        window.addEventListener('deviceorientation', (e) => {
            let h = e.webkitCompassHeading || (360 - e.alpha);
            if (h) document.getElementById("map-rotate").style.transform = `rotate(${-h}deg)`;
        });
    }
    
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "flex";
    
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}').addTo(map);

    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if (!state.playerMarker) {
            state.playerMarker = L.circleMarker(pos, { radius: 10, color: '#fff', fillColor: '#007bff', fillOpacity: 1 }).addTo(map);
        } else {
            state.playerMarker.setLatLng(pos);
            if (state.autoCenter) map.panTo(pos);
        }
    }, null, { enableHighAccuracy: true });

    setInterval(sync, 4000);
}

// 3. SINCRONIZZAZIONE E LOGICA
async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: { "X-Master-Key": SECRET_KEY }, cache: 'no-store' });
        let { record } = await res.json();
        const myPos = state.playerMarker.getLatLng();

        if (!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: myPos.lat, lon: myPos.lng, last: Date.now() };

        record.objectives.forEach(obj => {
            const d = getDist(myPos.lat, myPos.lng, obj.lat, obj.lon);
            if (d < 15 && obj.owner !== state.playerTeam) {
                obj.progress = (obj.progress || 0) + 4;
                if (obj.progress >= 180) { obj.owner = state.playerTeam; obj.progress = 0; }
            }
        });

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
    document.getElementById("score").innerText = `R: ${Math.floor(r.game.scoreRed/10)} | B: ${Math.floor(r.game.scoreBlue/10)}`;
    state.activeMarkers.forEach(m => map.removeLayer(m));
    state.activeMarkers = [];

    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    r.objectives.forEach(obj => {
        let col = obj.owner === 'RED' ? '#f00' : (obj.owner === 'BLUE' ? '#0ff' : '#fff');
        let li = document.createElement("li");
        li.style.color = col; li.innerHTML = `[${obj.owner}] ${obj.name}`;
        li.onclick = () => { state.targetObj = obj; document.getElementById("nav-overlay").style.display = "flex"; };
        sb.appendChild(li);
        state.activeMarkers.push(L.circle([obj.lat, obj.lon], { radius: 15, color: col, fillOpacity: 0.3 }).addTo(map));
    });

    const pl = document.getElementById("playerList"); pl.innerHTML = "";
    Object.entries(r.players).forEach(([n, p]) => {
        if (Date.now() - p.last < 30000 && p.team === state.playerTeam && n !== state.playerName) {
            pl.innerHTML += `<li>${n} (${getDist(p.lat, p.lon, state.playerMarker.getLatLng().lat, state.playerMarker.getLatLng().lng)}m)</li>`;
            state.activeMarkers.push(L.circleMarker([p.lat, p.lon], { radius: 7, color: p.team === 'RED' ? 'red' : 'cyan', fillOpacity: 1 }).addTo(map));
        }
    });
}

// 4. UTILITY
function getDist(la1, lo1, la2, lo2) {
    const R = 6371000;
    const dLat = (la2 - la1) * Math.PI / 180;
    const dLon = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

async function resetDatabase() {
    if (!confirm("RESET?")) return;
    let objs = [];
    document.querySelectorAll(".obj-row-edit").forEach(row => {
        const ins = row.querySelectorAll("input");
        objs.push({ name: ins[0].value.toUpperCase(), lat: parseFloat(ins[1].value), lon: parseFloat(ins[2].value), owner: "LIBERO", progress: 0 });
    });
    const data = { game: { scoreRed: 0, scoreBlue: 0, start: Date.now(), duration: 30 }, players: {}, objectives: objs };
    await fetch(URL, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY }, body: JSON.stringify(data) });
    alert("INVIATO!");
}

function stopNavigation() { state.targetObj = null; document.getElementById("nav-overlay").style.display = "none"; }
function centerMap() { state.autoCenter = true; map.panTo(state.playerMarker.getLatLng()); }
