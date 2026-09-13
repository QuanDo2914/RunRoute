/** Geometry-based return detection, independent of OSM edge IDs.
 * Resample every 10 m. Detect opposing travel within 25 m; exclude adjacent
 * samples so ordinary corners and dense map vertices do not inflate penalties.
 */
export function shapeFeatures(coordinates) {
  if (coordinates.length < 3)
    return { turns: 0, uTurns: 0, nearRetraceFraction: 0 };
  const latitude = (coordinates[0][0] * Math.PI) / 180;
  const project = ([lat, lon]) => [
    lon * 111320 * Math.cos(latitude),
    lat * 111320,
  ];
  const original = coordinates.map(project),
    samples = [original[0]];
  let remaining = 10;
  for (let i = 1; i < original.length; i++) {
    let a = original[i - 1];
    const b = original[i];
    let length = Math.hypot(b[0] - a[0], b[1] - a[1]);
    while (length >= remaining) {
      const t = remaining / length;
      a = [a[0] + t * (b[0] - a[0]), a[1] + t * (b[1] - a[1])];
      samples.push(a);
      length -= remaining;
      remaining = 10;
    }
    remaining -= length;
  }
  let turns = 0,
    lastDirectionTurn = -20;
  let uTurns = 0,
    lastTurn = -20,
    returns = 0;
  const cosine = (a, b) =>
    (a[0] * b[0] + a[1] * b[1]) / (Math.hypot(...a) * Math.hypot(...b) || 1);
  const grid = new Map();
  for (let i = 1; i < samples.length; i++) {
    const p = samples[i],
      before = samples[i - 1],
      direction = [p[0] - before[0], p[1] - before[1]];
    const x = Math.floor(p[0] / 25),
      y = Math.floor(p[1] / 25);
    let matched = false;
    for (let dx = -1; dx <= 1; dx++)
      for (let dy = -1; dy <= 1; dy++) {
        for (const old of grid.get(`${x + dx},${y + dy}`) || []) {
          if (
            i - old.i > 6 &&
            Math.hypot(p[0] - old.p[0], p[1] - old.p[1]) <= 25 &&
            cosine(direction, old.direction) < -0.85
          )
            matched = true;
        }
      }
    if (matched) returns++;
    const key = `${x},${y}`;
    if (!grid.has(key)) grid.set(key, []);
    grid.get(key).push({ i, p, direction });
    if (i >= 2 && i + 2 < samples.length && i - lastDirectionTurn > 4) {
      const a = samples[i - 2],
        b = samples[i + 2];
      if (
        cosine([p[0] - a[0], p[1] - a[1]], [b[0] - p[0], b[1] - p[1]]) < 0.5
      ) {
        turns++;
        lastDirectionTurn = i;
      }
    }
    if (i >= 3 && i + 3 < samples.length && i - lastTurn > 8) {
      const a = samples[i - 3],
        b = samples[i + 3];
      if (
        cosine([p[0] - a[0], p[1] - a[1]], [b[0] - p[0], b[1] - p[1]]) < -0.866
      ) {
        uTurns++;
        lastTurn = i;
      }
    }
  }
  return {
    turns,
    uTurns,
    nearRetraceFraction: returns / Math.max(1, samples.length - 1),
  };
}
export function scoreRoute(f, terrain = "flat") {
  const terrainPenalty =
    f.gain == null
      ? 0
      : terrain === "flat"
        ? Math.min(1, (f.gain / f.distance) * 100)
        : Math.max(0, 1 - (f.gain / f.distance) * 100);
  const shapeCost =
    (f.turns || 0) * 0.018 +
    (f.uTurns || 0) * 0.1 +
    Math.max(f.repeatFraction, f.nearRetraceFraction) * 1.3;
  const otherCost =
    f.distanceError * 2 +
    f.signals * 0.05 +
    terrainPenalty * 0.15 +
    (1 - f.trailFraction) * 0.1;
  const rankScore = 100 * Math.exp(-otherCost - shapeCost);
  return {
    score: Math.round(rankScore),
    rankScore,
    shapePenaltyPoints: Math.round(100 * Math.exp(-otherCost) - rankScore),
  };
}
