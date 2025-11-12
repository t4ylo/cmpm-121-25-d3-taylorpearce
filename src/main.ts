// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./_leafletWorkaround.ts";

// constants
// earth spanning and null island
const ORIGIN = leaflet.latLng(36.997936938057016, -122.05703507501151);
const CELL_DEG = 1e-4;
const GAMEPLAY_ZOOM_LEVEL = 19;
const COLLECT_RADIUS_M = 60;

const TOKEN_FONT_SIZE = 24;

const PER_CELL_TOKEN_CHANCE = 0.25;

// core layout

const controlPanelDiv = document.createElement("div");
controlPanelDiv.id = "controlPanel";
document.body.append(controlPanelDiv);

const mapDiv = document.createElement("div");
mapDiv.id = "map";
document.body.append(mapDiv);

const statusPanelDiv = document.createElement("div");
statusPanelDiv.id = "statusPanel";
document.body.append(statusPanelDiv);

// hand panel
const handPanel = document.createElement("div");
handPanel.className = "panel";
handPanel.innerHTML = `
  <h3>Hand</h3>
  <div class="row"><span>Holding</span><span id="hand" class="badge">Empty</span></div>
  <p style="margin-top:6px;font-size:12px;">Click a token to pick it up. Click another token of the <b>same tier</b> to merge (double the value).</p>
`;
controlPanelDiv.append(handPanel);

// movement buttons
const movePanel = document.createElement("div");
movePanel.className = "panel";
movePanel.innerHTML = `
  <h3>Move</h3>
  <div class="row" style="gap:6px; justify-content:flex-start;">
    <button id="moveN">⬆️ North</button>
    <button id="moveS">⬇️ South</button>
    <button id="moveW">⬅️ West</button>
    <button id="moveE">➡️ East</button>
  </div>
`;
controlPanelDiv.append(movePanel);

// win banner
const winDiv = document.createElement("div");
winDiv.className = "win";
winDiv.style.display = "none";
winDiv.textContent = "🎉 You created a Tier 3 token!";
controlPanelDiv.append(winDiv);

// map

const map = leaflet.map(mapDiv, {
  center: ORIGIN,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: true,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  })
  .addTo(map);

let playerPos = ORIGIN.clone();
const playerMarker = leaflet.marker(playerPos).addTo(map).bindTooltip(
  "That's you!",
);

//grid
type Cell = { i: number; j: number };

function _latLngToCell(p: leaflet.LatLng): Cell {
  const i = Math.floor((p.lat - ORIGIN.lat) / CELL_DEG);
  const j = Math.floor((p.lng - ORIGIN.lng) / CELL_DEG);
  return { i, j };
}

function cellBounds(c: Cell): leaflet.LatLngBounds {
  const lat1 = ORIGIN.lat + c.i * CELL_DEG;
  const lng1 = ORIGIN.lng + c.j * CELL_DEG;
  const lat2 = lat1 + CELL_DEG;
  const lng2 = lng1 + CELL_DEG;
  return leaflet.latLngBounds([[lat1, lng1], [lat2, lng2]]);
}

function cellCenter(c: Cell): leaflet.LatLng {
  const b = cellBounds(c);
  return b.getCenter();
}

// tokens and hand

type Tier = 1 | 2 | 3;
type Token = {
  id: string;
  cell: Cell;
  latlng: leaflet.LatLng;
  tier: Tier;
  marker: leaflet.Marker;
};
let tokens: Token[] = [];
let hand: Tier | null = null;
let hasWonThisSession = false;

function tokenIcon(tier: Tier) {
  const emoji = tier === 1 ? "🟡" : tier === 2 ? "🟣" : "🔵";
  return leaflet.divIcon({
    className: "",
    html: `<div style="font-size:${TOKEN_FONT_SIZE}px;">${emoji}</div>`,
  });
}

function setMarkerTier(tok: Token, newTier: Tier) {
  tok.tier = newTier;
  tok.marker.setIcon(tokenIcon(newTier));
  tok.marker.setTooltipContent(`Tier ${newTier} token (click to interact)`);
}

function renderStatus() {
  (handPanel.querySelector("#hand") as HTMLElement).textContent = hand
    ? `Tier ${hand}`
    : "Empty";
  statusPanelDiv.textContent =
    (hand ? `Holding Tier ${hand}. ` : `Hand empty. `) +
    `Tokens on screen: ${tokens.length}. Interact within ${COLLECT_RADIUS_M}m.`;
}

// spawn & despawn visual cells

let cellRects: leaflet.Rectangle[] = [];

