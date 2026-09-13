import { meters } from "./engine.mjs";
const point = ([lat, lon]) => ({ lat, lon });
export function navigationPath(coordinates) {
  if (coordinates.length < 2)
    throw Error("A route needs at least two coordinates.");
  const distances = [0];
  for (let i = 1; i < coordinates.length; i++)
    distances.push(
      distances.at(-1) +
        meters(point(coordinates[i - 1]), point(coordinates[i])),
    );
  const turns = [];
  let last = -100;
  for (let i = 1; i < coordinates.length - 1; i++) {
    let a = i - 1,
      b = i + 1;
    while (a > 0 && distances[i] - distances[a] < 20) a--;
    while (b < coordinates.length - 1 && distances[b] - distances[i] < 20) b++;
    if (distances[i] - distances[a] < 12 || distances[b] - distances[i] < 12)
      continue;
    const p = coordinates[i],
      scale = Math.cos((p[0] * Math.PI) / 180);
    const u = [(p[1] - coordinates[a][1]) * scale, p[0] - coordinates[a][0]],
      v = [(coordinates[b][1] - p[1]) * scale, coordinates[b][0] - p[0]];
    const angle =
      (Math.atan2(u[0] * v[1] - u[1] * v[0], u[0] * v[0] + u[1] * v[1]) * 180) /
      Math.PI;
    if (Math.abs(angle) > 55 && distances[i] - last > 45) {
      turns.push({
        at: distances[i],
        instruction:
          Math.abs(angle) > 150
            ? "Make a U-turn"
            : angle > 0
              ? "Turn left"
              : "Turn right",
        angle,
      });
      last = distances[i];
    }
  }
  return { coordinates, distances, total: distances.at(-1), turns };
}
/** Match only near current progress, never to a distant crossing or loop finish. */
export function matchProgress(path, position, previous = 0) {
  const scale = Math.cos((position.lat * Math.PI) / 180) * 111320;
  let best = { distance: Infinity, progress: previous, score: Infinity };
  for (let i = 1; i < path.coordinates.length; i++) {
    if (
      path.distances[i] < previous - 50 ||
      path.distances[i - 1] > previous + 250
    )
      continue;
    const a = path.coordinates[i - 1],
      b = path.coordinates[i];
    const ax = (a[1] - position.lon) * scale,
      ay = (a[0] - position.lat) * 111320,
      bx = (b[1] - position.lon) * scale,
      by = (b[0] - position.lat) * 111320;
    const dx = bx - ax,
      dy = by - ay,
      t = Math.max(
        0,
        Math.min(1, -(ax * dx + ay * dy) / (dx * dx + dy * dy || 1)),
      );
    const distance = Math.hypot(ax + t * dx, ay + t * dy),
      progress =
        path.distances[i - 1] + t * (path.distances[i] - path.distances[i - 1]);
    const score = distance + Math.max(0, progress - previous) * 0.015;
    if (score < best.score) best = { distance, progress, score };
  }
  return best;
}
export function navigationUpdate(
  path,
  position,
  previous = 0,
  acquired = false,
) {
  if (!Number.isFinite(position.accuracy) || position.accuracy > 40)
    return {
      progress: previous,
      acquired,
      status: "weak-gps",
      instruction: "Waiting for a better GPS signal",
      remaining: path.total - previous,
      toTurn: null,
    };
  const startDistance = meters(position, point(path.coordinates[0]));
  if (!acquired && startDistance > 45)
    return {
      progress: 0,
      acquired: false,
      status: "to-start",
      instruction: "Go to the route starting point",
      remaining: path.total,
      toTurn: Math.round(startDistance),
    };
  const match = matchProgress(path, position, previous);
  if (match.distance > 40)
    return {
      progress: previous,
      acquired: true,
      status: "off-route",
      instruction: "You are off route",
      remaining: path.total - previous,
      toTurn: null,
    };
  const progress = Math.max(previous, match.progress),
    remaining = Math.max(0, path.total - progress);
  const finished =
    remaining < 25 && meters(position, point(path.coordinates.at(-1))) < 30;
  const next = path.turns.find((t) => t.at > progress + 8);
  return {
    progress,
    acquired: true,
    status: finished ? "finished" : "on-route",
    instruction: finished
      ? "Route complete"
      : next
        ? next.instruction
        : "Continue to the finish",
    remaining,
    toTurn: next ? Math.round(next.at - progress) : Math.round(remaining),
  };
}
const escapeXml = (s) =>
  s.replace(
    /[<>&"']/g,
    (c) =>
      ({
        "<": "&lt;",
        ">": "&gt;",
        "&": "&amp;",
        '"': "&quot;",
        "'": "&apos;",
      })[c],
  );
export function toGpx(route, name = "RunRoute running route") {
  if (!route.coordinates?.length) throw Error("No route selected.");
  if (
    !route.coordinates.every(
      (p) =>
        p.length >= 2 &&
        p.every(Number.isFinite) &&
        Math.abs(p[0]) <= 90 &&
        Math.abs(p[1]) <= 180,
    )
  )
    throw Error("Invalid route coordinates.");
  return `<?xml version="1.0" encoding="UTF-8"?>\n<gpx version="1.1" creator="RunRoute" xmlns="http://www.topografix.com/GPX/1/1"><metadata><name>${escapeXml(name)}</name><desc>Running route generated from OpenStreetMap data. Check local conditions.</desc></metadata><trk><name>${escapeXml(name)}</name><trkseg>${route.coordinates.map(([lat, lon]) => `<trkpt lat="${lat.toFixed(7)}" lon="${lon.toFixed(7)}"/>`).join("")}</trkseg></trk></gpx>`;
}
