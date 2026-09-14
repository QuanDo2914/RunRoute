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
    searchId.current++;
    setBusy(false);
    setSearchError("");
    setText(p.name || `${p.lat}, ${p.lon}`);
    onChange(p);
    onPendingChange(false);
    setOpen(false);
    setSearched(false);
  }
  async function search(query = text, explicit = true) {
    if (query.trim().length < 3) {
      setSearchError("Enter a street address, including the house number.");
      return;
    }
    const parts = query.split(",").map((s) => s.trim());
    if (
      parts.length === 2 &&
      parts.every((s) => s.length && Number.isFinite(Number(s)))
    ) {
      if (!explicit) { setBusy(false); return; }
      const p = { lat: Number(parts[0]), lon: Number(parts[1]) };
      if (insideRegion(p)) choose(p);
      else onError("Choose coordinates inside the coverage area.");
      return;
    }
    const id = ++searchId.current;
    setBusy(true);
    setSearchError("");
    if (explicit) setOpen(true);
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
      const results = searchAddresses([...region.places, ...await addressData], query);
      if (id !== searchId.current) return;
      setMatches(results);
      setSearched(true);
    } catch {
      if (id !== searchId.current) return;
      setSearchError(
        "Address search could not load. You can still choose a place or pick on the map.",
      );
    } finally {
      if (id === searchId.current) setBusy(false);
    }
  }
  useEffect(() => {
    if (text === display || text.trim().length < 3) {
      setBusy(false);
      return;
    }
    setBusy(true);
    const timer = setTimeout(() => { void search(text, false); }, 200);
    return () => clearTimeout(timer);
  }, [text, display]);
  const options = searched ? matches : text === display || !text.trim()
    ? region.places
    : region.places.filter(p => p.name.toLowerCase().includes(text.toLowerCase()));
  return (
    <div>
      <Combobox
        items={options.map((p) => p.name!)}
        filter={null}
        autoHighlight={true}
        value={point.name ?? null}
        inputValue={text}
        open={open}
        onOpenChange={setOpen}
        onInputValueChange={(v, details) => {
          if (details.reason === "input-change" || details.reason === "input-clear") {
            setText(v);
            searchId.current++;
            setSearched(v.trim().length >= 3);
            setSearchError("");
            setBusy(v.trim().length >= 3);
            setOpen(true);
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
            if (e.key !== "Enter" || e.nativeEvent.isComposing) return;
            e.preventDefault();
            (e as typeof e & {preventBaseUIHandler?: () => void}).preventBaseUIHandler?.();
            const activeId=e.currentTarget.getAttribute("aria-activedescendant");
            const activeName=activeId?document.getElementById(activeId)?.textContent?.trim():null;
            const highlighted=options.find(p=>p.name===activeName);
            const selection=open && !busy ? highlighted ?? options[0] : null;
            if(selection) choose(selection);
            else void search();
          }}
        />
        <ComboboxContent className="place-options">
          <ComboboxEmpty>
            {busy ? "Searching addresses…" : searchError || (text.trim().length < 3
              ? "Type at least 3 characters to find an address."
              : "No matching address in this area. Try the street number and name, or pick on the map.")}
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
        <button className="address-search" disabled={busy} onClick={() => search()}>
          <Search size={14} />
          {busy ? "Searching…" : "Search address"}
        </button>
        <span>Private, on-device search</span>
      </div>
      {text !== display && (
        <p className="helper">Choose a suggestion as you type, or press Enter to search.</p>
      )}
      {searchError && (
        <p className="helper" role="status">
          {searchError}
        </p>
      )}
    </div>
  );
}
