/**
 * Genera código de referencia con formato ddMMrrrr.
 * dd = día actual (zero-padded), MM = mes actual (zero-padded), rrrr = 4 dígitos random.
 * Ejemplo: "29064823"
 */
export function generateReferencia(): string {
  const now = new Date();
  const dd = String(now.getDate()).padStart(2, "0");
  const MM = String(now.getMonth() + 1).padStart(2, "0");
  const rrrr = String(Math.floor(Math.random() * 10000)).padStart(4, "0");
  return `${dd}${MM}${rrrr}`;
}

/**
 * Deriva abreviatura de 2 letras del nombre de color proveedor (siempre MAYÚSCULAS).
 * 1 palabra   → primeras 2 letras:        "Rojo"              → "RO"
 * 2+ palabras → inicial de primeras 2:    "Azul Eléctrico"    → "AE"
 *                                          "Rojo Tomate Extra" → "RT"
 */
export function colorAbbr(colorName: string): string {
  const words = colorName.trim().split(/\s+/);
  if (words.length === 1) {
    return words[0].slice(0, 2).toUpperCase();
  }
  return (words[0][0] + words[1][0]).toUpperCase();
}

/**
 * Genera barcode para una variante.
 * Formato: {referencia}{AbrevColor}.{talle}
 * Ejemplo: "29064823RO.S"
 */
export function generateBarcode(
  referencia: string,
  colorName: string,
  sizeName: string,
): string {
  return `${referencia}${colorAbbr(colorName)}.${sizeName}`;
}
