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

- [x] Spawn tokens per visible cell: probabilistic roll per cell with rarity weighting (T1 common, T2 less, T3 rare).

- [x] Raise victory threshold: show banner when Tier 4 is created via merge (D3.a was Tier 3).

- [x] Memoryless despawn/respawn: clear tokens + rectangles, then re-spawn for current viewport.

### D3.c: Object Persistance

_Key technical challenge:_ Persisting cell state efficiently using Flyweight + Memento while still re-rendering the entire scene from scratch.
_Key gameplay challenge:_ Making the world feel consistent by giving cells a memory of past player actions, even as the map scrolls or the player moves away.

#### Steps.3

- [x] Introduce cellState map to store only modified cells (Flyweight).

- [x] Persist pickups: cells become tier:null when a token is taken.

- [x] Restore modified cells from memento when they re-enter view.

- [x] Flyweight: unmodified cells aren’t stored; they roll fresh on first visibility.

- [x] Persist merges to cellState (upgraded tier).

- [x] Rebuild from scratch on every moveend using saved data + fresh rolls for unmodified cells.

### D3.d: Gameplay Across Real-world Space and Time

_Key technical challenge:_ Hiding different movement systems (buttons vs. geolocation) behind a single movement interface (Facade) while also persisting game state using localStorage so it can be restored on page reload.

_Key gameplay challenge:_ Letting the player move their character by physically moving in the real world, and making the world feel continuous over time by resuming from the same state after closing/reopening the page, with a clear way to start over or switch movement modes.

#### Steps.4

- [x] Define a movement controller interface (e.g. MovementController) that exposes simple methods like start() / stop() or callbacks that update the player position.

- [x] Implement a **button-based** movement controller that wraps the existing N/S/E/W movement logic behind the movement interface.

- [x] Refactor the game so **all player movement** goes through the movement Facade instead of directly calling movePlayer from button handlers.

- [x] Implement a **geolocation-based** movement controller that uses the browser Geolocation API to watch the device position and convert it into grid movements / updates to playerPos.

- [x] Add a way to **choose movement mode** (e.g. a toggle in the UI or by reading a movement= query string) and wire it to construct either the button controller or the geolocation controller.

- [x] Use localStorage to **serialize game state** (player position, hand, cellState map, and any win state) whenever the state changes.

- [x] On page load, **restore game state** from localStorage if present (rebuild cells from cellState, place the player, restore hand), otherwise start a fresh game.

- [x] Add a **“New Game”** control that clears persisted state from localStorage and resets the world to a clean starting state.
