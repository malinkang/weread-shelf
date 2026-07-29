export type StickerDefinition = {
  id: string;
  label: string;
  src: string;
};

export type PlacedSticker = {
  id: string;
  stickerId: string;
  x: number;
  y: number;
  scale: number;
  rotation: number;
  zIndex: number;
};

export const stickerPack: StickerDefinition[] = [
  { id: "spark", label: "灵光", src: "stickers/spark.svg" },
  { id: "coffee", label: "咖啡", src: "stickers/coffee.svg" },
  { id: "leaf", label: "新叶", src: "stickers/leaf.svg" },
  { id: "glasses", label: "阅读眼镜", src: "stickers/glasses.svg" },
  { id: "tape", label: "纸胶带", src: "stickers/tape.svg" },
  { id: "heart", label: "喜欢", src: "stickers/heart.svg" },
];

const storagePrefix = "weread-shelf:stickers:v1";

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(maximum, Math.max(minimum, value));
}

export function stickerStorageKey(bookId: string, pageId: string) {
  return `${storagePrefix}:${encodeURIComponent(bookId)}:${encodeURIComponent(pageId)}`;
}

export function stickerAssetUrl(src: string) {
  return new URL(src.replace(/^\/+/, ""), window.location.href).href;
}

export function normalizeStickerLayout(value: unknown): PlacedSticker[] {
  if (!Array.isArray(value)) return [];
  const validStickerIds = new Set(stickerPack.map((sticker) => sticker.id));
  return value
    .filter((item): item is Partial<PlacedSticker> => {
      if (!item || typeof item !== "object") return false;
      const sticker = item as Partial<PlacedSticker>;
      return (
        typeof sticker.id === "string" &&
        typeof sticker.stickerId === "string" &&
        validStickerIds.has(sticker.stickerId) &&
        Number.isFinite(sticker.x) &&
        Number.isFinite(sticker.y) &&
        Number.isFinite(sticker.scale) &&
        Number.isFinite(sticker.rotation) &&
        Number.isFinite(sticker.zIndex)
      );
    })
    .slice(0, 40)
    .map((sticker) => ({
      id: sticker.id!,
      stickerId: sticker.stickerId!,
      x: clamp(Number(sticker.x), 4, 96),
      y: clamp(Number(sticker.y), 4, 96),
      scale: clamp(Number(sticker.scale), 0.45, 2.4),
      rotation: Number(sticker.rotation) % 360,
      zIndex: clamp(Math.round(Number(sticker.zIndex)), 1, 999),
    }));
}

export function loadStickerLayout(bookId: string, pageId: string) {
  if (typeof window === "undefined") return [];
  try {
    const stored = window.localStorage.getItem(stickerStorageKey(bookId, pageId));
    return stored ? normalizeStickerLayout(JSON.parse(stored)) : [];
  } catch {
    return [];
  }
}

export function saveStickerLayout(
  bookId: string,
  pageId: string,
  stickers: PlacedSticker[],
) {
  try {
    window.localStorage.setItem(
      stickerStorageKey(bookId, pageId),
      JSON.stringify(stickers),
    );
  } catch {
    // The layout still works for this session when storage is unavailable.
  }
}