function clearVisible() {
  for (const t of tokens) t.marker.remove();
  tokens = [];
  for (const r of cellRects) r.remove();
  cellRects = [];
}

function spawnForVisibleBounds() {
  const b = map.getBounds();

  const nw = b.getNorthWest();
  const se = b.getSouthEast();

  const iMin = Math.floor((se.lat - ORIGIN.lat) / CELL_DEG);
  const iMax = Math.floor((nw.lat - ORIGIN.lat) / CELL_DEG);
  const jMin = Math.floor((nw.lng - ORIGIN.lng) / CELL_DEG);
  const jMax = Math.floor((se.lng - ORIGIN.lng) / CELL_DEG);

  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      const cell: Cell = { i, j };

      const rect = leaflet.rectangle(cellBounds(cell), {
        color: "#999",
        weight: 1,
        fillOpacity: 0,
      });
      rect.addTo(map);
      cellRects.push(rect);

      // memoryless
      if (Math.random() < PER_CELL_TOKEN_CHANCE) {
        const tier: Tier = Math.random() < 0.75
          ? 1
          : (Math.random() < 0.9 ? 2 : 3);
        const center = cellCenter(cell);
        const marker = leaflet.marker(center, { icon: tokenIcon(tier) }).addTo(
          map,
        );
        marker.bindTooltip(`Tier ${tier} token (click to interact)`);

        const tok: Token = {
          id: `${i}-${j}-${Math.random()}`,
          cell,
          latlng: center,
          tier,
          marker,
        };
        tokens.push(tok);

        marker.on("click", () => {
          const d = playerPos.distanceTo(center);
          if (d > COLLECT_RADIUS_M) {
            alert(`Too far (${d.toFixed(0)}m). Need ≤ ${COLLECT_RADIUS_M}m.`);
            return;
          }

          if (hand === null) {
            hand = tok.tier;
            renderStatus();
            marker.remove();
            tokens = tokens.filter((t) => t.id !== tok.id);
            return;
          }

          if (hand === tok.tier) {
            const next = Math.min(tok.tier + 1, 3) as Tier;
            setMarkerTier(tok, next);
            hand = null;
            renderStatus();
            if (!hasWonThisSession && next === 3) {
              winDiv.style.display = "block";
              hasWonThisSession = true;
            }
          } else {
            statusPanelDiv.textContent =
              `Tiers must match to merge. Holding Tier ${hand}, clicked Tier ${tok.tier}. Tokens on screen: ${tokens.length}.`;
          }
        });
      }
    }
  }
}

function rerenderVisible() {
  clearVisible();
  spawnForVisibleBounds();
  renderStatus();
}

// movement & map events

function movePlayer(di: number, dj: number) {
  playerPos = leaflet.latLng(
    playerPos.lat + di * CELL_DEG,
    playerPos.lng + dj * CELL_DEG,
  );
  playerMarker.setLatLng(playerPos);
  map.panTo(playerPos);
}

(document.getElementById("moveN") as HTMLButtonElement).onclick = () =>
  movePlayer(+1, 0);
(document.getElementById("moveS") as HTMLButtonElement).onclick = () =>
  movePlayer(-1, 0);
(document.getElementById("moveW") as HTMLButtonElement).onclick = () =>
  movePlayer(0, -1);
(document.getElementById("moveE") as HTMLButtonElement).onclick = () =>
  movePlayer(0, +1);

map.on("moveend", () => rerenderVisible());

globalThis.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "e") return;
  if (tokens.length === 0) return;

  let nearest: Token | null = null;
  let best = Infinity;
  for (const t of tokens) {
    const d = playerPos.distanceTo(t.latlng);
    if (d < best) {
      best = d;
      nearest = t;
    }
  }
  if (!nearest || best > COLLECT_RADIUS_M) return;

  if (hand === null) {
    hand = nearest.tier;
    nearest.marker.remove();
    tokens = tokens.filter((t) => t.id !== nearest.id);
    renderStatus();
  } else if (hand === nearest.tier) {
    const next = Math.min(nearest.tier + 1, 3) as Tier;
    setMarkerTier(nearest, next);
    hand = null;
    renderStatus();
    if (!hasWonThisSession && next === 3) {
      winDiv.style.display = "block";
      hasWonThisSession = true;
    }
  } else {
    statusPanelDiv.textContent =
      `Tiers must match to merge. Holding Tier ${hand}, nearest is Tier ${nearest.tier}. Tokens on screen: ${tokens.length}.`;
  }
});

rerenderVisible();
renderStatus();
