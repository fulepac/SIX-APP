const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const API_URL = "https://api.jsonbin.io/v3/b/" + BIN_ID;

let state = { 
    isMaster: false, playerName: "", playerTeam: "", 
    playerMarker: null, autoCenter: true, targetObj: null, 
    activeMarkers: [], teamNames: { RED: "ROSSI", BLUE: "BLU" }
};
let map;

function checkMasterPass() {
    if (document.getElementById("masterPass").value === "71325") {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        if (document.getElementById("masterObjInputs").innerHTML === "") {
            addObjRow("ALFA", 45.2377, 8.8097);
            addObjRow("BRAVO", 45.2385, 8.8105);
        }
    }
}

function addObjRow(n="", lt="", ln="") {
    const div = document.createElement("div");
    div.className = "obj-row-edit";
    div.innerHTML = `
        <input type="text" placeholder="OBJ" value="${n}" style="width:30%">
        <input type="number" value="${lt}" step="0.0001" style="width:35%">
        <input type="number" value="${ln}" step="0.0001" style="width:35%">
    `;
    document.getElementById("masterObjInputs").appendChild(div);
}

async function initApp() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    if (!state.playerName) return alert("INSERISCI NOME OPERATORE!");
    
    state.playerTeam = document.getElementById("teamSelect").value;
    state.teamNames.RED = document.getElementById("nameRed").value.toUpperCase();
    state.teamNames.BLUE = document.getElementById("nameBlue").value.toUpperCase();

    // SBLOCCO BUSSOLA (Richiede interazione utente su iOS)
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleRot, true);
            } else {
                alert("Bussola negata. L'app non ruoterà.");
            }
        } catch (e) { console.error(e); }
    } else {
        window.addEventListener('deviceorientation', handleRot, true);
    }
    
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "flex";
    
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}').addTo(map);

    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if (!state.playerMarker) {
            state.playerMarker = L.circleMarker(pos, { radius: 10, color: '#fff', fillColor: '#007bff', fillOpacity: 1 }).addTo(map);
            map.panTo(pos);
        } else {
            state.playerMarker.setLatLng(pos);
            if (state.autoCenter) map.panTo(pos);
        }
        if (state.targetObj) updateNavHUD();
    }, null, { enableHighAccuracy: true });

    setInterval(sync, 4000);
}

function handleRot(e) {
    let heading = e.webkitCompassHeading || (360 - e.alpha);
    if (heading) {
        // Ruotiamo il contenitore della mappa in senso inverso alla bussola
        document.getElementById("map-rotate").style.transform = `rotate(${-heading}deg)`;
    }
}

async function sync() {
    try {
        const res = await fetch(API_URL + "/latest", { headers: { "X-Master-Key": SECRET_KEY }, cache: 'no-store' });
        let { record } = await res.json();
        const myPos = state.playerMarker.getLatLng();

        if (!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: myPos.lat, lon: myPos.lng, last: Date.now() };

        record.objectives.forEach(obj => {
            const d = getDist(myPos.lat, myPos.lng, obj.lat, obj.lon);
            if (d < 15 && obj.owner !== state.playerTeam) {
                obj.progress = (obj.progress || 0) + 4;
                if (obj.progress >= (record.game.capTime || 120)) { 
                    obj.owner = state.playerTeam; 
                    obj.progress = 0; 
                }
            }
        });

        if (state.isMaster) {
            record.objectives.forEach(o => {
                if (o.owner === 'RED') record.game.scoreRed += 1;
                if (o.owner === 'BLUE') record.game.scoreBlue += 1;
            });
            record.game.teamNames = state.teamNames;
        }

        updateUI(record);
        await fetch(API_URL, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY }, body: JSON.stringify(record) });
    } catch (e) {}
}

