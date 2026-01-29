const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "", playerMarker: null };
const CONQUER_TIME = 180000; // 3 Minuti

// Audio
const audioCtx = new (window.AudioContext || window.webkitAudioContext)();
function playSound(freq, duration) {
    if (audioCtx.state === 'suspended') audioCtx.resume();
    const osc = audioCtx.createOscillator();
    const gain = audioCtx.createGain();
    osc.type = "square";
    osc.frequency.setValueAtTime(freq, audioCtx.currentTime);
    gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
    osc.connect(gain); gain.connect(audioCtx.destination);
    osc.start(); osc.stop(audioCtx.currentTime + duration);
}

// Inizializzazione Slot Obiettivi per il Master
const DEFAULT_COORDS = [
    {name:"PF1", lat:45.238376, lon:8.810060, active: true},
    {name:"PF2", lat:45.237648, lon:8.810941, active: true},
    {name:"PF3", lat:45.238634, lon:8.808772, active: true}
];

function initSlotUI() {
    const container = document.getElementById("objSlotContainer");
    if (!container) return;
    container.innerHTML = "";
    for (let i = 0; i < 10; i++) {
        const d = DEFAULT_COORDS[i] || { name: `OBJ${i+1}`, lat: 0.0, lon: 0.0, active: false };
        container.innerHTML += `
            <div class="obj-slot" id="slot-${i}">
                <input type="checkbox" class="s-active" ${d.active ? 'checked' : ''}>
                <input type="text" class="s-name" value="${d.name}">
                <input type="number" class="s-lat" value="${d.lat}" step="0.000001">
                <input type="number" class="s-lon" value="${d.lon}" step="0.000001">
            </div>`;
    }
}

window.onload = () => { initSlotUI(); checkStatus(); };

function toggleMasterTools() { 
    document.getElementById("masterTools").style.display = document.getElementById("isMaster").checked ? "block" : "none"; 
}

const map = L.map("map", { zoomControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

function initCompass() {
    if (window.DeviceOrientationEvent && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(res => {
            if (res === 'granted') window.addEventListener('deviceorientation', handleOrientation);
        });
    } else { window.addEventListener('deviceorientation', handleOrientation); }
}

function handleOrientation(event) {
    let heading = event.webkitCompassHeading || (360 - event.alpha);
    if (heading) {
        document.getElementById("map-rotate-wrapper").style.transform = `rotate(${-heading}deg)`;
        document.getElementById("compass-needle").style.transform = `rotate(${-heading}deg)`;
    }
}

async function startGame() {
    initCompass();
    if (audioCtx.state === 'suspended') audioCtx.resume();
    
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;
    
    if (!state.playerName) return alert("INSERISCI NOME");
    if (state.isMaster && document.getElementById("masterPass").value !== "71325") return alert("PASSWORD ERRATA");

    document.getElementById("menu").style.display="none"; 
    document.getElementById("game-ui").style.display="block";
    if (state.isMaster) document.getElementById("master-controls").style.display="block";

    navigator.geolocation.watchPosition(p => {
        const {latitude:la, longitude:lo} = p.coords;
        if(!state.playerMarker) state.playerMarker = L.marker([la,lo]).addTo(map).bindTooltip("TU", {permanent:true});
        else state.playerMarker.setLatLng([la,lo]);
    }, null, {enableHighAccuracy:true});
    
    setInterval(sync, 4000);
}

function processLogic(r) {
    if (!r.game.started) {
        r.game.started = true; r.game.start = Date.now();
        r.game.score = {RED:0, BLUE:0}; r.game.lastTick = Date.now();
        r.game.duration = (parseInt(document.getElementById("gameDuration").value)||30)*60;
        
        let finalObjs = [];
        for(let i=0; i<10; i++){
            const row = document.getElementById(`slot-${i}`);
            if(row && row.querySelector(".s-active").checked) {
                finalObjs.push({
                    name: row.querySelector(".s-name").value.toUpperCase(),
                    lat: parseFloat(row.querySelector(".s-lat").value),
                    lon: parseFloat(row.querySelector(".s-lon").value),
                    owner: "LIBERO", start: null, teamConquering: null
                });
            }
        }
        r.objectives = finalObjs;
    }

    r.objectives.forEach(obj => {
        const nearby = Object.values(r.players).filter(p => (Date.now()-p.last < 10000) && getDist(obj.lat, obj.lon, p.lat, p.lon) < 15);
        const teams = [...new Set(nearby.map(p => p.team))];

        if(teams.length === 1 && teams[0] !== obj.owner) {
            if(obj.teamConquering !== teams[0]) {
                obj.start = Date.now(); obj.teamConquering = teams[0];
                playSound(440, 0.2);
            } else if(Date.now() - obj.start > CONQUER_TIME) {
                obj.owner = teams[0]; obj.teamConquering = null;
                playSound(880, 0.8);
            }
        } else { obj.teamConquering = null; obj.start = null; }
    });
}

function getDist(la1, lo1, la2, lo2) {
    const R = 6371e3;
    const dLat = (la2-la1)*Math.PI/180; const dLon = (lo2-lo1)*Math.PI/180;
    const a = Math.sin(dLat/2)**2 + Math.cos(la1*Math.PI/180)*Math.cos(la2*Math.PI/180)*Math.sin(dLon/2)**2;
    return R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a));
}

function centerMap() { if (state.playerMarker) map.setView(state.playerMarker.getLatLng(), 18); }

async function sync() {
    if(!state.playerMarker) return;
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const { record } = await res.json();
        if(!record.players) record.players = {};
        record.players[state.playerName] = { team: state.playerTeam, lat: state.playerMarker.getLatLng().lat, lon: state.playerMarker.getLatLng().lng, last: Date.now() };
        
        if(state.isMaster) {
            processLogic(record);
            await fetch(JSONBIN_URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        updateUI(record);
    } catch(e){}
}

function updateUI(r) {
    const sb = document.getElementById("scoreboard"); sb.innerHTML = "";
    r.objectives.forEach(obj => {
        let status = obj.owner;
        if(obj.teamConquering) status = `ATTACCO ${obj.teamConquering} (${Math.floor((Date.now()-obj.start)/1000)}s)`;
        sb.innerHTML += `<li>${obj.name}: ${status}</li>`;
    });
}

async function checkStatus() {
    try {
        const res = await fetch(`${JSONBIN_URL}/latest`, { headers: { "X-Master-Key": SECRET_KEY }, cache: 'no-store' });
        const { record } = await res.json();
        const b = document.getElementById("gameStatusBanner");
        if (record.game?.started) { b.innerText="⚠️ PARTITA IN CORSO"; b.className="status-banner status-active"; }
        else { b.innerText="✅ CAMPO DISPONIBILE"; b.className="status-banner status-waiting"; }
    } catch(e){}
}

async function resetBin() { if(confirm("RESET TOTALE?")) { await fetch(JSONBIN_URL, {method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{started:false}, players:{}, objectives:[]})}); location.reload(); } }
