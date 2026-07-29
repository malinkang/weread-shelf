export type WeReadHighlight = {
  id: string;
  chapterUid: string;
  chapterIndex?: number;
  chapterTitle: string;
  text: string;
  range?: string;
  colorStyle?: number;
  createTime?: number;
  createdAt?: string;
};

export type WeReadReview = {
  id: string;
  kind: "highlight-thought" | "chapter-review" | "book-review";
  chapterUid: string;
  chapterIndex?: number;
  chapterTitle: string;
  abstract?: string;
  content?: string;
  range?: string;
  createTime?: number;
  createdAt?: string;
  rating?: number;
};

export type WeReadBookNotes = {
  source: "weread";
  generatedAt: string;
  bookId: string;
  title: string;
  author: string;
  counts: {
    total: number;
    highlights: number;
    thoughts: number;
    bookmarks: number;
    exportedHighlights: number;
    exportedThoughts: number;
  };
  highlights: WeReadHighlight[];
  reviews: WeReadReview[];
};

export type ReadingThought = {
  id: string;
  content: string;
  createdAt?: string;
};

export type ReadingPage = {
  id: string;
  kind: "highlight" | "thought";
  chapterIndex?: number;
  chapterTitle: string;
  quote?: string;
  thoughts: ReadingThought[];
  colorStyle?: number;
  createTime?: number;
  createdAt?: string;
};

function comparable(value?: string) {
  return String(value ?? "")
    .replace(/[\s\p{P}\p{S}]+/gu, "")
    .toLocaleLowerCase();
}

function compareReadingOrder(left: ReadingPage, right: ReadingPage) {
  return (
    Number(left.chapterIndex ?? Number.MAX_SAFE_INTEGER) -
      Number(right.chapterIndex ?? Number.MAX_SAFE_INTEGER) ||
    Number(left.createTime ?? 0) - Number(right.createTime ?? 0)
  );
}

export function createReadingPages(notes: WeReadBookNotes): ReadingPage[] {
  const usedReviewIds = new Set<string>();
  const highlightPages = notes.highlights.map((highlight) => {
    const thoughts = notes.reviews
      .filter((review) => {
        if (usedReviewIds.has(review.id)) return false;
        if (review.kind !== "highlight-thought") return false;
        const sameRange =
          Boolean(highlight.range) && highlight.range === review.range;
        const sameText =
          Boolean(review.abstract) &&
          comparable(highlight.text) === comparable(review.abstract);
        return sameRange || sameText;
      })
      .map((review) => {
        usedReviewIds.add(review.id);
        return {
          id: review.id,
          content: review.content ?? "",
          createdAt: review.createdAt,
        };
      })
      .filter((thought) => thought.content);

    return {
      id: `highlight-${highlight.id}`,
      kind: "highlight" as const,
      chapterIndex: highlight.chapterIndex,
      chapterTitle: highlight.chapterTitle,
      quote: highlight.text,
      thoughts,
      colorStyle: highlight.colorStyle,
      createTime: highlight.createTime,
      createdAt: highlight.createdAt,
    };
  });

  const standaloneThoughts = notes.reviews
    .filter((review) => !usedReviewIds.has(review.id) && review.content)
    .map((review) => ({
      id: `thought-${review.id}`,
      kind: "thought" as const,
      chapterIndex: review.chapterIndex,
      chapterTitle: review.chapterTitle,
      quote: review.abstract,
      thoughts: [
        {
          id: review.id,
          content: review.content ?? "",
          createdAt: review.createdAt,
        },
      ],
      createTime: review.createTime,
      createdAt: review.createdAt,
    }));

  return [...highlightPages, ...standaloneThoughts].sort(compareReadingOrder);
}

function isBookNotes(value: unknown): value is WeReadBookNotes {
  if (!value || typeof value !== "object") return false;
  const notes = value as Partial<WeReadBookNotes>;
  return (
    notes.source === "weread" &&
    typeof notes.bookId === "string" &&
    Array.isArray(notes.highlights) &&
    Array.isArray(notes.reviews)
  );
}

export async function loadBookNotes(
  notesPath: string,
  signal?: AbortSignal,
): Promise<WeReadBookNotes> {
  const assetPath = notesPath.replace(/^\/+/, "");
  const notesUrl = new URL(assetPath, window.location.href);
  const response = await fetch(notesUrl, { cache: "no-store", signal });
  if (!response.ok) {
    throw new Error(`读取划线失败（${response.status}）`);
  }
  const payload: unknown = await response.json();
  if (!isBookNotes(payload)) throw new Error("划线数据格式不正确");
  return payload;
}
