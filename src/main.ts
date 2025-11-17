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

// localStorage key
const STORAGE_KEY = "world-of-bits-d3d-state";

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

// tokens and hand

type Tier = 1 | 2 | 3 | 4;

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

// movement mode toggle (buttons vs geolocation)
const modePanel = document.createElement("div");
modePanel.className = "panel";
modePanel.innerHTML = `
  <h3>Movement Mode</h3>
  <div class="row" style="gap:6px; justify-content:flex-start;">
    <button id="modeButtons">Buttons</button>
    <button id="modeGeo">Geolocation</button>
  </div>
  <p style="margin-top:6px;font-size:12px;">Switch between on-screen buttons and real-world movement.</p>
  <p id="modeLabel" style="margin-top:4px;font-size:12px;color:#555;">
    You’re in BUTTON mode (on-screen controls).
  </p>
`;
controlPanelDiv.append(modePanel);

// new game panel
const newGamePanel = document.createElement("div");
newGamePanel.className = "panel";
newGamePanel.innerHTML = `
  <h3>Game State</h3>
  <button id="newGame">New Game</button>
  <p style="margin-top:6px;font-size:12px;">Start over from a clean world and clear saved progress.</p>
`;
controlPanelDiv.append(newGamePanel);

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

// tokens and hand (cont.)

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

// diffed viewport

const cellRects = new Map<string, leaflet.Rectangle>();
const cellTokens = new Map<string, Token>();
let visibleKeys = new Set<string>();

function renderStatus() {
  (handPanel.querySelector("#hand") as HTMLElement).textContent = hand
    ? `Tier ${hand}`
    : "Empty";
  statusPanelDiv.textContent =
    (hand ? `Holding Tier ${hand}. ` : `Hand empty. `) +
    `Tokens on screen: ${cellTokens.size}. Interact within ${COLLECT_RADIUS_M}m. Cells persist once modified.`;
}

// persistence helpers
type SerializedCellState = { [key: string]: Tier | null };
type MovementMode = "buttons" | "geo";

interface GameState {
  playerLat: number;
  playerLng: number;
  hand: Tier | null;
  cellState: SerializedCellState;
  movementMode: MovementMode;
  hasWon: boolean;
}

function serializeCellState(): SerializedCellState {
  const obj: SerializedCellState = {};
  for (const [key, mem] of cellState.entries()) {
    obj[key] = mem.tier;
  }
  return obj;
}

function deserializeCellState(obj: SerializedCellState) {
  cellState.clear();
  for (const key of Object.keys(obj)) {
    cellState.set(key, { tier: obj[key] });
  }
}

let currentMovementMode: MovementMode = "buttons";