function updateUI(r) {
    const elapsed = Math.floor((Date.now() - r.game.start) / 1000);
    const remaining = ((r.game.duration || 60) * 60) - elapsed;
    if (remaining > 0) {
        const m = Math.floor(remaining / 60);
        const s = remaining % 60;
        document.getElementById("timer").innerText = `⏱️ ${m}:${s.toString().padStart(2, '0')}`;
    } else {
        document.getElementById("timer").innerText = "FINE PARTITA";
    }

    const tN = r.game.teamNames || { RED: "ROSSI", BLUE: "BLU" };
    document.getElementById("score").innerText = `${tN.RED}:${Math.floor(r.game.scoreRed/10)} | ${tN.BLUE}:${Math.floor(r.game.scoreBlue/10)}`;
    
    state.activeMarkers.forEach(m => map.removeLayer(m));
    state.activeMarkers = [];

    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    r.objectives.forEach(obj => {
        let col = obj.owner === 'RED' ? '#f00' : (obj.owner === 'BLUE' ? '#0ff' : '#fff');
        let li = document.createElement("li");
        li.style.color = col;
        li.innerHTML = `[${obj.owner === 'LIBERO' ? 'LIB' : tN[obj.owner]}] ${obj.name} ${obj.progress > 0 ? '⏳' : ''}`;
        li.onclick = () => { 
            state.targetObj = obj; 
            document.getElementById("nav-overlay").style.display = "flex"; 
        };
        sb.appendChild(li);
        state.activeMarkers.push(L.circle([obj.lat, obj.lon], { radius: 15, color: col, fillOpacity: 0.3 }).addTo(map));
    });

    const pl = document.getElementById("playerList"); pl.innerHTML = "";
    Object.entries(r.players).forEach(([n, p]) => {
        if (Date.now() - p.last < 30000 && p.team === state.playerTeam && n !== state.playerName) {
            const d = getDist(p.lat, p.lon, state.playerMarker.getLatLng().lat, state.playerMarker.getLatLng().lng);
            pl.innerHTML += `<li>${n} (${d}m)</li>`;
            state.activeMarkers.push(L.circleMarker([p.lat, p.lon], { radius: 7, color: p.team === 'RED' ? 'red' : 'cyan', fillOpacity: 1 }).addTo(map));
        }
    });
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371000;
    const dLat = (la2 - la1) * Math.PI / 180;
    const dLon = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dLat / 2) ** 2 + Math.cos(la1 * Math.PI / 180) * Math.cos(la2 * Math.PI / 180) * Math.sin(dLon / 2) ** 2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a)));
}

function updateNavHUD() {
    if (!state.playerMarker || !state.targetObj) return;
    const p1 = state.playerMarker.getLatLng();
    const d = getDist(p1.lat, p1.lng, state.targetObj.lat, state.targetObj.lon);
    document.getElementById("nav-text").innerText = `TARGET: ${state.targetObj.name} | DIST: ${d}m`;
}

function stopNavigation() { state.targetObj = null; document.getElementById("nav-overlay").style.display = "none"; }
function centerMap() { state.autoCenter = true; map.panTo(state.playerMarker.getLatLng()); }

async function resetDatabase() {
    if (!confirm("RESET TOTALE?")) return;
    let objs = [];
    document.querySelectorAll(".obj-row-edit").forEach(row => {
        const ins = row.querySelectorAll("input");
        if (ins[0].value) objs.push({ name: ins[0].value.toUpperCase(), lat: parseFloat(ins[1].value), lon: parseFloat(ins[2].value), owner: "LIBERO", progress: 0 });
    });
    const data = { 
        game: { scoreRed: 0, scoreBlue: 0, start: Date.now(), duration: parseInt(document.getElementById("gameDuration").value), capTime: parseInt(document.getElementById("captureTime").value), teamNames: { RED: document.getElementById("nameRed").value, BLUE: document.getElementById("nameBlue").value } }, 
        players: {}, objectives: objs 
    };
    await fetch(API_URL, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY }, body: JSON.stringify(data) });
    alert("SISTEMA RESETTATO!");
}
