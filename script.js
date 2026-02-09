const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

const mapBounds = [[45.2350, 8.8060], [45.2410, 8.8140]];
const DEFAULT_OBJS = [
    { name: "ALFA", lat: 45.2377, lon: 8.8097, owner: "LIBERO", progress: 0 },
    { name: "BRAVO", lat: 45.2385, lon: 8.8105, owner: "LIBERO", progress: 0 },
    { name: "CHARLIE", lat: 45.2369, lon: 8.8115, owner: "LIBERO", progress: 0 },
    { name: "DELTA", lat: 45.2392, lon: 8.8085, owner: "LIBERO", progress: 0 },
    { name: "ECHO", lat: 45.2360, lon: 8.8075, owner: "LIBERO", progress: 0 }
];

let state = { 
    isMaster: false, playerName: "", playerTeam: "", playerMarker: null, 
    autoCenter: true, selectedMode: "DOMINATION", targetObj: null, navLine: null, startTime: null 
};

let activeMarkers = [];
let map;

window.onload = () => {
    initMap();
    const saved = localStorage.getItem("six_app_session");
    if (saved) {
        const data = JSON.parse(saved);
        document.getElementById("playerName").value = data.name || "";
        document.getElementById("teamSelect").value = data.team || "RED";
    }
};

function initMap() {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'], maxZoom: 21 }).addTo(map);
    map.on('dragstart', () => state.autoCenter = false);
}

function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        document.getElementById("playerStartBtn").style.display = "none";
        loadConfigFromServer();
    }
}

function selectGameMode(m) {
    state.selectedMode = m;
    document.getElementById("btnDomination").classList.toggle("active", m === 'DOMINATION');
    document.getElementById("btnRecon").classList.toggle("active", m === 'RECON');
}

async function loadConfigFromServer() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}});
        const { record } = await res.json();
        const container = document.getElementById("objSlotContainer");
        container.innerHTML = "";
        const currentObjs = (record.objectives && record.objectives.length > 0) ? record.objectives : DEFAULT_OBJS;
        for (let i = 0; i < 10; i++) {
            let o = currentObjs[i] || { name: `OBJ${i+1}`, lat: "", lon: "" };
            container.innerHTML += `
                <div class="obj-slot">
                    <input type="checkbox" class="s-active" ${o.lat ? 'checked' : ''}>
                    <input type="text" class="s-name" value="${o.name}">
                    <input type="number" class="s-lat" value="${o.lat}" step="any">
                    <input type="number" class="s-lon" value="${o.lon}" step="any">
                </div>`;
        }
    } catch(e) {}
}

function handleRotation(e) {
    let compass = e.webkitCompassHeading || (360 - e.alpha);
    if(compass) document.getElementById("map-rotate").style.transform = `rotate(${-compass}deg)`;
}

function enableSensorsAndStart(isMasterAction) {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME!");
    localStorage.setItem("six_app_session", JSON.stringify({name: state.playerName, team: state.playerTeam}));
    
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        DeviceOrientationEvent.requestPermission().then(res => {
            if(res === 'granted') window.addEventListener('deviceorientation', handleRotation);
            isMasterAction ? saveAndStart() : startGame();
        }).catch(() => { isMasterAction ? saveAndStart() : startGame(); });
    } else {
        window.addEventListener('deviceorientation', handleRotation);
        isMasterAction ? saveAndStart() : startGame();
    }
}

async function saveAndStart() {
    state.startTime = Date.now();
    await sync(true, parseInt(document.getElementById("gameDuration").value));
    startGame();
}

async function startGame() {
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    map.invalidateSize();

    if ("geolocation" in navigator) {
        navigator.geolocation.watchPosition(
            (p) => {
                const pos = [p.coords.latitude, p.coords.longitude];
                if(!state.playerMarker) {
                    state.playerMarker = L.circleMarker(pos, {radius: 9, color: '#fff', fillColor: '#007bff', fillOpacity: 1, weight: 3}).addTo(map);
                    map.setView(pos, 18);
                } else {
                    state.playerMarker.setLatLng(pos);
                    if(state.autoCenter) map.panTo(pos);
                }
                updateNavigationLine();
            },
            null, { enableHighAccuracy: true, timeout: 5000, maximumAge: 0 }
        );
    }
    setInterval(() => sync(false), 4000);
}

