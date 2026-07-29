import assert from "node:assert/strict";
import test from "node:test";

import { createReadingPages } from "../app/reading-notes.ts";

test("pairs highlight thoughts and keeps standalone reviews in reading order", () => {
  const pages = createReadingPages({
    source: "weread",
    generatedAt: "2026-07-29T00:00:00.000Z",
    bookId: "book-1",
    title: "测试书",
    author: "作者",
    counts: {
      total: 4,
      highlights: 2,
      thoughts: 2,
      bookmarks: 0,
      exportedHighlights: 2,
      exportedThoughts: 2,
    },
    highlights: [
      {
        id: "h2",
        chapterUid: "20",
        chapterIndex: 2,
        chapterTitle: "第二章",
        text: "第二条",
        createTime: 20,
      },
      {
        id: "h1",
        chapterUid: "10",
        chapterIndex: 1,
        chapterTitle: "第一章",
        text: "重要的一句话。",
        range: "1-10",
        createTime: 10,
      },
    ],
    reviews: [
      {
        id: "r1",
        kind: "highlight-thought",
        chapterUid: "10",
        chapterIndex: 1,
        chapterTitle: "第一章",
        abstract: "重要的一句话",
        content: "我的批注",
        range: "1-10",
        createTime: 11,
      },
      {
        id: "r2",
        kind: "book-review",
        chapterUid: "book",
        chapterTitle: "整本书",
        content: "读后感",
        createTime: 30,
      },
    ],
  });

  assert.deepEqual(
    pages.map((page) => page.id),
    ["highlight-h1", "highlight-h2", "thought-r2"],
  );
  assert.equal(pages[0].thoughts[0].content, "我的批注");
  assert.equal(pages[2].kind, "thought");
});
