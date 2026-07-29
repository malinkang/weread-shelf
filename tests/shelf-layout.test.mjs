import assert from "node:assert/strict";
import test from "node:test";

import {
  adjacentShelfBookIndex,
  arrangeBooksByShelfCategory,
  arrangeBooksForShelves,
  cabinetRowForCategory,
  cabinetRowCount,
  centeredShelfBookIndex,
  createCabinetLayout,
} from "../app/shelf-layout.ts";

test("preserves thirteen WeRead shelf groups as thirteen visual layers", () => {
  const books = Array.from({ length: 13 }, (_, shelfGroupIndex) =>
    Array.from({ length: (shelfGroupIndex % 3) + 1 }, (_, bookIndex) => ({
      id: `${shelfGroupIndex}-${bookIndex}`,
      shelfGroupIndex,
      height: 2.02 + bookIndex * 0.02,
      thickness: 0.2 + bookIndex * 0.01,
    })),
  )
    .flat()
    .reverse();
  const arranged = arrangeBooksForShelves(books);
  const layout = createCabinetLayout(arranged);

  assert.equal(layout.rowCount, 13);
  assert.deepEqual(
    arranged.map((book) => book.shelfGroupIndex),
    [...arranged.map((book) => book.shelfGroupIndex)].sort((a, b) => a - b),
  );
  assert.deepEqual(
    layout.rowBookCounts,
    Array.from({ length: 13 }, (_, shelfGroupIndex) =>
      books.filter((book) => book.shelfGroupIndex === shelfGroupIndex).length,
    ),
  );
});

test("starts each shelf on the book nearest its visual center", () => {
  const placements = [
    { row: 0, x: -1.2 },
    { row: 0, x: -0.25 },
    { row: 0, x: 0.42 },
    { row: 1, x: -0.5 },
    { row: 1, x: 0.15 },
  ];

  assert.equal(centeredShelfBookIndex(placements), 1);
  assert.equal(centeredShelfBookIndex(placements, 1), 4);
  assert.equal(
    centeredShelfBookIndex([{ row: 0 }, { row: 0 }, { row: 0 }]),
    1,
  );
});

test("pages one shelf at a time while preserving the relative book position", () => {
  const placements = [
    ...Array.from({ length: 13 }, () => ({ row: 0 })),
    ...Array.from({ length: 7 }, () => ({ row: 1 })),
    ...Array.from({ length: 10 }, () => ({ row: 2 })),
  ];

  assert.equal(adjacentShelfBookIndex(placements, 6, 1), 16);
  assert.equal(adjacentShelfBookIndex(placements, 16, 1), 25);
  assert.equal(adjacentShelfBookIndex(placements, 25, -1), 16);
  assert.equal(adjacentShelfBookIndex(placements, 0, -1), 0);
  assert.equal(adjacentShelfBookIndex(placements, 29, 1), 29);
});

test("distributes a 30-volume collection across three ordered shelves", () => {
  const books = Array.from({ length: 30 }, (_, index) => ({
    height: 2.02 + (index % 5) * 0.04,
    thickness: 0.18 + (index % 4) * 0.025,
  }));
  const layout = createCabinetLayout(books);

  assert.equal(layout.rowCount, cabinetRowCount);
  assert.equal(layout.booksPerRow, 10);
  assert.equal(layout.placements.length, books.length);
  assert.deepEqual(
    layout.placements.map((placement) => placement.row),
    [...Array(10).fill(0), ...Array(10).fill(1), ...Array(10).fill(2)],
  );
  assert.ok(layout.placements[0].y > layout.placements[10].y);
  assert.ok(layout.placements[10].y > layout.placements[20].y);
  assert.ok(layout.outerWidth > layout.interiorWidth);
  assert.ok(layout.outerHeight > 7.5);

  for (let row = 0; row < cabinetRowCount; row += 1) {
    const rowPlacements = layout.placements.filter(
      (placement) => placement.row === row,
    );
    for (let index = 1; index < rowPlacements.length; index += 1) {
      assert.ok(rowPlacements[index].x > rowPlacements[index - 1].x);
    }
  }
});

test("groups WeRead categories into literary, technical, and practical shelves", () => {
  const books = [
    { title: "商业", category: "经济理财-商业" },
    { title: "小说", category: "文学-外国文学" },
    { title: "计算机", category: "计算机-计算机综合" },
    { title: "成长", category: "个人成长-认知思维" },
    { title: "科普", category: "科学技术-科学科普" },
  ];
  const arranged = arrangeBooksByShelfCategory(books);

  assert.equal(cabinetRowForCategory("精品小说-社会小说"), 0);
  assert.equal(cabinetRowForCategory("科学技术-自然科学"), 1);
  assert.equal(cabinetRowForCategory("心理-社会心理学"), 2);
  assert.deepEqual(
    arranged.map((book) => book.title),
    ["小说", "计算机", "科普", "成长", "商业"],
  );
});
