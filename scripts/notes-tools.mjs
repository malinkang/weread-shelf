function plainText(value) {
  return String(value ?? "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<[^>]+>/g, " ")
    .replace(/&nbsp;/gi, " ")
    .replace(/&amp;/gi, "&")
    .replace(/&lt;/gi, "<")
    .replace(/&gt;/gi, ">")
    .replace(/&quot;/gi, '"')
    .replace(/&#39;/gi, "'")
    .replace(/\s+/g, " ")
    .trim();
}

function formatDate(timestamp) {
  const value = Number(timestamp);
  if (!Number.isFinite(value) || value <= 0) return undefined;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(value * 1000));
  const values = Object.fromEntries(parts.map(({ type, value: part }) => [type, part]));
  return `${values.year}-${values.month}-${values.day}`;
}

function chapterKey(chapterUid) {
  return chapterUid === undefined || chapterUid === null
    ? "book"
    : String(chapterUid);
}

function compareReadingOrder(left, right) {
  return (
    Number(left.chapterIndex ?? Number.MAX_SAFE_INTEGER) -
      Number(right.chapterIndex ?? Number.MAX_SAFE_INTEGER) ||
    Number(left.createTime ?? 0) - Number(right.createTime ?? 0)
  );
}

export function notebookTotalCount(notebook) {
  return (
    Number(notebook?.noteCount ?? 0) +
    Number(notebook?.reviewCount ?? 0) +
    Number(notebook?.bookmarkCount ?? 0)
  );
}

export function normalizeBookNotes({
  bookId,
  notebook,
  bookmarkPayload,
  reviewItems,
  generatedAt = new Date().toISOString(),
}) {
  const chapters = new Map(
    (bookmarkPayload?.chapters ?? []).map((chapter) => [
      chapterKey(chapter.chapterUid),
      {
        uid: chapterKey(chapter.chapterUid),
        index: Number.isFinite(Number(chapter.chapterIdx))
          ? Number(chapter.chapterIdx)
          : undefined,
        title: plainText(chapter.title) || "未命名章节",
      },
    ]),
  );

  const chapterFor = (chapterUid, fallbackTitle, fallbackIndex) => {
    const key = chapterKey(chapterUid);
    const existing = chapters.get(key);
    if (existing) return existing;
    const chapter = {
      uid: key,
      index: Number.isFinite(Number(fallbackIndex))
        ? Number(fallbackIndex)
        : undefined,
      title: plainText(fallbackTitle) || (key === "book" ? "整本书" : "未命名章节"),
    };
    chapters.set(key, chapter);
    return chapter;
  };

  const highlights = (bookmarkPayload?.updated ?? [])
    .filter((bookmark) => Number(bookmark.type) === 1 && plainText(bookmark.markText))
    .map((bookmark) => {
      const chapter = chapterFor(bookmark.chapterUid);
      return {
        id: String(bookmark.bookmarkId),
        chapterUid: chapter.uid,
        chapterIndex: chapter.index,
        chapterTitle: chapter.title,
        text: plainText(bookmark.markText),
        range: plainText(bookmark.range) || undefined,
        colorStyle: Number.isFinite(Number(bookmark.colorStyle))
          ? Number(bookmark.colorStyle)
          : undefined,
        createTime: Number(bookmark.createTime) || undefined,
        createdAt: formatDate(bookmark.createTime),
      };
    })
    .sort(compareReadingOrder);

  const reviews = (reviewItems ?? [])
    .map((item) => item?.review ?? item)
    .filter((review) => review && (plainText(review.content) || plainText(review.abstract)))
    .map((review) => {
      const chapter = chapterFor(
        review.chapterUid,
        review.chapterName,
        review.chapterIdx,
      );
      const abstract = plainText(review.abstract);
      const content = plainText(review.content);
      return {
        id: String(review.reviewId),
        kind: abstract
          ? "highlight-thought"
          : chapter.uid === "book"
            ? "book-review"
            : "chapter-review",
        chapterUid: chapter.uid,
        chapterIndex: chapter.index,
        chapterTitle: chapter.title,
        abstract: abstract || undefined,
        content: content || undefined,
        range: plainText(review.range) || undefined,
        createTime: Number(review.createTime) || undefined,
        createdAt: formatDate(review.createTime),
        rating:
          Number.isFinite(Number(review.star)) && Number(review.star) >= 0
            ? Number(review.star)
            : undefined,
      };
    })
    .sort(compareReadingOrder);

  const noteCount = Number(notebook?.noteCount ?? highlights.length);
  const reviewCount = Number(notebook?.reviewCount ?? reviews.length);
  const bookmarkCount = Number(notebook?.bookmarkCount ?? 0);

  return {
    source: "weread",
    generatedAt,
    bookId: String(bookId),
    title: plainText(notebook?.book?.title || bookmarkPayload?.book?.title),
    author: plainText(notebook?.book?.author || bookmarkPayload?.book?.author),
    counts: {
      total: noteCount + reviewCount + bookmarkCount,
      highlights: noteCount,
      thoughts: reviewCount,
      bookmarks: bookmarkCount,
      exportedHighlights: highlights.length,
      exportedThoughts: reviews.length,
    },
    chapters: [...chapters.values()].sort(
      (left, right) =>
        Number(left.index ?? Number.MAX_SAFE_INTEGER) -
        Number(right.index ?? Number.MAX_SAFE_INTEGER),
    ),
    highlights,
    reviews,
  };
}
