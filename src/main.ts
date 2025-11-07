// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

const CLASSROOM_LATLNG = leaflet.latLng(36.997936938057016, -122.05703507501151);
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 6;
const CACHE_SPAWN_PROBABILITY = 0.15;

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: 19,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);

const playerMarker = leaflet.marker(CLASSROOM_LATLNG).addTo(map).bindTooltip("That's you!");

// panels
const controlPanel = document.createElement("div");
controlPanel.id = "controlPanel";
document.body.append(controlPanel);

const invPanel = document.createElement("div");
invPanel.innerHTML = `
  <h3>Inventory</h3>
  <div id="inv-t1">Tier1: 0</div>
  <div id="inv-t2">Tier2: 0</div>
  <div id="inv-t3">Tier3: 0</div>`;
controlPanel.append(invPanel);

const craftPanel = document.createElement("div");
craftPanel.innerHTML = `
  <h3>Crafting</h3>
  <button id="craft12">3×T1→T2</button>
  <button id="craft23">3×T2→T3</button>`;
controlPanel.append(craftPanel);

// inv state
const inv = { t1: 0, t2: 0, t3: 0 };

function renderInv() {
  (document.getElementById("inv-t1")!).textContent = `Tier1: ${inv.t1}`;
  (document.getElementById("inv-t2")!).textContent = `Tier2: ${inv.t2}`;
  (document.getElementById("inv-t3")!).textContent = `Tier3: ${inv.t3}`;
}

function craft12() { if (inv.t1 >= 3) { inv.t1 -= 3; inv.t2++; renderInv(); } }
function craft23() { if (inv.t2 >= 3) { inv.t2 -= 3; inv.t3++; renderInv(); } }

document.getElementById("craft12")!.addEventListener("click", craft12);
document.getElementById("craft23")!.addEventListener("click", craft23);

// token helpers
type Token = { id: string; latlng: leaflet.LatLng; marker: leaflet.Marker };
let tokens: Token[] = [];

function spawnToken(i: number, j: number) {
  const origin = CLASSROOM_LATLNG;
  const lat = origin.lat + (i + 0.5) * TILE_DEGREES;
  const lng = origin.lng + (j + 0.5) * TILE_DEGREES;
  const latlng = leaflet.latLng(lat, lng);

  const m = leaflet.marker(latlng, {
    icon: leaflet.divIcon({ html: "🟡", className: "" }),
  }).addTo(map);

  m.bindTooltip("Token (click to collect if in range)");

  m.on("click", () => {
    const d = playerMarker.getLatLng().distanceTo(latlng); // meters
    if (d <= 60) {
      inv.t1++;
      renderInv();
      m.remove();
      tokens = tokens.filter(t => t.id !== `${i}-${j}`);
    } else {
      alert("Too far to collect!");
    }
  });

  tokens.push({ id: `${i}-${j}`, latlng, marker: m });
}

renderInv();

// spawn neighborhood
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnToken(i, j);
    }
  }
}
