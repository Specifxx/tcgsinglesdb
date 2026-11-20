// The browser-local My Collection, as agreed with the collection page (2026-11-20): localStorage "sdb_collection_v1" =
// { v: 1, items: [{ id, game, set, s, printing, qty, addedAt, src }] }, one item per (id, printing), qty summed; after every
// write the window gets an "sdb:collection" event. Nothing leaves the browser. Client-safe (no fs).
export const COLLECTION_KEY = "sdb_collection_v1";
export interface CollectionItem {
  id: number;
  game: string;
  set: string;
  s: string;
  /** Exactly a key of the card's TCGplayer prices ("Holofoil", "1st Edition"…), or "Normal". */
  printing: string;
  qty: number;
  addedAt: string;
  src: "scan" | "manual";
}
export interface CollectionFile {
  v: 1;
  items: CollectionItem[];
}

export function parseCollection(raw: string | null): CollectionFile {
  try {
    const j = JSON.parse(raw ?? "") as CollectionFile;
    if (j && j.v === 1 && Array.isArray(j.items)) return { v: 1, items: j.items.filter((i) => i && Number.isInteger(i.id) && typeof i.printing === "string") };
  } catch {
    /* empty or broken: start again */
  }
  return { v: 1, items: [] };
}

/** Pure: the file with one more copy of (id, printing). */
export function withItem(file: CollectionFile, item: Omit<CollectionItem, "qty" | "addedAt"> & { qty?: number }, now = new Date()): CollectionFile {
  const qty = Math.max(1, Math.floor(item.qty ?? 1));
  const i = file.items.findIndex((x) => x.id === item.id && x.printing === item.printing);
  if (i >= 0) {
    const items = [...file.items];
    items[i] = { ...items[i], qty: items[i].qty + qty };
    return { v: 1, items };
  }
  return { v: 1, items: [...file.items, { ...item, qty, addedAt: now.toISOString() }] };
}

/** Adds a copy in the browser; false when storage is blocked (private mode). */
export function addToCollection(item: Omit<CollectionItem, "qty" | "addedAt">): boolean {
  try {
    const next = withItem(parseCollection(localStorage.getItem(COLLECTION_KEY)), item);
    localStorage.setItem(COLLECTION_KEY, JSON.stringify(next));
    window.dispatchEvent(new Event("sdb:collection"));
    return true;
  } catch {
    return false;
  }
}
