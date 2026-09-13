# RunRoute

A running route planner for Urbana–Champaign, Illinois. First working milestone: local pedestrian graph search, route comparison, estimated terrain, and device-local feedback. No LLM-generated geometry or fabricated recommendation model.

## Run and verify

Node.js 22.13+ is required.

```sh
npm run install:ci
npm run dev
npm test
npm run typecheck
npm run build
```

## Architecture

- `app/`: React/TypeScript planner, accessible controls and Leaflet map.
- `lib/routing/engine.mjs`: deterministic graph construction, Dijkstra search, candidate generation, feature extraction, and baseline scoring. `shape.mjs` detects reversals and nearby opposing travel independently of map edge IDs. Framework-independent and directly testable.
- `public/routing-worker.js`: graph loading and search off the main thread. Request IDs prevent stale results from overwriting new settings.
- `regions/urbana-champaign.json` and `lib/routing/regions.ts`: region boundary, graph location and selectable places. A new region gets a new configuration and graph, without changing search algorithms.
- `scripts/data/`: repeatable OpenStreetMap import, elevation enrichment and boundary clipping. Data are bundled so route generation does not query public services for each run.
- `tests/`: synthetic routing invariants and real regional integration cases.

The UI accepts predefined places, latitude/longitude, a map click, or browser geolocation. Address search uses a bundled OSM address index, so entered search text stays in the browser. Street abbreviations and exact house numbers are normalized. Users explicitly select a match; unconfirmed input cannot start route generation. The index is incomplete, so missing addresses require a map pin. OSM tile requests still reveal the viewed map area to the tile service. Pins snap to a mapped network vertex within 200 m; the offset is displayed and not included in route distance.

## Routing and baseline ranking

Loop search samples 36 pairs of geographic waypoints at three radii, joins shortest pedestrian paths, and penalizes already-used edges during subsequent legs. Point-to-point search includes the direct route and detours. Routes must be within 25% of requested distance; no feasible candidate is a normal empty result. Suggestions are deduplicated by edge set and filtered for node overlap.

Distances use Haversine sums over actual mapped geometry. Mapped signals are a hard exclusion when requested. Known pedestrian one-way restrictions are respected. Paths receive a modest cost preference. Secondary/tertiary roads require explicitly mapped sidewalks. Private access, prohibited foot access, motorways, parking aisles and driveways are excluded during import.

Recommendation scores are **heuristics, not probabilities or learned preferences**. They account for distance error, repeated segments, sharp U-turns, nearby doubling back, signal count, path fraction and estimated ascent per distance. Flat/hilly is a relative ranking preference, not a guarantee: the local candidate set may have little elevation variety. Missing elevation is never treated as zero.

## Data and accuracy

OpenStreetMap data © OpenStreetMap contributors, [ODbL 1.0](https://www.openstreetmap.org/copyright). The bundled graph contains its source timestamp and bounds; ODbL applies to the graph and derived database. Map tiles use the standard [OSM tile policy](https://operations.osmfoundation.org/policies/tiles/), browser cache and visible attribution. No tile prefetch or bulk download.

Elevation uses SRTM90m via [OpenTopoData](https://www.opentopodata.org/api/), sampled on a 0.003° grid and bilinearly interpolated. It is a coarse terrain estimate, inadequate for small hills, bridges or surveyed elevation gain. Import/enrichment scripts use public services only as an occasional development workflow, not a production backend. Leaflet 1.9.4 is vendored under its BSD-2-Clause license.

Map completeness is not guaranteed: unmapped signals, disconnected sidewalks, access restrictions, temporary closures and unsafe crossings may be absent. No inference that every route is safe. Region bounds are an explicit initial service rectangle around the two cities, not municipal boundaries. Paths may repeat, and repetitions are reported. Candidate search is bounded and does not prove infeasibility. Live browser directions provide geometry-derived turn prompts, GPS progress and off-route alerts while the page is open. They do not automatically reroute, provide spoken navigation, or guarantee screen-off operation.

To refresh the bundled data:

```sh
python3 scripts/data/import-region.py
python3 scripts/data/elevation.py
python3 scripts/data/clip-region.py
python3 scripts/data/import-addresses.py
npm test
```

All import scripts accept `--region regions/your-region.json`. Elevation caches are keyed by region, bounds and resolution. Review the refreshed routes before publishing.

## Useful ML, incrementally

1. **Current baseline:** deterministic search and explainable ranking. Local thumbs up/down feedback stores a versioned feature vector, chosen constraints and ranking version; up to 200 examples on this browser. Feedback does not change rankings yet.
2. **Next milestone — reliable feedback dataset:** add opt-in persistent storage, anonymous runner identity, exposure IDs, which candidates were shown, selected route, optional reasons and deletion/export. Log impressions as well as choices to avoid treating unseen routes as dislikes. No route history upload by default.
3. **Learned ranking:** fit a regularized pairwise logistic preference model to route comparisons; split by runner and time, compare against rules using NDCG@3 and pairwise accuracy. Use geographic/route grouping to avoid leakage. Keep rules as cold-start fallback. Ship only if held-out ranking improves without degrading constraint satisfaction.
4. **Personalization:** shrink user weights toward global weights until enough feedback exists. Expose feature contributions (hills, lights, repeats, paths) and a reset action. Evaluate both cold-start and returning runners. Monitor coverage, diversity and feedback bias.

Hard constraints always stay in the routing layer. A ranking model can reorder feasible candidates; it cannot invent roads, bypass exclusions, or promise an exact distance.

## Next engineering milestone

Replace coarse elevation with a proper local DEM and validate against known routes; contract degree-two graph chains while preserving geometry, signals and ascent; measure success rate/distance fit across a regional benchmark. Only then add persistent feedback and a trained preference model. This keeps the portfolio story grounded in measurable product improvements.

## Route shape preference

Version 3 makes fewer turns and fewer mapped traffic lights permanent preferences. Rank is `100 * exp(-cost)`, with cost = `2 * distanceError + .05 * lights + .018 * turns + .1 * Uturns + 1.3 * max(repeatFraction, nearReturnFraction) + .15 * terrainPenalty + .1 * (1 - pathFraction)`. Raw scores determine ordering; rounded scores are display-only. Holding other features constant, fewer turns or lights always improves rank. This is not a lexicographic guarantee when distance or other features differ.

Geometry is resampled every 10 m; opposing travel within 25 m and over 60 m apart along the route counts as nearby doubling back. Turns use smoothed 20 m heading windows and a 60° threshold. U-turns use 30 m windows and a 150° threshold. Normal right-angle turns carry a small turn cost, but are regression-tested not to receive U-turn/near-return penalties. Tolerances are heuristics, not a learned model.

## Following a selected route

`RouteActivity` offers live browser navigation or a standard GPX 1.1 track download. GPX retains all route coordinates and can be imported into compatible device software; vendor-specific watch synchronization is outside this app.

Live navigation asks for browser geolocation only when the runner starts it. GPS matching is constrained to the neighborhood of current progress to avoid jumping to a loop finish or distant self-intersection. Weak GPS (accuracy worse than 40 m) and off-route fixes freeze progress. Position watches are cleared on stop, completion, route change and unmount. No location telemetry is uploaded by the app. A native mobile implementation is the next step for dependable background GPS, screen-lock behavior and spoken directions.

Tests simulate complete GPS walks, poor accuracy, off-route points, loop starts, left/right prompts and GPX coordinate preservation. Field validation on an actual run remains necessary before calling live navigation production-ready.
