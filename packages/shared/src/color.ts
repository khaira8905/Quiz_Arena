/** Colour maths used to keep customisation readable (WCAG 2.x relative luminance). */

export const HEX_COLOR = /^#[0-9a-f]{6}$/i;

export function hexToRgb(hex: string): [number, number, number] {
  const n = Number.parseInt(hex.slice(1), 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

export function relativeLuminance(hex: string): number {
  const [r, g, b] = hexToRgb(hex).map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : ((s + 0.055) / 1.055) ** 2.4;
  }) as [number, number, number];
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

export function contrastRatio(a: string, b: string): number {
  const [hi, lo] = [relativeLuminance(a), relativeLuminance(b)].sort((x, y) => y - x) as [
    number,
    number,
  ];
  return (hi + 0.05) / (lo + 0.05);
}

export const INK_DARK = "#0a0b0f";
export const INK_LIGHT = "#ffffff";

/** The text colour (near-black or white) that reads best on a given fill. */
export function inkFor(fill: string): string {
  return contrastRatio(fill, INK_DARK) >= contrastRatio(fill, INK_LIGHT) ? INK_DARK : INK_LIGHT;
}

/** Euclidean RGB distance — a cheap "are these two answer colours distinguishable?" check. */
export function colorDistance(a: string, b: string): number {
  const [r1, g1, b1] = hexToRgb(a);
  const [r2, g2, b2] = hexToRgb(b);
  return Math.hypot(r1 - r2, g1 - g2, b1 - b2);
}
