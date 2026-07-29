import assert from "node:assert/strict";
import test from "node:test";

import {
  loadStickerLayout,
  normalizeStickerLayout,
  saveStickerLayout,
  stickerStorageKey,
} from "../app/stickers.ts";

test("keeps sticker layouts page-local and clamps restored transforms", () => {
  assert.equal(
    stickerStorageKey("book / one", "highlight:1"),
    "weread-shelf:stickers:v1:book%20%2F%20one:highlight%3A1",
  );
  assert.deepEqual(
    normalizeStickerLayout([
      {
        id: "placed-1",
        stickerId: "spark",
        x: -20,
        y: 140,
        scale: 8,
        rotation: 375,
        zIndex: 2000,
      },
      { id: "unknown", stickerId: "missing", x: 1, y: 1, scale: 1 },
    ]),
    [
      {
        id: "placed-1",
        stickerId: "spark",
        x: 4,
        y: 96,
        scale: 2.4,
        rotation: 15,
        zIndex: 999,
      },
    ],
  );
});

test("persists each page layout in browser-local storage", () => {
  const storage = new Map();
  globalThis.window = {
    localStorage: {
      getItem: (key) => storage.get(key) ?? null,
      setItem: (key, value) => storage.set(key, value),
    },
  };
  const layout = [
    {
      id: "placed-1-spark",
      stickerId: "spark",
      x: 50,
      y: 40,
      scale: 1,
      rotation: -8,
      zIndex: 1,
    },
  ];

  saveStickerLayout("book-1", "highlight-1", layout);
  assert.deepEqual(loadStickerLayout("book-1", "highlight-1"), layout);
  assert.deepEqual(loadStickerLayout("book-1", "highlight-2"), []);
  delete globalThis.window;
});
