import assert from "node:assert/strict";
import test from "node:test";

import sharp from "sharp";

import {
  deriveCoverPalette,
  highResolutionCoverUrl,
} from "../scripts/cover-tools.mjs";

test("upgrades supported WeRead cover URLs to the highest CDN tier", () => {
  assert.equal(
    highResolutionCoverUrl(
      "https://cdn.weread.qq.com/weread/cover/82/book/t6_book.jpg",
    ),
    "https://cdn.weread.qq.com/weread/cover/82/book/t9_book.jpg",
  );
  assert.equal(
    highResolutionCoverUrl(
      "https://wfqqreader-1252317822.image.myqcloud.com/cover/600/1/s_1.jpg",
    ),
    "https://wfqqreader-1252317822.image.myqcloud.com/cover/600/1/t9_1.jpg",
  );
  assert.equal(
    highResolutionCoverUrl("https://example.com/t6_book.jpg"),
    "https://example.com/t6_book.jpg",
  );
});

test("derives the spine palette from a cover's edge colors", async () => {
  const cover = await sharp({
    create: {
      width: 96,
      height: 144,
      channels: 3,
      background: "#ec642f",
    },
  })
    .composite([
      {
        input: await sharp({
          create: {
            width: 44,
            height: 100,
            channels: 3,
            background: "#f0e2d1",
          },
        })
          .png()
          .toBuffer(),
        left: 26,
        top: 22,
      },
    ])
    .jpeg()
    .toBuffer();
  const fallback = {
    cover: "#315b55",
    accent: "#d89b58",
    ink: "#f4ead8",
  };
  const palette = await deriveCoverPalette(cover, fallback);
  const red = Number.parseInt(palette.cover.slice(1, 3), 16);
  const green = Number.parseInt(palette.cover.slice(3, 5), 16);

  assert.notDeepEqual(palette, fallback);
  assert.ok(red > green, `expected a warm spine, received ${palette.cover}`);
  assert.match(palette.accent, /^#[\da-f]{6}$/i);
  assert.match(palette.ink, /^#[\da-f]{6}$/i);
});
