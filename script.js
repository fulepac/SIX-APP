/**************** CONFIG ****************/
const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const API = `https://api.jsonbin.io/v3/b/${BIN_ID}`;
const MASTER_PASSWORD = "71325";

const CAPTURE_TIME = 180; // 3 minuti permanenza
const CAPTURE_RADIUS = 8; // metri

/**************** STATO ****************/
let playerId = crypto.randomUUID();
let playerName="", playerTeam="", isMaster=false;
let map, playerMarker=null;

/**************** OBIETTIVI ****************/
const localObjectives = [
  {name:"PF1", lat:45.238376, lon:8.810060},
  {name:"PF2", lat:45.237648, lon:8.810941},
  {name:"PF3", lat:45.238634, lon:8.808772},
  {name:"PF4", lat:45.237771, lon:8.809208},
  {name:"PF5", lat:45.237995, lon:8.808303}
];

/**************** ELEMENTI DOM ****************/
const objectiveList = document.getElementById("objectiveList");
const timerElem = document.getElementById("timer");
const statusElem = document.getElementById("status");
const redList = document.getElementById("redList");
const blueList = document.getElementById("blueList");
const masterPanel = document.getElementById("masterPanel");
const playerNameInput = document.getElementById("playerName");
const teamSelect = document.getElementById("teamSelect");
const masterPass = document.getElementById("masterPass");
const gameDuration = document.getElementById("gameDuration");

/**************** API ****************/
async function getData(){
  try{
    const res = await fetch(API, { headers:{ "X-Master-Key":SECRET_KEY }});
    return (await res.json()).record;
  }catch{ return null; }
}

async function saveData(data){
  await fetch(API,{
    method:"PUT",
    headers:{
      "Content-Type":"application/json",
      "X-Master-Key":SECRET_KEY
    },
    body:JSON.stringify(data)
  });
}

/**************** JOIN ****************/
async function joinGame(){
  playerName = playerNameInput.value.trim();
  playerTeam = teamSelect.value;
  isMaster = masterPass.value===MASTER_PASSWORD;

  if(!playerName) return alert("Inserisci nome");

  let data = await getData();
  if(!data){
    data = { players:{}, match:{started:false}, objectives: localObjectives.map(o=>({ ...o, owner:null, captureTeam:null, captureStart:null })) };
  }

  data.players[playerId] = { name:playerName, team:playerTeam, lat:null, lon:null, online:true };
  await saveData(data);

  if(isMaster) masterPanel.classList.remove("hidden");

  initMap();
}

/**************** MASTER ****************/
async function startGame(){
  const min = parseInt(gameDuration.value);
  if(!min) return alert("Imposta durata partita!");
  const data = await getData();
  data.match = { started:true, startTime:Date.now(), duration:min*60 };
  await saveData(data);
}

async function endGame(){
  const data = await getData();
  data.match.started = false;
  await saveData(data);
}

async function resetAll(){
  await saveData({
    players:{}, match:{started:false}, objectives:localObjectives.map(o=>({ ...o, owner:null, captureTeam:null, captureStart:null }))
  });
  location.reload();
}

/**************** MAP ****************/
function initMap(){
  map = L.map("map").setView([45.2382,8.8095],17);
  L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

  navigator.geolocation.watchPosition(pos=>{
    const {latitude, longitude} = pos.coords;
    if(!playerMarker){
      playerMarker = L.marker([latitude,longitude]).addTo(map);
    }else playerMarker.setLatLng([latitude,longitude]);

    updatePosition(latitude,longitude);
  });

  setInterval(gameLoop,2000);
}

/**************** UPDATE POS ****************/
async function updatePosition(lat,lon){
  const data = await getData();
  if(data.players[playerId]){
    data.players[playerId].lat = lat;
    data.players[playerId].lon = lon;
    await saveData(data);
  }
}

/**************** GAME LOOP ****************/
async function gameLoop(){
  const data = await getData();
  if(!data || !data.match.started) {
    statusElem.innerText="⏳ In attesa avvio master";
    return;
  }

  // logica conquista
  data.objectives.forEach(obj=>{
    const present = Object.values(data.players).filter(p=>{
      if(!p.lat) return false;
      return distance(p.lat,p.lon,obj.lat,obj.lon)<CAPTURE_RADIUS;
    });
    const teams = [...new Set(present.map(p=>p.team))];

    if(present.length===0){ obj.captureTeam=null; obj.captureStart=null; return; }
    if(teams.length>1) return;
    const team = teams[0];
    if(obj.owner===team){ obj.captureTeam=null; obj.captureStart=null; return; }
    if(!obj.captureTeam){ obj.captureTeam=team; obj.captureStart=Date.now(); }
    if(Date.now()-obj.captureStart>=CAPTURE_TIME*1000){ obj.owner=team; obj.captureTeam=null; obj.captureStart=null; }
  });

  await saveData(data);
  updateUI(data);
}

/**************** UI ****************/
function updateUI(data){
  // timer
  if(data.match.started){
    const r = data.match.duration-Math.floor((Date.now()-data.match.startTime)/1000);
    timerElem.innerText = `${Math.floor(r/60)}:${(r%60).toString().padStart(2,"0")}`;
    statusElem.innerText="🔥 PARTITA IN CORSO";
  }else statusElem.innerText="⏳ In attesa avvio master";

  // obiettivi
  objectiveList.innerHTML="";
  data.objectives.forEach(o=>{
    const li=document.createElement("li");
    li.textContent=`${o.name} - ${o.owner||"LIBERO"}`;
    objectiveList.appendChild(li);
  });

  // operatori
  redList.innerHTML="";
  blueList.innerHTML="";
  Object.values(data.players).forEach(p=>{
    const li=document.createElement("li");
    li.textContent=p.name;
    (p.team==="RED"?redList:blueList).appendChild(li);
  });
}

/**************** UTIL ****************/
function distance(a,b,c,d){ return Math.sqrt((a-c)**2+(b-d)**2)*111139; }
