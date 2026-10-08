export const clamp = (value: number, min = 0, max = 1): number =>
  Math.min(max, Math.max(min, value));

export const sigmoid = (x: number): number => 1 / (1 + Math.exp(-x));

export const logit = (p: number): number => Math.log(p / (1 - p));

export const mean = (values: number[]): number =>
  values.length === 0 ? 0 : values.reduce((sum, v) => sum + v, 0) / values.length;

export const round = (value: number, places = 0): number => {
  const f = 10 ** places;
  return Math.round(value * f) / f;
};

export const seconds = (ms: number): string => `${Math.max(1, Math.round(ms / 1000))}s`;

export const plural = (n: number, one: string, many = `${one}s`): string =>
  `${n} ${n === 1 ? one : many}`;
