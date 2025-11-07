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
const CACHE_SPAWN_PROBABILITY = 0.2;

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

leaflet.marker(CLASSROOM_LATLNG).addTo(map).bindTooltip("That's you!");

// spawn some rectangles as “cache cells”
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      const origin = CLASSROOM_LATLNG;
      const bounds = leaflet.latLngBounds([
        [origin.lat + i * TILE_DEGREES, origin.lng + j * TILE_DEGREES],
        [
          origin.lat + (i + 1) * TILE_DEGREES,
          origin.lng + (j + 1) * TILE_DEGREES,
        ],
      ]);
      leaflet.rectangle(bounds, { color: "#888" }).addTo(map);
    }
  }
}
