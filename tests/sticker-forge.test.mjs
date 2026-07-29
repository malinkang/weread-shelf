import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("loads one attributed Sticker Forge renderer for only the selected sticker", async () => {
  const [canvasSource, peelSource, loaderSource, notices, license, bundle] =
    await Promise.all([
      readFile(new URL("../app/StickerCanvas.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/PeelableSticker.tsx", import.meta.url), "utf8"),
      readFile(new URL("../app/sticker-forge.ts", import.meta.url), "utf8"),
      readFile(new URL("../THIRD_PARTY_NOTICES.md", import.meta.url), "utf8"),
      readFile(
        new URL("../public/vendor/sticker-forge/LICENSE", import.meta.url),
        "utf8",
      ),
      readFile(
        new URL(
          "../public/vendor/sticker-forge/sticker-forge.iife.js",
          import.meta.url,
        ),
      ),
    ]);

  assert.match(canvasSource, /editing && sticker\.id === selectedId/);
  assert.match(canvasSource, /<PeelableSticker/);
  assert.match(peelSource, /created\.destroy\(\)/);
  assert.match(peelSource, /instance\?\.destroy\(\)/);
  assert.match(peelSource, /quality: "low"/);
  assert.match(loaderSource, /data-sticker-forge/);
  assert.match(loaderSource, /sticker-forge\.iife\.js/);
  assert.match(notices, /CatsJuice\/sticker-forge/);
  assert.match(notices, /a1b1853564651fb2fce4d8e637e751fc076066ad/);
  assert.match(license, /Copyright \(c\) 2026 CatsJuice/);
  assert.match(bundle.toString("utf8", 0, 120), /var StickerForge=/);
  assert.equal(
    createHash("sha256").update(bundle).digest("hex"),
    "e6b6d3c2d599e65250094c839e399b83886d3425054618d6900e8efd162a085c",
  );
});
