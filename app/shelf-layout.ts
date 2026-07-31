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
  tilt: number;
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
  shelfCenterXs: number[];
  shelfWidths: number[];
  wallColumnCount: number;
  wallRowCount: number;
  wallCellCount: number;
  cellWidth: number;
  cellHeight: number;
  cellIndexes: number[];
  wallCenterX: number;
  wallCenterY: number;
  wallWidth: number;
  wallHeight: number;
};

export const cabinetRowCount = 3;
export const cabinetBaseTop = 0.34;
export const cabinetRowSpacing = 2.55;
export const cabinetShelfThickness = 0.19;
export const cabinetSideThickness = 0.22;
export const cabinetDepth = 1.9;
export const cabinetBookInsetZ = 0.04;
export const cabinetWallColumnCount = 5;
export const cabinetWallRowCount = 4;

const minimumInteriorWidth = 3.4;
const rowPadding = 0.25;
const bookGap = 0.075;
const minimumCompartmentWidth = 3.18;
const compartmentSideRoom = 0.72;
const bookAlignments = [-1, 1, 0, -1, 0, 1, -1];

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
    const rowCenter =
      ((rowBooks[0]?.x ?? 0) + (rowBooks[rowBooks.length - 1]?.x ?? 0)) *
      0.5;
    return rowBooks.reduce((closest, candidate) =>
      Math.abs((candidate.x ?? 0) - rowCenter) <
      Math.abs((closest.x ?? 0) - rowCenter)
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
  const rows = Array.from({ length: normalizedRowCount }, (_, row) => {
    const rowBooks = books
      .map((book, index) => ({ book, index }))
      .filter(({ index }) => assignments[index] === row);
    rowBookCounts[row] = rowBooks.length;
    const rowWidth =
      rowBooks.reduce((total, { book }) => total + book.thickness, 0) +
      bookGap * Math.max(0, rowBooks.length - 1);
    const maxBookHeight = Math.max(
      0,
      ...rowBooks.map(({ book }) => book.height),
    );
    return { row, rowBooks, rowWidth, maxBookHeight };
  });

  const wallColumnCount =
    normalizedRowCount >= 10
      ? cabinetWallColumnCount
      : normalizedRowCount >= 5
        ? 3
        : 1;
  const wallRowCount =
    normalizedRowCount >= 10
      ? cabinetWallRowCount
      : Math.ceil(normalizedRowCount / wallColumnCount);
  const wallCellCount = wallColumnCount * wallRowCount;
  const cellWidth = Math.max(
    minimumCompartmentWidth,
    ...rows.map(({ rowWidth }) => rowWidth + compartmentSideRoom),
  );
  const cellIndexes = Array.from({ length: normalizedRowCount }, (_, row) =>
    normalizedRowCount === 1
      ? Math.floor((wallCellCount - 1) * 0.5)
      : Math.round((row * (wallCellCount - 1)) / (normalizedRowCount - 1)),
  );
  const shelfCenterXs = Array(normalizedRowCount).fill(0);
  const shelfSurfaceYs = Array(normalizedRowCount).fill(cabinetBaseTop);
  const shelfWidths = Array(normalizedRowCount).fill(cellWidth);

  rows.forEach(({ row, rowBooks, rowWidth }) => {
    const cellIndex = cellIndexes[row];
    const band = Math.floor(cellIndex / wallColumnCount);
    const visualColumn = cellIndex % wallColumnCount;
    const shelfCenterX =
      (visualColumn - (wallColumnCount - 1) * 0.5) * cellWidth;
    const shelfSurfaceY =
      cabinetBaseTop +
      (wallRowCount - band - 1) * cabinetRowSpacing;
    const spareRoom = Math.max(0, cellWidth - rowWidth - rowPadding * 2);
    const bookOffset =
      bookAlignments[row % bookAlignments.length] * spareRoom * 0.38;
    let cursor = shelfCenterX + bookOffset - rowWidth * 0.5;

    shelfCenterXs[row] = shelfCenterX;
    shelfSurfaceYs[row] = shelfSurfaceY;

    const leanPairStart =
      rowBooks.length >= 5
        ? 1 + (row % Math.max(1, rowBooks.length - 3))
        : -1;
    rowBooks.forEach(({ book, index }, bookPosition) => {
      cursor += book.thickness * 0.5;
      const tilt =
        bookPosition === leanPairStart
          ? -0.052
          : bookPosition === leanPairStart + 1
            ? 0.052
            : 0;
      placements[index] = {
        row,
        x: cursor,
        y: shelfSurfaceY + book.height * 0.5,
        tilt,
      };
      cursor += book.thickness * 0.5 + bookGap;
    });
  });

  const interiorWidth = Math.max(
    minimumInteriorWidth,
    cellWidth * wallColumnCount,
  );
  const outerWidth = interiorWidth + cabinetSideThickness * 2;
  const outerHeight =
    cabinetRowSpacing * wallRowCount + cabinetShelfThickness * 2;
  const wallWidth = outerWidth;
  const wallHeight = outerHeight;
  const wallCenterX = 0;
  const wallCenterY = cabinetBaseTop + cabinetRowSpacing * wallRowCount * 0.5;

  return {
    rowCount: normalizedRowCount,
    booksPerRow: Math.max(...rowBookCounts, 1),
    placements,
    interiorWidth,
    outerWidth,
    outerHeight,
    rowBookCounts,
    shelfSurfaceYs,
    shelfCenterXs,
    shelfWidths,
    wallColumnCount,
    wallRowCount,
    wallCellCount,
    cellWidth,
    cellHeight: cabinetRowSpacing,
    cellIndexes,
    wallCenterX,
    wallCenterY,
    wallWidth,
    wallHeight,
  };
}
