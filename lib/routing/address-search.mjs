const aliases = {
  north: "n",
  south: "s",
  east: "e",
  west: "w",
  street: "st",
  avenue: "ave",
  road: "rd",
  drive: "dr",
  boulevard: "blvd",
  lane: "ln",
  court: "ct",
  place: "pl",
  parkway: "pkwy",
  illinois: "il",
};
export function normalizeAddress(value) {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9\s-]/g, " ")
    .split(/\s+/)
    .filter(Boolean)
    .map((t) => aliases[t] || t)
    .join(" ");
}
export function searchAddresses(addresses, query, limit = 6) {
  const normalized = normalizeAddress(query);
  if (normalized.length < 3) return [];
  const tokens = normalized.split(" ");
  const house = /^\d+[a-z]?$/.test(tokens[0]) ? tokens.shift() : null;
  const matches = [];
  for (const address of addresses) {
    const label = normalizeAddress(address.name),
      parts = label.split(" ");
    if (house && parts[0] !== house) continue;
    const meaningful = tokens.filter(
      (t) => !["il", "usa", "us", "united", "states"].includes(t),
    );
    if (
      !meaningful.every((t) =>
        parts.some((p) => p === t || (!/^\d/.test(t) && p.startsWith(t))),
      )
    )
      continue;
    const score =
      (label.startsWith(normalized) ? 10 : 0) +
      (house ? 5 : 0) -
      label.length / 1000;
    matches.push({ ...address, matchScore: score });
  }
  matches.sort((a, b) => b.matchScore - a.matchScore);
  const unique = [];
  for (const m of matches) {
    if (
      unique.some(
        (p) =>
          normalizeAddress(p.name) === normalizeAddress(m.name) &&
          Math.hypot((p.lat - m.lat) * 111320, (p.lon - m.lon) * 85000) < 100,
      )
    )
      continue;
    if (unique.some((p) => p.name === m.name))
      m.name += ` (${m.lat.toFixed(4)}, ${m.lon.toFixed(4)})`;
    unique.push(m);
    if (unique.length === limit) break;
  }
  return unique;
}
