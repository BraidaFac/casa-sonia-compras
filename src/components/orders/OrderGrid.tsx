"use client";
import { useState, useEffect, useRef } from "react";
import { Button, Group, Text } from "@mantine/core";

const ORDER_DRAFT_KEY = "order_new_draft";
import { Plus } from "lucide-react";
import { ArticleRow } from "./ArticleRow";
import { REQUIRED_ATTR_FAMILIES } from "./ArticleAttributes";
import { useAttributes } from "@/hooks/useAttributes";
import { useBrands } from "@/hooks/useBrands";
import { useCategories } from "@/hooks/useCategories";
import { useSizeAttributes } from "@/hooks/useSizeAttributes";
import { useColorBaseOptions } from "@/hooks/useColorBaseOptions";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type {
  Article,
  AttributeValue,
  Supplier,
  PrintColumn,
  PrintValues,
  Warehouse,
} from "@/types";

interface Props {
  supplier: Supplier | null;
  date: string;
  onTotalsChange?: (units: number, amount: number) => void;
  // Edit mode
  mode?: "create" | "edit";
  initialArticles?: Article[];
  orderId?: number;
  onArticlesChange?: (articles: Article[]) => void;
  onDraftCleared?: () => void;
  // Controlled from parent (DatosCabeceraOrden)
  globalBrand?: AttributeValue | null;
  selectedWarehouses?: Warehouse[];
  // Expose internal state to parent for ConfirmModal
  onPrintColumnsChange?: (cols: PrintColumn[]) => void;
  onPrintValuesChange?: (vals: PrintValues) => void;
  showValidation?: boolean;
  readOnly?: boolean;
}

function createEmptyArticle(
  globalBrand?: { attributeId: number; brand: AttributeValue } | null,
): Article {
  const attributes = [];
  if (globalBrand) {
    attributes.push({
      attributeId: globalBrand.attributeId,
      attributeName: "Marca",
      values: [globalBrand.brand],
      generatesVariants: false,
      locked: true,
    });
  }
  return {
    id: crypto.randomUUID(),
    name: "",
    existingProductId: null,
    referencia: "",
    price: "",
    salePrice: "",
    priceGranular: false,
    category: null,
    rows: [
      {
        id: crypto.randomUUID(),
        color: null,
        quantities: {},
        warehouseQuantities: {},
      },
    ],
    sizes: [],
    sizeAttributeId: null,
    attributes,
    description: "",
    colorImages: {},
    deletedOdooImageIds: [],
    clearedPrimaryColorNames: [],
    maxCoeficiente: 0,
  };
}

