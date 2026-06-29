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
  // true if attribute name is fixed (preloaded from Odoo or injected) — cannot be reassigned
  locked?: boolean;
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
  // edit mode: size name → purchase.order.line ID (populated when loading existing OC)
  odooLineIds?: Record<string, number>;
  // size name → barcode value
  barcodes?: Record<string, string>;
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
  isFromOdoo?: boolean; // true si fue cargada desde Odoo (imagen primaria)
  odooId?: number;     // ID del registro product.image en Odoo (solo imágenes adicionales)
  tempPath?: string;   // "/uploads/temp/[orderId]/[uuid].ext" — set after upload to server
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
  deletedOdooImageIds: number[];       // IDs de product.image a eliminar en Odoo al guardar
  clearedPrimaryColorNames: string[];  // colores cuya imagen primaria fue borrada (limpiar image_variant_1920)
  maxCoeficiente: number; // 0 if new article or no Tipo de Producto
  originalSizeIds?: number[]; // IDs de talles que ya existían en Odoo al cargar producto existente (no se pueden eliminar)
}

export interface OrderPayload {
  supplierId: number;
  date: string;
  articles: Article[];
}

export interface OrderHeader {
  id: number;
  name: string;
  supplierId: number;
  supplierName: string;
  date: string;
  warehouseIds: number[];
  state: string;
  writeDate: string;
}

export interface OdooProductLite {
  id: number;
  name: string;
  referencia: string;
  defaultCode: string;
  listPrice: number;
  category: ProductCategory | null;
}

export interface OdooProduct extends OdooProductLite {
  maxCoeficiente: number;
  colors: AttributeValue[];
  sizes: SizeValue[];
  sizeAttributeId: number | null;
  extraAttributes: ProductAttribute[];
}

export interface AttributesData {
  colors: ColorValue[];
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

// ─── Local DB order types ─────────────────────────────────────────────────────

export type OrderStatus = "DRAFT" | "CONFIRMED" | "ERROR";

// ProductImage as stored in DB: no base64/previewUrl for new images
export interface LocalProductImage {
  id: string;
  fileName: string;
  mimeType: string;
  isFromOdoo?: boolean;
  odooId?: number;
  tempPath?: string;   // "/uploads/temp/[orderId]/[uuid].ext" — set after explicit save
  // base64 and previewUrl are NEVER stored in DB
}

export type LocalColorImages = Record<string, LocalProductImage[]>;

// Article as stored in DB — same as Article but colorImages uses LocalProductImage
export interface LocalArticle extends Omit<Article, "colorImages"> {
  colorImages: LocalColorImages;
}

export interface LocalOrder {
  id: number;
  status: OrderStatus;
  odooOrderId: number | null;
  odooOrderName: string | null;
  errorDetail: string | null;
  supplierId: number;
  supplierName: string;
  brandId: number | null;
  brandName: string | null;
  compradoraIds: number[];
  date: string;
  warehouseIds: number[];
  articles: LocalArticle[];
  printColumns: PrintColumn[];
  printValues: PrintValues;
  createdAt: string;
  updatedAt: string;
}

export interface LocalOrderSummary {
  id: number;
  status: OrderStatus;
  odooOrderId: number | null;
  odooOrderName: string | null;
  errorDetail: string | null;
  supplierId: number;
  supplierName: string;
  date: string;
  articleCount: number;
  createdAt: string;
  updatedAt: string;
}
