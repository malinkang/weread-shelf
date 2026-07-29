export type ShelfBookSize = {
  category?: string;
  shelfGroupIndex?: number;
  height: number;
  thickness: number;
};

export type ShelfBookPlacement = {
  row: number;
  x: number;
  y: number;
};

export type CabinetLayout = {
  rowCount: number;
  booksPerRow: number;
  placements: ShelfBookPlacement[];
  interiorWidth: number;
  outerWidth: number;
  outerHeight: number;
  rowBookCounts: number[];
  shelfSurfaceYs: number[];
};

export const cabinetRowCount = 3;
export const cabinetBaseTop = 0.34;
export const cabinetRowSpacing = 2.55;
export const cabinetShelfThickness = 0.24;
export const cabinetSideThickness = 0.3;
export const cabinetDepth = 1.9;
export const cabinetBookInsetZ = 0.04;

const minimumInteriorWidth = 3.4;
const rowPadding = 0.25;
const bookGap = 0.075;

const categoryRows = [
  new Set(["文学", "精品小说", "历史", "社会文化"]),
  new Set(["科学技术", "计算机"]),
  new Set(["个人成长", "经济理财", "心理", "医学健康", "人物传记"]),
];

function categoryFamily(category?: string) {
  return String(category ?? "").split("-")[0].trim();
}

export function cabinetRowForCategory(category?: string) {
  const family = categoryFamily(category);
  const row = categoryRows.findIndex((families) => families.has(family));
  return row >= 0 ? row : null;
}

function assignRows(books: ShelfBookSize[], rowCount: number) {
  const explicitlyGrouped = books.filter(
    (book) =>
      Number.isInteger(book.shelfGroupIndex) &&
      Number(book.shelfGroupIndex) >= 0 &&
      Number(book.shelfGroupIndex) < rowCount,
  ).length;
  const useShelfGroups = explicitlyGrouped >= Math.ceil(books.length * 0.5);
  const categorized = books.filter(
    (book) => cabinetRowForCategory(book.category) !== null,
  ).length;
  const useCategories =
    !useShelfGroups && categorized >= Math.ceil(books.length * 0.5);
  const balancedSize = Math.max(1, Math.ceil(books.length / rowCount));
  const counts = Array(rowCount).fill(0);

  return books.map((book, index) => {
    let row = useShelfGroups ? Number(book.shelfGroupIndex) : null;
    if (!useShelfGroups && useCategories) {
      row = cabinetRowForCategory(book.category);
    }
    if (!Number.isInteger(row) || Number(row) < 0 || Number(row) >= rowCount) {
      row = useShelfGroups || useCategories
        ? counts.indexOf(Math.min(...counts))
        : Math.min(rowCount - 1, Math.floor(index / balancedSize));
    }
    const assignedRow = Number(row);
    counts[assignedRow] += 1;
    return assignedRow;
  });
}

export function arrangeBooksForShelves<
  Book extends { category?: string; shelfGroupIndex?: number },
>(books: Book[]) {
  const grouped = books.filter(
    (book) =>
      Number.isInteger(book.shelfGroupIndex) && Number(book.shelfGroupIndex) >= 0,
  ).length;
  if (grouped < Math.ceil(books.length * 0.5)) {
    return arrangeBooksByShelfCategory(books);
  }

  return books
    .map((book, index) => ({ book, index }))
    .sort(
      (left, right) =>
        Number(left.book.shelfGroupIndex) - Number(right.book.shelfGroupIndex) ||
        left.index - right.index,
    )
    .map(({ book }) => book);
}

export function arrangeBooksByShelfCategory<
  Book extends { category?: string },
>(books: Book[]) {
  const assignments = assignRows(
    books.map((book) => ({ height: 0, thickness: 0, category: book.category })),
    cabinetRowCount,
  );

  return books
    .map((book, index) => ({ book, index, row: assignments[index] }))
    .sort(
      (left, right) =>
        left.row - right.row ||
        String(left.book.category ?? "").localeCompare(
          String(right.book.category ?? ""),
          "zh-CN",
        ) ||
        left.index - right.index,
    )
    .map(({ book }) => book);
}

