export const LETTER_SIZES = [
  "XS",
  "S",
  "M",
  "L",
  "XL",
  "2XL",
  "3XL",
  "4XL",
  "5XL",
  "6XL",
  "7XL",
  "8XL",
] as const;

export type LetterSize = (typeof LETTER_SIZES)[number];

/**
 * Dado un rango de letras (desde, hasta), retorna todos los talles intermedios inclusive.
 * Ej: getLetterSizeRange("S", "XL") → ["S", "M", "L", "XL"]
 */
export function getLetterSizeRange(
  from: LetterSize,
  to: LetterSize,
): LetterSize[] {
  const fromIdx = LETTER_SIZES.indexOf(from);
  const toIdx = LETTER_SIZES.indexOf(to);
  if (fromIdx === -1 || toIdx === -1 || fromIdx > toIdx) return [];
  return LETTER_SIZES.slice(fromIdx, toIdx + 1);
}

/**
 * Dado un rango numérico (desde, hasta, step), retorna los talles como strings.
 * Ej: getNumericSizeRange(30, 50, 2) → ["30", "32", "34", ..., "50"]
 */
export function getNumericSizeRange(
  from: number,
  to: number,
  step: number,
): string[] {
  if (step <= 0 || from > to) return [];
  const result: string[] = [];
  for (let i = from; i <= to; i += step) {
    result.push(String(i));
  }
  return result;
}
