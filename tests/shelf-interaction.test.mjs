import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("keeps every book shelved until the user requests one", async () => {
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
  assert.match(engine, /this\.wheelLockedUntil = now \+ 720/);
  assert.match(engine, /completedVerticalSwipe/);
  assert.match(engine, /continuousShelf:/);
  assert.doesNotMatch(engine, /walnutCabinet/);
});
