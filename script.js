const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const PWD_MASTER = "71325";

const DEFAULT_OBJS = [
    { name: "ALFA", lat: 45.2377, lon: 8.8097, owner: "LIBERO" },
    { name: "BRAVO", lat: 45.2385, lon: 8.8105, owner: "LIBERO" },
    { name: "CHARLIE", lat: 45.2369, lon: 8.8115, owner: "LIBERO" }
];

let state = { 
    isMaster: false, playerName: "", playerTeam: "", playerMarker: null, 
    autoCenter: true, selectedMode: "DOMINATION", startTime: null 
};

let activeMarkers = [];
let map;
let captureTimers = {}; // { "ALFA": { team: 'RED', seconds: 0 } }

window.onload = () => {
    map = L.map("map", { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', { subdomains:['mt0','mt1','mt2','mt3'], maxZoom: 21 }).addTo(map);
    map.on('dragstart', () => state.autoCenter = false);
    loadConfigFromServer();
};

function checkMasterPass() {
    if(document.getElementById("masterPass").value === PWD_MASTER) {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
        document.getElementById("playerStartBtn").style.display = "none";
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
        for (let i = 0; i < 6; i++) {
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
    if(compass) {
        // Punto 6: Ruota la mappa e segui il movimento
        document.getElementById("map-rotate").style.transform = `rotate(${-compass}deg)`;
    }
}

function enableSensorsAndStart(isMasterAction) {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("INSERISCI NOME!");
    
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

function startGame() {
    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "block";
    map.invalidateSize();

    navigator.geolocation.watchPosition(
        (p) => {
            const pos = [p.coords.latitude, p.coords.longitude];
            if(!state.playerMarker) {
                state.playerMarker = L.circleMarker(pos, {radius: 8, color: '#fff', fillColor: '#007bff', fillOpacity: 1, weight: 3}).addTo(map);
                map.setView(pos, 19);
            } else {
                state.playerMarker.setLatLng(pos);
                if(state.autoCenter) map.panTo(pos);
            }
        }, null, { enableHighAccuracy: true }
    );
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

        const captureRequired = parseInt(document.getElementById("captureTime")?.value || 180);

        // LOGICA DI CONQUISTA (Punti 1, 2, 3)
        record.objectives.forEach(obj => {
            let playersInRadius = Object.values(record.players).filter(p => (Date.now() - p.last < 10000) && getDist(p.lat, p.lon, obj.lat, obj.lon) <= 15);
            let redHere = playersInRadius.some(p => p.team === 'RED');
            let blueHere = playersInRadius.some(p => p.team === 'BLUE');

            if (redHere && blueHere) {
                obj.contested = true; // Punto 3: Segnala contesa
            } else {
                obj.contested = false;
                let activeTeam = redHere ? 'RED' : (blueHere ? 'BLUE' : null);
                
                // Punto 2: Conquista solo se il proprietario non c'è
                if (activeTeam && (obj.owner === "LIBERO" || obj.owner !== activeTeam)) {
                    if (!captureTimers[obj.name] || captureTimers[obj.name].team !== activeTeam) {
                        captureTimers[obj.name] = { team: activeTeam, seconds: 0 };
                    }
                    captureTimers[obj.name].seconds += 4;
                    if (captureTimers[obj.name].seconds >= captureRequired) {
                        obj.owner = activeTeam;
                        captureTimers[obj.name].seconds = 0;
                    }
                } else {
                    if(captureTimers[obj.name]) captureTimers[obj.name].seconds = 0;
                }
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
    
    // Timer e Score
    const timerEl = document.getElementById("timer");
    const remain = ((r.game.duration || 30) * 60) - Math.floor((Date.now() - r.game.start) / 1000);
    if(remain > 0) {
        const m = Math.floor(remain / 60); const s = remain % 60;
        timerEl.innerText = `⏱️ ${m}:${s < 10 ? '0'+s : s}`;
    } else { timerEl.innerText = "FINE"; }
    document.getElementById("scoreRed").innerText = Math.floor(r.game.scoreRed/10);
    document.getElementById("scoreBlue").innerText = Math.floor(r.game.scoreBlue/10);

    // Liste Obiettivi (Punto 5: Visibili senza scorrere in landscape)
    const scoreboard = document.getElementById("scoreboard");
    scoreboard.innerHTML = "";
    r.objectives.forEach(obj => {
        let color = obj.owner === 'RED' ? '#f00' : (obj.owner === 'BLUE' ? '#0ff' : '#fff');
        let statusText = obj.contested ? '<span style="color:yellow">! CONTESA !</span>' : obj.owner;
        
        scoreboard.innerHTML += `<li style="border-left:5px solid ${color}"><b>${obj.name}</b>: ${statusText}</li>`;
        
        let m = L.circle([obj.lat, obj.lon], {radius: 15, color: obj.contested ? 'yellow' : color, weight: 3, fillOpacity: 0.2}).addTo(map);
        activeMarkers.push(m);
    });

    // Radar Team
    const pList = document.getElementById("playerList");
    pList.innerHTML = "";
    Object.entries(r.players).forEach(([name, p]) => {
        if(Date.now() - p.last < 30000 && p.team === state.playerTeam && name !== state.playerName) {
            let d = getDist(p.lat, p.lon, state.playerMarker?.getLatLng().lat, state.playerMarker?.getLatLng().lng);
            pList.innerHTML += `<li>${name} [${d}m]</li>`;
            activeMarkers.push(L.circleMarker([p.lat, p.lon], {radius: 6, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map));
        }
    });
}

function getDist(lat1, lon1, lat2, lon2) {
    if(!lat1 || !lat2) return 0;
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function centerMap() { state.autoCenter = true; }
function exitGame() { location.reload(); }
async function resetBin() {
    if(confirm("RESET TOTALE?")) {
        await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify({game:{mode:"DOMINATION",scoreRed:0,scoreBlue:0,start:Date.now(),duration:30},players:{},objectives:DEFAULT_OBJS})});
        location.reload();
    }
}
