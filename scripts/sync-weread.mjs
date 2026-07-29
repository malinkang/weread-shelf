import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import sharp from "sharp";

import {
  deriveCoverPalette,
  highResolutionCoverUrl,
} from "./cover-tools.mjs";

const gateway = "https://i.weread.qq.com/api/agent/gateway";
const skillVersion = "1.0.4";
const defaultBooksPerShelf = 8;
const projectRoot = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
const publicRoot = path.join(projectRoot, "public");
const outputPath = path.join(publicRoot, "weread-catalog.json");
const coverRoot = path.join(publicRoot, "books", "weread");

const motifs = [
  "lattice",
  "corrosion",
  "efficiency",
  "network",
  "boom",
  "organization",
  "schematic",
  "flight",
  "circuit",
  "orbit",
  "branches",
  "wave",
  "runner",
  "gather",
  "maze",
  "fracture",
  "continuum",
  "windows",
  "steps",
];

const palettes = [
  { cover: "#315b55", accent: "#d89b58", ink: "#f4ead8" },
  { cover: "#813d37", accent: "#e2b660", ink: "#f6ecdc" },
  { cover: "#263d5b", accent: "#d9634e", ink: "#f2e8d8" },
  { cover: "#6a5137", accent: "#c98a5a", ink: "#f3e7d2" },
  { cover: "#566b49", accent: "#e1b85d", ink: "#f5ecdc" },
  { cover: "#59465e", accent: "#d99573", ink: "#f2e7d8" },
  { cover: "#2f6068", accent: "#dfaa63", ink: "#f3eadb" },
  { cover: "#7a4d58", accent: "#e0aa74", ink: "#f7eddf" },
];

class UpgradeRequiredError extends Error {}

function hash(value) {
  let result = 2166136261;
  for (const character of String(value)) {
    result ^= character.charCodeAt(0);
    result = Math.imul(result, 16777619);
  }
  return result >>> 0;
}

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
  if (!Number.isFinite(timestamp) || timestamp <= 0) return null;
  const parts = new Intl.DateTimeFormat("en-CA", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).formatToParts(new Date(timestamp * 1000));
  const values = Object.fromEntries(parts.map(({ type, value }) => [type, value]));
  return `${values.year}-${values.month}-${values.day}`;
}

function safePathSegment(value) {
  return String(value).replace(/[^a-zA-Z0-9_-]/g, "-");
}

function shortTitle(title) {
  const normalized = plainText(title);
  return normalized.length > 34 ? `${normalized.slice(0, 32)}...` : normalized;
}

async function wereadApi(apiName, params = {}) {
  const apiKey = process.env.WEREAD_API_KEY;
  if (!apiKey) {
    throw new Error("WEREAD_API_KEY is not set");
  }

  const response = await fetch(gateway, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      api_name: apiName,
      ...params,
      skill_version: skillVersion,
    }),
  });

  if (!response.ok) {
    throw new Error(`WeRead request failed with HTTP ${response.status}`);
  }

  const payload = await response.json();
  if (payload.upgrade_info) {
    throw new UpgradeRequiredError(payload.upgrade_info.message);
  }
  if (payload.errcode) {
    throw new Error(payload.errmsg || `WeRead error ${payload.errcode}`);
  }
  return payload;
}

async function mapWithConcurrency(items, concurrency, mapper) {
  const results = new Array(items.length);
  let cursor = 0;

  async function worker() {
    while (cursor < items.length) {
      const index = cursor;
      cursor += 1;
      results[index] = await mapper(items[index], index);
    }
  }

  await Promise.all(
    Array.from({ length: Math.min(concurrency, items.length) }, () => worker()),
  );
  return results;
}

async function fetchCover(sourceUrl) {
  const response = await fetch(sourceUrl, { redirect: "follow" });
  if (!response.ok) throw new Error(`cover HTTP ${response.status}`);
  const contentType = response.headers.get("content-type") ?? "";
  if (!contentType.startsWith("image/")) {
    throw new Error(`unexpected cover content type: ${contentType || "unknown"}`);
  }
  return Buffer.from(await response.arrayBuffer());
}

