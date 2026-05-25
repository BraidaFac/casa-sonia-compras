export interface Supplier {
  id: number;
  name: string;
}

export interface ProductCategory {
  id: number;
  name: string;
  completeName: string;
}

export interface AttributeValue {
  id: number;
  name: string;
}

export interface ColorValue {
  id: number | null;  // null if new color not yet in Odoo
  name: string;
  colorBase: string;  // x_studio_color_base value
  hexColor: string;   // html_color value (e.g. "#1a2b3c")
  isNew: boolean;     // true if created from the app, not yet in Odoo
}

export interface SizeValue {
  id: number;
  name: string;
  equivalencia: string;
}

export interface SizeAttribute {
  id: number;
  name: string;
  values: SizeValue[];
}

// Generic attribute for the Attributes tab
export interface ProductAttribute {
  attributeId: number;
  attributeName: string;
  values: AttributeValue[];
  // true if generates variants (Color or Talle)
  generatesVariants: boolean;
}

export interface Warehouse {
  id: number;
  name: string;
  code: string;
}

export interface ArticleRow {
  id: string; // local UUID
  color: ColorValue | null;
  quantities: Record<string, string>; // size name → quantity string (no-warehouse mode)
  prices?: Record<string, string>; // size name → price (granular mode)
  // key: `${warehouseId}:${sizeName}` → quantity string (warehouse mode)
  warehouseQuantities: Record<string, string>;
}

// Imagen de producto — convertida a base64 en el browser
export interface ProductImage {
  id: string;          // UUID local
  fileName: string;    // nombre original del archivo
  base64: string;      // contenido en base64 (sin prefijo data:...)
  mimeType: string;    // "image/jpeg", "image/png", etc.
  previewUrl: string;  // data URL para preview en la app (con prefijo data:...)
  uploading?: boolean; // true mientras se procesa
  error?: string;      // mensaje de error si falló
}

// Imágenes por color — key: colorName → array de imágenes
export type ColorImages = Record<string, ProductImage[]>;

export interface Article {
  id: string; // local UUID
  name: string;
  existingProductId: number | null;
  referencia: string;
  price: string; // Costo Neto
  salePrice: string; // Precio Venta — obligatorio
  priceGranular: boolean;
  category: ProductCategory | null; // obligatorio
  rows: ArticleRow[];
  sizes: SizeValue[];
  sizeAttributeId: number | null;
  attributes: ProductAttribute[];
  description: string;
  colorImages: ColorImages; // imágenes por variante de color
  maxCoeficiente: number; // 0 if new article or no Tipo de Producto
}

export interface OrderPayload {
  supplierId: number;
  date: string;
  articles: Article[];
}

export interface OdooProduct {
  id: number;
  name: string;
  referencia: string;
  defaultCode: string;
  listPrice: number;
  maxCoeficiente: number;
  category: ProductCategory | null;
  colors: AttributeValue[];
  sizes: SizeValue[];
  sizeAttributeId: number | null;
  extraAttributes: ProductAttribute[];
}

export interface AttributesData {
  colors: ColorValue[];
  sizes: AttributeValue[];
  colorAttributeId: number;
  sizeAttributeId: number;
}

// Columna extra para impresión — global para toda la orden
export interface PrintColumn {
  id: string;
  header: string;
}

// key: `${articleId}:${rowId}:${printColumnId}` → valor string
export type PrintValues = Record<string, string>;
