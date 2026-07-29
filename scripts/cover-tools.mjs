import sharp from "sharp";

const SAMPLE_WIDTH = 48;
const SAMPLE_HEIGHT = 64;
const EDGE_WIDTH = 9;
const LIGHT_INK = "#f6edde";
const DARK_INK = "#27231f";

function clamp(value, minimum, maximum) {
  return Math.min(maximum, Math.max(minimum, value));
}

function toHex(value) {
  return Math.round(clamp(value, 0, 255)).toString(16).padStart(2, "0");
}

function rgbToHex({ r, g, b }) {
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

function rgbToHsl({ r, g, b }) {
  const red = r / 255;
  const green = g / 255;
  const blue = b / 255;
  const maximum = Math.max(red, green, blue);
  const minimum = Math.min(red, green, blue);
  const lightness = (maximum + minimum) / 2;
  const delta = maximum - minimum;

  if (delta === 0) return { h: 0, s: 0, l: lightness };

  const saturation = delta / (1 - Math.abs(2 * lightness - 1));
  let hue;
  if (maximum === red) hue = ((green - blue) / delta) % 6;
  else if (maximum === green) hue = (blue - red) / delta + 2;
  else hue = (red - green) / delta + 4;

  return {
    h: ((hue * 60 + 360) % 360) / 360,
    s: saturation,
    l: lightness,
  };
}

function hslToRgb({ h, s, l }) {
  const chroma = (1 - Math.abs(2 * l - 1)) * s;
  const scaledHue = h * 6;
  const secondary = chroma * (1 - Math.abs((scaledHue % 2) - 1));
  let channels;

  if (scaledHue < 1) channels = [chroma, secondary, 0];
  else if (scaledHue < 2) channels = [secondary, chroma, 0];
  else if (scaledHue < 3) channels = [0, chroma, secondary];
  else if (scaledHue < 4) channels = [0, secondary, chroma];
  else if (scaledHue < 5) channels = [secondary, 0, chroma];
  else channels = [chroma, 0, secondary];

  const offset = l - chroma / 2;
  return {
    r: (channels[0] + offset) * 255,
    g: (channels[1] + offset) * 255,
    b: (channels[2] + offset) * 255,
  };
}

function relativeLuminance({ r, g, b }) {
  const linear = [r, g, b].map((channel) => {
    const value = channel / 255;
    return value <= 0.04045
      ? value / 12.92
      : ((value + 0.055) / 1.055) ** 2.4;
  });
  return linear[0] * 0.2126 + linear[1] * 0.7152 + linear[2] * 0.0722;
}

function hexToRgb(value) {
  const match = /^#([\da-f]{2})([\da-f]{2})([\da-f]{2})$/i.exec(value);
  if (!match) return { r: 0, g: 0, b: 0 };
  return {
    r: Number.parseInt(match[1], 16),
    g: Number.parseInt(match[2], 16),
    b: Number.parseInt(match[3], 16),
  };
}

function contrastRatio(left, right) {
  const lighter = Math.max(relativeLuminance(left), relativeLuminance(right));
  const darker = Math.min(relativeLuminance(left), relativeLuminance(right));
  return (lighter + 0.05) / (darker + 0.05);
}

function colorDistance(left, right) {
  const red = left.r - right.r;
  const green = left.g - right.g;
  const blue = left.b - right.b;
  return Math.sqrt(red * red + green * green + blue * blue);
}

function normalizeCoverColor(color) {
  const hsl = rgbToHsl(color);

  if (hsl.l >= 0.78 && hsl.s <= 0.28) {
    hsl.s = clamp(hsl.s, 0.06, 0.2);
    hsl.l = clamp(hsl.l * 0.86, 0.68, 0.78);
  } else if (hsl.l <= 0.2) {
    hsl.s = clamp(hsl.s * 0.8, 0.08, 0.38);
    hsl.l = clamp(hsl.l * 1.3, 0.19, 0.26);
  } else {
    hsl.s = clamp(hsl.s * 0.8, 0.12, 0.46);
    hsl.l = clamp(hsl.l * 0.78, 0.25, 0.48);
  }

  return hslToRgb(hsl);
}

function normalizeAccentColor(color, coverColor) {
  const hsl = rgbToHsl(color);
  const coverLightness = rgbToHsl(coverColor).l;
  hsl.s = clamp(hsl.s * 0.95, 0.32, 0.66);
  hsl.l =
    coverLightness > 0.58
      ? clamp(hsl.l * 0.72, 0.28, 0.44)
      : clamp(hsl.l * 1.1, 0.56, 0.72);
  return hslToRgb(hsl);
}

function chooseInk(coverColor) {
  const light = hexToRgb(LIGHT_INK);
  const dark = hexToRgb(DARK_INK);
  return contrastRatio(coverColor, light) >= contrastRatio(coverColor, dark)
    ? LIGHT_INK
    : DARK_INK;
}

function collectColorBuckets(data, channels) {
  const buckets = new Map();

  for (let y = 0; y < SAMPLE_HEIGHT; y += 1) {
    for (let x = 0; x < SAMPLE_WIDTH; x += 1) {
      const offset = (y * SAMPLE_WIDTH + x) * channels;
      const r = data[offset];
      const g = data[offset + 1];
      const b = data[offset + 2];
      const edge = x < EDGE_WIDTH || x >= SAMPLE_WIDTH - EDGE_WIDTH;
      const weight = edge ? 5 : 1;
      const key = `${r >> 5}:${g >> 5}:${b >> 5}`;
      const bucket = buckets.get(key) ?? {
        r: 0,
        g: 0,
        b: 0,
        weight: 0,
        edgeWeight: 0,
      };

      bucket.r += r * weight;
      bucket.g += g * weight;
      bucket.b += b * weight;
      bucket.weight += weight;
      if (edge) bucket.edgeWeight += weight;
      buckets.set(key, bucket);
    }
  }

  return [...buckets.values()]
    .map((bucket) => ({
      r: bucket.r / bucket.weight,
      g: bucket.g / bucket.weight,
      b: bucket.b / bucket.weight,
      weight: bucket.weight,
      edgeWeight: bucket.edgeWeight,
      score: bucket.weight + bucket.edgeWeight * 2,
    }))
    .sort((left, right) => right.score - left.score);
}

function selectAccent(colors, coverColor) {
  return (
    colors.find(
      (color) =>
        colorDistance(color, coverColor) >= 72 &&
        rgbToHsl(color).l > 0.08 &&
        rgbToHsl(color).l < 0.93,
    ) ?? colors.find((color) => colorDistance(color, coverColor) >= 48)
  );
}

export function highResolutionCoverUrl(sourceUrl) {
  try {
    const url = new URL(sourceUrl);
    const isWereadCoverHost =
      url.hostname === "cdn.weread.qq.com" ||
      url.hostname.endsWith(".image.myqcloud.com");
    if (!isWereadCoverHost) return sourceUrl;

    url.pathname = url.pathname.replace(
      /\/(?:s|t[1-8])_([^/]+)$/i,
      "/t9_$1",
    );
    return url.toString();
  } catch {
    return sourceUrl;
  }
}

export async function deriveCoverPalette(imageBuffer, fallbackPalette) {
  try {
    const { data, info } = await sharp(imageBuffer)
      .rotate()
      .resize(SAMPLE_WIDTH, SAMPLE_HEIGHT, { fit: "fill" })
      .removeAlpha()
      .raw()
      .toBuffer({ resolveWithObject: true });
    const colors = collectColorBuckets(data, info.channels);
    if (!colors.length) return fallbackPalette;

    const rawCover = colors[0];
    const cover = normalizeCoverColor(rawCover);
    const rawAccent = selectAccent(colors.slice(1), rawCover);
    const fallbackAccent = hexToRgb(fallbackPalette.accent);
    const accent = normalizeAccentColor(rawAccent ?? fallbackAccent, cover);

    return {
      cover: rgbToHex(cover),
      accent: rgbToHex(accent),
      ink: chooseInk(cover),
    };
  } catch {
    return fallbackPalette;
  }
}
