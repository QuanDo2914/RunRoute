"use client";
import { useEffect, useRef, useState } from "react";
import {
  ArrowUpRight,
  Route,
  MapPin,
  Mountain,
  Footprints,
  TrafficCone,
  ThumbsUp,
  ThumbsDown,
  LocateFixed,
} from "lucide-react";
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { Switch } from "@/components/ui/switch";
import { region } from "@/lib/routing/regions";
import { RouteActivity } from "@/components/runroute/route-activity";
import { LocationPicker } from "@/components/runroute/location-picker";

type Point = { lat: number; lon: number; name?: string };
type Run = {
  ids: (number|string)[];
  startLocation: Point & {description:string};
  endLocation: Point & {description:string};
  coordinates: number[][];
  distance: number;
  gain: number | null;
  signals: number;
  score: number;
  trailFraction: number;
  repeatFraction: number;
  distanceError: number;
  snapStart: number;
  snapEnd: number;
  turns: number;
  uTurns: number;
  nearRetraceFraction: number;
  shapePenaltyPoints: number;
};
declare global {
  interface Window {
    L: any;
  }
}
export default function Home() {
  const [start, setStart] = useState<Point>(region.places[0]),
    [end, setEnd] = useState<Point>(region.places[2]),
    [mode, setMode] = useState("loop"),
    [distance, setDistance] = useState(5),
    [terrain, setTerrain] = useState("flat"),
    [avoid, setAvoid] = useState(false),
    [runs, setRuns] = useState<Run[]>([]),
    [selected, setSelected] = useState(0),
    [busy, setBusy] = useState(false),
    [message, setMessage] = useState(""),
    [ready, setReady] = useState(false),
    [pick, setPick] = useState<"start" | "end">("start"),
    [feedback, setFeedback] = useState<Record<string, string>>({});
  const map = useRef<any>(null),
    layer = useRef<any>(null),
    markers = useRef<any>(null),
    worker = useRef<Worker | null>(null),
    pickRef = useRef(pick),
    requestId = useRef(0);
  pickRef.current = pick;
  const [pendingStart, setPendingStart] = useState(false),
    [pendingEnd, setPendingEnd] = useState(false);
  const [resolvedStart,setResolvedStart]=useState<(Point & {description:string})|null>(null),[resolvedEnd,setResolvedEnd]=useState<(Point & {description:string})|null>(null);
  const snapId=useRef(0);
  const userMarker = useRef<any>(null);
  const run = runs[selected];
  function invalidate() {
    setRuns([]);
    setMessage("");
    requestId.current++;
    setBusy(false);
  }
  useEffect(() => {
    try {
      const saved = JSON.parse(
        localStorage.getItem("runroute-feedback-v1") || "[]",
      );
      if (Array.isArray(saved))
        setFeedback(
          Object.fromEntries(
            saved
              .filter((r: any) => typeof r.id === "string")
              .map((r: any) => [r.id, r.rating]),
          ),
        );
    } catch {}
  }, []);
  useEffect(() => {
    const w = new Worker("/routing-worker.js", { type: "module" });
    worker.current = w;
    w.onmessage = (e) => {
      if(e.data.kind==="snap"){if(e.data.id!==snapId.current)return;if(e.data.error){setMessage(e.data.error);return;}setResolvedStart(e.data.start);setResolvedEnd(e.data.end);return;}
      if (e.data.id !== requestId.current) return;
      setBusy(false);
      if (e.data.error) setMessage(e.data.error);
      else {
        setRuns(e.data.routes);
        setSelected(0);
        setMessage(
          e.data.routes.length
            ? ""
            : "No smooth route between your target and 5% longer was found. Try another start, distance, or allow traffic lights.",
        );
      }
    };
    w.onerror = () => {
      setBusy(false);
      setMessage(
        "The route engine could not load. Please reload and try again.",
      );
    };
    return () => w.terminate();
  }, []);
  useEffect(()=>{setResolvedStart(null);setResolvedEnd(null);const id=++snapId.current;worker.current?.postMessage({kind:"snap",id,url:region.graphUrl,request:{start,end:mode==="point"?end:null}});},[start,end,mode]);
  useEffect(() => {
    setReady(false);
    let active=true;
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = "/vendor/leaflet.css";
    document.head.appendChild(link);
    const script = document.createElement("script");
    script.src = "/vendor/leaflet.js";
    script.onload = () => {
      if (!active || map.current || !document.getElementById("route-map")) return;
      const L = window.L;
      map.current = L.map("route-map", { zoomControl: false }).setView(
        [40.109, -88.235],
        13,
      );
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution:
          '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
      }).addTo(map.current);
      L.control.zoom({ position: "bottomright" }).addTo(map.current);
      layer.current = L.layerGroup().addTo(map.current);
      markers.current = L.layerGroup().addTo(map.current);
      map.current.on("click", (e: any) => {
        const p = { lat: e.latlng.lat, lon: e.latlng.lng };
        if (!inside(p)) {
          setMessage(
            "Choose a point inside the Urbana–Champaign coverage area.",
          );
          return;
        }
        invalidate();
        if (pickRef.current === "start") setStart(p);
        else setEnd(p);
      });
      L.rectangle(
        [
          [region.bounds[0], region.bounds[1]],
          [region.bounds[2], region.bounds[3]],
        ],
        {
          color: "#566a77",
          weight: 1,
          dashArray: "5 6",
          fill: false,
          interactive: false,
        },
      ).addTo(map.current);
      setReady(true);
    };
    script.onerror = () =>
      setMessage(
        "Map could not load. Location fields and route generation are still available.",
      );
    document.body.appendChild(script);
    return () => {
      active=false;
      script.onload=null;
      script.onerror=null;
      map.current?.remove();
      map.current = null;
      script.remove();
      link.remove();
    };
  }, []);
  useEffect(() => {
    if (!ready) return;
    const L = window.L;
    markers.current.clearLayers();
    for (const [p, label] of [
      [run?.startLocation || resolvedStart || start, "A"],
      ...(mode === "point" ? [[run?.endLocation || resolvedEnd || end, "B"]] : []),
    ] as [Point, string][]) {
      L.marker([p.lat, p.lon], {
        icon: L.divIcon({
          className: "pin",
          html: label,
          iconSize: [30, 30],
          iconAnchor: [15, 15],
        }),
      }).addTo(markers.current);
    }
  }, [ready, start, end, mode, run, resolvedStart, resolvedEnd]);
  useEffect(() => {
    if (!ready) return;
    layer.current.clearLayers();
    if (run) {
      const line = window.L.polyline(run.coordinates, {
        color: "#ed592b",
        weight: 6,
        opacity: 0.95,
      }).addTo(layer.current);
      map.current.fitBounds(line.getBounds(), { padding: [55, 75] });
    }
  }, [run, ready]);
  function inside(p: Point) {
    return (
      p.lat >= region.bounds[0] &&
      p.lat <= region.bounds[2] &&
      p.lon >= region.bounds[1] &&
      p.lon <= region.bounds[3]
    );
  }
  function generateRoutes() {
    if (pendingStart || (mode === "point" && pendingEnd)) {
      setMessage("Search your address and choose a matching location first.");
      return;
    }
    if (!inside(start) || (mode === "point" && !inside(end))) {
      setMessage("Choose locations inside the supported area.");
      return;
    }
    setBusy(true);
    setMessage("");
    setRuns([]);
    const id = ++requestId.current;
    worker.current?.postMessage({
      id,
      url: region.graphUrl,
      request: {
        start,
        end: mode === "point" ? end : null,
        target: distance * 1000,
        terrain,
        avoid,
      },
    });
  }
  useEffect(() => {
    const context = (document as any).modelContext;
    if (!context?.registerTool) return;
    const controller = new AbortController();
    Promise.resolve(
      context.registerTool(
        {
          name: "start_running_route_search",
          description:
            "Start a running route search using the visible settings. Results appear asynchronously in the planner.",
          inputSchema: {
            type: "object",
            properties: {},
            additionalProperties: false,
          },
          annotations: { readOnlyHint: false },
          execute: async (input: unknown) => {
            if (
              !input ||
              typeof input !== "object" ||
              Object.keys(input).length
            )
              throw Error("Expected an empty object");
            generateRoutes();
            return { status: "started" };
          },
        },
        { signal: controller.signal },
      ),
    ).catch(() => {});
    return () => controller.abort();
  }, [start, end, mode, distance, terrain, avoid, pendingStart, pendingEnd]);
  function vote(value: string) {
    if (!run) return;
    const key = run.ids.join("-");
    try {
      const saved = JSON.parse(
        localStorage.getItem("runroute-feedback-v1") || "[]",
      );
      const record = {
        id: key,
        at: new Date().toISOString(),
        region: region.id,
        rating: value,
        features: {
          distance: run.distance,
          gain: run.gain,
          signals: run.signals,
          trailFraction: run.trailFraction,
          repeatFraction: run.repeatFraction,
          turns: run.turns,
          uTurns: run.uTurns,
          nearRetraceFraction: run.nearRetraceFraction,
          distanceError: run.distanceError,
        },
        request: { distance, terrain, avoid, mode },
        rankingVersion: "rules-v4-smooth",
      };
      localStorage.setItem(
        "runroute-feedback-v1",
        JSON.stringify(
          [...saved.filter((x: any) => x.id !== key), record].slice(-200),
        ),
      );
      setFeedback({ ...feedback, [key]: value });
    } catch {
      setMessage(
        "Feedback could not be saved. Browser storage may be disabled.",
      );
    }
  }
  return (
    <main>
      <header>
        <a className="brand" href="/">
          <span>
            <Route size={23} />
          </span>
          RunRoute<span className="beta">BETA</span>
        </a>
        <div className="region">
          <MapPin size={15} /> Urbana–Champaign, Illinois
        </div>
        <span className="edition">Built for the everyday run.</span>
      </header>
      <div className="workspace">
        <aside className="planner">
          <div className="eyebrow">YOUR NEXT RUN</div>
          <h1>
            A good route.{" "}
            <br />A better run.
          </h1>
          <p className="intro">Find your way around Urbana–Champaign.</p>
          <section>
            <label className="field-label">Route type</label>
            <RadioGroup
              className="choice"
              value={mode}
              onValueChange={(v) => {
                invalidate();
                setMode(v);
                setPick("start");
              }}
            >
              <label>
                <RadioGroupItem value="loop" /> Loop
              </label>
              <label>
                <RadioGroupItem value="point" /> Point to point
              </label>
            </RadioGroup>
          </section>
          <section>
            <div className="label-row">
              <label className="field-label">Starting location</label>
              <button
                className={
                  pick === "start" ? "text-button active" : "text-button"
                }
                onClick={() => {setPick("start");document.getElementById("route-map")?.scrollIntoView({behavior:"smooth",block:"center"});}}
              >
                Pick on map
              </button>
            </div>
            <LocationPicker
              point={start}
              onPendingChange={(v) => {
                setPendingStart(v);
                if (v) invalidate();
              }}
              label="Starting location"
              onChange={(p) => {
                invalidate();
                map.current?.setView([p.lat, p.lon], 15);
                setStart(p);
              }}
              onError={setMessage}
            />
            {resolvedStart&&<p className="helper">Start: {resolvedStart.description}</p>}
            <button
              className="locate text-button"
              onClick={() => {
                if (!navigator.geolocation) {
                  setMessage("Location is not supported in this browser.");
                  return;
                }
                navigator.geolocation.getCurrentPosition(
                  (p) => {
                    const point = {
                      lat: p.coords.latitude,
                      lon: p.coords.longitude,
                    };
                    if (!inside(point)) {
                      setMessage(
                        "Your location is outside the supported area.",
                      );
                      return;
                    }
                    invalidate();
                    setStart(point);
                    map.current?.panTo([point.lat, point.lon]);
                  },
                  () =>
                    setMessage(
                      "Location unavailable. Choose a place or click the map instead.",
                    ),
                );
              }}
            >
              <LocateFixed size={14} /> Use my location
            </button>
          </section>
          {mode === "point" && (
            <section>
              <div className="label-row">
                <label className="field-label">Destination</label>
                <button
                  className={
                    pick === "end" ? "text-button active" : "text-button"
                  }
                  onClick={() => {setPick("end");document.getElementById("route-map")?.scrollIntoView({behavior:"smooth",block:"center"});}}
                >
                  Pick on map
                </button>
              </div>
              <LocationPicker
                point={end}
                onPendingChange={(v) => {
                  setPendingEnd(v);
                  if (v) invalidate();
                }}
                label="Destination"
                onChange={(p) => {
                  invalidate();
                  map.current?.setView([p.lat, p.lon], 15);
                  setEnd(p);
                }}
                onError={setMessage}
              />
            </section>
          )}
          <section>
            <div className="label-row">
              <label htmlFor="distance" className="field-label">
                Target distance
              </label>
              <span className="units">KM</span>
            </div>
            <div className="distance">
              <input
                id="distance"
                type="number"
                min="1"
                max="25"
                step=".5"
                value={distance}
                onChange={(e) => {
                  invalidate();
                  setDistance(Number(e.target.value));
                }}
              />
              <span>kilometers</span>
            </div>
            <div className="presets">
              {[3, 5, 8, 10, 15].map((n) => (
                <button
                  className={distance === n ? "chosen" : ""}
                  key={n}
                  onClick={() => {
                    invalidate();
                    setDistance(n);
                  }}
                >
                  {n} km
                </button>
              ))}
            </div>
          </section>
          <section>
            <label className="field-label">Terrain preference</label>
            <RadioGroup
              value={terrain}
              onValueChange={(v) => {
                invalidate();
                setTerrain(v);
              }}
              className="choice"
            >
              <label>
                <RadioGroupItem value="flat" /> Flat
              </label>
              <label>
                <RadioGroupItem value="hilly" /> Hilly
              </label>
            </RadioGroup>
            <p className="helper">Hills are relative to the local terrain.</p>
          </section>
          <section className="toggle">
            <div>
              <label htmlFor="signals" className="field-label">
                Avoid traffic lights
              </label>
              <p className="helper">Exclude mapped signal crossings</p>
            </div>
            <Switch
              id="signals"
              checked={avoid}
              onCheckedChange={(v) => {
                invalidate();
                setAvoid(v);
              }}
            />
          </section>
          <button
            className="generate"
            disabled={
              pendingStart ||
              (mode === "point" && pendingEnd) ||
              busy ||
              distance < 1 ||
              distance > 25 ||
              !Number.isFinite(distance)
            }
            onClick={generateRoutes}
          >
            {busy ? "Finding your routes…" : "Find running routes"}
            <ArrowUpRight size={20} />
          </button>
          <p className="footnote">
            Routes follow mapped public roads and paths. Check local conditions
            before your run.
          </p>
        </aside>
        <div className="main-surface">
          <div className="map-wrap">
            <div id="route-map" />
            <div className="map-caption">
              <span className="map-label">EXPLORE YOUR NEIGHBORHOOD</span>
              <strong>
                {pick === "start"
                  ? "Click the map to set your start"
                  : "Click the map to set your destination"}
              </strong>
            </div>
            <div className="map-key" title="The route follows mapped sidewalks and paths; these may run beside the street centerline.">
              <i /> Running route <b>A</b> Start{" "}
              {mode === "point" && (
                <>
                  <b>B</b> Finish
                </>
              )}
            </div>
          </div>
          <div className="results">
            <p className="helper">Route lines follow mapped sidewalks and paths, which may sit beside the street.</p>
            <div className="results-heading">
              <div>
                <div className="eyebrow">MADE FOR YOUR RUN</div>
                <h2>
                  {runs.length
                    ? `${runs.length} routes to explore`
                    : "Your route starts here"}
                </h2>
              </div>
              <span className="ranking-label">Smoother routes · up to 7 options</span>
            </div>
            <div role="status" aria-live="polite">
              {message && <p className="notice">{message}</p>}
              {busy && (
                <p className="notice">
                  Searching for up to 7 smoother routes and comparing distances,
                  paths, and crossings…
                </p>
              )}
            </div>
            {!runs.length && !busy && !message && (
              <p className="empty">
                Choose your start and distance, then find a few ways to get
                there.
              </p>
            )}
            <div className="route-cards">
              {runs.map((r, i) => (
                <button
                  key={i}
                  onClick={() => setSelected(i)}
                  className={`route-card ${selected === i ? "selected" : ""}`}
                >
                  <div className="card-top">
                    <span>{i === 0 ? "BEST MATCH" : `ALTERNATIVE ${i}`}</span>
                    <strong>
                      {r.score}
                      <small>/100</small>
                    </strong>
                  </div>
                  <h3>
                    {r.trailFraction > 0.65
                      ? "Path-focused"
                      : r.signals === 0
                        ? "Uninterrupted"
                        : "Neighborhood"}{" "}
                    {mode === "loop" ? "loop" : "route"}
                  </h3>
                  <div className="metrics">
                    <div>
                      <strong>{(r.distance / 1000).toFixed(2)}</strong>
                      <span>km mapped ≈</span>
                    </div>
                    <div>
                      <strong>
                        {r.gain === null ? "—" : Math.round(r.gain)}
                      </strong>
                      <span>m ascent ≈</span>
                    </div>
                    <div>
                      <strong>{r.signals}</strong>
                      <span>mapped lights</span>
                    </div>
                  </div>
                  <div className="shape-note">
                    {r.shapePenaltyPoints
                      ? `${r.turns} turns · −${r.shapePenaltyPoints} shape points`
                      : `${r.turns} turns · no sharp reversals`}
                  </div>
                  <div className="card-bottom">
                    <Footprints size={14} />
                    {Math.round(r.trailFraction * 100)}% paths{" "}
                    <span>{Math.round(r.repeatFraction * 100)}% repeated</span>
                  </div>
                </button>
              ))}
            </div>
            {run && (
              <RouteActivity
                key={run.ids.join("-")}
                route={run}
                onLocation={(p) => {
                  if (!map.current) return;
                  if (userMarker.current)
                    userMarker.current.setLatLng([p.lat, p.lon]);
                  else
                    userMarker.current = window.L.circleMarker([p.lat, p.lon], {
                      radius: 9,
                      color: "#fff",
                      weight: 3,
                      fillColor: "#287ed6",
                      fillOpacity: 1,
                    }).addTo(map.current);
                  map.current.setView([p.lat, p.lon], 16);
                }}
                onStop={() => {
                  userMarker.current?.remove();
                  userMarker.current = null;
                }}
              />
            )}
            {run && (
              <div className="route-detail">
                <div>
                  <strong>Why this route?</strong>
                  <p>
                    {Math.round(run.distanceError * 100)}% from your target ·{" "}
                    {run.gain === null
                      ? "Elevation unavailable; terrain preference could not be evaluated."
                      : `${run.gain / run.distance > 0.01 ? "Rolling" : "Mostly flat"} · Elevation estimated from a coarse terrain grid.`}{" "}
                    {run.startLocation.description}. Start adjusted {Math.round(run.snapStart)} m from the selected location
                    {mode === "point"
                      ? `; destination ${Math.round(run.snapEnd)} m`
                      : ""}
                    .
                  </p>
                  {terrain === "hilly" &&
                    run.gain !== null &&
                    run.gain / run.distance < 0.01 && (
                      <p className="terrain-note">
                        This route is mostly flat. The available local terrain
                        may not offer the hills you want.
                      </p>
                    )}
                  <p className="helper">
                    Mapped distance is an estimate, not a certified course length.
                    Watch GPS and the path you actually run can differ. Routes meet
                    your target on the map, up to 5% longer; watch distance is not guaranteed.
                  </p>
                  <p className="helper">
                    {run.turns} turns · {run.uTurns} sharp reversals ·{" "}
                    {Math.round(run.nearRetraceFraction * 100)}% doubling back ·
                    −{run.shapePenaltyPoints} points for route shape. Score also
                    weighs distance, terrain, paths and lights. Signal counts
                    may be incomplete.
                  </p>
                </div>
                <div className="feedback">
                  <span>Would you run this?</span>
                  <div>
                    <button
                      aria-label="Like route"
                      className={
                        feedback[run.ids.join("-")] === "like" ? "voted" : ""
                      }
                      onClick={() => vote("like")}
                    >
                      <ThumbsUp size={17} />
                    </button>
                    <button
                      aria-label="Dislike route"
                      className={
                        feedback[run.ids.join("-")] === "dislike" ? "voted" : ""
                      }
                      onClick={() => vote("dislike")}
                    >
                      <ThumbsDown size={17} />
                    </button>
                  </div>
                  <small>
                    {feedback[run.ids.join("-")]
                      ? "Saved on this device"
                      : "Feedback stays on this device"}
                  </small>
                </div>
              </div>
            )}
          </div>
          <footer>
            <span>URBANA + CHAMPAIGN</span>
            <span>OpenStreetMap data · No account needed</span>
          </footer>
        </div>
      </div>
    </main>
  );
}