export function adjacentShelfBookIndex(
  placements: Array<{ row: number }>,
  currentIndex: number,
  direction: number,
) {
  if (!placements.length || direction === 0) return currentIndex;
  const normalizedIndex = Math.max(
    0,
    Math.min(placements.length - 1, Math.round(currentIndex)),
  );
  const current = placements[normalizedIndex];
  const rows = [...new Set(placements.map((placement) => placement.row))].sort(
    (left, right) => left - right,
  );
  const currentRowIndex = rows.indexOf(current.row);
  const targetRowIndex = Math.max(
    0,
    Math.min(rows.length - 1, currentRowIndex + Math.sign(direction)),
  );
  if (targetRowIndex === currentRowIndex) return normalizedIndex;

  const currentRowBooks = placements
    .map((placement, index) => ({ index, row: placement.row }))
    .filter(({ row }) => row === current.row);
  const targetRowBooks = placements
    .map((placement, index) => ({ index, row: placement.row }))
    .filter(({ row }) => row === rows[targetRowIndex]);
  const currentPosition = currentRowBooks.findIndex(
    ({ index }) => index === normalizedIndex,
  );
  const relativePosition =
    currentRowBooks.length > 1
      ? Math.max(0, currentPosition) / (currentRowBooks.length - 1)
      : 0;
  const targetPosition = Math.round(
    relativePosition * Math.max(0, targetRowBooks.length - 1),
  );
  return targetRowBooks[targetPosition]?.index ?? normalizedIndex;
}

export function centeredShelfBookIndex(
  placements: Array<{ row: number; x?: number }>,
  row = placements[0]?.row ?? 0,
) {
  const rowBooks = placements
    .map((placement, index) => ({ index, ...placement }))
    .filter((placement) => placement.row === row);
  if (!rowBooks.length) return 0;

  if (rowBooks.every((placement) => Number.isFinite(placement.x))) {
    return rowBooks.reduce((closest, candidate) =>
      Math.abs(candidate.x ?? 0) < Math.abs(closest.x ?? 0)
        ? candidate
        : closest,
    ).index;
  }

  return rowBooks[Math.floor((rowBooks.length - 1) * 0.5)].index;
}

export function createCabinetLayout(
  books: ShelfBookSize[],
  rowCount?: number,
): CabinetLayout {
  const explicitRowCount =
    Math.max(
      -1,
      ...books.map((book) =>
        Number.isInteger(book.shelfGroupIndex)
          ? Number(book.shelfGroupIndex)
          : -1,
      ),
    ) + 1;
  const normalizedRowCount = Math.max(
    1,
    Math.round(rowCount ?? (explicitRowCount || cabinetRowCount)),
  );
  const placements = new Array<ShelfBookPlacement>(books.length);
  const assignments = assignRows(books, normalizedRowCount);
  const rowBookCounts = Array(normalizedRowCount).fill(0);
  let widestRow = 0;

  for (let row = 0; row < normalizedRowCount; row += 1) {
    const rowBooks = books
      .map((book, index) => ({ book, index }))
      .filter(({ index }) => assignments[index] === row);
    if (!rowBooks.length) continue;
    rowBookCounts[row] = rowBooks.length;

    const rowWidth =
      rowBooks.reduce((total, { book }) => total + book.thickness, 0) +
      bookGap * Math.max(0, rowBooks.length - 1);
    widestRow = Math.max(widestRow, rowWidth);
    let cursor = -rowWidth * 0.5;
    const shelfFromBottom = normalizedRowCount - row - 1;
    const shelfSurfaceY = cabinetBaseTop + shelfFromBottom * cabinetRowSpacing;

    rowBooks.forEach(({ book, index }) => {
      cursor += book.thickness * 0.5;
      placements[index] = {
        row,
        x: cursor,
        y: shelfSurfaceY + book.height * 0.5,
      };
      cursor += book.thickness * 0.5 + bookGap;
    });
  }

  const interiorWidth = Math.max(
    minimumInteriorWidth,
    widestRow + rowPadding * 2,
  );
  const shelfSurfaceYs = Array.from(
    { length: normalizedRowCount },
    (_, level) => cabinetBaseTop + level * cabinetRowSpacing,
  );

  return {
    rowCount: normalizedRowCount,
    booksPerRow: Math.max(...rowBookCounts, 1),
    placements,
    interiorWidth,
    outerWidth: interiorWidth + cabinetSideThickness * 2,
    outerHeight:
      normalizedRowCount * cabinetRowSpacing + cabinetShelfThickness,
    rowBookCounts,
    shelfSurfaceYs,
  };
}
