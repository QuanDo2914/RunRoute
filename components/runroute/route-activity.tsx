"use client";
import { useEffect, useRef, useState } from "react";
import { Download, Navigation, Flag, X, LocateFixed } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  navigationPath,
  navigationUpdate,
  toGpx,
} from "@/lib/routing/navigation.mjs";
type Route = { coordinates: number[][]; distance: number };
type Position = { lat: number; lon: number; accuracy: number };
export function RouteActivity({
  route,
  onLocation,
  onStop,
}: {
  route: Route;
  onLocation: (p: Position) => void;
  onStop: () => void;
}) {
  const [open, setOpen] = useState(false),
    [live, setLive] = useState(false),
    [error, setError] = useState(""),
    [status, setStatus] = useState<ReturnType<typeof navigationUpdate> | null>(
      null,
    ),
    [accuracy, setAccuracy] = useState<number | null>(null),
    [downloaded, setDownloaded] = useState(false);
  const watch = useRef<number | null>(null),
    progress = useRef(0),
    acquired = useRef(false),
    callback = useRef(onLocation),
    stopCallback = useRef(onStop),
    lastPosition = useRef<Position | null>(null),
    lastFix = useRef(0);
  callback.current = onLocation;
  stopCallback.current = onStop;
  function stop() {
    if (watch.current !== null) navigator.geolocation.clearWatch(watch.current);
    watch.current = null;
    setLive(false);
    stopCallback.current();
  }
  useEffect(
    () => () => {
      if (watch.current !== null)
        navigator.geolocation.clearWatch(watch.current);
      stopCallback.current();
    },
    [],
  );
  useEffect(() => {
    if (!live) return;
    const timer = setInterval(() => {
      if (
        lastFix.current &&
        Date.now() - lastFix.current > 20000 &&
        watch.current !== null
      )
        setStatus((previous) =>
          previous
            ? {
                ...previous,
                status: "weak-gps",
                instruction: "GPS signal lost — waiting for an update",
                toTurn: null,
              }
            : null,
        );
    }, 5000);
    return () => clearInterval(timer);
  }, [live]);
  function start() {
    if (!navigator.geolocation) {
      setError(
        "This browser does not support live location. You can download the GPX instead.",
      );
      return;
    }
    setError("");
    setOpen(false);
    setLive(true);
    setStatus(null);
    lastFix.current = 0;
    progress.current = 0;
    acquired.current = false;
    const path = navigationPath(route.coordinates);
    watch.current = navigator.geolocation.watchPosition(
      (p) => {
        lastFix.current = Date.now();
        setError("");
        const position = {
          lat: p.coords.latitude,
          lon: p.coords.longitude,
          accuracy: p.coords.accuracy,
        };
        lastPosition.current = position;
        setAccuracy(position.accuracy);
        const next = navigationUpdate(
          path,
          position,
          progress.current,
          acquired.current,
        );
        progress.current = next.progress;
        acquired.current = next.acquired;
        setStatus(next);
        if (position.accuracy <= 40) callback.current(position);
        if (next.status === "finished" && watch.current !== null) {
          navigator.geolocation.clearWatch(watch.current);
          watch.current = null;
        }
      },
      (e) => {
        setError(
          e.code === 1
            ? "Location permission was denied. Allow location access in your browser, or download the GPX."
            : "GPS location is unavailable. Move into open sky and try again.",
        );
        setStatus((previous) =>
          previous
            ? {
                ...previous,
                status: "weak-gps",
                instruction: "Waiting for a GPS signal",
                toTurn: null,
              }
            : null,
        );
        if (e.code === 1) stop();
      },
      { enableHighAccuracy: true, maximumAge: 2000, timeout: 15000 },
    );
  }
  function download() {
    try {
      const xml = toGpx(
        route,
        `RunRoute ${(route.distance / 1000).toFixed(2)} km`,
      );
      const url = URL.createObjectURL(
        new Blob([xml], { type: "application/gpx+xml" }),
      );
      const a = document.createElement("a");
      a.href = url;
      a.download = `runroute-${(route.distance / 1000).toFixed(2)}km.gpx`;
      document.body.appendChild(a);
      a.click();
      a.remove();
      setTimeout(() => URL.revokeObjectURL(url), 30000);
      setDownloaded(true);
    } catch {
      setError("The GPX could not be created. Generate the route again.");
    }
  }
  return (
    <div className="route-activity">
      <button
        className="start-route"
        onClick={() => {
          setError("");
          setDownloaded(false);
          setOpen(true);
        }}
        disabled={live}
      >
        <Navigation size={17} />
        {live ? "Navigation active" : "Start this route"}
      </button>
      {error && (
        <p className="notice" role="alert">
          {error}
        </p>
      )}
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="start-dialog">
          <DialogHeader>
            <DialogTitle>Take this route for a run</DialogTitle>
            <DialogDescription>
              {(route.distance / 1000).toFixed(2)} km · Choose how to follow
              your route.
            </DialogDescription>
          </DialogHeader>
          <button className="start-option" onClick={start}>
            <Navigation size={24} />
            <span>
              <strong>Live directions</strong>
              <small>
                Follow your position and upcoming turns in RunRoute.
              </small>
            </span>
          </button>
          <button className="start-option" onClick={download}>
            <Download size={24} />
            <span>
              <strong>{downloaded ? "GPX downloaded" : "Download GPX"}</strong>
              <small>Import the track into your watch or navigation app.</small>
            </span>
          </button>
          <p className="helper">
            Live directions use GPS while this page is open. Keep the screen
            awake. Directions are estimated from the route geometry; off-route
            alerts do not reroute you. GPX import depends on your device.
          </p>
        </DialogContent>
      </Dialog>
      {live && (
        <section
          className={`live-navigation ${status?.status === "off-route" ? "off-route" : ""}`}
          aria-live="polite"
        >
          <div className="navigation-icon">
            {status?.status === "finished" ? (
              <Flag size={27} />
            ) : (
              <Navigation size={27} />
            )}
          </div>
          <div className="navigation-main">
            <span className="eyebrow">
              {status?.status === "off-route"
                ? "RETURN TO THE HIGHLIGHTED ROUTE"
                : "LIVE DIRECTIONS · BETA"}
            </span>
            <strong>
              {status?.toTurn !== null &&
              (status?.toTurn ?? 0) > 0 &&
              status?.status === "on-route"
                ? `In ${status.toTurn} m, `
                : ""}
              {status?.instruction || "Finding your GPS position…"}
            </strong>
            <p>
              {status
                ? `${(status.remaining / 1000).toFixed(2)} km remaining`
                : "Waiting for location permission"}
              {accuracy !== null ? ` · GPS ±${Math.round(accuracy)} m` : ""}
              {status?.status === "to-start"
                ? ` · ${status.toTurn} m from the start`
                : ""}
            </p>
            {error && <p>{error}</p>}
          </div>
          <button
            aria-label="Center on my position"
            onClick={() => {
              if (lastPosition.current) callback.current(lastPosition.current);
            }}
          >
            <LocateFixed size={20} />
          </button>
          <button className="stop-navigation" onClick={stop}>
            <X size={17} /> Stop
          </button>
        </section>
      )}
    </div>
  );
}