async function downloadCover(sourceUrl, bookId, fallbackPalette) {
  if (!sourceUrl) return null;

  const candidates = [...new Set([highResolutionCoverUrl(sourceUrl), sourceUrl])];
  let imageBuffer;
  let lastError;
  for (const candidate of candidates) {
    try {
      imageBuffer = await fetchCover(candidate);
      break;
    } catch (error) {
      lastError = error;
    }
  }
  if (!imageBuffer) throw lastError ?? new Error("cover download failed");

  const directoryName = safePathSegment(bookId);
  const directory = path.join(coverRoot, directoryName);
  await mkdir(directory, { recursive: true });
  await writeFile(path.join(directory, "cover.jpg"), imageBuffer);

  const metadata = await sharp(imageBuffer).metadata();
  return {
    coverImage: `books/weread/${directoryName}/cover.jpg`,
    palette: await deriveCoverPalette(imageBuffer, fallbackPalette),
    width: metadata.width,
    height: metadata.height,
  };
}

function createCatalogBook(shelfBook, detail, coverAsset, shelfGroup) {
  const identity = String(shelfBook.bookId);
  const seed = hash(identity);
  const palette = coverAsset?.palette ?? palettes[seed % palettes.length];
  const lastReadAt = formatDate(Number(shelfBook.readUpdateTime));
  const readingStatus = shelfBook.finishReading === 1 ? "已读完" : "最近阅读";
  const availability = lastReadAt
    ? `${readingStatus} · ${lastReadAt}`
    : readingStatus;
  const description = plainText(detail.intro);
  const category = plainText(detail.category || shelfBook.category) || "微信读书";
  const title = plainText(detail.title || shelfBook.title) || "未命名书籍";
  const author = plainText(detail.author || shelfBook.author) || "未知作者";

  return {
    id: `weread-${safePathSegment(shelfGroup.id)}-${safePathSegment(identity)}`,
    source: "weread",
    sourceId: identity,
    title,
    shortTitle: shortTitle(title),
    author,
    description: description || "微信读书暂未提供这本书的简介。",
    format: category,
    availability,
    url: detail.deepLink || shelfBook.deepLink,
    linkLabel: "在微信读书中打开",
    cover: palette.cover,
    accent: palette.accent,
    ink: palette.ink,
    motif: motifs[seed % motifs.length],
    height: Number((2.02 + ((seed >>> 8) % 19) / 100).toFixed(2)),
    thickness: Number((0.18 + ((seed >>> 16) % 13) / 100).toFixed(2)),
    coverImage: coverAsset?.coverImage,
    category,
    publisher: plainText(detail.publisher) || undefined,
    publishTime: plainText(detail.publishTime).slice(0, 10) || undefined,
    isbn: plainText(detail.isbn) || undefined,
    rating:
      Number.isFinite(Number(detail.newRating)) && Number(detail.newRating) > 0
        ? Number(detail.newRating)
        : undefined,
    ratingCount:
      Number.isFinite(Number(detail.newRatingCount)) &&
      Number(detail.newRatingCount) > 0
        ? Number(detail.newRatingCount)
        : undefined,
    lastReadAt: lastReadAt || undefined,
    finishReading: shelfBook.finishReading === 1,
    shelfGroupId: shelfGroup.id,
    shelfGroupName: shelfGroup.name,
    shelfGroupIndex: shelfGroup.index,
  };
}

