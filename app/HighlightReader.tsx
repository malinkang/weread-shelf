"use client";

import {
  type CSSProperties,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import type { CatalogBook } from "./catalog";
import {
  createReadingPages,
  loadBookNotes,
  type WeReadBookNotes,
} from "./reading-notes";

const highlightColors = ["#e9c861", "#efb08a", "#91cbbd", "#aebee4", "#d0abd8"];

type HighlightReaderProps = {
  book: CatalogBook;
  onClose: () => void;
};

export function HighlightReader({ book, onClose }: HighlightReaderProps) {
  const [notes, setNotes] = useState<WeReadBookNotes | null>(null);
  const [error, setError] = useState<string | null>(
    book.notesPath ? null : "这本书还没有同步划线",
  );
  const [pageIndex, setPageIndex] = useState(0);
  const closeButtonRef = useRef<HTMLButtonElement>(null);
  const pages = useMemo(() => (notes ? createReadingPages(notes) : []), [notes]);
  const page = pages[pageIndex];

  useEffect(() => {
    const controller = new AbortController();
    if (!book.notesPath) return () => controller.abort();
    loadBookNotes(book.notesPath, controller.signal)
      .then(setNotes)
      .catch((reason: unknown) => {
        if (reason instanceof DOMException && reason.name === "AbortError") return;
        setError(reason instanceof Error ? reason.message : "读取划线失败");
      });
    return () => controller.abort();
  }, [book.notesPath]);

  useEffect(() => {
    closeButtonRef.current?.focus();
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
      if (event.key === "ArrowLeft") {
        setPageIndex((current) => Math.max(0, current - 1));
      }
      if (event.key === "ArrowRight") {
        setPageIndex((current) =>
          Math.min(Math.max(0, pages.length - 1), current + 1),
        );
      }
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, pages.length]);

  const readerStyle = page
    ? ({
        "--reader-highlight":
          highlightColors[Math.abs(page.colorStyle ?? 0) % highlightColors.length],
      } as CSSProperties)
    : undefined;

  return (
    <section
      className="highlight-reader"
      data-testid="highlight-reader"
      role="dialog"
      aria-modal="true"
      aria-label={`${book.title}的划线`}
      style={readerStyle}
    >
      <header className="highlight-reader__header">
        <div>
          <p>MY WEREAD MARGINALIA</p>
          <h2>{book.title}</h2>
          <span>{book.author}</span>
        </div>
        <button
          ref={closeButtonRef}
          type="button"
          className="highlight-reader__close"
          data-testid="close-highlight-reader"
          onClick={onClose}
        >
          <span>合上书</span>
          <i aria-hidden="true" />
        </button>
      </header>

      <div className="highlight-reader__body">
        {!notes && !error ? (
          <div className="highlight-reader__state" role="status">
            <span className="highlight-reader__loading" />
            <p>正在翻到你的划线…</p>
          </div>
        ) : null}

        {error ? (
          <div className="highlight-reader__state" role="alert">
            <strong>这一页暂时翻不开</strong>
            <p>{error}</p>
          </div>
        ) : null}

        {notes && !page ? (
          <div className="highlight-reader__state">
            <strong>还没有可展示的文字划线</strong>
            <p>书签只同步数量，不会导出书签内容。</p>
          </div>
        ) : null}

        {page ? (
          <article className="reading-sheet" key={page.id}>
            <div className="reading-sheet__folio">
              <span>{String(pageIndex + 1).padStart(3, "0")}</span>
              <span>{String(pages.length).padStart(3, "0")}</span>
            </div>
            <p className="reading-sheet__chapter">{page.chapterTitle}</p>
            {page.quote ? (
              <blockquote>
                <span aria-hidden="true">“</span>
                <p>{page.quote}</p>
              </blockquote>
            ) : null}
            {page.thoughts.map((thought) => (
              <aside className="reading-sheet__thought" key={thought.id}>
                <p className="reading-sheet__thought-label">当时的想法</p>
                <p>{thought.content}</p>
                {thought.createdAt ? <time>{thought.createdAt}</time> : null}
              </aside>
            ))}
            <footer>
              <span>{page.kind === "highlight" ? "划线" : "想法"}</span>
              {page.createdAt ? <time>{page.createdAt}</time> : null}
            </footer>
          </article>
        ) : null}
      </div>

      <footer className="highlight-reader__footer">
        <button
          type="button"
          disabled={pageIndex <= 0}
          onClick={() => setPageIndex((current) => Math.max(0, current - 1))}
        >
          上一条
        </button>
        <div aria-live="polite">
          <span>{pages.length ? pageIndex + 1 : 0}</span>
          <i />
          <span>{pages.length}</span>
        </div>
        <button
          type="button"
          disabled={!pages.length || pageIndex >= pages.length - 1}
          onClick={() =>
            setPageIndex((current) =>
              Math.min(Math.max(0, pages.length - 1), current + 1),
            )
          }
        >
          下一条
        </button>
        <a href={book.url} target="_blank" rel="noreferrer">
          去微信读书继续阅读 <span aria-hidden="true">↗</span>
        </a>
      </footer>
    </section>
  );
}
