import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

import {
  shareCardFilename,
  wrapMeasuredText,
} from "../app/share-card-utils.ts";

test("builds safe share filenames and wraps Chinese highlight text", () => {
  assert.equal(
    shareCardFilename('书名：为什么/这样? "测试"', 2),
    "书名：为什么-这样- -测试--3.png",
  );
  assert.deepEqual(
    wrapMeasuredText("这是一段用于分享卡的中文划线", 6, (value) => value.length, 2),
    ["这是一段用于", "分享卡的中…"],
  );
});

test("exports a local 1080 by 1440 card with thoughts and stickers", async () => {
  const source = await readFile(
    new URL("../app/share-card.ts", import.meta.url),
    "utf8",
  );
  assert.match(source, /cardWidth = 1080/);
  assert.match(source, /cardHeight = 1440/);
  assert.match(source, /page\.thoughts/);
  assert.match(source, /drawStickers/);
  assert.match(source, /canvas\.toBlob/);
  assert.match(source, /anchor\.download/);
});
