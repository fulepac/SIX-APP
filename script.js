const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// Stato Globale
let state = {
    isMaster: false,
    playerName: "",
    playerTeam: "",
    playerMarker: null,
    autoCenter: true,
    selectedMode: "DOMINATION",
    targetObj: null,
    navLine: null,
    activeMarkers: []
};

let map;

// --- INIZIALIZZAZIONE E PERMESSI ---

function checkMasterPass() {
    if(document.getElementById("masterPass").value === "71325") {
        state.isMaster = true;
        document.getElementById("masterTools").style.display = "block";
    }
}

function selectGameMode(m) {
    state.selectedMode = m;
    document.getElementById("btnDomination").className = m === 'DOMINATION' ? 'mode-btn active' : 'mode-btn';
    document.getElementById("btnRecon").className = m === 'RECON' ? 'mode-btn active' : 'mode-btn';
}

async function requestPermissions() {
    // Gestione iOS 13+ per la bussola
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const res = await DeviceOrientationEvent.requestPermission();
            if (res === 'granted') window.addEventListener('deviceorientation', handleOrientation);
        } catch (e) { console.error("Permessi orientamento negati"); }
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

// --- LOGICA DI GIOCO ---

function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    
    if(!state.playerName) return alert("ERRORE: Inserisci il nome operatore!");

    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "flex";

    // Mappa
    map = L.map('map', { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
    L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {
        subdomains:['mt0','mt1','mt2','mt3'],
        maxZoom: 21
    }).addTo(map);

    // GPS
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
    
    // Avvio Ciclo Sincronizzazione
    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key": SECRET_KEY}, cache: 'no-store' });
        let { record } = await res.json();
        
        const myPos = state.playerMarker.getLatLng();
        
        // 1. Aggiorna la mia posizione nel database
        if(!record.players) record.players = {};
        record.players[state.playerName] = {
            team: state.playerTeam,
            lat: myPos.lat,
            lon: myPos.lng,
            last: Date.now()
        };

        // 2. LOGICA CONQUISTA (Eseguita localmente da ogni client, salvata solo se Master o primo arrivato)
        const captureTimeLimit = parseInt(document.getElementById("captureTime").value) || 180;
        
        record.objectives.forEach(obj => {
            const nearPlayers = Object.values(record.players).filter(p => 
                (Date.now() - p.last < 10000) && getDistance(p.lat, p.lon, obj.lat, obj.lon) < 15
            );

            const reds = nearPlayers.filter(p => p.team === 'RED').length > 0;
            const blues = nearPlayers.filter(p => p.team === 'BLUE').length > 0;

            if (reds && blues) {
                obj.contested = true;
            } else {
                obj.contested = false;
                let activeTeam = reds ? 'RED' : (blues ? 'BLUE' : null);
                
                if (activeTeam && obj.owner !== activeTeam) {
                    obj.progress = (obj.progress || 0) + 4; // Incremento basato sul sync (4sec)
                    if (obj.progress >= captureTimeLimit) {
                        obj.owner = activeTeam;
                        obj.progress = 0;
                    }
                } else {
                    obj.progress = 0;
                }
            }
        });

        // 3. Punteggi Domination (Solo se sono Master aggiorno i punti globali)
        if(state.isMaster && record.game.mode === 'DOMINATION') {
            record.objectives.forEach(o => {
                if(o.owner === 'RED') record.game.scoreRed += 1;
                if(o.owner === 'BLUE') record.game.scoreBlue += 1;
            });
        }

        // 4. Update UI locale e salvataggio
        updateUI(record);
        
        await fetch(URL, {
            method: "PUT",
            headers: {"Content-Type": "application/json", "X-Master-Key": SECRET_KEY},
            body: JSON.stringify(record)
        });

    } catch (e) { console.error("Errore Sync"); }
}

