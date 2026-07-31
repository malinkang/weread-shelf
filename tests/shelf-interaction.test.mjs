import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("moves from the complete wall to a shelf before opening a book", async () => {
  const engine = await readFile(
    new URL("../app/ShelfEngine.ts", import.meta.url),
    "utf8",
  );

  assert.match(engine, /private presentedIndex: number \| null = null/);
  assert.match(
    engine,
    /this\.runtimeBooks\.forEach\(\(book\) => \{\s*this\.commitBookPose\(book, shelvedBookPose\(this\.motionLayout\), false\)/s,
  );
  assert.match(
    engine,
    /requestedIndex === null && this\.presentedIndex === null\) \{\s*return/s,
  );
  assert.match(
    engine,
    /focusBook\([\s\S]*?this\.pendingFocusIndex = next;[\s\S]*?Preparing/s,
  );
  assert.match(engine, /browseShelfBy\(direction: number\)/);
  assert.match(engine, /browseShelfTo\(row: number\)/);
  assert.match(engine, /private browseScope: BrowseScope = "wall"/);
  assert.match(engine, /this\.setBrowseScope\("shelf", Math\.round\(row\)\)/);
  assert.match(engine, /showWall\(\)/);
  assert.match(engine, /this\.setBrowseScope\("wall", null\)/);
  assert.match(engine, /this\.browseScope === "wall"/);
  assert.match(engine, /this\.wheelLockedUntil = now \+ 720/);
  assert.match(engine, /completedVerticalSwipe/);
  assert.match(engine, /walnutCabinetHorizontal:/);
  assert.match(engine, /walnutCabinetDivider:/);
  assert.match(engine, /singleWalnutShelf:/);
  assert.match(engine, /loadWalnutTexture/);
  assert.match(engine, /familyPhotoFrame:/);
  assert.match(engine, /familyPhotoPick/);
  assert.match(engine, /onPhotoFocus\(true\)/);
  assert.match(engine, /flowerPetal:/);
  assert.match(engine, /createShelfDecor/);
  assert.match(engine, /const focusShelfWidth = layout\.outerWidth/);
  assert.match(engine, /this\.wallCabinet\.visible = scope === "wall"/);
  assert.match(
    engine,
    /book\.row === this\.focusedShelfRow/,
  );
  assert.doesNotMatch(engine, /floatingWalnutShelf:/);
});