export function OrderGrid({
  supplier,
  date,
  onTotalsChange,
  mode = "create",
  initialArticles,
  orderId,
  onArticlesChange,
  onDraftCleared,
  globalBrand: globalBrandProp = null,
  selectedWarehouses: selectedWarehousesProp = [],
  onPrintColumnsChange,
  onPrintValuesChange,
  showValidation,
  readOnly = false,
}: Props) {
  const isEditMode = mode === "edit";

  // Read draft once at init time (create mode only, lazy useState runs exactly once)
  const [draft] = useState<Record<string, unknown> | null>(() => {
    if (isEditMode) return null;
    try {
      const raw = localStorage.getItem(ORDER_DRAFT_KEY);
      return raw ? JSON.parse(raw) : null;
    } catch {
      return null;
    }
  });

  const [articles, setArticles] = useState<Article[]>(() => {
    if (isEditMode)
      return initialArticles?.length ? initialArticles : [createEmptyArticle()];
    const draftArticles = draft?.articles as Article[] | undefined;
    return draftArticles?.length ? draftArticles : [createEmptyArticle()];
  });
  const draftSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  function updateArticles(
    updater: Article[] | ((prev: Article[]) => Article[]),
  ) {
    setArticles((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }

  useEffect(() => {
    if (isEditMode && initialArticles && initialArticles.length > 0) {
      // eslint-disable-next-line react-hooks/set-state-in-effect
      updateArticles(initialArticles);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const [printColumns, setPrintColumns] = useState<PrintColumn[]>(
    () => (draft?.printColumns as PrintColumn[]) ?? [],
  );
  const [printValues, setPrintValues] = useState<PrintValues>(
    () => (draft?.printValues as PrintValues) ?? {},
  );
  const effectiveValidateMode = showValidation;

  // Use props directly — controlled by parent (DatosCabeceraOrden)
  const globalBrand = globalBrandProp;
  const selectedWarehouses = selectedWarehousesProp;

  // Track previous globalBrand to apply article mutation only on change
  const prevGlobalBrandRef = useRef<AttributeValue | null>(null);

  // Notify parent when internal state changes
  useEffect(() => {
    onArticlesChange?.(articles);
  }, [articles]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onPrintColumnsChange?.(printColumns);
  }, [printColumns]); // eslint-disable-line react-hooks/exhaustive-deps
  useEffect(() => {
    onPrintValuesChange?.(printValues);
  }, [printValues]); // eslint-disable-line react-hooks/exhaustive-deps

  const {
    data: attrData,
    isLoading: attrLoading,
    error: attrError,
    refetch: refetchAttrs,
  } = useAttributes();
  const { data: sizeAttributes = [] } = useSizeAttributes();
  const { data: brandsData } = useBrands();
  const { data: categories = [] } = useCategories();
  const { data: colorBaseOptions = [] } = useColorBaseOptions();

  const allColors = attrData?.colors || [];
  const colorAttributeId = attrData?.colorAttributeId ?? 0;
  const sizeAttributeId = attrData?.sizeAttributeId ?? 0;
  const brandAttributeId = brandsData?.attributeId ?? 0;

  // When globalBrand prop changes, inject it into articles that don't have a brand yet
  useEffect(() => {
    if (globalBrand === prevGlobalBrandRef.current) return;
    prevGlobalBrandRef.current = globalBrand;
    if (!globalBrand || !brandAttributeId) return;
    const timer = setTimeout(() => {
      updateArticles((prev) =>
        prev.map((a) => {
          const hasBrand = a.attributes.some((attr) =>
            attr.attributeName.toLowerCase().includes("marca"),
          );
          if (hasBrand) return a;
          return {
            ...a,
            attributes: [
              ...a.attributes,
              {
                attributeId: brandAttributeId,
                attributeName: "Marca",
                values: [globalBrand],
                generatesVariants: false,
              },
            ],
          };
        }),
      );
    }, 0);
    return () => clearTimeout(timer);
  }, [globalBrand, brandAttributeId]); // eslint-disable-line react-hooks/exhaustive-deps

  function addPrintColumn() {
    setPrintColumns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), header: "" },
    ]);
  }

  function updatePrintColumnHeader(id: string, header: string) {
    setPrintColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, header } : col)),
    );
  }

  function removePrintColumn(id: string) {
    setPrintColumns((prev) => prev.filter((col) => col.id !== id));
    setPrintValues((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.includes(`:${id}`)) delete next[key];
      });
      return next;
    });
  }

  function updatePrintValue(
    articleId: string,
    rowId: string,
    columnId: string,
    value: string,
  ) {
    setPrintValues((prev) => ({
      ...prev,
      [`${articleId}:${rowId}:${columnId}`]: value,
    }));
  }

  function getPrintValue(
    articleId: string,
    rowId: string,
    columnId: string,
  ): string {
    return printValues[`${articleId}:${rowId}:${columnId}`] || "";
  }

  function updateArticle(id: string, updated: Article) {
    updateArticles((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }

  function removeArticle(id: string) {
    updateArticles((prev) => prev.filter((a) => a.id !== id));
  }

  function duplicateArticle(id: string) {
    const original = articles.find((a) => a.id === id);
    if (!original) return;

    const duplicated: Article = {
      ...original,
      id: crypto.randomUUID(),
      name: "",
      referencia: "",
      existingProductId: null,
      colorImages: {},
      deletedOdooImageIds: [],
      clearedPrimaryColorNames: [],
      rows: original.rows.map((row) => ({
        ...row,
        id: crypto.randomUUID(),
        quantities: {},
        warehouseQuantities: {},
      })),
      sizes: original.sizes.map((size) => ({ ...size })),
      attributes: original.attributes.map((attr) => ({
        ...attr,
        values: [...attr.values],
      })),
    };

    updateArticles((prev) => {
      const idx = prev.findIndex((a) => a.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, duplicated);
      return next;
    });
  }

  function addArticle() {
    const brandInfo =
      globalBrand && brandAttributeId
        ? { attributeId: brandAttributeId, brand: globalBrand }
        : null;
    updateArticles((prev) => [...prev, createEmptyArticle(brandInfo)]);
  }

  const totalUnits = articles.reduce((sum, article) => {
    return (
      sum +
      article.rows.reduce((s2, row) => {
        if (selectedWarehouses.length > 0) {
          return (
            s2 +
            Object.values(row.warehouseQuantities || {}).reduce(
              (s, v) => s + (parseInt(v || "0", 10) || 0),
              0,
            )
          );
        }
        return (
          s2 +
          article.sizes.reduce((s3, size) => {
            const qty = parseInt(row.quantities[size.name] || "0", 10);
            return s3 + (isNaN(qty) ? 0 : qty);
          }, 0)
        );
      }, 0)
    );
  }, 0);

  const totalAmount = articles.reduce((sum, article) => {
    return (
      sum +
      article.rows.reduce((s2, row) => {
        if (selectedWarehouses.length > 0) {
          return (
            s2 +
            Object.entries(row.warehouseQuantities || {}).reduce(
              (s3, [key, val]) => {
                const qty = parseInt(val || "0", 10);
                if (isNaN(qty) || qty <= 0) return s3;
                const sizeName = key.split(":").slice(1).join(":");
                let price: number;
                if (article.priceGranular) {
                  const specific = row.prices?.[sizeName];
                  price = specific
                    ? parseFloat(specific) || 0
                    : parseFloat(article.price) || 0;
                } else {
                  price = parseFloat(article.price) || 0;
                }
                return s3 + price * qty;
              },
              0,
            )
          );
        }
        return (
          s2 +
          article.sizes.reduce((s3, size) => {
            const qty = parseInt(row.quantities[size.name] || "0", 10);
            if (isNaN(qty) || qty <= 0) return s3;
            let price: number;
            if (article.priceGranular) {
              const specific = row.prices?.[size.name];
              price = specific
                ? parseFloat(specific) || 0
                : parseFloat(article.price) || 0;
            } else {
              price = parseFloat(article.price) || 0;
            }
            return s3 + price * qty;
          }, 0)
        );
      }, 0)
    );
  }, 0);

  useEffect(() => {
    onTotalsChange?.(totalUnits, totalAmount);
  }, [totalUnits, totalAmount, onTotalsChange]);

  const hasDirtyData =
    articles.length > 1 ||
    (articles.length === 1 &&
      (articles[0].name.trim() !== "" ||
        articles[0].sizes.length > 0 ||
        articles[0].rows.some((r) =>
          Object.values(r.quantities).some((q) => parseInt(q || "0", 10) > 0),
        )));

  useEffect(() => {
    if (!hasDirtyData) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDirtyData]);

  // Auto-save draft to localStorage (create mode only, debounced 5s, only when ≥2 articles)
  useEffect(() => {
    if (isEditMode) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      // Only write draft if there are at least 2 articles
      if (articles.length < 2) return;
      try {
        const raw = localStorage.getItem(ORDER_DRAFT_KEY);
        const current = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          ORDER_DRAFT_KEY,
          JSON.stringify({
            ...current,
            savedAt: new Date().toISOString(),
            supplier,
            articles,
            globalBrand,
            selectedWarehouses,
            printColumns,
            printValues,
          }),
        );
      } catch {}
    }, 5000);
    return () => {
      if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [supplier, articles, globalBrand, selectedWarehouses, printColumns, printValues]);

  function articleRowHasQty(
    article: Article,
    row: {
      quantities: Record<string, string>;
      warehouseQuantities?: Record<string, string>;
    },
  ): boolean {
    if (selectedWarehouses.length > 0) {
      return Object.values(row.warehouseQuantities || {}).some(
        (v) => parseInt(v || "0", 10) > 0,
      );
    }
    return article.sizes.some(
      (s) => parseInt(row.quantities[s.name] || "0", 10) > 0,
    );
  }

  function articleHasQty(article: Article): boolean {
    return article.rows.some((r) => articleRowHasQty(article, r));
  }

  const hasValidationErrors = articles.some((a) => {
    const hasQty = articleHasQty(a);
    const missingPrice = !a.priceGranular && !a.price && hasQty;
    const missingColor = a.rows.some((r) => articleRowHasQty(a, r) && !r.color);
    return missingPrice || missingColor;
  });

  const missingBrand = articles.some((a) => {
    if (!articleHasQty(a)) return false;
    const brandAttr = a.attributes.find((attr) =>
      attr.attributeName.toLowerCase().includes("marca"),
    );
    return !brandAttr || brandAttr.values.length === 0;
  });

  const hasAnyQty = articles.some((a) => articleHasQty(a));

  function getMissingRequiredKeys(article: Article): string[] {
    return REQUIRED_ATTR_FAMILIES.filter(
      (family) =>
        !article.attributes.some(
          (attr) =>
            family.names.some((n) =>
              attr.attributeName.toLowerCase().includes(n),
            ) && attr.values.length > 0,
        ),
    ).map((f) => f.key);
  }

  // Computed per article (always, not only in validateMode)
  const missingRequiredPerArticle: Record<string, string[]> = {};
  for (const article of articles) {
    const missing = getMissingRequiredKeys(article);
    if (missing.length > 0) missingRequiredPerArticle[article.id] = missing;
  }
  const hasMissingRequiredAttrs =
    Object.keys(missingRequiredPerArticle).length > 0;
  const firstMissingArticleId = articles.find(
    (a) => missingRequiredPerArticle[a.id],
  )?.id;

  if (attrLoading) {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 8,
          padding: 48,
          color: "var(--text2)",
        }}
      >
        <LoadingSpinner size={20} />
        Cargando atributos de Odoo...
      </div>
    );
  }

  if (attrError) {
    return (
      <div style={{ padding: 24, color: "var(--red)", fontSize: 14 }}>
        Error al cargar atributos de Odoo. Verificar conexión.
      </div>
    );
  }

  return (
    <div style={{ position: "relative" }}>
      {/* Articles */}
      {articles.map((article) => {
        return (
          <ArticleRow
            key={article.id}
            article={article}
            allColors={allColors}
            colorBaseOptions={colorBaseOptions}
            sizeAttributes={sizeAttributes}
            colorAttributeId={colorAttributeId}
            sizeAttributeId={sizeAttributeId}
            categories={categories}
            invalidColors={[]}
            invalidSizes={[]}
            printColumns={printColumns}
            onAddPrintColumn={addPrintColumn}
            onUpdatePrintColumnHeader={updatePrintColumnHeader}
            onRemovePrintColumn={removePrintColumn}
            getPrintValue={(rowId, columnId) =>
              getPrintValue(article.id, rowId, columnId)
            }
            onUpdatePrintValue={(rowId, columnId, value) =>
              updatePrintValue(article.id, rowId, columnId, value)
            }
            selectedWarehouses={selectedWarehouses}
            onChange={(updated) => updateArticle(article.id, updated)}
            onRemove={() => removeArticle(article.id)}
            onDuplicate={() => duplicateArticle(article.id)}
            onOpenSizeModal={() => refetchAttrs()}
            missingRequiredKeys={
              effectiveValidateMode ? (missingRequiredPerArticle[article.id] ?? []) : []
            }
            isFirstMissingArticle={
              effectiveValidateMode && article.id === firstMissingArticleId
            }
            orderId={orderId}
            readOnly={readOnly}
          />
        );
      })}

      {/* Add article — hidden in readOnly */}
      {!readOnly && (
        <Button
          variant="subtle"
          color="gray"
          fullWidth
          leftSection={<Plus size={14} />}
          mb="xl"
          onClick={addArticle}
          style={{ border: "1px dashed var(--border2)" }}
        >
          Agregar artículo
        </Button>
      )}
    </div>
  );
}

