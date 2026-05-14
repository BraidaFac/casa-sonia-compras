export interface Supplier {
  id: number;
  name: string;
}

export interface AttributeValue {
  id: number;
  name: string;
}

// Generic attribute for the Attributes tab
export interface ProductAttribute {
  attributeId: number;
  attributeName: string;
  values: AttributeValue[];
  // true if generates variants (Color or Talle)
  generatesVariants: boolean;
}

export interface ArticleRow {
  id: string; // local UUID
  color: AttributeValue | null;
  quantities: Record<string, string>; // size name → quantity string
  prices?: Record<string, string>; // size name → price (granular mode)
}

export interface Article {
  id: string; // local UUID
  name: string;
  existingProductId: number | null;
  referencia: string;
  price: string; // Costo Neto
  salePrice: string; // Precio Venta
  priceGranular: boolean;
  rows: ArticleRow[];
  sizes: AttributeValue[];
  attributes: ProductAttribute[];
  description: string;
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
  colors: AttributeValue[];
  sizes: AttributeValue[];
  extraAttributes: ProductAttribute[];
}

export interface AttributesData {
  colors: AttributeValue[];
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
