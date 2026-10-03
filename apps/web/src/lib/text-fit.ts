/**
 * Organisers write questions of every length (up to 280 characters, answers up to 120).
 * Instead of clipping long text, screens step the type size down by length so the longest
 * allowed content still fits a 1080p projector and a 360px phone.
 */

export function questionScale(text: string): number {
  const n = text.length;
  if (n <= 70) return 1;
  if (n <= 120) return 0.86;
  if (n <= 180) return 0.74;
  return 0.64;
}

export function answerScale(texts: string[]): number {
  const n = Math.max(0, ...texts.map((t) => t.length));
  if (n <= 32) return 1;
  if (n <= 60) return 0.86;
  if (n <= 90) return 0.74;
  return 0.64;
}

/** Phones switch from a 2×2 grid to full-width rows once any answer is long. */
export const PHONE_ROWS_THRESHOLD = 42;
