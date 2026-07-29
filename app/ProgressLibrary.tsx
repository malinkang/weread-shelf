"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { catalog as fallbackCatalog } from "./catalog";
import { loadLocalCatalog, type CatalogShelf } from "./load-catalog";
import { arrangeBooksForShelves, createCabinetLayout } from "./shelf-layout";
import { ShelfEngine, type ShelfMode } from "./ShelfEngine";
import { siteConfig } from "./site-config";

function ArrowIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <span aria-hidden="true" className={`arrow-icon arrow-icon--${direction}`}>
      <span />
    </span>
  );
}

const fallbackShelfNavigation: CatalogShelf[] = [
  { id: "literary", name: "文学 · 小说", totalCount: 0, syncedCount: 0, bookIds: [] },
  { id: "technical", name: "科学 · 技术", totalCount: 0, syncedCount: 0, bookIds: [] },
  { id: "practical", name: "成长 · 商业", totalCount: 0, syncedCount: 0, bookIds: [] },
];

export function ProgressLibrary() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const engineRef = useRef<ShelfEngine | null>(null);
  const [books, setBooks] = useState(fallbackCatalog);
  const [shelves, setShelves] = useState(fallbackShelfNavigation);
  const [activeIndex, setActiveIndex] = useState(0);
  const [selectedIndex, setSelectedIndex] = useState<number | null>(null);
  const [mode, setMode] = useState<ShelfMode>("browse");
  const [ready, setReady] = useState(false);
  const [status, setStatus] = useState("Preparing the complete catalog");

  const activeBook = books[activeIndex] ?? books[0] ?? fallbackCatalog[0];
  const selectedBook = useMemo(
    () => (selectedIndex === null ? null : books[selectedIndex]),
    [books, selectedIndex],
  );
  const isFocused = mode !== "browse";
  const isWeReadShelf = books.some((book) => book.source === "weread");
  const collectionName = isWeReadShelf
    ? "微信读书 · 书架分组"
    : siteConfig.collectionName;
  const shelfLayout = useMemo(
    () => createCabinetLayout(books, shelves.length),
    [books, shelves.length],
  );
  const activeShelfRow = shelfLayout.placements[activeIndex]?.row ?? 0;
  const activeShelf = shelves[activeShelfRow] ?? shelves[0];

  useEffect(() => {
    let cancelled = false;
    let engine: ShelfEngine | null = null;

    async function start() {
      if (!canvasRef.current) return;
      const loadedCatalog = await loadLocalCatalog();
      if (cancelled || !canvasRef.current) return;
      const arrangedBooks = arrangeBooksForShelves(loadedCatalog.books);
      setBooks(arrangedBooks);
      setShelves(loadedCatalog.shelves);
      setSelectedIndex(null);
      setStatus(
        arrangedBooks.some((book) => book.source === "weread")
          ? `正在装载 ${loadedCatalog.shelves.length} 层微信读书书架`
          : "Preparing the complete catalog",
      );
      await document.fonts.ready;
      if (cancelled || !canvasRef.current) return;

      engine = new ShelfEngine(canvasRef.current, arrangedBooks, {
        onActiveIndex: setActiveIndex,
        onMode: (nextMode, index) => {
          setMode(nextMode);
          setSelectedIndex(index);
        },
        onStatus: setStatus,
        onReady: () => setReady(true),
      });
      engineRef.current = engine;
    }

    void start();
    return () => {
      cancelled = true;
      engine?.dispose();
      engineRef.current = null;
    };
  }, []);

  return (
    <main
      className={`press-experience ${ready ? "is-ready" : ""} ${
        isFocused ? "is-focused" : "is-browsing"
      }`}
    >
      <canvas
        ref={canvasRef}
        className="shelf-canvas"
        data-testid="shelf-canvas"
        role="application"
        tabIndex={0}
        aria-label={`Interactive shelf with ${shelves.length} groups and ${books.length} books. Swipe vertically to change shelf, click a spine to open a book, or use the shelf menu for quick navigation.`}
      />

      <header className="site-header">
        <div
          className="wordmark"
          aria-label={`${siteConfig.wordmark}, ${collectionName}`}
        >
          <span>{siteConfig.wordmark}</span>
          <span className="wordmark__divider" />
          <span>{collectionName}</span>
        </div>
        <div className="header-actions">
          <div className="edition-mark">
            <span>{books.length} VOLUMES</span>
            <span>{String(shelves.length).padStart(2, "0")} SHELF GROUPS</span>
          </div>
        </div>
      </header>

      <nav
        className="shelf-switcher"
        aria-label="微信读书书架分组"
        data-testid="shelf-switcher"
      >
        <div className="shelf-switcher__rail">
          {shelves.map((shelf, shelfIndex) => (
            <button
              key={shelf.id}
              type="button"
              className={shelfIndex === activeShelfRow ? "is-active" : ""}
              aria-label={`切换到${shelf.name}书架`}
              disabled={isFocused}
              onClick={() => engineRef.current?.browseShelfTo(shelfIndex)}
            >
              <span />
            </button>
          ))}
        </div>
        <div className="shelf-switcher__menu">
          <div className="shelf-switcher__heading">
            <span>书架分组</span>
            <span>{shelves.length}</span>
          </div>
          <div className="shelf-switcher__list">
            {shelves.map((shelf, shelfIndex) => {
              const displayedCount =
                shelf.syncedCount || shelfLayout.rowBookCounts[shelfIndex] || 0;
              return (
                <button
                  key={shelf.id}
                  type="button"
                  className={shelfIndex === activeShelfRow ? "is-active" : ""}
                  aria-current={shelfIndex === activeShelfRow ? "page" : undefined}
                  disabled={isFocused}
                  title={
                    shelf.totalCount > displayedCount
                      ? `展示 ${displayedCount} 本，共 ${shelf.totalCount} 本`
                      : `${displayedCount} 本`
                  }
                  onClick={() => engineRef.current?.browseShelfTo(shelfIndex)}
                >
                  <span>{shelf.name}</span>
                  <span>{displayedCount}</span>
                </button>
              );
            })}
          </div>
        </div>
      </nav>

      <nav className="shelf-index" aria-label="Catalog position">
        <div
          className="shelf-index__ticks"
          style={{ gridTemplateColumns: `repeat(${books.length}, 1fr)` }}
        >
          {books.map((book, index) => (
            <button
              key={book.id}
              type="button"
              className={index === activeIndex ? "is-active" : ""}
              aria-label={`Browse to ${book.title}`}
              aria-current={index === activeIndex ? "true" : undefined}
              disabled={isFocused}
              onClick={() => engineRef.current?.browseTo(index)}
            >
              <span />
            </button>
          ))}
        </div>
        <div className="input-hint" aria-hidden="true">
          <span>SWIPE UP / DOWN</span>
          <i />
          <span>{activeShelf?.name ?? "SHELF"}</span>
          <i />
          <span>
            LAYER {String(activeShelfRow + 1).padStart(2, "0")} / {String(shelves.length).padStart(2, "0")}
          </span>
          <i />
          <span>CLICK BOOKS</span>
        </div>
      </nav>

      <aside
        className="book-details"
        aria-hidden={!isFocused}
        aria-label={selectedBook ? `Details for ${selectedBook.title}` : "Book details"}
        data-testid="book-details"
      >
        {selectedBook ? (
          <div className="book-details__inner">
            <button
              type="button"
              className="back-button"
              data-testid="return-to-shelf"
              onClick={() => engineRef.current?.returnToShelf()}
            >
              <ArrowIcon direction="left" />
              <span>Return to shelf</span>
            </button>

            <div className="book-details__position">
              <span>{String(selectedIndex! + 1).padStart(2, "0")}</span>
              <span>{String(books.length).padStart(2, "0")}</span>
            </div>

            <div className="book-details__copy">
              <p className="eyebrow">
                {selectedBook.source === "weread"
                  ? `微信读书 · ${selectedBook.shelfGroupName ?? "书架"}`
                  : siteConfig.editionEyebrow}
              </p>
              <h2>{selectedBook.title}</h2>
              <p className="book-details__author">{selectedBook.author}</p>
              <p className="book-details__description">
                {selectedBook.description}
              </p>

              {selectedBook.quote ? (
                <blockquote>
                  <p>“{selectedBook.quote}”</p>
                  {selectedBook.quoteBy ? <cite>{selectedBook.quoteBy}</cite> : null}
                </blockquote>
              ) : null}

              <dl>
                <div>
                  <dt>{selectedBook.source === "weread" ? "分类" : "Format"}</dt>
                  <dd>{selectedBook.format}</dd>
                </div>
                <div>
                  <dt>
                    {selectedBook.source === "weread" ? "阅读状态" : "Availability"}
                  </dt>
                  <dd>{selectedBook.availability}</dd>
                </div>
                {selectedBook.publisher ? (
                  <div>
                    <dt>出版社</dt>
                    <dd>{selectedBook.publisher}</dd>
                  </div>
                ) : null}
                {selectedBook.isbn ? (
                  <div>
                    <dt>ISBN</dt>
                    <dd>{selectedBook.isbn}</dd>
                  </div>
                ) : null}
              </dl>

              <a
                className="official-link"
                data-testid="official-link"
                href={selectedBook.url}
                target="_blank"
                rel="noreferrer"
              >
                <span>
                  {selectedBook.linkLabel ?? siteConfig.bookLinkLabel}
                </span>
                <span aria-hidden="true">↗</span>
              </a>
            </div>

            <div className="focus-controls" aria-label="Inspection controls">
              <span>Drag to orbit</span>
              <span>Pinch or scroll to zoom</span>
              <button
                type="button"
                data-testid="reset-view"
                onClick={() => engineRef.current?.resetFocusView()}
              >
                Reset view
              </button>
            </div>
          </div>
        ) : null}
      </aside>

      <div
        className="experience-status"
        role="status"
        aria-live="polite"
        data-testid="experience-status"
      >
        <span className="experience-status__dot" />
        <span>{status}</span>
      </div>

      <div className="loading-screen" aria-hidden={ready}>
        <div className="loading-screen__mark">
          <span />
          <span />
          <span />
        </div>
        <p>Assembling {books.length} volumes</p>
      </div>

      <p className="independent-note">
        {isWeReadShelf
          ? "本地同步自微信读书 · 已排除私密条目"
          : siteConfig.independentNote}
      </p>

      <div className="sr-only" aria-live="polite">
        {isFocused && selectedBook
          ? `Inspecting ${selectedBook.title} by ${selectedBook.author}.`
          : `Selected ${activeBook.title} by ${activeBook.author}.`}
      </div>
    </main>
  );
}
