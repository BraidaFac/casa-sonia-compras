export interface Supplier {
  id: number;
  name: string;
}

export interface AttributeValue {
  id: number;
  name: string;
  isNew?: boolean;
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
  price: string;
  priceGranular: boolean;
  rows: ArticleRow[];
  sizes: AttributeValue[]; // columns for this article
}

export interface OrderPayload {
  supplierId: number;
  date: string;
  articles: Article[];
}

export interface OdooProduct {
  id: number;
  name: string;
  colors: AttributeValue[];
  sizes: AttributeValue[];
}

export interface AttributesData {
  colors: AttributeValue[];
  sizes: AttributeValue[];
  colorAttributeId: number;
  sizeAttributeId: number;
}
