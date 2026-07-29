import type { CatalogBook } from "./catalog";
import type { ReadingPage } from "./reading-notes";
import { shareCardFilename, wrapMeasuredText } from "./share-card-utils";
import {
  type PlacedSticker,
  stickerAssetUrl,
  stickerPack,
} from "./stickers";

const cardWidth = 1080;
const cardHeight = 1440;
const cardHighlightColors = [
  "#e9c861",
  "#efb08a",
  "#91cbbd",
  "#aebee4",
  "#d0abd8",
];

type ShareCardInput = {
  book: CatalogBook;
  page: ReadingPage;
  stickers: PlacedSticker[];
};

function roundedRect(
  context: CanvasRenderingContext2D,
  x: number,
  y: number,
  width: number,
  height: number,
  radius: number,
) {
  const r = Math.min(radius, width / 2, height / 2);
  context.beginPath();
  context.moveTo(x + r, y);
  context.arcTo(x + width, y, x + width, y + height, r);
  context.arcTo(x + width, y + height, x, y + height, r);
  context.arcTo(x, y + height, x, y, r);
  context.arcTo(x, y, x + width, y, r);
  context.closePath();
}

function loadImage(source: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image();
    image.decoding = "async";
    image.onload = () => resolve(image);
    image.onerror = () => reject(new Error("贴纸图片读取失败"));
    image.src = source;
  });
}

function drawLines(
  context: CanvasRenderingContext2D,
  lines: string[],
  x: number,
  y: number,
  lineHeight: number,
) {
  lines.forEach((line, index) => context.fillText(line, x, y + index * lineHeight));
}

function fitQuote(
  context: CanvasRenderingContext2D,
  quote: string,
  maxWidth: number,
  maxHeight: number,
) {
  for (let fontSize = 64; fontSize >= 38; fontSize -= 2) {
    context.font = `430 ${fontSize}px "Newsreader Variable", "Songti SC", serif`;
    const lineHeight = Math.round(fontSize * 1.38);
    const maxLines = Math.max(2, Math.floor(maxHeight / lineHeight));
    const lines = wrapMeasuredText(
      quote,
      maxWidth,
      (value) => context.measureText(value).width,
      maxLines,
    );
    if (lines.length * lineHeight <= maxHeight) {
      return { fontSize, lineHeight, lines };
    }
  }
  return { fontSize: 38, lineHeight: 53, lines: [quote] };
}

async function drawStickers(
  context: CanvasRenderingContext2D,
  stickers: PlacedSticker[],
) {
  await Promise.all(
    stickers.map(async (sticker) => {
      const definition = stickerPack.find((item) => item.id === sticker.stickerId);
      if (!definition) return;
      try {
        const image = await loadImage(stickerAssetUrl(definition.src));
        const size = 154 * sticker.scale;
        const x = (sticker.x / 100) * cardWidth;
        const y = (sticker.y / 100) * cardHeight;
        context.save();
        context.translate(x, y);
        context.rotate((sticker.rotation * Math.PI) / 180);
        context.shadowColor = "rgba(48, 38, 28, 0.18)";
        context.shadowBlur = 18;
        context.shadowOffsetY = 9;
        context.drawImage(image, -size / 2, -size / 2, size, size);
        context.restore();
      } catch {
        // A missing decorative asset should not block the reading card export.
      }
    }),
  );
}

