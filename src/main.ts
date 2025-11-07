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
const GAMEPLAY_ZOOM_LEVEL = 19;
const TILE_DEGREES = 1e-4;
const NEIGHBORHOOD_SIZE = 8;
const CACHE_SPAWN_PROBABILITY = 0.10;
const COLLECT_RADIUS_M = 60;

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

const winDiv = document.createElement("div");
winDiv.className = "win";
winDiv.style.display = "none";
winDiv.textContent = "🎉 You created a Tier 3 token!";
controlPanelDiv.append(winDiv);

const map = leaflet.map(mapDiv, {
  center: CLASSROOM_LATLNG,
  zoom: GAMEPLAY_ZOOM_LEVEL,
  minZoom: GAMEPLAY_ZOOM_LEVEL,
  maxZoom: GAMEPLAY_ZOOM_LEVEL,
  zoomControl: false,
  scrollWheelZoom: false,
});

leaflet
  .tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
    maxZoom: 19,
    attribution: "© OpenStreetMap",
  })
  .addTo(map);

const playerMarker = leaflet.marker(CLASSROOM_LATLNG).addTo(map).bindTooltip(
  "That's you!",
);

// tokens and hand
type Tier = 1 | 2 | 3;
type Token = {
  id: string;
  latlng: leaflet.LatLng;
  tier: Tier;
  marker: leaflet.Marker;
};
let tokens: Token[] = [];

let hand: Tier | null = null;
let hasWonThisSession = false;

function renderStatus() {
  (handPanel.querySelector("#hand") as HTMLElement).textContent = hand
    ? `Tier ${hand}`
    : "Empty";
  statusPanelDiv.textContent = hand
    ? `Holding Tier ${hand}. Click another token of Tier ${hand} within ${COLLECT_RADIUS_M}m to merge.`
    : `Click a token within ${COLLECT_RADIUS_M}m to pick it up. Press “E” for nearest interaction.`;
}

function tierFor(i: number, j: number): Tier {
  const r = luck([i, j, "tier"].toString());
  if (r < 0.75) return 1;
  if (r < 0.95) return 2;
  return 3;
}
function tokenIcon(tier: Tier) {
  const emoji = tier === 1 ? "🟡" : tier === 2 ? "🟣" : "🔵";
  return leaflet.divIcon({
    className: "",
    html: `<div style="font-size:24px;">${emoji}</div>`,
  });
}

function getTokenById(id: string) {
  return tokens.find((t) => t.id === id) ?? null;
}

function setMarkerTier(tok: Token, newTier: Tier) {
  tok.tier = newTier;
  tok.marker.setIcon(tokenIcon(newTier));
  tok.marker.setTooltipContent(`Tier ${newTier} token (click to interact)`);
}

// click behavior

function attachTokenHandlers(tok: Token) {
  tok.marker.on("click", () => {
    const d = playerMarker.getLatLng().distanceTo(tok.latlng);
    if (d > COLLECT_RADIUS_M) {
      alert(`Too far (${d.toFixed(0)}m). Need ≤ ${COLLECT_RADIUS_M}m.`);
      return;
    }

    if (hand === null) {
      hand = tok.tier;
      renderStatus();
      tok.marker.remove();
      tokens = tokens.filter((t) => t.id !== tok.id);
      return;
    }

    if (hand === tok.tier) {
      const newTier = (tok.tier + 1) as Tier;
      setMarkerTier(tok, Math.min(newTier, 3) as Tier);
      hand = null;
      renderStatus();
      if (!hasWonThisSession && tok.tier === 3) {
        winDiv.style.display = "block";
        hasWonThisSession = true;
      }
    } else {
      statusPanelDiv.textContent =
        `Tiers must match to merge. Holding Tier ${hand}, clicked Tier ${tok.tier}.`;
    }
  });
}

function spawnToken(i: number, j: number) {
  const lat = CLASSROOM_LATLNG.lat + (i + 0.5) * TILE_DEGREES;
  const lng = CLASSROOM_LATLNG.lng + (j + 0.5) * TILE_DEGREES;
  const latlng = leaflet.latLng(lat, lng);

  const tier = tierFor(i, j);
  const marker = leaflet.marker(latlng, { icon: tokenIcon(tier) }).addTo(map);
  marker.bindTooltip(`Tier ${tier} token (click to interact)`);

  const tok: Token = { id: `${i}-${j}`, latlng, tier, marker };
  tokens.push(tok);
  attachTokenHandlers(tok);
}

// spawn neighborhood
for (let i = -NEIGHBORHOOD_SIZE; i < NEIGHBORHOOD_SIZE; i++) {
  for (let j = -NEIGHBORHOOD_SIZE; j < NEIGHBORHOOD_SIZE; j++) {
    if (luck([i, j].toString()) < CACHE_SPAWN_PROBABILITY) {
      spawnToken(i, j);
    }
  }
}

// E to pick up nearest
globalThis.addEventListener("keydown", (e) => {
  if (e.key.toLowerCase() !== "e") return;
  let nearest: Token | null = null;
  let best = Infinity;
  for (const t of tokens) {
    const d = playerMarker.getLatLng().distanceTo(t.latlng);
    if (d < best) {
      best = d;
      nearest = t;
    }
  }
  if (!nearest || best > COLLECT_RADIUS_M) return;

  if (hand === null) {
    hand = nearest.tier;
    renderStatus();
    nearest.marker.remove();
    tokens = tokens.filter((t) => t.id !== nearest.id);
  } else if (hand === nearest.tier) {
    const newTier = (nearest.tier + 1) as Tier;
    setMarkerTier(nearest, Math.min(newTier, 3) as Tier);
    hand = null;
    renderStatus();
    if (!hasWonThisSession && nearest.tier === 3) {
      winDiv.style.display = "block";
      hasWonThisSession = true;
    }
  } else {
    statusPanelDiv.textContent =
      `Tiers must match to merge. Holding Tier ${hand}, nearest is Tier ${nearest.tier}.`;
  }
});

renderStatus();
