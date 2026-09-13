"use client";
import { useEffect, useRef, useState } from "react";
import { Search } from "lucide-react";
import {
  Combobox,
  ComboboxInput,
  ComboboxContent,
  ComboboxList,
  ComboboxItem,
  ComboboxEmpty,
} from "@/components/ui/combobox";
import { region } from "@/lib/routing/regions";
import { searchAddresses } from "@/lib/routing/address-search.mjs";
export type Point = { lat: number; lon: number; name?: string };
let addressData: Promise<Point[]> | null = null;
export function insideRegion(p: Point) {
  return (
    p.lat >= region.bounds[0] &&
    p.lat <= region.bounds[2] &&
    p.lon >= region.bounds[1] &&
    p.lon <= region.bounds[3]
  );
}
export function LocationPicker({
  point,
  label,
  onChange,
  onError,
  onPendingChange,
}: {
  point: Point;
  label: string;
  onChange: (p: Point) => void;
  onError: (s: string) => void;
  onPendingChange: (v: boolean) => void;
}) {
  const display =
    point.name || `${point.lat.toFixed(5)}, ${point.lon.toFixed(5)}`;
  const [text, setText] = useState(display),
    [matches, setMatches] = useState<Point[]>([]),
    [busy, setBusy] = useState(false),
    [searched, setSearched] = useState(false),
    [open, setOpen] = useState(false),
    [searchError, setSearchError] = useState("");
  const searchId = useRef(0);
  useEffect(() => {
    searchId.current++;
    setText(display);
    onPendingChange(false);
    setSearched(false);
    setMatches([]);
  }, [display]);
  function choose(p: Point) {
    setText(p.name || `${p.lat}, ${p.lon}`);
    onChange(p);
    onPendingChange(false);
    setOpen(false);
    setSearched(false);
  }
  async function search() {
    if (text.trim().length < 3) {
      setSearchError("Enter a street address, including the house number.");
      return;
    }
    const parts = text.split(",").map((s) => s.trim());
    if (
      parts.length === 2 &&
      parts.every((s) => s.length && Number.isFinite(Number(s)))
    ) {
      const p = { lat: Number(parts[0]), lon: Number(parts[1]) };
      if (insideRegion(p)) choose(p);
      else onError("Choose coordinates inside the coverage area.");
      return;
    }
    const id = ++searchId.current;
    setBusy(true);
    setSearchError("");
    try {
      if (!addressData)
        addressData = fetch(region.addressUrl)
          .then((r) => {
            if (!r.ok) throw Error("Address data unavailable");
            return r.json();
          })
          .then((d) => (d as { addresses: Point[] }).addresses)
          .catch((e) => {
            addressData = null;
            throw e;
          });
      const results = searchAddresses(await addressData, text);
      if (id !== searchId.current) return;
      setMatches(results);
      setSearched(true);
      setOpen(true);
    } catch {
      setSearchError(
        "Address search could not load. You can still choose a place or pick on the map.",
      );
    } finally {
      setBusy(false);
    }
  }
  const options = searched ? matches : region.places;
  return (
    <div>
      <Combobox
        items={options.map((p) => p.name!)}
        filter={null}
        autoHighlight={false}
        value={point.name ?? null}
        inputValue={text}
        open={open}
        onOpenChange={setOpen}
        onInputValueChange={(v, details) => {
          setText(v);
          if (details.reason === "input-change") {
            searchId.current++;
            setSearched(false);
            setMatches([]);
            onPendingChange(v !== display);
          }
        }}
        onValueChange={(v) => {
          const p = options.find((p) => p.name === v);
          if (p) choose(p);
        }}
      >
        <ComboboxInput
          className="place-combobox"
          aria-label={label}
          placeholder="Enter an address or choose a place"
          onKeyDown={(e) => {
            if (
              e.key === "Enter" &&
              (!open || (!searched && text !== display))
            ) {
              e.preventDefault();
              search();
            }
          }}
        />
        <ComboboxContent className="place-options">
          <ComboboxEmpty>
            No matching address in this area. Try the street number and name, or
            pick on the map.
          </ComboboxEmpty>
          <ComboboxList>
            {(item: string) => (
              <ComboboxItem key={item} value={item}>
                {item}
              </ComboboxItem>
            )}
          </ComboboxList>
        </ComboboxContent>
      </Combobox>
      <div className="address-search-row">
        <button className="address-search" disabled={busy} onClick={search}>
          <Search size={14} />
          {busy ? "Searching…" : "Search address"}
        </button>
        <span>Private, on-device search</span>
      </div>
      {text !== display && (
        <p className="helper">Search your address, then select a match.</p>
      )}
      {searchError && (
        <p className="helper" role="status">
          {searchError}
        </p>
      )}
    </div>
  );
}
