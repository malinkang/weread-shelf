type MeasureText = (value: string) => number;

export function wrapMeasuredText(
  text: string,
  maxWidth: number,
  measure: MeasureText,
  maxLines = Number.POSITIVE_INFINITY,
) {
  const lines: string[] = [];
  let line = "";
  const characters = [...text.replace(/\s+/g, " ").trim()];

  for (const character of characters) {
    const candidate = line + character;
    if (line && measure(candidate) > maxWidth) {
      lines.push(line.trimEnd());
      line = character.trimStart();
      if (lines.length === maxLines) break;
    } else {
      line = candidate;
    }
  }
  if (line && lines.length < maxLines) lines.push(line.trimEnd());

  if (lines.length === maxLines) {
    const consumed = lines.join("").replace(/…$/, "").length;
    if (consumed < characters.length) {
      let last = lines.at(-1) ?? "";
      while (last && measure(`${last}…`) > maxWidth) last = last.slice(0, -1);
      lines[lines.length - 1] = `${last.trimEnd()}…`;
    }
  }
  return lines;
}

export function shareCardFilename(title: string, pageIndex: number) {
  const safeTitle = title
    .replace(/[\\/:*?"<>|]/g, "-")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 48);
  return `${safeTitle || "微信读书划线"}-${pageIndex + 1}.png`;
}
