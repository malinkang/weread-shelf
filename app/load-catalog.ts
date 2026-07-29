import { catalog as fallbackCatalog, type CatalogBook } from "./catalog";

type CatalogPayload = {
  source?: string;
  books?: unknown[];
  shelves?: unknown[];
};

export type CatalogShelf = {
  id: string;
  name: string;
  totalCount: number;
  syncedCount: number;
  bookIds: string[];
};

export type LoadedCatalog = {
  books: CatalogBook[];
  shelves: CatalogShelf[];
};

const fallbackShelves: CatalogShelf[] = [
  { id: "literary", name: "文学 · 小说", totalCount: 0, syncedCount: 0, bookIds: [] },
  { id: "technical", name: "科学 · 技术", totalCount: 0, syncedCount: 0, bookIds: [] },
  { id: "practical", name: "成长 · 商业", totalCount: 0, syncedCount: 0, bookIds: [] },
];

function isCatalogBook(value: unknown): value is CatalogBook {
  if (!value || typeof value !== "object") return false;
  const book = value as Partial<CatalogBook>;
  return (
    typeof book.id === "string" &&
    typeof book.title === "string" &&
    typeof book.shortTitle === "string" &&
    typeof book.author === "string" &&
    typeof book.description === "string" &&
    typeof book.url === "string" &&
    typeof book.cover === "string" &&
    typeof book.accent === "string" &&
    typeof book.ink === "string" &&
    typeof book.motif === "string" &&
    typeof book.height === "number" &&
    typeof book.thickness === "number"
  );
}

function isCatalogShelf(value: unknown): value is CatalogShelf {
  if (!value || typeof value !== "object") return false;
  const shelf = value as Partial<CatalogShelf>;
  return (
    typeof shelf.id === "string" &&
    typeof shelf.name === "string" &&
    typeof shelf.totalCount === "number" &&
    typeof shelf.syncedCount === "number" &&
    Array.isArray(shelf.bookIds) &&
    shelf.bookIds.every((bookId) => typeof bookId === "string")
  );
}

export async function loadLocalCatalog(): Promise<LoadedCatalog> {
  try {
    const catalogUrl = new URL("weread-catalog.json", window.location.href);
    const response = await fetch(catalogUrl, { cache: "no-store" });
    if (!response.ok) return { books: fallbackCatalog, shelves: fallbackShelves };

    const payload = (await response.json()) as CatalogPayload;
    const books = (payload.books ?? []).filter(isCatalogBook);
    const shelves = (payload.shelves ?? []).filter(isCatalogShelf);
    return books.length
      ? { books, shelves: shelves.length ? shelves : fallbackShelves }
      : { books: fallbackCatalog, shelves: fallbackShelves };
  } catch {
    return { books: fallbackCatalog, shelves: fallbackShelves };
  }
}
