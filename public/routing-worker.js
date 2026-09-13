import { graphFrom, generate } from "/engine.mjs";
let graph;
self.onmessage = async ({ data }) => {
  try {
    if (!graph) {
      const r = await fetch(data.url);
      if (!r.ok)
        throw Error(
          "Regional map data is unavailable. Please try again later.",
        );
      graph = graphFrom(await r.json());
    }
    self.postMessage({ id: data.id, routes: generate(graph, data.request) });
  } catch (e) {
    self.postMessage({
      id: data.id,
      error: e.message || "Route generation failed.",
    });
  }
};
