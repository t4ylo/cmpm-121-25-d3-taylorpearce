# D3: World of Bits – PLAN

## Game Design Vision

Walk around a tiled “world” (Leaflet map). Collect nearby tokens from locations on the map and craft them into higher-tier tokens. Goal: craft a Tier 3 token.

## Technologies

- TypeScript, Vite, Deno
- Leaflet for the map UI
- LocalStorage for inventory persistence
- GitHub Pages for deploy

## Assignments

### D3.a: Core mechanics (token collection and crafting)

_Key technical challenge:_ Assemble a map-based UI with Leaflet.\
_Key gameplay challenge:_ Collect & craft tokens to reach a target tier.

#### Steps

- [x] Install Leaflet and basic map bootstrap

- [x] Show player location (marker) with fallback center

- [x] Draw a visible grid overlay (rectangles)

- [x] Spawn a handful of tokens at fixed map coords

- [x] Click a token in range (<= 60m) to collect

- [x] Inventory panel shows counts

- [x] Crafting: 2x Tier N → 1x Tier N+1 (was 3 before, mistake)

- [x] Add a hand and merge mechanism

- [x] Win condition: owning ≥ 1 Tier 3 token triggers success banner

### D3.b: Globe-Spanning Gameplay

_Key technical challenge:_ Viewport-driven cell rendering on a world grid, plus simulated player movement.
_Key gameplay challenge:_ Practice on-map merging to reach a higher target tier (Tier 4), with cells treated as memoryless while off-screen.

#### Steps.2

- [x] Anchor grid & helpers: define CELL_DEG, ORIGIN, and helpers (cellBounds, cellCenter,_latLngToCell).

- [x] Render viewport cells: on map moveend, compute visible cell range, draw thin cell rectangles.

- [x] Player movement buttons: N/S/E/W move by one cell; recenter map to player, trigger rerender.

- [] Spawn tokens per visible cell: probabilistic roll per cell with rarity weighting (T1 common, T2 less, T3 rare).

- [] Memoryless despawn/respawn: clear tokens + rectangles, then re-spawn for current viewport.

- [] Near-player interaction: enforce collection/merge only if within ~60 m of player marker.

- [] On-map merge crafting (hand): empty hand picks up; matching tier merges to next tier on clicked cell.

- [] Raise victory threshold: show banner when Tier 4 is created via merge (D3.a was Tier 3).
