const BIN_ID="696d4940ae596e708fe53514";
const SECRET_KEY="$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL=`https://api.jsonbin.io/v3/b/${BIN_ID}`;

let me=null,team=null,isMaster=false,joined=false;
let myPos=null,myMarker=null;

const CAPTURE_TIME = 180000; // 3 minuti

// MAPPA
const map=L.map("map").setView([45.237763,8.809708],18);
L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);

// OBJ FISSI
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
 const name=nameEl.value.trim();
 const pin=pinEl.value.trim();
 team=teamSelect.value;
 if(pin.length<4) return alert("PIN minimo 4 cifre");
 me=name+"#"+pin;
 isMaster=masterPass.value==="71325";
 loginBox.classList.add("hidden");
 playerPanel.classList.remove("hidden");
 if(isMaster) masterPanel.classList.remove("hidden");
 setInterval(sync,2000);
}

// ENTRA PARTITA
async function joinGame(){
 let d=(await api("GET")).record;
 d.players[me]={team,joined:true};
 await api("PUT",{record:d});
 joined=true;
}

// ESCI
async function leaveGame(){
 let d=(await api("GET")).record;
 delete d.players[me];
 await api("PUT",{record:d});
 joined=false;
}

// MASTER
async function startGame(){
 let d=(await api("GET")).record;
 d.game.started=true;
 d.game.startTime=Date.now();
 d.game.duration=+duration.value*60;
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
},()=>{}, {enableHighAccuracy:true});

// DISTANZA
function dist(a,b){
 return map.distance(a,b);
}

// SYNC
async function sync(){
 let d=(await api("GET")).record;

 // TIMER
 if(d.game.started){
  let left=d.game.duration-(Date.now()-d.game.startTime)/1000;
  timer.textContent=left>0
   ?`⏱️ ${Math.floor(left/60)}:${Math.floor(left%60).toString().padStart(2,"0")}`
   :"⛔ FINE PARTITA";
 } else timer.textContent="⏱️ In attesa";

 // PLAYER LIST
 players.innerHTML="";
 Object.entries(d.players).forEach(([p,v])=>{
  let li=document.createElement("li");
  li.textContent=`${p} (${v.team})`;
  players.appendChild(li);
 });

 // OBJ LOGIC
 if(joined && myPos && d.game.started){
  Object.entries(objectivesData).forEach(([name,pos])=>{
   const o=d.objectives[name];
   const inside=dist(myPos,pos)<=6;

   if(inside){
    if(!o.owner){
     if(!o.capturingBy){
      o.capturingBy=team;
      o.captureStart=Date.now();
     } else if(o.capturingBy===team){
      if(Date.now()-o.captureStart>=CAPTURE_TIME){
       o.owner=team;
       o.capturingBy=null;
       o.captureStart=null;
      }
     }
    }
   } else {
    if(o.capturingBy===team){
     o.capturingBy=null;
     o.captureStart=null;
    }
   }
  });
  await api("PUT",{record:d});
 }

 // UI OBJ
 objectives.innerHTML="";
 Object.entries(d.objectives).forEach(([k,v])=>{
  let li=document.createElement("li");
  li.textContent=`${k}: ${v.owner||"Libero"}`;
  objectives.appendChild(li);

  objMarkers[k].setStyle({
   color: v.owner==="RED"?"red":v.owner==="BLUE"?"blue":"white"
  });
 });
}
