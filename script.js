const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { playerName: "", playerTeam: "", selectedMode: "DOMINATION", autoCenter: true };
let map, playerMarker;
let activeMarkers = [];

function checkMasterPass() {
    if(document.getElementById("masterPass").value === "71325") {
        document.getElementById("masterTools").style.display = "block";
    }
}

function selectGameMode(m) {
    state.selectedMode = m;
    document.getElementById("btnDomination").className = m === 'DOMINATION' ? 'mode-btn active' : 'mode-btn';
    document.getElementById("btnRecon").className = m === 'RECON' ? 'mode-btn active' : 'mode-btn';
}

// FIX BUSSOLA: Richiesta permessi esplicita
async function requestPermissions() {
    // Per iOS 13+
    if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function') {
        try {
            const permission = await DeviceOrientationEvent.requestPermission();
            if (permission === 'granted') {
                window.addEventListener('deviceorientation', handleOrientation);
            }
        } catch (error) {
            console.error("Permessi bussola negati");
        }
    } else {
        // Android o browser desktop
        window.addEventListener('deviceorientation', handleOrientation);
    }
    enableSensorsAndStart();
}

function handleOrientation(e) {
    // Calcolo heading per iOS (webkit) o Android (alpha)
    let heading = e.webkitCompassHeading || (360 - e.alpha);
    if (heading) {
        const mapRotate = document.getElementById("map-rotate");
        if(mapRotate) mapRotate.style.transform = `rotate(${-heading}deg)`;
    }
}

function enableSensorsAndStart() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    if(!state.playerName) return alert("Inserisci Nome!");

    document.getElementById("setup-screen").style.display = "none";
    document.getElementById("game-ui").style.display = "grid";

    if(!map) {
        map = L.map('map', { zoomControl: false, attributionControl: false }).setView([45.2377, 8.8097], 18);
        L.tileLayer('https://{s}.google.com/vt/lyrs=s&x={x}&y={y}&z={z}', {subdomains:['mt0','mt1','mt2','mt3'], maxZoom: 21}).addTo(map);
    }

    navigator.geolocation.watchPosition(p => {
        const pos = [p.coords.latitude, p.coords.longitude];
        if(!playerMarker) {
            playerMarker = L.circleMarker(pos, {radius: 8, color: '#fff', fillColor: '#007bff', fillOpacity: 1, weight: 3}).addTo(map);
            map.setView(pos, 19);
        } else {
            playerMarker.setLatLng(pos);
            if(state.autoCenter) map.panTo(pos);
        }
    }, null, {enableHighAccuracy: true});

    map.on('dragstart', () => state.autoCenter = false);
    setInterval(sync, 4000);
}

// Funzione sync e updateUI (rimaste invariate ma necessarie)
async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key": SECRET_KEY}, cache: 'no-store' });
        const { record } = await res.json();
        record.players[state.playerName] = { team: state.playerTeam, lat: playerMarker?.getLatLng().lat || 0, lon: playerMarker?.getLatLng().lng || 0, last: Date.now() };
        updateUI(record);
        await fetch(URL, { method: "PUT", headers: {"Content-Type": "application/json", "X-Master-Key": SECRET_KEY}, body: JSON.stringify(record) });
    } catch (e) {}
}

function updateUI(r) {
    const remain = (r.game.duration * 60) - Math.floor((Date.now() - r.game.start) / 1000);
    document.getElementById("timer").innerText = remain > 0 ? `⏱️ ${Math.floor(remain/60)}:${(remain%60).toString().padStart(2,'0')}` : "FINE";
    document.getElementById("scoreRed").innerText = Math.floor(r.game.scoreRed/10);
    document.getElementById("scoreBlue").innerText = Math.floor(r.game.scoreBlue/10);
    
    const sb = document.getElementById("scoreboard");
    sb.innerHTML = "";
    activeMarkers.forEach(m => map.removeLayer(m));
    activeMarkers = [];

    r.objectives.forEach(obj => {
        let color = obj.owner === 'RED' ? '#f00' : (obj.owner === 'BLUE' ? '#0ff' : '#fff');
        sb.innerHTML += `<li style="border-left:4px solid ${color}; padding-left:5px;"><b>${obj.name}</b>: ${obj.owner}</li>`;
        activeMarkers.push(L.circle([obj.lat, obj.lon], {radius: 15, color: color, weight: 2, fillOpacity: 0.2}).addTo(map));
    });
}