function saveGameState() {
  try {
    if (typeof localStorage === "undefined") return;
    const state: GameState = {
      playerLat: playerPos.lat,
      playerLng: playerPos.lng,
      hand,
      cellState: serializeCellState(),
      movementMode: currentMovementMode,
      hasWon: winDiv.style.display !== "none",
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch {
    // ignore
  }
}

function loadGameState(): GameState | null {
  try {
    if (typeof localStorage === "undefined") return null;
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as GameState;
    return parsed;
  } catch {
    return null;
  }
}

function addCell(c: Cell) {
  const key = cellKey(c);
  if (cellRects.has(key)) return;

  const rect = leaflet.rectangle(cellBounds(c), {
    color: "#999",
    weight: 1,
    fillOpacity: 0,
  }).addTo(map);
  cellRects.set(key, rect);

  // restore from memento if present, else roll fresh (flyweight)
  const saved = cellState.get(key);
  if (saved) {
    if (saved.tier !== null) {
      const center = cellCenter(c);
      const marker = leaflet.marker(center, { icon: tokenIcon(saved.tier) })
        .addTo(map);
      marker.bindTooltip(`Tier ${saved.tier} token (click to interact)`);

      const tok: Token = {
        id: key,
        cell: c,
        latlng: center,
        tier: saved.tier,
        marker,
      };
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
          saveGameState();
          return;
        }

        if (hand === tok.tier) {
          const next = Math.min(tok.tier + 1, MAX_TIER) as Tier;
          setMarkerTier(tok, next);
          hand = null;
          cellState.set(key, { tier: next });
          if (next === MAX_TIER) {
            winDiv.textContent = `🎉 You created a Tier ${MAX_TIER} token!`;
            winDiv.style.display = "block";
          }
          renderStatus();
          saveGameState();
        } else {
          statusPanelDiv.textContent =
            `Tiers must match to merge. Holding Tier ${hand}, clicked Tier ${tok.tier}. Tokens on screen: ${cellTokens.size}.`;
        }
      });
    }
    return;
  }

  // no saved state, flyweight random roll
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
        saveGameState();
        return;
      }

      if (hand === tok.tier) {
        const next = Math.min(tok.tier + 1, MAX_TIER) as Tier;
        setMarkerTier(tok, next);
        hand = null;
        cellState.set(key, { tier: next });
        if (next === MAX_TIER) {
          winDiv.textContent = `🎉 You created a Tier ${MAX_TIER} token!`;
          winDiv.style.display = "block";
        }
        renderStatus();
        saveGameState();
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

function clearVisibleAll() {
  for (const r of cellRects.values()) r.remove();
  for (const t of cellTokens.values()) t.marker.remove();
  cellRects.clear();
  cellTokens.clear();
  visibleKeys.clear();
}

function _rebuildVisibleFromScratch() {
  clearVisibleAll();
  const { iMin, iMax, jMin, jMax } = visibleCellRange();
  for (let i = iMin; i <= iMax; i++) {
    for (let j = jMin; j <= jMax; j++) {
      addCell({ i, j });
      visibleKeys.add(`${i},${j}`);
    }
  }
  renderStatus();
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

// movement & map events, facade and movementcontroller

interface MovementController {
  start(): void;
  stop(): void;
}

function setPlayerPosition(pos: leaflet.LatLng) {
  playerPos = pos;
  playerMarker.setLatLng(playerPos);
  map.panTo(playerPos);
  saveGameState();
}

// button-based movement
class ButtonMovementController implements MovementController {
  private northBtn: HTMLButtonElement;
  private southBtn: HTMLButtonElement;
  private westBtn: HTMLButtonElement;
  private eastBtn: HTMLButtonElement;

  constructor() {
    this.northBtn = document.getElementById("moveN") as HTMLButtonElement;
    this.southBtn = document.getElementById("moveS") as HTMLButtonElement;
    this.westBtn = document.getElementById("moveW") as HTMLButtonElement;
    this.eastBtn = document.getElementById("moveE") as HTMLButtonElement;
  }

  start(): void {
    this.northBtn.onclick = () => movePlayer(+1, 0);
    this.southBtn.onclick = () => movePlayer(-1, 0);
    this.westBtn.onclick = () => movePlayer(0, -1);
    this.eastBtn.onclick = () => movePlayer(0, +1);
  }

  stop(): void {
    this.northBtn.onclick = null;
    this.southBtn.onclick = null;
    this.westBtn.onclick = null;
    this.eastBtn.onclick = null;
  }
}

// geolocation-based movement
class GeolocationMovementController implements MovementController {
  private watchId: number | null = null;

  start(): void {
    if (!("geolocation" in navigator)) {
      statusPanelDiv.textContent =
        "Geolocation not supported in this browser. Staying in button mode.";
      return;
    }

    this.watchId = navigator.geolocation.watchPosition(
      (pos) => {
        const lat = pos.coords.latitude;
        const lng = pos.coords.longitude;
        const newPos = leaflet.latLng(lat, lng);
        setPlayerPosition(newPos);
      },
      (err) => {
        statusPanelDiv.textContent =
          `Geolocation error: ${err.message}. Try enabling location or switch back to buttons.`;
      },
      {
        enableHighAccuracy: true,
        maximumAge: 5000,
        timeout: 10000,
      },
    );
  }

  stop(): void {
    if (this.watchId !== null && "geolocation" in navigator) {
      navigator.geolocation.clearWatch(this.watchId);
      this.watchId = null;
    }
  }
}

function movePlayer(di: number, dj: number) {
  setPlayerPosition(
    leaflet.latLng(
      playerPos.lat + di * CELL_DEG,
      playerPos.lng + dj * CELL_DEG,
    ),
  );
}

// which movement controller is active
let activeMovementController: MovementController | null = null;

// helper to switch modes
function setMovementMode(mode: MovementMode) {
  if (activeMovementController) {
    activeMovementController.stop();
  }

  currentMovementMode = mode;

  if (mode === "geo") {
    activeMovementController = new GeolocationMovementController();
  } else {
    activeMovementController = new ButtonMovementController();
  }

  activeMovementController.start();

  const buttonsBtn = document.getElementById("modeButtons") as
    | HTMLButtonElement
    | null;
  const geoBtn = document.getElementById("modeGeo") as HTMLButtonElement | null;
  if (buttonsBtn && geoBtn) {
    if (mode === "buttons") {
      buttonsBtn.disabled = true;
      geoBtn.disabled = false;
    } else {
      buttonsBtn.disabled = false;
      geoBtn.disabled = true;
    }
  }

  const modeLabel = document.getElementById("modeLabel") as
    | HTMLParagraphElement
    | null;
  if (modeLabel) {
    modeLabel.textContent = mode === "buttons"
      ? "You’re in BUTTON mode (on-screen controls)."
      : "You’re in GEO mode (move your device in the real world).";
  }

  saveGameState();
}

function getInitialMovementMode(): MovementMode {
  const params = new URLSearchParams(globalThis.location.search);
  const m = params.get("movement");
  if (m === "geo" || m === "geolocation") return "geo";
  return "buttons";
}

(document.getElementById("modeButtons") as HTMLButtonElement).onclick = () =>
  setMovementMode("buttons");
(document.getElementById("modeGeo") as HTMLButtonElement).onclick = () =>
  setMovementMode("geo");

// new game handler
function newGame() {
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.removeItem(STORAGE_KEY);
    }
  } catch {
    // ignore
  }

  if (activeMovementController) {
    activeMovementController.stop();
    activeMovementController.start();
  }

  // reset in-memory state
  cellState.clear();
  hand = null;
  winDiv.style.display = "none";

  // reset player
  playerPos = START_POS;
  playerMarker.setLatLng(playerPos);
  map.panTo(playerPos);

  clearVisibleAll();
  updateVisibleCells();
  renderStatus();
  saveGameState();
}

