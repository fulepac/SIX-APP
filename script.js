const BIN_ID = "696d4940ae596e708fe53514";
const SECRET_KEY = "$2a$10$8flpC9MOhAbyRpJOlsFLWO.Mb/virkFhLrl9MIFwETKeSkmBYiE2e";
const URL = `https://api.jsonbin.io/v3/b/${BIN_ID}`;

let state = { isMaster: false, playerName: "", playerTeam: "" };

// QUESTA FUNZIONE COMANDA LA COMPARSA DELLA PASSWORD
function toggleMasterTools() {
    const isChecked = document.getElementById("isMaster").checked;
    const toolsDiv = document.getElementById("masterTools");
    if(isChecked) {
        toolsDiv.style.display = "block";
    } else {
        toolsDiv.style.display = "none";
    }
}

// Inizializza i 10 slot subito
function initSlots() {
    const container = document.getElementById("objSlotContainer");
    for(let i=0; i<10; i++) {
        container.innerHTML += `
            <div style="font-size:10px; margin-bottom:5px;">
                <input type="checkbox" class="act" ${i<2?'checked':''}> OBJ ${i+1}
                <input type="text" class="nm" value="OBJ${i+1}" style="width:40px">
                <input type="text" class="lt" value="45.23" style="width:40px">
                <input type="text" class="ln" value="8.80" style="width:40px">
            </div>`;
    }
}

const map = L.map("map", { zoomControl: false }).setView([45.2377, 8.8097], 18);
L.tileLayer('https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}').addTo(map);

async function startGame() {
    state.playerName = document.getElementById("playerName").value.trim().toUpperCase();
    state.playerTeam = document.getElementById("teamSelect").value;
    state.isMaster = document.getElementById("isMaster").checked;

    if(!state.playerName) return alert("Manca il nome!");
    if(state.isMaster && document.getElementById("masterPass").value !== "71325") return alert("Password errata!");

    document.getElementById("menu").style.display = "none";
    document.getElementById("game-ui").style.display = "block";

    setInterval(sync, 4000);
}

async function sync() {
    try {
        const res = await fetch(`${URL}/latest`, { headers: {"X-Master-Key":SECRET_KEY}, cache:'no-store'});
        const data = await res.json();
        let record = data.record;

        if (state.isMaster && (!record.game || !record.game.started)) {
            record.game = { started: true };
            record.objectives = [];
            document.querySelectorAll("#objSlotContainer div").forEach(div => {
                if(div.querySelector(".act").checked) {
                    record.objectives.push({
                        name: div.querySelector(".nm").value,
                        lat: parseFloat(div.querySelector(".lt").value),
                        lon: parseFloat(div.querySelector(".ln").value),
                        owner: "LIBERO"
                    });
                }
            });
            await fetch(URL, { method:"PUT", headers:{"Content-Type":"application/json","X-Master-Key":SECRET_KEY}, body: JSON.stringify(record)});
        }
        
        const sb = document.getElementById("scoreboard");
        sb.innerHTML = "<h3>OBIETTIVI:</h3>";
        (record.objectives || []).forEach(o => {
            sb.innerHTML += `<p>${o.name}: ${o.owner}</p>`;
        });
        document.getElementById("statusBanner").innerText = record.game?.started ? "IN CORSO" : "PRONTO";
    } catch(e) {}
}

window.onload = initSlots;
