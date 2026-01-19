const BIN_ID="696d4940ae596e708fe53514";
const SECRET_KEY="$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const API=`https://api.jsonbin.io/v3/b/${BIN_ID}`;

let playerId, team, isMaster=false;
let map;

const objectives=[
 {name:"PF1",lat:45.238376,lon:8.810060,owner:null},
 {name:"PF2",lat:45.237648,lon:8.810941,owner:null},
 {name:"PF3",lat:45.238634,lon:8.808772,owner:null},
 {name:"PF4",lat:45.237771,lon:8.809208,owner:null},
 {name:"PF5",lat:45.237995,lon:8.808303,owner:null}
];

async function getData(){
 const r=await fetch(API,{headers:{"X-Master-Key":SECRET_KEY}});
 return (await r.json()).record;
}

async function saveData(d){
 await fetch(API,{
  method:"PUT",
  headers:{
   "Content-Type":"application/json",
   "X-Master-Key":SECRET_KEY
  },
  body:JSON.stringify(d)
 });
}

async function joinGame(){
 const name=document.getElementById("name").value;
 if(!name)return alert("Nome mancante");

 const data=await getData();
 playerId=crypto.randomUUID();
 team=document.getElementById("team").value;
 isMaster=document.getElementById("masterpass").value==="71325";

 if(isMaster) masterPanel.classList.remove("hidden");

 data.players[playerId]={name,team,active:true};
 await saveData(data);
 initMap();
}

async function startMatch(){
 const data=await getData();
 data.match={
  active:true,
  start:Date.now(),
  duration:matchTime.value*60,
  mode:mode.value
 };
 await saveData(data);
}

async function stopMatch(){
 const data=await getData();
 data.match.active=false;
 await saveData(data);
}

async function resetAll(){
 await saveData({
  players:{},
  match:{active:false},
  score:{RED:0,BLUE:0}
 });
 location.reload();
}

function initMap(){
 map=L.map("map").setView([45.2382,8.8095],17);
 L.tileLayer("https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png").addTo(map);
 objectives.forEach(o=>{
  L.circle([o.lat,o.lon],{radius:8}).addTo(map).bindPopup(o.name);
 });
 setInterval(update,2000);
}

async function update(){
 const d=await getData();

 status.innerText=d.match.active?"PARTITA IN CORSO":"IN ATTESA";

 if(d.match.active){
  const t=d.match.duration-Math.floor((Date.now()-d.match.start)/1000);
  timer.innerText=`${Math.floor(t/60)}:${(t%60).toString().padStart(2,"0")}`;
 }

 redPlayers.innerHTML="";
 bluePlayers.innerHTML="";

 Object.values(d.players).forEach(p=>{
  const li=document.createElement("li");
  li.textContent=(p.active?"🟢 ":"⚪ ")+p.name;
  (p.team==="RED"?redPlayers:bluePlayers).appendChild(li);
 });

 redScore.innerText=d.score.RED;
 blueScore.innerText=d.score.BLUE;
}
