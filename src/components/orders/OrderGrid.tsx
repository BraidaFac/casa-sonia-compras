"use client";
import { useState, useEffect, useRef, useMemo, useCallback } from "react";
import { Button } from "@mantine/core";

// Stable empty array reference — prevents new array allocation per render for articles with no missing required attrs
const EMPTY_STRING_ARRAY: string[] = [];

const ORDER_DRAFT_KEY = "order_new_draft";
import { Plus } from "lucide-react";
import { ArticleRowContainer } from "./ArticleRowContainer";
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
  onSaveArticle?: (article: Article) => Promise<void>;
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
        barcodes: {},
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
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  date: _date,
  onTotalsChange,
  mode = "create",
  initialArticles,
  orderId,
  onArticlesChange,
  // eslint-disable-next-line @typescript-eslint/no-unused-vars
  onDraftCleared: _onDraftCleared,
  globalBrand: globalBrandProp = null,
  selectedWarehouses: selectedWarehousesProp = [],
  onPrintColumnsChange,
  onPrintValuesChange,
  showValidation,
  readOnly = false,
  onSaveArticle,
}: Props) {
  const isEditMode = mode === "edit";

  const [editingArticleId, setEditingArticleId] = useState<string | null>(null);
  const [isSavingArticleId, setIsSavingArticleId] = useState<string | null>(null);
  const editingSnapshotRef = useRef<Article | null>(null);

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

  const updateArticles = useCallback((
    updater: Article[] | ((prev: Article[]) => Article[]),
  ) => {
    setArticles((prev) => {
      const next = typeof updater === "function" ? updater(prev) : updater;
      return next;
    });
  }, []);

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
  const printValuesRef = useRef(printValues);
  useEffect(() => {
    printValuesRef.current = printValues;
  }, [printValues]);
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

  const addPrintColumn = useCallback(() => {
    setPrintColumns((prev) => [
      ...prev,
      { id: crypto.randomUUID(), header: "" },
    ]);
  }, []);

  const updatePrintColumnHeader = useCallback((id: string, header: string) => {
    setPrintColumns((prev) =>
      prev.map((col) => (col.id === id ? { ...col, header } : col)),
    );
  }, []);

  const removePrintColumn = useCallback((id: string) => {
    setPrintColumns((prev) => prev.filter((col) => col.id !== id));
    setPrintValues((prev) => {
      const next = { ...prev };
      Object.keys(next).forEach((key) => {
        if (key.includes(`:${id}`)) delete next[key];
      });
      return next;
    });
  }, []);

  const updatePrintValue = useCallback((
    articleId: string,
    rowId: string,
    columnId: string,
    value: string,
  ) => {
    setPrintValues((prev) => ({
      ...prev,
      [`${articleId}:${rowId}:${columnId}`]: value,
    }));
  }, []);

  // Reads from ref so it stays stable even as printValues changes
  const getPrintValue = useCallback((
    articleId: string,
    rowId: string,
    columnId: string,
  ): string => {
    return printValuesRef.current[`${articleId}:${rowId}:${columnId}`] || "";
  }, []);

  const updateArticle = useCallback((id: string, updated: Article) => {
    updateArticles((prev) => prev.map((a) => (a.id === id ? updated : a)));
  }, [updateArticles]);

  const removeArticle = useCallback((id: string) => {
    updateArticles((prev) => prev.filter((a) => a.id !== id));
  }, [updateArticles]);

  const duplicateArticle = useCallback((id: string) => {
    updateArticles((prev) => {
      const original = prev.find((a) => a.id === id);
      if (!original) return prev;

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
          barcodes: {},
        })),
        sizes: original.sizes.map((size) => ({ ...size })),
        attributes: original.attributes.map((attr) => ({
          ...attr,
          values: [...attr.values],
        })),
      };

      const idx = prev.findIndex((a) => a.id === id);
      const next = [...prev];
      next.splice(idx + 1, 0, duplicated);
      return next;
    });
  }, [updateArticles]);

  const addArticle = useCallback(() => {
    const brandInfo =
      globalBrand && brandAttributeId
        ? { attributeId: brandAttributeId, brand: globalBrand }
        : null;
    updateArticles((prev) => [...prev, createEmptyArticle(brandInfo)]);
  }, [globalBrand, brandAttributeId, updateArticles]);

  const totalUnits = useMemo(() => articles.reduce((sum, article) => {
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
  }, 0), [articles, selectedWarehouses]);

  const totalAmount = useMemo(() => articles.reduce((sum, article) => {
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
  }, 0), [articles, selectedWarehouses]);

  useEffect(() => {
    onTotalsChange?.(totalUnits, totalAmount);
  }, [totalUnits, totalAmount, onTotalsChange]);

  const hasDirtyData = useMemo(() =>
    articles.length > 1 ||
    (articles.length === 1 &&
      (articles[0].name.trim() !== "" ||
        articles[0].sizes.length > 0 ||
        articles[0].rows.some((r) =>
          Object.values(r.quantities).some((q) => parseInt(q || "0", 10) > 0),
        ))),
  [articles]);

  useEffect(() => {
    if (!hasDirtyData) return;
    function handleBeforeUnload(e: BeforeUnloadEvent) {
      e.preventDefault();
    }
    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [hasDirtyData]);

  // Auto-save draft to localStorage (create mode only, debounced 5s, only when supplier set + ≥1 article)
  useEffect(() => {
    if (isEditMode) return;
    if (draftSaveTimerRef.current) clearTimeout(draftSaveTimerRef.current);
    draftSaveTimerRef.current = setTimeout(() => {
      // Only write draft if header data (supplier) is set and there is at least 1 article
      if (!supplier || articles.length < 1) return;
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

  const { missingRequiredPerArticle, firstMissingArticleId } = useMemo(() => {
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

    const missingRequiredPerArticle: Record<string, string[]> = {};
    for (const article of articles) {
      const missing = getMissingRequiredKeys(article);
      if (missing.length > 0) missingRequiredPerArticle[article.id] = missing;
    }

    const firstMissingArticleId = articles.find(
      (a) => missingRequiredPerArticle[a.id],
    )?.id;

    return { hasValidationErrors, missingBrand, hasAnyQty, missingRequiredPerArticle, firstMissingArticleId };
  }, [articles, selectedWarehouses]); // eslint-disable-line react-hooks/exhaustive-deps


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
      {articles.map((article) => (
        <div key={article.id} style={{ position: "relative" }}>
          {readOnly && onSaveArticle && (
            <div
              style={{
                position: "absolute",
                top: 8,
                right: 8,
                zIndex: 10,
                display: "flex",
                gap: 6,
              }}
            >
              {editingArticleId === article.id ? (
                <>
                  <Button
                    size="xs"
                    variant="filled"
                    color="amber"
                    loading={isSavingArticleId === article.id}
                    disabled={isSavingArticleId === article.id}
                    onClick={async () => {
                      const current = articles.find((a) => a.id === article.id);
                      if (!current) return;
                      setIsSavingArticleId(article.id);
                      try {
                        await onSaveArticle(current);
                        setEditingArticleId(null);
                        editingSnapshotRef.current = null;
                      } finally {
                        setIsSavingArticleId(null);
                      }
                    }}
                  >
                    Guardar
                  </Button>
                  <Button
                    size="xs"
                    variant="subtle"
                    color="gray"
                    onClick={() => {
                      if (editingSnapshotRef.current) {
                        updateArticle(article.id, editingSnapshotRef.current);
                      }
                      setEditingArticleId(null);
                      editingSnapshotRef.current = null;
                    }}
                  >
                    Cancelar
                  </Button>
                </>
              ) : (
                <Button
                  size="xs"
                  variant="subtle"
                  color="amber"
                  onClick={() => {
                    editingSnapshotRef.current = article;
                    setEditingArticleId(article.id);
                  }}
                >
                  Editar
                </Button>
              )}
            </div>
          )}
          <ArticleRowContainer
            article={article}
            updateArticle={updateArticle}
            removeArticle={removeArticle}
            duplicateArticle={duplicateArticle}
            getPrintValue={getPrintValue}
            updatePrintValue={updatePrintValue}
            refetchAttrs={refetchAttrs}
            allColors={allColors}
            colorBaseOptions={colorBaseOptions}
            sizeAttributes={sizeAttributes}
            colorAttributeId={colorAttributeId}
            sizeAttributeId={sizeAttributeId}
            categories={categories}
            printColumns={printColumns}
            onAddPrintColumn={addPrintColumn}
            onUpdatePrintColumnHeader={updatePrintColumnHeader}
            onRemovePrintColumn={removePrintColumn}
            selectedWarehouses={selectedWarehouses}
            missingRequiredKeys={
              effectiveValidateMode
                ? (missingRequiredPerArticle[article.id] ?? EMPTY_STRING_ARRAY)
                : EMPTY_STRING_ARRAY
            }
            isFirstMissingArticle={
              effectiveValidateMode && article.id === firstMissingArticleId
            }
            orderId={orderId}
            readOnly={readOnly && article.id !== editingArticleId}
            allowArticleActions={!readOnly}
            readOnlyQuantities={readOnly}
          />
        </div>
      ))}

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