async function sync(forceMaster, duration) {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        let { record } = await res.json();
        if(!record.players) record.players = {};
        
        const myLat = state.playerMarker?.getLatLng().lat || 0;
        const myLon = state.playerMarker?.getLatLng().lng || 0;
        record.players[state.playerName] = { team: state.playerTeam, lat: myLat, lon: myLon, last: Date.now() };

        const capReq = parseInt(document.getElementById("captureTime")?.value || 180);

        // LOGICA DI CONQUISTA E CONTESA
        record.objectives.forEach(obj => {
            let inRange = Object.values(record.players).filter(p => (Date.now() - p.last < 15000) && getDistRaw(p.lat, p.lon, obj.lat, obj.lon) <= 15);
            let redIn = inRange.some(p => p.team === 'RED');
            let blueIn = inRange.some(p => p.team === 'BLUE');

            if (redIn && blueIn) {
                // Contesa: non succede nulla al progresso 
            } else if (redIn || blueIn) {
                let activeTeam = redIn ? 'RED' : 'BLUE';
                // Punto 2: Per riconquistare, non ci devono essere nemici 
                if (obj.owner === "LIBERO" || obj.owner !== activeTeam) {
                    obj.tempProgress = (obj.tempProgress || 0) + 4;
                    if (obj.tempProgress >= capReq) {
                        obj.owner = activeTeam;
                        obj.tempProgress = 0;
                    }
                }
            } else {
                obj.tempProgress = 0;
            }
        });

        if(state.isMaster || forceMaster) {
            record.game = { 
                mode: state.selectedMode, 
                scoreRed: record.game?.scoreRed || 0, scoreBlue: record.game?.scoreBlue || 0,
                start: forceMaster ? state.startTime : (record.game?.start || Date.now()),
                duration: duration || record.game?.duration || 30
            };
            if(record.game.mode === 'DOMINATION') {
                record.objectives.forEach(o => {
                    if(o.owner === 'RED') record.game.scoreRed += 1;
                    if(o.owner === 'BLUE') record.game.scoreBlue += 1;
                });
            }
            if(forceMaster) {
                let newObjs = [];
                document.querySelectorAll(".obj-slot").forEach(s => {
                    if(s.querySelector(".s-active").checked) {
                        newObjs.push({ name: s.querySelector(".s-name").value, lat: parseFloat(s.querySelector(".s-lat").value), lon: parseFloat(s.querySelector(".s-lon").value), owner: "LIBERO" });
                    }
                });
                record.objectives = newObjs;
            }
        }
        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        updateUI(record);
    } catch(e) {}
}

function updateUI(r) {
    activeMarkers.forEach(m => map.removeLayer(m)); activeMarkers = [];
    const timerEl = document.getElementById("timer");
    const scorePanel = document.getElementById("score-panel");

    if(r.game?.mode === 'DOMINATION') {
        scorePanel.style.display = 'flex'; timerEl.style.display = 'block';
        document.getElementById("scoreRed").innerText = r.game.scoreRed || 0;
        document.getElementById("scoreBlue").innerText = r.game.scoreBlue || 0;
        const remain = ((r.game.duration || 30) * 60) - Math.floor((Date.now() - r.game.start) / 1000);
        if(remain > 0) {
            const m = Math.floor(remain / 60); const s = remain % 60;
            timerEl.innerText = `⏱️ ${m}:${s < 10 ? '0'+s : s}`;
        } else { timerEl.innerText = "FINE MISSIONE"; }
    } else {
        scorePanel.style.display = 'none'; timerEl.style.display = 'none';
    }
    
    const scoreboard = document.getElementById("scoreboard");
    scoreboard.innerHTML = "";
    (r.objectives || []).forEach(obj => {
        let inRange = Object.values(r.players).filter(p => (Date.now() - p.last < 15000) && getDistRaw(p.lat, p.lon, obj.lat, obj.lon) <= 15);
        let contested = inRange.some(p => p.team === 'RED') && inRange.some(p => p.team === 'BLUE');
        
        let color = obj.owner === 'RED' ? '#ff0000' : obj.owner === 'BLUE' ? '#00ffff' : '#ffffff';
        let m = L.circle([obj.lat, obj.lon], {radius: 15, color: contested ? 'yellow' : color, weight: 4, fillOpacity: 0.3}).addTo(map);
        m.bindTooltip(`${obj.name}${contested ? ' (CONTESA!)' : ''}`, {permanent:true, direction:'top', className:'obj-label'});
        activeMarkers.push(m);

        scoreboard.innerHTML += `<li style="border-left: 4px solid ${color}; padding-left: 5px;">
            ${obj.name} ${contested ? '<b style="color:yellow">! ATTENZIONE !</b>' : ''} 
            <span>${obj.owner}</span>
        </li>`;
    });

    const pList = document.getElementById("playerList"); pList.innerHTML = "";
    Object.entries(r.players || {}).forEach(([name, p]) => {
        if(Date.now() - p.last < 30000 && p.team === state.playerTeam && name !== state.playerName) {
            pList.innerHTML += `<li>${name} <span>${getDistRaw(p.lat, p.lon, state.playerMarker?.getLatLng().lat, state.playerMarker?.getLatLng().lng)}m</span></li>`;
            activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius: 7, color: p.team==='RED'?'red':'#00ffff', fillColor: p.team==='RED'?'#f00':'#0ff', fillOpacity:0.8}).addTo(map));
        }
    });
}

function getDistRaw(lat1, lon1, lat2, lon2) {
    if(!lat1 || !lat2) return "?";
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function updateNavigationLine() {
    if(!state.targetObj || !state.playerMarker) return;
    const p1 = state.playerMarker.getLatLng();
    const dist = getDistRaw(p1.lat, p1.lng, state.targetObj.lat, state.targetObj.lon);
    document.getElementById("nav-text").innerText = `${state.targetObj.name}: ${dist}m`;
    if(state.navLine) map.removeLayer(state.navLine);
    state.navLine = L.polyline([p1, [state.targetObj.lat, state.targetObj.lon]], {color: 'yellow', weight: 4, dashArray: '10, 10'}).addTo(map);
}

function centerMap() { state.autoCenter = true; if(state.playerMarker) map.panTo(state.playerMarker.getLatLng()); }
function exitGame() { if(confirm("SCOLLEGARTI?")) location.reload(); }
async function resetBin() {
    if(confirm("ABORTIRE MISSIONE E RESETTARE TUTTO?")) {
        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{mode:"DOMINATION",scoreRed:0,scoreBlue:0,start:Date.now(),duration:30},players:{},objectives:DEFAULT_OBJS})});
        location.reload();
    }
}
