import assert from "node:assert/strict";
import test from "node:test";

import {
  normalizeBookNotes,
  notebookTotalCount,
} from "../scripts/notes-tools.mjs";

test("normalizes personal highlights and thoughts into reading-order data", () => {
  const notebook = {
    bookId: "book-1",
    book: { title: "测试书", author: "作者" },
    noteCount: 2,
    reviewCount: 2,
    bookmarkCount: 1,
  };
  const notes = normalizeBookNotes({
    bookId: notebook.bookId,
    notebook,
    generatedAt: "2026-07-29T00:00:00.000Z",
    bookmarkPayload: {
      chapters: [
        { chapterUid: 10, chapterIdx: 1, title: "第一章" },
        { chapterUid: 20, chapterIdx: 2, title: "第二章" },
      ],
      updated: [
        {
          bookmarkId: "highlight-2",
          chapterUid: 20,
          markText: "第二条划线",
          createTime: 1753747200,
          type: 1,
          range: "20-30",
          colorStyle: 2,
        },
        {
          bookmarkId: "bookmark-only",
          chapterUid: 10,
          markText: "书签不应导出",
          type: 0,
        },
        {
          bookmarkId: "highlight-1",
          chapterUid: 10,
          markText: "<b>第一条</b>划线",
          createTime: 1753660800,
          type: 1,
          range: "1-10",
          colorStyle: 1,
        },
      ],
    },
    reviewItems: [
      {
        review: {
          reviewId: "thought-1",
          content: "当时的想法",
          abstract: "第一条划线",
          chapterUid: 10,
          chapterIdx: 1,
          range: "1-10",
          createTime: 1753660800,
          star: -1,
        },
      },
      {
        review: {
          reviewId: "review-1",
          content: "整本书的点评",
          createTime: 1753833600,
          star: 4,
        },
      },
    ],
  });

  assert.equal(notebookTotalCount(notebook), 5);
  assert.deepEqual(notes.counts, {
    total: 5,
    highlights: 2,
    thoughts: 2,
    bookmarks: 1,
    exportedHighlights: 2,
    exportedThoughts: 2,
  });
  assert.deepEqual(
    notes.highlights.map((highlight) => highlight.id),
    ["highlight-1", "highlight-2"],
  );
  assert.equal(notes.highlights[0].text, "第一条 划线");
  assert.equal(notes.highlights[0].createdAt, "2025-07-28");
  assert.equal(notes.reviews[0].kind, "highlight-thought");
  assert.equal(notes.reviews[1].kind, "book-review");
  assert.equal(notes.reviews[1].rating, 4);
  assert.deepEqual(
    notes.chapters.map((chapter) => chapter.title),
    ["第一章", "第二章", "整本书"],
  );
});