(document.getElementById("newGame") as HTMLButtonElement).onclick = () =>
  newGame();

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
    saveGameState();
  } else if (hand === nearest.tier) {
    const next = Math.min(nearest.tier + 1, MAX_TIER) as Tier;
    setMarkerTier(nearest, next);
    hand = null;
    cellState.set(key, { tier: next });
    if (next === MAX_TIER) {
      winDiv.textContent = `🎉 You created a Tier ${MAX_TIER} token!`;
      winDiv.style.display = "block";
    }
    renderStatus();
    saveGameState();
  } else {
    statusPanelDiv.textContent =
      `Tiers must match to merge. Holding Tier ${hand}, nearest is Tier ${nearest.tier}. Tokens on screen: ${cellTokens.size}.`;
  }
});

// boot, restore saved state if present, then set movement mode

const loaded = loadGameState();
if (loaded) {
  playerPos = leaflet.latLng(loaded.playerLat, loaded.playerLng);
  playerMarker.setLatLng(playerPos);
  map.panTo(playerPos);

  hand = loaded.hand;
  deserializeCellState(loaded.cellState);
  currentMovementMode = loaded.movementMode ?? "buttons";

  if (loaded.hasWon) {
    winDiv.textContent = `🎉 You created a Tier ${MAX_TIER} token!`;
    winDiv.style.display = "block";
  }
} else {
  currentMovementMode = "buttons";
}

updateVisibleCells();
renderStatus();

const initialMode = loaded?.movementMode ?? getInitialMovementMode();
setMovementMode(initialMode);
