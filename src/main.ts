// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./_leafletWorkaround.ts";
import luck from "./_luck.ts";

const CLASSROOM_LATLNG = leaflet.latLng(
  36.997936938057016,
  -122.05703507501151,
);
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

const playerMarker = leaflet.marker(CLASSROOM_LATLNG).addTo(map).bindTooltip(
  "That's you!",
);

// tokens
type Token = { id: string; latlng: leaflet.LatLng; marker: leaflet.Marker };
let tokens: Token[] = [];
const COLLECT_RADIUS_M = 60;

function spawnToken(i: number, j: number) {
  const origin = CLASSROOM_LATLNG;
  const lat = origin.lat + (i + 0.5) * TILE_DEGREES;
  const lng = origin.lng + (j + 0.5) * TILE_DEGREES;
  const m = leaflet.marker([lat, lng], {
    icon: leaflet.divIcon({ html: "🟡", className: "" }),
  }).addTo(map);
  m.bindTooltip("Token (click to collect if in range)");
  m.on("click", () => {
    const d = playerMarker.getLatLng().distanceTo(leaflet.latLng(lat, lng));
    if (d <= COLLECT_RADIUS_M) {
      m.remove();
      tokens = tokens.filter((t) => t.id !== `${i}-${j}`);
    } else alert("Too far to collect!");
  });
  tokens.push({ id: `${i}-${j}`, latlng: leaflet.latLng(lat, lng), marker: m });
}

for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) spawnToken(i, j);
  }
}
