export interface BankIconEntry {
  key: string;
  nombre: string;
  color: string; // hex sin #
  svgPath?: string;
  viewBox?: string;
  /** Ruta a un SVG estático en /public — si existe, se renderiza como <img> */
  svgSrc?: string;
  /** Multiplicador de tamaño visual (default 1). Útil para logos con mucho espacio en blanco. */
  scale?: number;
}

/** SVG custom para bancos no disponibles en simple-icons v16 */
const CUSTOM_SVGS: Record<string, Omit<BankIconEntry, "key">> = {
  galicia: {
    nombre: "Banco Galicia",
    color: "FA6400",
    svgSrc: "/icons/banks/galicia.svg",
  },
  macro: {
    nombre: "Banco Macro",
    color: "133250",
    svgSrc: "/icons/banks/macro.svg",
  },
  santander: {
    nombre: "Santander",
    color: "EA1D25",
    svgSrc: "/icons/banks/santander.svg",
  },
  bbva: {
    nombre: "BBVA",
    color: "004679",
    svgSrc: "/icons/banks/bbva.svg",
  },
  itau: {
    nombre: "Itaú",
    color: "EC7000",
    svgSrc: "/icons/banks/itau.svg",
  },
  naranjax: {
    nombre: "Naranja X",
    color: "FF5000",
    svgSrc: "/icons/banks/naranjax.svg",
  },
  provincia: {
    nombre: "Banco Provincia",
    color: "0F4C9E",
    svgSrc: "/icons/banks/banco_provincia_ba_logo.svg",
  },
  nacion: {
    nombre: "Banco Nación",
    color: "0e7391",
    svgSrc: "/icons/banks/banco-nacion.svg",
  },
  supervielle: {
    nombre: "Supervielle",
    color: "E30613",
    svgSrc: "/icons/banks/supervielle.svg",
  },
  ciudad: {
    nombre: "Banco Ciudad",
    color: "0055A5",
    svgSrc: "/icons/banks/ciudad.svg",
  },
  mercadopago: {
    nombre: "Mercado Pago",
    color: "009EE3",
    svgSrc: "/icons/banks/MP_RGB_HANDSHAKE_color_horizontal.svg",
    scale: 1.8,
  },
  credicoop: {
    nombre: "Credicoop",
    color: "004B8D",
    svgSrc: "/icons/banks/credicoop.svg",
  },
  comafi: {
    nombre: "Comafi",
    color: "D20030",
    svgSrc: "/icons/banks/comafi.svg",
  },
  santafe: {
    nombre: "Santa Fe",
    color: "D20030",
    svgSrc: "/icons/banks/santafe.png",
  },
  bica: {
    nombre: "Bica",
    color: "D20030",
    svgSrc: "/icons/banks/bancobica.png",
  },
};

const CUSTOM_ENTRIES: BankIconEntry[] = Object.entries(CUSTOM_SVGS).map(
  ([key, data]) => ({ key, ...data }),
);

/** Catálogo completo: primero bancos locales AR, luego internacionales */
export const BANK_ICONS: BankIconEntry[] = [...CUSTOM_ENTRIES];

export const BANK_ICON_MAP = new Map<string, BankIconEntry>(
  BANK_ICONS.map((e) => [e.key, e]),
);

export function getBankIcon(
  key: string | null | undefined,
): BankIconEntry | null {
  if (!key) return null;
  return BANK_ICON_MAP.get(key) ?? null;
}

export const BANK_ICON_VIEWBOX = "0 0 24 24";
