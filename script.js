const BIN_ID="696d4940ae596e708fe53514";
const SECRET_KEY="$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL=`https://api.jsonbin.io/v3/b/${BIN_ID}`;

const CAPTURE_TIME = 180000;     // 3 minuti
const SCORE_INTERVAL = 30000;   // 30 secondi

let me=null,team=null,isMaster=false,joined=false;
let myPos=null,myMarker=null;

// 🔊 SUONO CONQUISTA
const captureSound = new Audio("https://actions.google.com/sounds/v1/cartoon/clang_and_wobble.ogg");

// MAPPA
const map=L.map("map").setView([45.237763,8.809708],18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// OBIETTIVI
const objectivesData={
 PF1:[45.238376,8.810060],
 PF2:[45.237648,8.810941],
 PF3:[45.238634,8.808772],
 PF4:[45.237771,8.809208],
 PF5:[45.237995,8.808303]
};

const objMarkers={};
Object.entries(objectivesData).forEach(([n,p])=>{
 objMarkers[n]=L.circle(p,{radius:6,color:"white",fillOpacity:0.4}).addTo(map);
});

// API
async function api(method,data){
 return fetch(URL,{
  method,
  headers:{
   "X-Master-Key":SECRET_KEY,
   "Content-Type":"application/json"
  },
  body:data?JSON.stringify(data):null
 }).then(r=>r.json());
}

// LOGIN
async function login(){
 me=nameEl.value.trim()+"#"+pinEl.value.trim();
 team=teamSelect.value;
 isMaster=masterPass.value==="71325";
 loginBox.classList.add("hidden");
 playerPanel.classList.remove("hidden");
 if(isMaster) masterPanel.classList.remove("hidden");
 setInterval(sync,2000);
}

// JOIN
async function joinGame(){
 let d=(await api("GET")).record;
 d.players[me]={team,joined:true};
 await api("PUT",{record:d});
 joined=true;
}

// MASTER
async function startGame(){
 let d=(await api("GET")).record;
 d.game={
  started:true,
  startTime:Date.now(),
  duration:+duration.value*60,
  mode:modeSelect.value,
  score:{RED:0,BLUE:0},
  lastScoreTick:Date.now()
 };
 await api("PUT",{record:d});
}

async function stopGame(){
 let d=(await api("GET")).record;
 d.game.started=false;
 await api("PUT",{record:d});
}

// GPS
navigator.geolocation.watchPosition(p=>{
 myPos=[p.coords.latitude,p.coords.longitude];
 if(!myMarker) myMarker=L.marker(myPos).addTo(map);
 else myMarker.setLatLng(myPos);
},{},{enableHighAccuracy:true});

function dist(a,b){ return map.distance(a,b); }

// SYNC
async function sync(){
 let d=(await api("GET")).record;
 const now=Date.now();

 // TIMER
 if(d.game.started){
  let left=d.game.duration-(now-d.game.startTime)/1000;
  timer.textContent=left>0
   ?`⏱️ ${Math.floor(left/60)}:${Math.floor(left%60).toString().padStart(2,"0")}`
   :"⛔ FINE PARTITA";
 }

 // SCORE
 if(d.game.started && now-d.game.lastScoreTick>=SCORE_INTERVAL){
  Object.values(d.objectives).forEach(o=>{
   if(o.owner) d.game.score[o.owner]++;
  });
  d.game.lastScoreTick=now;
 }

 scoreBox.textContent=`🔴 RED ${d.game.score.RED} | 🔵 BLUE ${d.game.score.BLUE}`;

 // OBIETTIVI
 if(joined && myPos && d.game.started){
  Object.entries(objectivesData).forEach(([name,pos])=>{
   let o=d.objectives[name];
   if(dist(myPos,pos)<=6){
    if(!o.owner && !o.capturingBy){
     o.capturingBy=team;
     o.captureStart=now;
    }
    if(o.capturingBy===team && now-o.captureStart>=CAPTURE_TIME){
     o.owner=team;
     o.capturingBy=null;
     o.captureStart=null;
     captureSound.play();
    }
   }
  });
 }

 // UI
 objectives.innerHTML="";
 Object.entries(d.objectives).forEach(([k,v])=>{
  let li=document.createElement("li");
  li.textContent=`${k}: ${v.owner||"Libero"}`;
  objectives.appendChild(li);
  objMarkers[k].setStyle({
   color:v.owner==="RED"?"red":v.owner==="BLUE"?"blue":"white"
  });
 });

 await api("PUT",{record:d});
}