function updateUI(r) {
    // Timer
    const elapsed = Math.floor((Date.now() - r.game.start) / 1000);
    const remain = (r.game.duration * 60) - elapsed;
    document.getElementById("timer").innerText = remain > 0 ? 
        `⏱️ ${Math.floor(remain/60)}:${(remain%60).toString().padStart(2,'0')}` : "FINE OPERAZIONE";
    
    // Score
    document.getElementById("scoreRed").innerText = Math.floor(r.game.scoreRed/10);
    document.getElementById("scoreBlue").innerText = Math.floor(r.game.scoreBlue/10);
    
    // Pulizia Marker vecchi
    state.activeMarkers.forEach(m => map.removeLayer(m));
    state.activeMarkers = [];

    // Lista Obiettivi
    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    r.objectives.forEach(obj => {
        let color = obj.owner === 'RED' ? '#f00' : (obj.owner === 'BLUE' ? '#0ff' : '#fff');
        if(obj.contested) color = 'yellow';
        
        const perc = Math.round((obj.progress / parseInt(document.getElementById("captureTime").value)) * 100) || 0;
        
        let li = document.createElement("li");
        li.style.borderLeft = `5px solid ${color}`;
        li.style.paddingLeft = "10px";
        li.innerHTML = `<div><b>${obj.name}</b></div><div style="font-size:0.7rem; color:#888;">${obj.contested ? 'CONTESO' : 'OWNER: '+obj.owner} ${perc>0 ? '['+perc+'%]' : ''}</div>`;
        li.onclick = () => startNavigation(obj);
        sb.appendChild(li);

        // Marker Mappa
        let m = L.circle([obj.lat, obj.lon], {radius: 15, color: color, weight: 2, fillOpacity: 0.3}).addTo(map);
        state.activeMarkers.push(m);
    });

    // Radar Team
    const pl = document.getElementById("playerList");
    pl.innerHTML = "";
    Object.entries(r.players).forEach(([name, p]) => {
        if(Date.now() - p.last < 30000 && p.team === state.playerTeam && name !== state.playerName) {
            const d = getDistance(p.lat, p.lon, state.playerMarker.getLatLng().lat, state.playerMarker.getLatLng().lng);
            pl.innerHTML += `<li><span style="color:${p.team==='RED'?'#f44':'#4cf'}">●</span> ${name} (${d}m)</li>`;
            let pm = L.circleMarker([p.lat, p.lon], {radius: 6, color: p.team==='RED'?'red':'cyan', fillOpacity:1}).addTo(map);
            state.activeMarkers.push(pm);
        }
    });
}

// --- NAVIGAZIONE ---

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

// --- UTILITY ---

function getDistance(lat1, lon1, lat2, lon2) {
    const R = 6371000;
    const dLat = (lat2 - lat1) * Math.PI / 180;
    const dLon = (lon2 - lon1) * Math.PI / 180;
    const a = Math.sin(dLat/2) * Math.sin(dLat/2) + Math.cos(lat1 * Math.PI / 180) * Math.cos(lat2 * Math.PI / 180) * Math.sin(dLon/2) * Math.sin(dLon/2);
    return Math.round(R * 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1-a)));
}

function centerMap() {
    state.autoCenter = true;
    if(state.playerMarker) map.panTo(state.playerMarker.getLatLng());
}

async function resetDatabase() {
    if(!confirm("VUOI CANCELLARE TUTTO IL DATABASE?")) return;
    const initial = {
        game: { mode: state.selectedMode, scoreRed: 0, scoreBlue: 0, start: Date.now(), duration: parseInt(document.getElementById("gameDuration").value) },
        players: {},
        objectives: [
            { name: "ALFA", lat: 45.2377, lon: 8.8097, owner: "LIBERO", progress: 0 },
            { name: "BRAVO", lat: 45.2385, lon: 8.8105, owner: "LIBERO", progress: 0 },
            { name: "CHARLIE", lat: 45.2369, lon: 8.8115, owner: "LIBERO", progress: 0 },
            { name: "DELTA", lat: 45.2392, lon: 8.8085, owner: "LIBERO", progress: 0 },
            { name: "ECHO", lat: 45.2360, lon: 8.8075, owner: "LIBERO", progress: 0 }
        ]
    };
    await fetch(URL, { method: "PUT", headers: {"Content-Type": "application/json", "X-Master-Key": SECRET_KEY}, body: JSON.stringify(initial) });
    alert("DATABASE RESETTATO!");
}
