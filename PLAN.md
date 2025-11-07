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

- [] Draw a visible grid overlay (rectangles)

- [] Spawn a handful of tokens at fixed map coords

- [] Click a token in range (<= 60m) to collect

- [] Inventory panel shows counts

- [] Crafting: 3x Tier N → 1x Tier N+1

- [] Persist inventory in localStorage

- [] Win condition: owning ≥ 1 Tier 3 token triggers success banner
