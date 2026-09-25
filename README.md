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

The UI accepts predefined places, latitude/longitude, a map click, or browser geolocation. Address search uses a bundled OSM address index, so entered search text stays in the browser. Street abbreviations and exact house numbers are normalized. Users explicitly select a match; unconfirmed input cannot start route generation. The index is incomplete, so missing addresses require a map pin. OSM tile requests still reveal the viewed map area to the tile service. Pins snap to the closest point on an eligible network segment within 200 m. Address selections match the named street and prefer its parallel, same-side mapped sidewalk over a rear alley. Segment splitting preserves directions and does not mutate the cached graph. The offset is displayed and not included in route distance. Markers preview the resolved endpoint and agree with route geometry, navigation and GPX. Sidewalk lines remain beside road centerlines because they represent the actual mapped running path.

## Routing and baseline ranking

Loop search explores triangular and rectangular layouts at 16 bearings and multiple aspect ratios, with four distance-fitting attempts per layout (up to 384 attempts, with duplicate stop sequences cached). Point-to-point search includes the direct path and fitted detours. A* search keeps the incoming edge in its state and charges for bends and mapped lights while finding paths, rather than only scoring turns afterward. Already-used edges are excluded on subsequent legs. Degree-two chains are contracted for search, preserving all original vertices, traversal directions, internal bend costs and distances for route reconstruction.

Every recommendation must measure at least the target and no more than 5% over it. All alternatives must have zero detected sharp U-turns, at most 1% repeated geometry, at most 3% nearby opposing travel and no continuous detected return longer than 60 m. Turns are capped at max(8, 3 per target km), so a 5K has at most 15 detected turns. The search returns up to seven diverse routes; fewer or zero is a normal result when the mapped network cannot satisfy these limits. In particular, starts reached through a narrow access spur may have no acceptable loop. The app never pads the list with routes that fail the gates.

Distance is the sum of Haversine lengths of the exact displayed/exported coordinates. Navigation uses the same geometry; GPX rounds coordinates to seven decimal places. This is a mapped estimate, not a certified course or a promise about watch GPS. The reported 5.02 km versus 4.93 km field result cannot be attributed to a specific cause without the original route and recorded watch track; the app does not apply an invented calibration factor.

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

Replace coarse elevation with a proper local DEM and validate against known routes; measure success rate/distance fit across a regional benchmark. Only then add persistent feedback and a trained preference model. This keeps the portfolio story grounded in measurable product improvements.

## Route shape preference

Version 4 favors smooth paths during generation and ranking. Rank is `100 * exp(-cost)`, with cost = `4 * distanceError + .08 * lights + .055 * turns + .4 * Uturns + 3 * max(repeatFraction, nearRetraceFraction) + .15 * terrainPenalty + .1 * (1 - pathFraction)`. Raw scores determine ordering; rounded scores are display-only. Holding other features constant, fewer turns or lights always improves rank. Search separately charges 140 equivalent meters times `(1 - cos(bend))`, another 250 for sharp reversals, and 65 per mapped signal node entered. These are heuristic preference costs, never added to the reported distance.

Regression tests cover smoother-path selection, one-way preservation, signal avoidance, route endpoint alignment, all-alternative quality limits, and distance agreement between the route, navigation and exported GPX. Outdoor GPS accuracy remains a field-validation task.

## Netlify deployment

RunRoute also has a standalone static Vite build. It reuses the same React app,
route worker, local address index and regional graph, without a Cloudflare server
or ChatGPT sign-in. The original hosting build remains available separately.

```sh
npm run build:netlify
netlify deploy --prod --no-build --dir dist-netlify --site 14c88f79-a9b0-420f-a8a9-0853baae999e
```

Live site: https://runroute-uc.netlify.app

`netlify.toml` specifies the build command, publish directory and Node version.
`web/` contains the static HTML and React entry point; `vite.netlify.config.ts`
handles bundling. Keep Netlify credentials and `.netlify/` out of Git. This site
was deployed directly with the CLI; automatic GitHub deployment is not yet
connected. Future Git-connected builds should use `npm run build:netlify` and
`dist-netlify` as configured. GPS requires HTTPS and the user's location permission.
