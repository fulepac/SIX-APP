const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const API_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = {
    isMaster: false, name: "", team: "", 
    pos: null, heading: 0, target: null,
    markers: [], tNames: { RED: "ROSSI", BLUE: "BLU" }
};
let map;

// 1. GESTIONE MASTER
function checkMaster() {
    if (document.getElementById("masterPass").value === "71325") {
        state.isMaster = true;
        document.getElementById("masterPanel").style.display = "block";
        if (!document.getElementById("objContainer").innerHTML) addObjField("OBJ-1", 45.2377, 8.8097);
    }
}

function addObjField(n="", lt="", ln="") {
    const div = document.createElement("div");
    div.className = "grid";
    div.innerHTML = `<input type="text" value="${n}" style="width:100%"><input type="number" value="${lt}" step="0.0001"><input type="number" value="${ln}" step="0.0001">`;
    document.getElementById("objContainer").appendChild(div);
}

// 2. BUSSOLA (FUNZIONE FIXATA)
async function unlockCompass() {
    const btn = document.getElementById("compassBtn");
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleRotate, true);
                btn.innerHTML = "BUSSOLA SBLOCCATA ✅";
                btn.style.background = "#004400";
            }
        } catch (e) { alert("Errore: " + e); }
    } else {
        window.addEventListener('deviceorientation', handleRotate, true);
        btn.innerHTML = "BUSSOLA ATTIVA ✅";
    }
}

function handleRotate(e) {
    let compass = e.webkitCompassHeading || (360 - e.alpha);
    if (compass) {
        state.heading = compass;
        document.getElementById("map-rotate").style.transform = `rotate(${-compass}deg)`;
        if (state.target) updateNav();
    }
}

// 3. LOGICA DI GIOCO
function startApp() {
    state.name = document.getElementById("playerName").value.toUpperCase();
    if (!state.name) return alert("INSERISCI NOME OPERATORE");
    state.team = document.getElementById("teamSelect").value;

    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "flex";

    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://mt1.google.com/vt/lyrs=s&x={x}&y={y}&z={z}').addTo(map);

    navigator.geolocation.watchPosition(p => {
        state.pos = { lat: p.coords.latitude, lng: p.coords.longitude };
        if (state.target) updateNav();
        map.panTo([state.pos.lat, state.pos.lng]);
    }, null, { enableHighAccuracy: true });

    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(API_URL + "/latest", { headers: { "X-Master-Key": SECRET_KEY }, cache: 'no-store' });
        const { record } = await res.json();
        
        if (state.pos) {
            if (!record.players) record.players = {};
            record.players[state.name] = { team: state.team, lat: state.pos.lat, lon: state.pos.lng, last: Date.now() };
            
            // Logica cattura
            record.objectives.forEach(obj => {
                const d = getDist(state.pos.lat, state.pos.lng, obj.lat, obj.lon);
                if (d < 15 && obj.owner !== state.team) {
                    obj.progress = (obj.progress || 0) + 4;
                    if (obj.progress >= (record.game.capTime || 120)) { obj.owner = state.team; obj.progress = 0; }
                }
            });
        }

        if (state.isMaster) {
            record.objectives.forEach(o => { 
                if (o.owner === 'RED') record.game.scoreRed++; 
                if (o.owner === 'BLUE') record.game.scoreBlue++; 
            });
        }

        updateUI(record);
        await fetch(API_URL, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY }, body: JSON.stringify(record) });
    } catch (e) {}
}

function updateUI(r) {
    const tN = r.game.teamNames || { RED: "ROSSI", BLUE: "BLU" };
    document.getElementById("m-label").innerText = r.game.mode;
    document.getElementById("score").innerText = `${tN.RED}:${Math.floor(r.game.scoreRed/10)} | ${tN.BLUE}:${Math.floor(r.game.scoreBlue/10)}`;
    
    // Timer
    const rem = (r.game.duration * 60) - Math.floor((Date.now() - r.game.start) / 1000);
    if (rem > 0) {
        document.getElementById("timer").innerText = `${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,'0')}`;
    }

    state.markers.forEach(m => map.removeLayer(m));
    state.markers = [];

    const list = document.getElementById("objList"); list.innerHTML = "";
    r.objectives.forEach(o => {
        const col = o.owner === 'RED' ? 'red' : (o.owner === 'BLUE' ? 'cyan' : 'white');
        const li = document.createElement("li");
        li.style.color = col;
        li.innerHTML = `${o.name} [${o.owner === 'LIBERO' ? 'LIB' : tN[o.owner]}] ${o.progress > 0 ? '⏳' : ''}`;
        li.onclick = () => { state.target = o; document.getElementById("nav-hud").style.display = "flex"; };
        list.appendChild(li);
        state.markers.push(L.circle([o.lat, o.lon], { radius: 15, color: col, fillOpacity: 0.3 }).addTo(map));
    });

    const tList = document.getElementById("teamList"); tList.innerHTML = "";
    Object.entries(r.players).forEach(([n, p]) => {
        if (Date.now() - p.last < 30000 && p.team === state.team && n !== state.name) {
            tList.innerHTML += `<li>${n}</li>`;
            state.markers.push(L.circleMarker([p.lat, p.lon], { radius: 6, color: p.team==='RED'?'red':'cyan', fillOpacity:1 }).addTo(map));
        }
    });
}

function updateNav() {
    const d = getDist(state.pos.lat, state.pos.lng, state.target.lat, state.target.lon);
    document.getElementById("nav-info").innerText = `${state.target.name} | ${d}m`;
    
    // Calcolo Bearing (Direzione)
    const y = Math.sin((state.target.lon - state.pos.lng) * Math.PI/180) * Math.cos(state.target.lat * Math.PI/180);
    const x = Math.cos(state.pos.lat * Math.PI/180) * Math.sin(state.target.lat * Math.PI/180) - Math.sin(state.pos.lat * Math.PI/180) * Math.cos(state.target.lat * Math.PI/180) * Math.cos((state.target.lon - state.pos.lng) * Math.PI/180);
    const bearing = (Math.atan2(y, x) * 180/Math.PI + 360) % 360;
    document.getElementById("nav-arrow").style.transform = `rotate(${bearing - state.heading}deg)`;
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371000;
    const dLat = (la2-la1)*Math.PI/180; const dLon = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function closeNav() { state.target = null; document.getElementById("nav-hud").style.display = "none"; }
function recenter() { map.panTo([state.pos.lat, state.pos.lng]); }

async function hardReset() {
    if (!confirm("AVVIARE NUOVA MISSIONE?")) return;
    let objs = [];
    document.querySelectorAll("#objContainer .grid").forEach(g => {
        const ins = g.querySelectorAll("input");
        if (ins[0].value) objs.push({ name: ins[0].value.toUpperCase(), lat: parseFloat(ins[1].value), lon: parseFloat(ins[2].value), owner: "LIBERO", progress: 0 });
    });
    const data = {
        game: { mode: document.getElementById("gameMode").value, scoreRed: 0, scoreBlue: 0, start: Date.now(), duration: parseInt(document.getElementById("gameDur").value), capTime: parseInt(document.getElementById("capTime").value), teamNames: { RED: document.getElementById("nameRed").value, BLUE: document.getElementById("nameBlue").value } },
        players: {}, objectives: objs
    };
    await fetch(API_URL, { method: "PUT", headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY }, body: JSON.stringify(data) });
    alert("MISSIONE INVIATA!");
}
