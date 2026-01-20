const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();

function playBeep(f, d) {
    const o = audioCtx.createOscillator();
    const g = audioCtx.createGain();
    o.frequency.value = f; g.gain.setValueAtTime(0.1, audioCtx.currentTime);
    o.connect(g); g.connect(audioCtx.destination);
    o.start(); o.stop(audioCtx.currentTime + d);
}

const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

const objectives = [
    {name:"PF1", lat:45.238376, lon:8.810060},
    {name:"PF2", lat:45.237648, lon:8.810941},
    {name:"PF3", lat:45.238634, lon:8.808772},
    {name:"PF4", lat:45.237771, lon:8.809208},
    {name:"PF5", lat:45.237995, lon:8.808303}
];

objectives.forEach(o => {
    o.marker = L.circle([o.lat, o.lon], { radius: 10, color: "white", fillOpacity: 0.3 }).addTo(map);
});

function getDist(la1, lo1, la2, lo2) {
    const R = 6371e3;
    const dLat = (la2 - la1) * Math.PI / 180;
    const dLon = (lo2 - lo1) * Math.PI / 180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;

    if (!state.playerName) return alert("INSERISCI NOME");
    if (state.isMaster && document.getElementById("masterPass").value !== "71325") return alert("PASS ERRATA");

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    if (state.isMaster) document.getElementById("master-controls").style.display = "block";

    navigator.geolocation.watchPosition(p => {
        const { latitude: lat, longitude: lon } = p.coords;
        if (!state.playerMarker) state.playerMarker = L.marker([lat, lon]).addTo(map);
        else state.playerMarker.setLatLng([lat, lon]);
    }, null, { enableHighAccuracy: true });

    setInterval(sync, 3000);
}

async function sync() {
    if (!state.playerMarker) return;
    const pos = state.playerMarker.getLatLng();

    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: { "X-Master-Key": SECRET_KEY } });
        const { record } = await res.json();

        record.players[state.playerName] = { team: state.playerTeam, lat: pos.lat, lon: pos.lng, last: Date.now() };

        if (state.isMaster) {
            processLogic(record);
            await fetch(JSONBIN_URL, {
                method: "PUT",
                headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY },
                body: JSON.stringify(record)
            });
        }
        updateUI(record);
    } catch (e) { console.error(e); }
}

function processLogic(r) {
    if (!r.game.started) {
        r.game.started = true; r.game.start = Date.now();
        r.game.duration = parseInt(document.getElementById("gameDuration").value) * 60;
        r.game.score = { RED: 0, BLUE: 0 }; r.game.lastTick = Date.now();
        r.objectives = objectives.map(o => ({ name: o.name, owner: null, start: null }));
    }

    r.objectives.forEach((obj, i) => {
        const inside = Object.values(r.players).filter(p => getDist(objectives[i].lat, objectives[i].lon, p.lat, p.lon) < 10);
        const teams = [...new Set(inside.map(p => p.team))];
        if (teams.length === 1) {
            if (!obj.start) obj.start = Date.now();
            if (Date.now() - obj.start > 60000 && obj.owner !== teams[0]) {
                obj.owner = teams[0]; playBeep(880, 0.3);
            }
        } else obj.start = null;
    });

    if (Date.now() - r.game.lastTick > 30000) {
        r.objectives.forEach(o => { if (o.owner) r.game.score[o.owner]++; });
        r.game.lastTick = Date.now();
    }
}

function updateUI(r) {
    const rem = r.game.duration - Math.floor((Date.now() - r.game.start) / 1000);
    document.getElementById("timer").innerText = rem > 0 ? `⏱️ ${Math.floor(rem/60)}:${(rem%60).toString().padStart(2,"0")}` : "FINE";
    document.getElementById("score").innerHTML = `<span style="color:red">ROSSI: ${r.game.score.RED}</span> | <span style="color:cyan">BLU: ${r.game.score.BLUE}</span>`;
    
    const rad = document.getElementById("radar");
    rad.querySelectorAll(".dot").forEach(d => d.remove());
    
    Object.entries(r.players).forEach(([name, p]) => {
        if (Date.now() - p.last > 15000) return;
        const d = getDist(state.playerMarker.getLatLng().lat, state.playerMarker.getLatLng().lng, p.lat, p.lon);
        if (d < 100 && name !== state.playerName) {
            const dot = document.createElement("div");
            dot.className = `dot ${p.team}`;
            dot.style.left = (75 + Math.random()*40-20) + "px"; // Semplificato
            dot.style.top = (75 + Math.random()*40-20) + "px";
            rad.appendChild(dot);
        }
    });
}

async function resetBin() {
    if (!confirm("RESETTA TUTTO?")) return;
    await fetch(JSONBIN_URL, {
        method: "PUT",
        headers: { "Content-Type": "application/json", "X-Master-Key": SECRET_KEY },
        body: JSON.stringify({ game: { started: false }, players: {}, objectives: [] })
    });
    location.reload();
}
