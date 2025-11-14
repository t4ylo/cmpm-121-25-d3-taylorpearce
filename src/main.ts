// @deno-types="npm:@types/leaflet"
import leaflet from "leaflet";
import "leaflet/dist/leaflet.css";
import "./style.css";
import "./_leafletWorkaround.ts";

// constants
// earth spanning and null island
const ORIGIN = leaflet.latLng(0, 0);
const CELL_DEG = 1e-4;
const GAMEPLAY_ZOOM_LEVEL = 19;
const COLLECT_RADIUS_M = 60;
const TOKEN_FONT_SIZE = 24;
const PER_CELL_TOKEN_CHANCE = 0.25;
const MAX_TIER = 4 as const;
const START_POS = leaflet.latLng(36.997936938057016, -122.05703507501151);

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

// memento
type CellMemento = { tier: Tier | null };
const cellState = new Map<string, CellMemento>();

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
winDiv.textContent = `🎉 You created a Tier ${MAX_TIER} token!`;
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

leaflet.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
  maxZoom: 19,
  attribution: "© OpenStreetMap",
}).addTo(map);

let playerPos = START_POS;
const playerMarker = leaflet.marker(playerPos).addTo(map).bindTooltip(
  "That's you!",
);

// grid

type Cell = { i: number; j: number };
const cellKey = (c: Cell) => `${c.i},${c.j}`;

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
  return cellBounds(c).getCenter();
}

function visibleCellRange() {
  const b = map.getBounds();
  const nw = b.getNorthWest();
  const se = b.getSouthEast();
  const iMin = Math.floor((se.lat - ORIGIN.lat) / CELL_DEG);
  const iMax = Math.floor((nw.lat - ORIGIN.lat) / CELL_DEG);
  const jMin = Math.floor((nw.lng - ORIGIN.lng) / CELL_DEG);
  const jMax = Math.floor((se.lng - ORIGIN.lng) / CELL_DEG);
  return { iMin, iMax, jMin, jMax };
}

// tokens and hand

type Tier = 1 | 2 | 3 | 4;
type Token = {
  id: string;
  cell: Cell;
  latlng: leaflet.LatLng;
  tier: Tier;
  marker: leaflet.Marker;
};

let hand: Tier | null = null;

function tokenIcon(tier: Tier) {
  const emoji = tier === 1
    ? "🟡"
    : tier === 2
    ? "🟣"
    : tier === 3
    ? "🔵"
    : "💎";
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
    `Tokens on screen: ${cellTokens.size}. Interact within ${COLLECT_RADIUS_M}m. Cells reroll only after leaving the screen.`;
}

// diffed viewport

const cellRects = new Map<string, leaflet.Rectangle>();
const cellTokens = new Map<string, Token>();
let visibleKeys = new Set<string>();

function addCell(c: Cell) {
  const key = cellKey(c);
  if (cellRects.has(key)) return;

  const rect = leaflet.rectangle(cellBounds(c), {
    color: "#999",
    weight: 1,
    fillOpacity: 0,
  }).addTo(map);
  cellRects.set(key, rect);

  if (Math.random() < PER_CELL_TOKEN_CHANCE) {
    const r = Math.random();
    const tier: Tier = r < 0.75 ? 1 : r < 0.95 ? 2 : 3;
    const center = cellCenter(c);
    const marker = leaflet.marker(center, { icon: tokenIcon(tier) }).addTo(map);
    marker.bindTooltip(`Tier ${tier} token (click to interact)`);

    const tok: Token = { id: key, cell: c, latlng: center, tier, marker };
    cellTokens.set(key, tok);

    marker.on("click", () => {
      const d = playerPos.distanceTo(center);
      if (d > COLLECT_RADIUS_M) {
        alert(`Too far (${d.toFixed(0)}m). Need ≤ ${COLLECT_RADIUS_M}m.`);
        return;
      }

      if (hand === null) {
        hand = tok.tier;
        marker.remove();
        cellTokens.delete(key);
        cellState.set(key, { tier: null });
        renderStatus();
        return;
      }

      if (hand === tok.tier) {
        const next = Math.min(tok.tier + 1, MAX_TIER) as Tier;
        setMarkerTier(tok, next);
        hand = null;
        if (next === MAX_TIER) {
          winDiv.textContent = `🎉 You created a Tier ${MAX_TIER} token!`;
          winDiv.style.display = "block";
        }
        renderStatus();
      } else {
        statusPanelDiv.textContent =
          `Tiers must match to merge. Holding Tier ${hand}, clicked Tier ${tok.tier}. Tokens on screen: ${cellTokens.size}.`;
      }
    });
  }
}

function removeCell(c: Cell) {
  const key = cellKey(c);
  const rect = cellRects.get(key);
  if (rect) {
    rect.remove();
    cellRects.delete(key);
  }
  const tok = cellTokens.get(key);
  if (tok) {
    tok.marker.remove();
    cellTokens.delete(key);
  }
}

function updateVisibleCells() {
  const { iMin, iMax, jMin, jMax } = visibleCellRange();

  const nextKeys = new Set<string>();
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      nextKeys.add(`${i},${j}`);
    }
  }

  for (const key of visibleKeys) {
    if (!nextKeys.has(key)) {
      const [i, j] = key.split(",").map(Number);
      removeCell({ i, j });
    }
  }

  for (const key of nextKeys) {
    if (!visibleKeys.has(key)) {
      const [i, j] = key.split(",").map(Number);
      addCell({ i, j });
    }
  }

  visibleKeys = nextKeys;
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

map.on("moveend", updateVisibleCells);

globalThis.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "e") return;
  if (cellTokens.size === 0) return;

  let nearest: Token | null = null;
  let best = Infinity;
  for (const t of cellTokens.values()) {
    const d = playerPos.distanceTo(t.latlng);
    if (d < best) {
      best = d;
      nearest = t;
    }
  }
  if (!nearest || best > COLLECT_RADIUS_M) return;

  const key = cellKey(nearest.cell);

  if (hand === null) {
    hand = nearest.tier;
    nearest.marker.remove();
    cellTokens.delete(key);
    cellState.set(key, { tier: null });
    renderStatus();
  } else if (hand === nearest.tier) {
    const next = Math.min(nearest.tier + 1, MAX_TIER) as Tier;
    setMarkerTier(nearest, next);
    hand = null;
    if (next === MAX_TIER) {
      winDiv.textContent = `🎉 You created a Tier ${MAX_TIER} token!`;
      winDiv.style.display = "block";
    }
    renderStatus();
  } else {
    statusPanelDiv.textContent =
      `Tiers must match to merge. Holding Tier ${hand}, nearest is Tier ${nearest.tier}. Tokens on screen: ${cellTokens.size}.`;
  }
});

updateVisibleCells();
renderStatus();