export async function createShareCard({
  book,
  page,
  stickers,
}: ShareCardInput) {
  await document.fonts?.ready;
  const canvas = document.createElement("canvas");
  canvas.width = cardWidth;
  canvas.height = cardHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法生成分享卡");

  const background = context.createLinearGradient(0, 0, cardWidth, cardHeight);
  background.addColorStop(0, "#f4efe5");
  background.addColorStop(0.52, "#ebe3d5");
  background.addColorStop(1, "#e2d7c6");
  context.fillStyle = background;
  context.fillRect(0, 0, cardWidth, cardHeight);

  let grainSeed = 20260729;
  for (let index = 0; index < 380; index += 1) {
    grainSeed = (grainSeed * 1664525 + 1013904223) >>> 0;
    const x = grainSeed % cardWidth;
    grainSeed = (grainSeed * 1664525 + 1013904223) >>> 0;
    const y = grainSeed % cardHeight;
    context.fillStyle = index % 3 ? "rgba(56,45,33,.035)" : "rgba(255,255,255,.16)";
    context.fillRect(x, y, 1.4, 1.4);
  }

  context.fillStyle = "#25231f";
  context.font = '700 15px "Inter Variable", sans-serif';
  context.letterSpacing = "3px";
  context.fillText("MY WEREAD MARGINALIA", 84, 86);
  context.letterSpacing = "0px";

  context.font = '480 52px "Newsreader Variable", "Songti SC", serif';
  const titleLines = wrapMeasuredText(
    book.title,
    780,
    (value) => context.measureText(value).width,
    2,
  );
  drawLines(context, titleLines, 84, 150, 58);
  const titleBottom = 150 + (titleLines.length - 1) * 58;
  context.fillStyle = "rgba(37,35,31,.58)";
  context.font = 'italic 24px "Newsreader Variable", "Songti SC", serif';
  context.fillText(book.author, 86, titleBottom + 46);

  context.fillStyle = "rgba(37,35,31,.18)";
  context.fillRect(84, titleBottom + 83, 912, 1);
  context.fillStyle = "rgba(37,35,31,.62)";
  context.font = '700 16px "Inter Variable", "Songti SC", sans-serif';
  context.fillText(page.chapterTitle, 86, titleBottom + 130);

  const quoteTop = titleBottom + 190;
  const hasThought = page.thoughts.some((thought) => thought.content);
  const quoteLayout = fitQuote(
    context,
    page.quote ?? page.thoughts[0]?.content ?? "",
    850,
    hasThought ? 650 : 820,
  );
  context.font = `430 ${quoteLayout.fontSize}px "Newsreader Variable", "Songti SC", serif`;
  const highlight =
    cardHighlightColors[
      Math.abs(page.colorStyle ?? 0) % cardHighlightColors.length
    ];
  quoteLayout.lines.forEach((line, index) => {
    const y = quoteTop + index * quoteLayout.lineHeight;
    context.fillStyle = `${highlight}9c`;
    context.fillRect(
      104,
      y + quoteLayout.fontSize * 0.72,
      Math.min(858, context.measureText(line).width + 8),
      Math.max(12, quoteLayout.fontSize * 0.22),
    );
    context.fillStyle = "#25231f";
    context.fillText(line, 108, y + quoteLayout.fontSize);
  });

  const quoteBottom =
    quoteTop + quoteLayout.lines.length * quoteLayout.lineHeight + 22;
  const thought = page.thoughts.find((item) => item.content);
  if (thought && page.quote) {
    context.fillStyle = "rgba(37,35,31,.055)";
    roundedRect(context, 104, quoteBottom, 850, 170, 12);
    context.fill();
    context.fillStyle = highlight;
    context.fillRect(104, quoteBottom, 5, 170);
    context.fillStyle = "rgba(37,35,31,.58)";
    context.font = '700 14px "Inter Variable", "Songti SC", sans-serif';
    context.fillText("当时的想法", 134, quoteBottom + 38);
    context.fillStyle = "#25231f";
    context.font = '430 28px "Newsreader Variable", "Songti SC", serif';
    const thoughtLines = wrapMeasuredText(
      thought.content,
      760,
      (value) => context.measureText(value).width,
      3,
    );
    drawLines(context, thoughtLines, 134, quoteBottom + 80, 35);
  }

  context.fillStyle = "rgba(37,35,31,.18)";
  context.fillRect(84, 1322, 912, 1);
  context.fillStyle = "rgba(37,35,31,.58)";
  context.font = '650 14px "Inter Variable", "Songti SC", sans-serif';
  context.fillText("微信读书 · 私人划线", 84, 1367);
  context.textAlign = "right";
  context.fillText(page.createdAt ?? "THE COMPLETE SHELF", 996, 1367);
  context.textAlign = "left";

  await drawStickers(context, [...stickers].sort((a, b) => a.zIndex - b.zIndex));

  return new Promise<Blob>((resolve, reject) => {
    canvas.toBlob((blob) => {
      if (blob) resolve(blob);
      else reject(new Error("分享卡生成失败"));
    }, "image/png");
  });
}

export async function downloadShareCard(
  input: ShareCardInput,
  pageIndex: number,
) {
  const blob = await createShareCard(input);
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = shareCardFilename(input.book.title, pageIndex);
  anchor.click();
  window.setTimeout(() => URL.revokeObjectURL(url), 1_000);
}