async function main() {
  const requestedLimit = Number.parseInt(
    process.env.WEREAD_BOOKS_PER_SHELF ??
      process.env.WEREAD_SHELF_LIMIT ??
      "",
    10,
  );
  const booksPerShelf = Number.isFinite(requestedLimit)
    ? Math.min(20, Math.max(1, requestedLimit))
    : defaultBooksPerShelf;
  const shelf = await wereadApi("/shelf/sync");
  const publicBooks = (shelf.books ?? []).filter(
    (book) => book.secret === 0 && book.bookId,
  );
  const publicBooksById = new Map(
    publicBooks.map((book) => [String(book.bookId), book]),
  );
  const archiveShelves = (shelf.archive ?? [])
    .map((archive, archiveIndex) => {
      const eligibleBooks = (archive.bookIds ?? [])
        .map((bookId) => publicBooksById.get(String(bookId)))
        .filter(Boolean)
        .sort(
          (left, right) =>
            Number(right.readUpdateTime) - Number(left.readUpdateTime),
        );
      return {
        id: `archive-${archiveIndex}-${safePathSegment(archive.name || "shelf")}`,
        name: plainText(archive.name) || `书架 ${archiveIndex + 1}`,
        totalCount: eligibleBooks.length,
        sourceBooks: eligibleBooks.slice(0, booksPerShelf),
      };
    })
    .filter((archive) => archive.sourceBooks.length > 0);

  const shelfGroups = archiveShelves.length
    ? archiveShelves
    : [
        {
          id: "recent-reading",
          name: "最近阅读",
          totalCount: publicBooks.length,
          sourceBooks: publicBooks
            .filter((book) => Number(book.readUpdateTime) > 0)
            .sort(
              (left, right) =>
                Number(right.readUpdateTime) - Number(left.readUpdateTime),
            )
            .slice(0, booksPerShelf),
        },
      ];

  const groupedEntries = shelfGroups.flatMap((group, groupIndex) =>
    group.sourceBooks.map((shelfBook) => ({
      shelfBook,
      shelfGroup: {
        id: group.id,
        name: group.name,
        index: groupIndex,
      },
    })),
  );
  if (!groupedEntries.length) {
    throw new Error("No public books were returned by WeRead shelf groups");
  }

  const uniqueSourceBooks = [
    ...new Map(
      groupedEntries.map(({ shelfBook }) => [String(shelfBook.bookId), shelfBook]),
    ).values(),
  ];
  const preparedBooks = await mapWithConcurrency(uniqueSourceBooks, 4, async (shelfBook) => {
    let detail = shelfBook;
    try {
      detail = await wereadApi("/book/info", { bookId: String(shelfBook.bookId) });
    } catch (error) {
      if (error instanceof UpgradeRequiredError) throw error;
      console.warn(`Using shelf metadata for ${shelfBook.title}: ${error.message}`);
    }

    let coverAsset = null;
    try {
      const identity = String(shelfBook.bookId);
      const fallbackPalette = palettes[hash(identity) % palettes.length];
      coverAsset = await downloadCover(
        detail.cover || shelfBook.cover,
        shelfBook.bookId,
        fallbackPalette,
      );
    } catch (error) {
      console.warn(`Using a procedural cover for ${shelfBook.title}: ${error.message}`);
    }
    return {
      shelfBook,
      detail,
      coverAsset: coverAsset || undefined,
    };
  });
  const preparedBooksById = new Map(
    preparedBooks.map((prepared) => [String(prepared.shelfBook.bookId), prepared]),
  );
  const books = groupedEntries.map(({ shelfBook, shelfGroup }) => {
    const prepared = preparedBooksById.get(String(shelfBook.bookId));
    return createCatalogBook(
      shelfBook,
      prepared?.detail ?? shelfBook,
      prepared?.coverAsset,
      shelfGroup,
    );
  });
  const shelves = shelfGroups.map((group, groupIndex) => ({
    id: group.id,
    name: group.name,
    totalCount: group.totalCount,
    syncedCount: group.sourceBooks.length,
    bookIds: books
      .filter((book) => book.shelfGroupIndex === groupIndex)
      .map((book) => book.id),
  }));

  await mkdir(publicRoot, { recursive: true });
  await writeFile(
    outputPath,
    `${JSON.stringify(
      {
        source: "weread",
        generatedAt: new Date().toISOString(),
        count: books.length,
        shelves,
        books,
      },
      null,
      2,
    )}\n`,
  );

  console.log(
    `Synced ${books.length} public books across ${shelves.length} shelf groups to ${outputPath}`,
  );
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
