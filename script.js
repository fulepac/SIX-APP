// ================================================
// CONFIG JSONBIN.IO
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const JSONBIN_URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

// ================================================
// STATO GLOBALE
let gameStarted = false;
let isMaster = false;
let gameTime = 0;
let timerInterval = null;
let playerName = "";
let playerTeam = "";
let playerMarker = null;
let operators = [];
let objectives = [];

// ================================================
// MAPPA
const map = L.map("map").setView([45.237763, 8.809708], 18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",{maxZoom:19}).addTo(map);

// ================================================
// OBIETTIVI PREDEFINITI
const predefinedObjectives = [
    {name:"PF1", lat:45.238376, lon:8.810060},
    {name:"PF2", lat:45.237648, lon:8.810941},
    {name:"PF3", lat:45.238634, lon:8.808772},
    {name:"PF4", lat:45.237771, lon:8.809208},
    {name:"PF5", lat:45.237995, lon:8.808303}
];

// Inizializza obiettivi su mappa
predefinedObjectives.forEach(o=>{
    const obj = {...o, owner:null, operator:null, radius:6, marker:null};
    obj.marker = L.circle([obj.lat,obj.lon],{
        radius: obj.radius,
        color:'white',
        fillOpacity:0.4
    }).addTo(map).bindPopup(`${obj.name} - Libero`);
    objectives.push(obj);
});
updateScoreboard();

// ================================================
// FUNZIONI BIN ONLINE
async function fetchBin(){
    try{
        const res = await fetch(JSONBIN_URL+"/latest",{
            headers:{"X-Master-Key":SECRET_KEY}
        });
        const data = await res.json();
        const record = data.record;

        // Aggiorna stato globale dal bin
        gameStarted = record.gameStarted;
        gameTime = record.gameTime;
        operators = record.operators;
        objectives.forEach((obj,i)=>{
            obj.owner = record.objectives[i].owner;
            obj.operator = record.objectives[i].operator;
            obj.marker.setStyle({color: obj.owner? (obj.owner=="ALFA"?"blue":"red"):"white"});
            obj.marker.bindPopup(obj.owner? `${obj.name} - ${obj.owner} - ${obj.operator}`:`${obj.name} - Libero`);
        });

        updateScoreboard();
        updateOperatorsUI();
        updateTimerDisplay();

    }catch(e){console.log(e);}
}

async function updateBin(){
    const data = {
        gameStarted,
        gameTime,
        operators,
        objectives: objectives.map(o=>({name:o.name,lat:o.lat,lon:o.lon,owner:o.owner,operator:o.operator,radius:o.radius}))
    };
    try{
        await fetch(JSONBIN_URL,{
            method:"PUT",
            headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY},
            body:JSON.stringify(data)
        });
    }catch(e){console.log(e);}
}

setInterval(fetchBin,2000); // Polling ogni 2s

// ================================================
// TIMER
function startTimer(){
    if(timerInterval) clearInterval(timerInterval);
    timerInterval = setInterval(()=>{
        if(gameTime<=0){
            clearInterval(timerInterval);
            document.getElementById("timer").innerText="⛔ PARTITA TERMINATA";
            gameStarted=false;
            updateBin();
            return;
        }
        gameTime--;
        updateTimerDisplay();
        updateBin();
    },1000);
}

function updateTimerDisplay(){
    const m = Math.floor(gameTime/60);
    const s = gameTime%60;
    document.getElementById("timer").innerText=gameStarted?`⏱️ Tempo: ${m}:${s.toString().padStart(2,"0")}`:`⏱️ In attesa`;
}

// ================================================
// OPERATORI
function addOperator(){
    const displayName = playerName + (isMaster?" 👑":"");
    if(!operators.includes(displayName)) operators.push(displayName);
    updateOperatorsUI();
    updateBin();
}

function updateOperatorsUI(){
    const ul = document.getElementById("operators");
    ul.innerHTML="";
    operators.forEach(op=>{
        const li = document.createElement("li");
        li.innerText=op;
        ul.appendChild(li);
    });
}

// ================================================
// SCOREBOARD
function updateScoreboard(){
    const sb = document.getElementById("scoreboard");
    sb.innerHTML="";
    objectives.forEach(o=>{
        const li = document.createElement("li");
        li.innerText=o.owner? `${o.name} - ${o.owner} - ${o.operator}`:`${o.name} - Libero`;
        sb.appendChild(li);
    });
}

// ================================================
// AVVIO PARTITA
function startGame(){
    playerName = document.getElementById("playerName").value.trim();
    playerTeam = document.getElementById("teamSelect").value;
    const pwd = document.getElementById("masterPwd").value;
    isMaster = pwd==="71325";

    if(!playerName){ alert("Inserisci nome"); return; }

    if(isMaster){
        const min = parseInt(document.getElementById("gameDuration").value);
        if(!min){ alert("Il master deve impostare il tempo"); return; }
        gameTime = min*60;
        gameStarted=true;
        startTimer();
        updateBin();
    }else{
        if(!gameStarted) return alert("La partita non è stata ancora avviata dal master!");
    }

    lockInputs();
    addOperator();
}

// ================================================
// FINE PARTITA
function stopGame(){
    if(!isMaster) return alert("Solo il master può fermare la partita!");
    clearInterval(timerInterval);
    gameStarted=false;
    updateBin();
    document.getElementById("timer").innerText="⛔ PARTITA TERMINATA";
}

// ================================================
// INPUT LOCK
function lockInputs(){
    document.getElementById("playerName").disabled=true;
    document.getElementById("teamSelect").disabled=true;
    document.getElementById("gameDuration").disabled=true;
    document.getElementById("masterPwd").disabled=true;
}

// ================================================
// RESET PLAYER
function resetPlayer(){ location.reload(); }

// ================================================
// GPS
navigator.geolocation.watchPosition(
    pos=>{
        const lat = pos.coords.latitude;
        const lon = pos.coords.longitude;
        document.getElementById("status").innerText=`📍 GPS attivo ${lat.toFixed(5)}, ${lon.toFixed(5)}`;
        if(!playerMarker) playerMarker=L.marker([lat,lon]).addTo(map);
        else playerMarker.setLatLng([lat,lon]);
    },
    ()=>{document.getElementById("status").innerText="❌ GPS non disponibile";},
    {enableHighAccuracy:true}
);
