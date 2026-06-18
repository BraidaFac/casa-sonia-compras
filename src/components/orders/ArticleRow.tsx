"use client";
import React, { useRef, useState, useEffect, useCallback } from "react";
import { useQueryClient } from "@tanstack/react-query";
import {
  Combobox,
  InputBase,
  useCombobox,
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
  Modal,
  NumberInput,
  Stack,
  Text,
  TextInput,
  Tabs,
  Textarea,
  Tooltip,
} from "@mantine/core";
import {
  X,
  Plus,
  Sparkles,
  ToggleLeft,
  ToggleRight,
  EyeOff,
  Eye,
  ArrowDownToLine,
  Copy,
} from "lucide-react";
import { SizePickerModal } from "@/components/orders/SizePickerModal";
import { ArticleAttributes, REQUIRED_ATTR_FAMILIES, OPTIONAL_PRELOADED_NAMES } from "@/components/orders/ArticleAttributes";
import { useProducts } from "@/hooks/useProducts";
import { useAllAttributes } from "@/hooks/useAllAttributes";
import { useProductTypes } from "@/hooks/useProductTypes";
import { ColorProveedorCell } from "@/components/orders/ColorProveedorCell";
import { ColorBaseCell } from "@/components/orders/ColorBaseCell";
import type {
  Article,
  ArticleRow as ArticleRowType,
  Warehouse,
  ColorValue,
  SizeValue,
  SizeAttribute,
  OdooProduct,
  PrintColumn,
  ProductCategory,
  ProductImage,
} from "@/types";

const DEFAULT_COEF = parseFloat(
  process.env.NEXT_PUBLIC_DEFAULT_PRICE_COEFICIENTE || "2.2",
);

interface Props {
  article: Article;
  allColors: ColorValue[];
  colorBaseOptions: string[];
  sizeAttributes: SizeAttribute[];
  colorAttributeId: number;
  sizeAttributeId: number;
  categories: ProductCategory[];
  invalidColors?: string[];
  invalidSizes?: string[];
  printColumns: PrintColumn[];
  onAddPrintColumn: () => void;
  onUpdatePrintColumnHeader: (id: string, header: string) => void;
  onRemovePrintColumn: (id: string) => void;
  getPrintValue: (rowId: string, columnId: string) => string;
  onUpdatePrintValue: (rowId: string, columnId: string, value: string) => void;
  selectedWarehouses: Warehouse[];
  onChange: (article: Article) => void;
  onRemove: () => void;
  onDuplicate: () => void;
  onOpenSizeModal?: () => void;
  missingRequiredKeys?: string[];
  isFirstMissingArticle?: boolean;
}

const COLOR_COL = "__color__";
const DEFAULT_COLOR_W = 140;
const DEFAULT_SIZE_W = 52;
const PRINT_COL_W = 90;
const ADD_BTN_W = 32;

export function ArticleRow({
  article,
  allColors,
  colorBaseOptions,
  sizeAttributes,
  colorAttributeId,
  sizeAttributeId,
  categories,
  invalidColors = [],
  invalidSizes = [],
  printColumns,
  onAddPrintColumn,
  onUpdatePrintColumnHeader,
  onRemovePrintColumn,
  getPrintValue,
  onUpdatePrintValue,
  selectedWarehouses,
  onChange,
  onRemove,
  onDuplicate,
  onOpenSizeModal,
  missingRequiredKeys = [],
  isFirstMissingArticle = false,
}: Props) {
  const [debouncedNameQuery, setDebouncedNameQuery] = useState("");
  const [sizePickerOpen, setSizePickerOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("quantities");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const [uploadingColors, setUploadingColors] = useState<Set<string>>(new Set());
  const [focusedColor, setFocusedColor] = useState<string | null>(null);

  type PendingChange =
    | { type: "color"; rowId: string; newColor: ColorValue | null; oldColorName: string }
    | { type: "category"; newCategory: ProductCategory; previousCategory: ProductCategory | null };
  const [pendingChange, setPendingChange] = useState<PendingChange | null>(null);

  // Ref que siempre guarda la última categoría confirmada (no se borra al tipear)
  const lastConfirmedCategoryRef = useRef<ProductCategory | null>(article.category);
  useEffect(() => {
    if (article.category) {
      lastConfirmedCategoryRef.current = article.category;
    }
  }, [article.category]);

  const nameTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  // Auto-switch to attributes tab when this is the first article with missing required attrs
  const didAutoSwitchRef = useRef(false);
  useEffect(() => {
    if (isFirstMissingArticle && missingRequiredKeys.length > 0) {
      if (!didAutoSwitchRef.current) {
        didAutoSwitchRef.current = true;
        setActiveTab("attributes");
      }
    } else {
      didAutoSwitchRef.current = false;
    }
  }, [isFirstMissingArticle, missingRequiredKeys.length]);

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [hiddenPrintCols, setHiddenPrintCols] = useState<Set<string>>(
    new Set(),
  );
  const resizingRef = useRef<{
    col: string;
    startX: number;
    startWidth: number;
  } | null>(null);
  const tableRef = useRef<HTMLTableElement>(null);

  const queryClient = useQueryClient();
  const { data: products, isFetching: isFetchingProducts } =
    useProducts(debouncedNameQuery);
  const { data: allAttributes = [], refetch: refetchAttributes } = useAllAttributes();
  const { data: productTypes = [] } = useProductTypes();

  const handleRefreshAttributes = useCallback(async () => {
    await refetchAttributes();
    await queryClient.invalidateQueries({ queryKey: ["attribute-values"] });
    await queryClient.invalidateQueries({ queryKey: ["brands"] });
    await queryClient.invalidateQueries({ queryKey: ["compradora"] });
  }, [refetchAttributes, queryClient]);

  const nameCombobox = useCombobox({
    onDropdownClose: () => nameCombobox.resetSelectedOption(),
  });

  const categoryCombobox = useCombobox({
    onDropdownClose: () => categoryCombobox.resetSelectedOption(),
  });

  const [categorySearch, setCategorySearch] = useState(
    article.category?.name || "",
  );

  const normStr = (s: string) =>
    s
      .toLowerCase()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "");
  const filteredCategories = categories.filter((cat) => {
    const haystack = normStr(cat.completeName);
    const words = categorySearch.trim().split(/\s+/).filter(Boolean);
    return words.length === 0 || words.every((w) => haystack.includes(normStr(w)));
  });

  useEffect(() => {
    if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    nameTimerRef.current = setTimeout(
      () => setDebouncedNameQuery(article.name),
      300,
    );
    return () => {
      if (nameTimerRef.current) clearTimeout(nameTimerRef.current);
    };
  }, [article.name]);

  function getColWidth(key: string, def: number) {
    return colWidths[key] ?? def;
  }

  function startResize(e: React.MouseEvent, key: string, def: number) {
    e.preventDefault();
    resizingRef.current = {
      col: key,
      startX: e.clientX,
      startWidth: colWidths[key] ?? def,
    };

    function onMove(ev: MouseEvent) {
      const resizing = resizingRef.current;
      if (!resizing) return;
      const delta = ev.clientX - resizing.startX;
      const newW = Math.max(40, resizing.startWidth + delta);
      setColWidths((prev) => ({ ...prev, [resizing.col]: newW }));
    }
    function onUp() {
      resizingRef.current = null;
      document.removeEventListener("mousemove", onMove);
      document.removeEventListener("mouseup", onUp);
    }
    document.addEventListener("mousemove", onMove);
    document.addEventListener("mouseup", onUp);
  }

  function toggleHidePrintCol(id: string) {
    setHiddenPrintCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  async function handleSelectProduct(p: OdooProduct) {
    const newRows: ArticleRowType[] =
      p.colors.length > 0
        ? p.colors.map((color) => ({
            id: crypto.randomUUID(),
            color: allColors.find((c) => c.id === color.id) || {
              id: color.id,
              name: color.name,
              colorBase: "",
              hexColor: "",
              isNew: false,
            },
            quantities: Object.fromEntries(p.sizes.map((s) => [s.name, ""])),
            warehouseQuantities: {},
          }))
        : [
            {
              id: crypto.randomUUID(),
              color: null,
              quantities: Object.fromEntries(p.sizes.map((s) => [s.name, ""])),
              warehouseQuantities: {},
            },
          ];

    const baseAttributes = p.extraAttributes || [];
    const existingAttrIds = new Set(baseAttributes.map((a) => a.attributeId));
    const allPreloadedNames = [
      ...REQUIRED_ATTR_FAMILIES.flatMap((f) => f.names),
      ...OPTIONAL_PRELOADED_NAMES,
    ];
    const missingPreloaded = allAttributes.filter((a) => {
      const nameLower = a.name.toLowerCase();
      return (
        allPreloadedNames.some((n) => nameLower.includes(n)) &&
        !existingAttrIds.has(a.id)
      );
    });
    const mergedAttributes = [
      ...baseAttributes,
      ...missingPreloaded.map((a) => ({
        attributeId: a.id,
        attributeName: a.name,
        values: [],
        generatesVariants: false,
      })),
    ];

    const newArticle = {
      ...article,
      name: p.name,
      existingProductId: p.id,
      referencia: p.referencia || p.defaultCode || "",
      salePrice: p.listPrice ? String(p.listPrice) : "",
      maxCoeficiente: p.maxCoeficiente || 0,
      category: p.category || null,
      sizes: p.sizes,
      sizeAttributeId: p.sizeAttributeId ?? null,
      rows: newRows,
      attributes: mergedAttributes,
      colorImages: {},
      deletedOdooImageIds: [],
      clearedPrimaryColorNames: [],
    };

    onChange(newArticle);

    if (p.category) {
      setCategorySearch(p.category.name);
    }
    nameCombobox.closeDropdown();

    // Fetch variant images from Odoo asynchronously
    if (p.id) {
      try {
        const res = await fetch(`/api/products/${p.id}/images`);
        if (res.ok) {
          const colorImages = await res.json();
          if (Object.keys(colorImages).length > 0) {
            onChange({ ...newArticle, colorImages });
          }
        }
      } catch (err) {
        console.error("Error fetching product images:", err);
      }
    }
  }

  function updateRow(rowId: string, updates: Partial<ArticleRowType>) {
    onChange({
      ...article,
      rows: article.rows.map((r) =>
        r.id === rowId ? { ...r, ...updates } : r,
      ),
    });
  }

  function addRow() {
    onChange({
      ...article,
      rows: [
        ...article.rows,
        {
          id: crypto.randomUUID(),
          color: null,
          quantities: Object.fromEntries(
            article.sizes.map((s) => [s.name, ""]),
          ),
          warehouseQuantities: {},
        },
      ],
    });
  }

  function removeRow(rowId: string) {
    onChange({ ...article, rows: article.rows.filter((r) => r.id !== rowId) });
  }

  function removeSize(idx: number) {
    const sizeName = article.sizes[idx].name;
    const newSizes = article.sizes.filter((_, i) => i !== idx);
    const newRows = article.rows.map((r) => {
      const newQtys = { ...r.quantities };
      delete newQtys[sizeName];
      return { ...r, quantities: newQtys };
    });
    onChange({ ...article, sizes: newSizes, rows: newRows });
  }

  function handleSizeConfirm(newSizes: SizeValue[], newSizeAttributeId: number) {
    const existingIds = new Set(article.sizes.map((s) => s.id));
    const toAdd = newSizes.filter((s) => !existingIds.has(s.id));

    if (toAdd.length === 0) {
      onChange({ ...article, sizeAttributeId: newSizeAttributeId });
      setSizePickerOpen(false);
      return;
    }

    const updatedRows = article.rows.map((r) => ({
      ...r,
      quantities: {
        ...r.quantities,
        ...Object.fromEntries(toAdd.map((s) => [s.name, ""])),
      },
      warehouseQuantities: { ...(r.warehouseQuantities || {}) },
    }));

    onChange({
      ...article,
      sizes: [...article.sizes, ...toAdd],
      sizeAttributeId: newSizeAttributeId,
      rows: updatedRows,
    });

    setSizePickerOpen(false);
  }

  function updateQty(rowId: string, sizeName: string, val: string) {
    const row = article.rows.find((r) => r.id === rowId);
    if (!row) return;
    updateRow(rowId, { quantities: { ...row.quantities, [sizeName]: val } });
  }

  function getWarehouseQty(rowId: string, warehouseId: number, sizeName: string): string {
    const row = article.rows.find((r) => r.id === rowId);
    return row?.warehouseQuantities?.[`${warehouseId}:${sizeName}`] || "";
  }

  function updateWarehouseQty(rowId: string, warehouseId: number, sizeName: string, val: string) {
    const key = `${warehouseId}:${sizeName}`;
    onChange({
      ...article,
      rows: article.rows.map((r) =>
        r.id === rowId
          ? { ...r, warehouseQuantities: { ...r.warehouseQuantities, [key]: val } }
          : r,
      ),
    });
  }

  function handleSizeKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Escape") {
      e.currentTarget.blur();
      return;
    }
    if (e.key !== "Tab") return;

    const inputs = Array.from(
      tableRef.current?.querySelectorAll<HTMLInputElement>("[data-size-cell]") ?? [],
    );
    const currentIdx = inputs.indexOf(e.currentTarget);
    if (currentIdx === -1) return;

    const nextIdx = e.shiftKey ? currentIdx - 1 : currentIdx + 1;
    if (nextIdx < 0 || nextIdx >= inputs.length) return;

    e.preventDefault();
    inputs[nextIdx].focus();
    inputs[nextIdx].select();
  }

  const articleHasQty = article.rows.some((r) =>
    article.sizes.some((s) => parseInt(r.quantities[s.name] || "0", 10) > 0),
  );
  const missingGeneralPrice =
    !article.priceGranular && !article.price && articleHasQty;

  const allSizesHaveSpecificPrice =
    article.priceGranular &&
    article.sizes.length > 0 &&
    article.rows.every((row) =>
      article.sizes.every((size) => !!row.prices?.[size.name]),
    );

  const totalUnits = article.rows.reduce((sum, row) => {
    if (selectedWarehouses.length > 0) {
      return (
        sum +
        Object.values(row.warehouseQuantities || {}).reduce(
          (s, v) => s + (parseInt(v) || 0),
          0,
        )
      );
    }
    return (
      sum +
      article.sizes.reduce((s2, size) => {
        const qty = parseInt(row.quantities[size.name] || "0", 10);
        return s2 + (isNaN(qty) ? 0 : qty);
      }, 0)
    );
  }, 0);

  // Suggested price calculation
  const costo = parseFloat(article.price) || 0;
  const coef =
    article.maxCoeficiente > 0 ? article.maxCoeficiente : DEFAULT_COEF;
  const precioSugeridoNum = costo > 0 ? costo * coef : null;
  const precioSugerido = precioSugeridoNum
    ? precioSugeridoNum.toLocaleString("es-AR", {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2,
      })
    : null;

  async function handleGenerateDescription() {
    const brandAttr = article.attributes.find((attr) =>
      attr.attributeName.toLowerCase().includes("marca"),
    );
    const brand = brandAttr?.values?.[0]?.name || "";

    const colors = article.rows
      .map((r) => r.color?.name)
      .filter((c): c is string => !!c);

    setIsGenerating(true);
    setGenerateError(null);

    try {
      const res = await fetch("/api/description", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          productName: article.name,
          brand,
          colors,
          userHint: article.description,
        }),
      });

      if (!res.ok) {
        const err = await res.json();
        throw new Error(
          (err as { error?: string }).error || "Error generando descripción",
        );
      }

      const { description } = await res.json();
      onChange({ ...article, description });
    } catch (error) {
      setGenerateError(
        error instanceof Error ? error.message : "Error generando descripción",
      );
    } finally {
      setIsGenerating(false);
    }
  }

  function handleColorChange(rowId: string, newColor: ColorValue | null, oldColor: ColorValue | null) {
    const oldColorName = oldColor?.name;
    const hasImages = oldColorName
      ? (article.colorImages[oldColorName] || []).some((i) => !i.error && i.base64)
      : false;

    if (hasImages && oldColorName) {
      setPendingChange({ type: "color", rowId, newColor, oldColorName });
      return;
    }
    updateRow(rowId, { color: newColor });
  }

  function confirmPendingChange() {
    if (!pendingChange) return;

    if (pendingChange.type === "color") {
      const { rowId, newColor, oldColorName } = pendingChange;
      const oldImages = article.colorImages[oldColorName] || [];
      const newColorImages = { ...article.colorImages };
      delete newColorImages[oldColorName];

      const deletedOdooImageIds = [...(article.deletedOdooImageIds || [])];
      const clearedPrimaryColorNames = [...(article.clearedPrimaryColorNames || [])];

      for (const img of oldImages) {
        if (img.odooId) {
          deletedOdooImageIds.push(img.odooId);
        }
      }
      const primaryImg = oldImages[0];
      if (primaryImg?.isFromOdoo && !primaryImg.odooId && !clearedPrimaryColorNames.includes(oldColorName)) {
        clearedPrimaryColorNames.push(oldColorName);
      }

      onChange({
        ...article,
        colorImages: newColorImages,
        deletedOdooImageIds,
        clearedPrimaryColorNames,
        rows: article.rows.map((r) =>
          r.id === rowId ? { ...r, color: newColor } : r,
        ),
      });
    } else if (pendingChange.type === "category") {
      const { newCategory } = pendingChange;
      onChange({ ...article, category: newCategory, colorImages: {}, deletedOdooImageIds: [], clearedPrimaryColorNames: [] });
      setCategorySearch(newCategory.name);
    }

    setPendingChange(null);
  }

  function fileToBase64(file: File): Promise<string> {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        resolve(result.split(",")[1]);
      };
      reader.onerror = () => reject(new Error("Error leyendo archivo"));
      reader.readAsDataURL(file);
    });
  }

  async function handleImageUpload(colorName: string, files: FileList) {
    if (!files.length) return;

    setUploadingColors((prev) => new Set(prev).add(colorName));

    const newImages: ProductImage[] = [];
    const allowedTypes = ["image/jpeg", "image/png", "image/webp", "image/gif"];

    for (const file of Array.from(files)) {
      if (!allowedTypes.includes(file.type)) {
        newImages.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          base64: "",
          mimeType: file.type,
          previewUrl: "",
          error: "Tipo no permitido. Usar JPG, PNG, WEBP o GIF.",
        });
        continue;
      }

      if (file.size > 10 * 1024 * 1024) {
        newImages.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          base64: "",
          mimeType: file.type,
          previewUrl: "",
          error: "El archivo supera el límite de 10MB.",
        });
        continue;
      }

      try {
        const base64 = await fileToBase64(file);
        const previewUrl = `data:${file.type};base64,${base64}`;
        newImages.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          base64,
          mimeType: file.type,
          previewUrl,
        });
      } catch {
        newImages.push({
          id: crypto.randomUUID(),
          fileName: file.name,
          base64: "",
          mimeType: file.type,
          previewUrl: "",
          error: "Error procesando la imagen.",
        });
      }
    }

    const existingImages = article.colorImages[colorName] || [];
    onChange({
      ...article,
      colorImages: {
        ...article.colorImages,
        [colorName]: [...existingImages, ...newImages],
      },
    });

    setUploadingColors((prev) => {
      const next = new Set(prev);
      next.delete(colorName);
      return next;
    });
  }

  function handleRemoveImage(colorName: string, imageId: string) {
    const existing = article.colorImages[colorName] || [];
    const imgToRemove = existing.find((i) => i.id === imageId);
    const remaining = existing.filter((i) => i.id !== imageId);

    const deletedOdooImageIds = [...(article.deletedOdooImageIds || [])];
    const clearedPrimaryColorNames = [...(article.clearedPrimaryColorNames || [])];

    if (imgToRemove) {
      if (imgToRemove.odooId) {
        // Additional image from Odoo — unlink record on save
        deletedOdooImageIds.push(imgToRemove.odooId);
      } else if (imgToRemove.isFromOdoo && remaining.length === 0) {
        // Primary from Odoo, no replacements — clear image_variant_1920 on save
        if (!clearedPrimaryColorNames.includes(colorName)) {
          clearedPrimaryColorNames.push(colorName);
        }
      }
    }

    onChange({
      ...article,
      colorImages: {
        ...article.colorImages,
        [colorName]: remaining,
      },
      deletedOdooImageIds,
      clearedPrimaryColorNames,
    });
  }

  const cellStyle: React.CSSProperties = {
    border: "1px solid var(--border)",
    padding: "4px",
    background: "var(--surface)",
    textAlign: "center",
  };

  const headerCellStyle: React.CSSProperties = {
    ...cellStyle,
    background: "var(--surface3)",
    color: "var(--text2)",
    fontSize: 12,
    fontWeight: 600,
    padding: "4px 8px",
    position: "relative",
    userSelect: "none",
    overflow: "hidden",
  };

  const resizeHandle: React.CSSProperties = {
    position: "absolute",
    right: 0,
    top: 0,
    bottom: 0,
    width: 5,
    cursor: "col-resize",
    zIndex: 1,
  };

  const visibleSizes = article.sizes.filter(
    (size, idx, arr) => arr.findIndex((s) => s.id === size.id) === idx,
  );
  const visiblePrintColumns = printColumns.filter(
    (c) => !hiddenPrintCols.has(c.id),
  );
  const hiddenPrintColsList = printColumns.filter((c) =>
    hiddenPrintCols.has(c.id),
  );
  const filteredProducts = products ?? [];

  // Sticky left offsets — computed from visible print cols and current colWidths
  const printColLeftOffsets = visiblePrintColumns.map(
    (_, idx) =>
      ADD_BTN_W +
      visiblePrintColumns
        .slice(0, idx)
        .reduce((sum, c) => sum + getColWidth(c.id, PRINT_COL_W), 0),
  );
  const colorStickyLeft =
    ADD_BTN_W +
    visiblePrintColumns.reduce(
      (sum, c) => sum + getColWidth(c.id, PRINT_COL_W),
      0,
    );

  const pendingColorImages =
    pendingChange?.type === "color"
      ? (article.colorImages[pendingChange.oldColorName] || []).filter(
          (i) => !i.error && i.base64,
        )
      : [];
  const pendingAllImages =
    pendingChange?.type === "category"
      ? Object.values(article.colorImages)
          .flat()
          .filter((i) => !i.error && i.base64)
      : [];

  return (
    <>
    <Modal
      opened={pendingChange !== null}
      onClose={() => {
        if (pendingChange?.type === "category") {
          onChange({ ...article, category: pendingChange.previousCategory });
          setCategorySearch(pendingChange.previousCategory?.name || "");
        }
        setPendingChange(null);
      }}
      title={
        pendingChange?.type === "color"
          ? `Cambiar color "${pendingChange.oldColorName}"`
          : "Cambiar categoría"
      }
      size="sm"
      centered
    >
      <Stack gap="md">
        <Text size="sm">
          {pendingChange?.type === "color" ? (
            <>
              El color <strong>{pendingChange.oldColorName}</strong> tiene{" "}
              <strong>{pendingColorImages.length}</strong> imagen
              {pendingColorImages.length !== 1 ? "es" : ""} cargada
              {pendingColorImages.length !== 1 ? "s" : ""}. Si cambiás el
              color, se eliminarán.
            </>
          ) : (
            <>
              Hay <strong>{pendingAllImages.length}</strong> imagen
              {pendingAllImages.length !== 1 ? "es" : ""} cargada
              {pendingAllImages.length !== 1 ? "s" : ""} en{" "}
              <strong>
                {Object.keys(article.colorImages).filter(
                  (k) =>
                    article.colorImages[k].some((i) => !i.error && i.base64),
                ).length}
              </strong>{" "}
              color
              {Object.keys(article.colorImages).filter((k) =>
                article.colorImages[k].some((i) => !i.error && i.base64),
              ).length !== 1
                ? "es"
                : ""}
              . Al cambiar la categoría se eliminarán.
            </>
          )}
        </Text>
        <Group justify="flex-end" gap="sm">
          <Button
            variant="subtle"
            color="gray"
            onClick={() => {
              if (pendingChange?.type === "category") {
                setCategorySearch(article.category?.name || "");
              }
              setPendingChange(null);
            }}
          >
            Cancelar
          </Button>
          <Button color="red" onClick={confirmPendingChange}>
            Eliminar y continuar
          </Button>
        </Group>
      </Stack>
    </Modal>

    <div
      style={{
        background: "var(--surface)",
        border: "1px solid var(--border)",
        borderRadius: 8,
        padding: 16,
        paddingTop: 28,
        marginBottom: 12,
        position: "relative",
      }}
    >
      {/* Duplicate & Remove — top-right corner */}
      <div
        style={{
          position: "absolute",
          top: 6,
          right: 8,
          display: "flex",
          gap: 4,
        }}
      >
        <Tooltip label="Duplicar artículo (sin nombre ni código)" withArrow>
          <ActionIcon
            variant="subtle"
            color="gray"
            onClick={onDuplicate}
            title="Duplicar artículo"
            size="sm"
          >
            <Copy size={14} />
          </ActionIcon>
        </Tooltip>
        <ActionIcon
          variant="subtle"
          color="gray"
          onClick={onRemove}
          title="Eliminar artículo"
          size="sm"
        >
          <X size={14} />
        </ActionIcon>
      </div>

      {/* Article header — always visible */}
      <div
        style={{
          display: "flex",
          alignItems: "flex-end",
          gap: 12,
          marginBottom: 12,
          flexWrap: "wrap",
        }}
      >
        {/* Product name autocomplete */}
        <div
          style={{
            flex: 1,
            minWidth: 200,
            position: "relative",
            paddingTop: article.name ? 20 : 0,
          }}
        >
          {article.name && !article.existingProductId && (
            <Badge
              color="teal"
              variant="light"
              size="xs"
              style={{ position: "absolute", top: -10, left: 0 }}
            >
              Artículo nuevo
            </Badge>
          )}
          {article.existingProductId && (
            <Badge
              color="blue"
              variant="light"
              size="xs"
              style={{ position: "absolute", top: -10, left: 0 }}
            >
              Existente en Odoo
            </Badge>
          )}
          <Combobox
            store={nameCombobox}
            onOptionSubmit={(val) => {
              if (val === "__new__") {
                nameCombobox.closeDropdown();
                return;
              }
              const p = filteredProducts.find((p) => String(p.id) === val);
              if (p) handleSelectProduct(p as OdooProduct);
            }}
            withinPortal
          >
            <Combobox.Target>
              <TextInput
                label="Nombre del artículo"
                value={article.name}
                placeholder="Nombre del artículo..."
                size="xs"
                style={{ width: "100%" }}
                styles={{ input: { fontWeight: 600 } }}
                rightSection={
                  isFetchingProducts ? <Loader size="xs" color="amber" /> : null
                }
                onChange={(e) => {
                  const raw = e.currentTarget.value;
                  const name = raw.replace(/\b\w/g, (c) => c.toUpperCase());
                  onChange({
                    ...article,
                    name,
                    existingProductId: null,
                  });
                  nameCombobox.openDropdown();
                }}
                onFocus={() => {
                  if (article.name) nameCombobox.openDropdown();
                }}
                onBlur={() => nameCombobox.closeDropdown()}
                onKeyDown={(e) => {
                  if (!nameCombobox.dropdownOpened) return;
                  if (e.key === "Tab") {
                    const totalOpts =
                      filteredProducts.length + (article.name.trim() ? 1 : 0);
                    if (totalOpts > 0) {
                      e.preventDefault();
                      nameCombobox.selectNextOption();
                    }
                  } else if (
                    e.key === "Enter" &&
                    filteredProducts.length === 1
                  ) {
                    e.preventDefault();
                    handleSelectProduct(filteredProducts[0] as OdooProduct);
                  }
                }}
              />
            </Combobox.Target>
            <Combobox.Dropdown>
              <Combobox.Options
                mah={200}
                style={{ overflowY: "auto", overscrollBehavior: "contain" }}
              >
                {filteredProducts.map((p) => (
                  <Combobox.Option key={p.id} value={String(p.id)}>
                    <div>
                      <span style={{ fontWeight: 600 }}>{p.name}</span>
                      {(p as OdooProduct).referencia && (
                        <span
                          style={{
                            color: "var(--text3)",
                            fontSize: 11,
                            marginLeft: 6,
                          }}
                        >
                          {(p as OdooProduct).referencia}
                        </span>
                      )}
                    </div>
                    {(p.colors.length > 0 || p.sizes.length > 0) && (
                      <span style={{ color: "var(--text3)", fontSize: 11 }}>
                        {p.colors.length} colores · {p.sizes.length} talles
                      </span>
                    )}
                  </Combobox.Option>
                ))}
                {article.name.trim() && !isFetchingProducts && (
                  <Combobox.Option
                    value="__new__"
                    style={{
                      borderTop:
                        filteredProducts.length > 0
                          ? "1px solid var(--border)"
                          : undefined,
                      color: "var(--mantine-color-teal-6)",
                      fontWeight: 600,
                      fontSize: 13,
                    }}
                  >
                    + Crear &ldquo;{article.name}&rdquo; como artículo nuevo
                  </Combobox.Option>
                )}
              </Combobox.Options>
            </Combobox.Dropdown>
          </Combobox>
        </div>

        {/* Código Referencia */}
        <TextInput
          label="Cód. Referencia"
          placeholder="Ej: HO15100CS"
          size="xs"
          w={140}
          value={article.referencia}
          onChange={(e) =>
            onChange({ ...article, referencia: e.currentTarget.value })
          }
        />

        {/* Categoría */}
        <Combobox
          store={categoryCombobox}
          onOptionSubmit={(val) => {
            const cat = filteredCategories.find((c) => String(c.id) === val);
            if (cat) {
              const isSameCategory = cat.id === article.category?.id;
              const hasImages = Object.values(article.colorImages).some(
                (imgs) => imgs.some((i) => !i.error && i.base64),
              );
              if (!isSameCategory && hasImages) {
                setPendingChange({
                  type: "category",
                  newCategory: cat,
                  previousCategory: lastConfirmedCategoryRef.current,
                });
              } else {
                onChange({ ...article, category: cat });
                setCategorySearch(cat.name);
              }
            }
            categoryCombobox.closeDropdown();
          }}
          withinPortal
        >
          <Combobox.Target>
            <Tooltip
              label={article.category?.completeName}
              disabled={!article.category}
              withArrow
              position="top"
            >
              <TextInput
                label="Categoría"
                placeholder="Buscar categoría..."
                size="xs"
                w={220}
                value={categorySearch}
                error={articleHasQty && !article.category}
                onChange={(e) => {
                  setCategorySearch(e.currentTarget.value);
                  if (
                    article.category &&
                    e.currentTarget.value !== article.category.name
                  ) {
                    onChange({ ...article, category: null });
                  }
                  categoryCombobox.openDropdown();
                }}
                onFocus={() => categoryCombobox.openDropdown()}
                onKeyDown={(e) => {
                  if (!categoryCombobox.dropdownOpened) return;
                  if ((e.key === "Tab" || e.key === "ArrowDown") && filteredCategories.length > 0) {
                    e.preventDefault();
                    categoryCombobox.selectNextOption();
                  } else if (e.key === "ArrowUp" && filteredCategories.length > 0) {
                    e.preventDefault();
                    categoryCombobox.selectPreviousOption();
                  } else if (e.key === "Enter" && filteredCategories.length > 0) {
                    e.preventDefault();
                    if (filteredCategories.length === 1) {
                      const cat = filteredCategories[0];
                      const isSameCategory = cat.id === article.category?.id;
                      const hasImages = Object.values(article.colorImages).some(
                        (imgs) => imgs.some((i) => !i.error && i.base64),
                      );
                      if (!isSameCategory && hasImages) {
                        setPendingChange({
                          type: "category",
                          newCategory: cat,
                          previousCategory: lastConfirmedCategoryRef.current,
                        });
                      } else {
                        onChange({ ...article, category: cat });
                        setCategorySearch(cat.name);
                      }
                      categoryCombobox.closeDropdown();
                    } else {
                      categoryCombobox.clickSelectedOption();
                    }
                  }
                }}
                onBlur={() => {
                  categoryCombobox.closeDropdown();
                  if (!article.category) {
                    setCategorySearch("");
                  } else {
                    setCategorySearch(article.category.name);
                  }
                }}
              />
            </Tooltip>
          </Combobox.Target>
          <Combobox.Dropdown style={{ minWidth: 320 }}>
            <Combobox.Options mah={240} style={{ overflowY: "auto" }}>
              {filteredCategories.length > 0 ? (
                filteredCategories.map((cat) => (
                  <Combobox.Option key={cat.id} value={String(cat.id)}>
                    <div>
                      <span style={{ fontWeight: 600, fontSize: 13 }}>
                        {cat.name}
                      </span>
                      {cat.completeName !== cat.name && (
                        <div style={{ color: "var(--text3)", fontSize: 11 }}>
                          {cat.completeName}
                        </div>
                      )}
                    </div>
                  </Combobox.Option>
                ))
              ) : (
                <Combobox.Empty>Sin resultados</Combobox.Empty>
              )}
            </Combobox.Options>
          </Combobox.Dropdown>
        </Combobox>

        {/* Costo Neto */}
        <NumberInput
          label="Costo Neto $"
          size="xs"
          min={0}
          value={article.price === "" ? "" : Number(article.price)}
          disabled={allSizesHaveSpecificPrice}
          onChange={(val) => onChange({ ...article, price: String(val) })}
          error={missingGeneralPrice}
          hideControls
          thousandSeparator="."
          decimalSeparator=","
          w={120}
          styles={{
            label: {
              fontSize: 12,
              color: allSizesHaveSpecificPrice
                ? "var(--text3)"
                : "var(--text2)",
            },
          }}
        />

        {/* Granular toggle */}
        <Tooltip label="Costo Neto granular por variante" withArrow>
          <ActionIcon
            variant={article.priceGranular ? "filled" : "subtle"}
            color={article.priceGranular ? "amber" : "gray"}
            onClick={() =>
              onChange({ ...article, priceGranular: !article.priceGranular })
            }
            size="md"
            style={{ alignSelf: "flex-end", marginBottom: 2 }}
          >
            {article.priceGranular ? (
              <ToggleRight size={16} />
            ) : (
              <ToggleLeft size={16} />
            )}
          </ActionIcon>
        </Tooltip>

        {/* Precio Venta + apply suggested */}
        <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
          <NumberInput
            label="Precio Venta $"
            placeholder={
              precioSugerido ? `Sugerido: $${precioSugerido}` : "0,00"
            }
            size="xs"
            min={0}
            error={articleHasQty && !article.salePrice}
            value={article.salePrice === "" ? "" : Number(article.salePrice)}
            onChange={(val) => onChange({ ...article, salePrice: String(val) })}
            description={
              precioSugerido && !article.salePrice
                ? `Sugerido: $${precioSugerido} (× ${coef})`
                : precioSugerido
                  ? `Sugerido: $${precioSugerido}`
                  : undefined
            }
            hideControls
            thousandSeparator="."
            decimalSeparator=","
            w={140}
          />
          {precioSugeridoNum && (
            <Tooltip label={`Aplicar sugerido $${precioSugerido}`} withArrow>
              <ActionIcon
                variant="subtle"
                color="amber"
                size="md"
                style={{ marginBottom: 0 }}
                onClick={() =>
                  onChange({
                    ...article,
                    salePrice: String(precioSugeridoNum.toFixed(2)),
                  })
                }
              >
                <ArrowDownToLine size={13} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>

        {/* Total badge */}
        {totalUnits > 0 && (
          <Badge
            color="amber"
            variant="light"
            style={{ alignSelf: "flex-end", marginBottom: 4 }}
          >
            {totalUnits} u.
          </Badge>
        )}
      </div>

      {/* TABS */}
      <Tabs value={activeTab} onChange={setActiveTab} defaultValue="quantities">
        <Tabs.List>
          <Tabs.Tab value="quantities">Cantidades</Tabs.Tab>
          <Tabs.Tab value="attributes">Atributos</Tabs.Tab>
          <Tabs.Tab value="description">Datos Web</Tabs.Tab>
        </Tabs.List>

        {/* Cantidades tab */}
        <Tabs.Panel value="quantities" pt="sm">
          {/* Hidden print cols chips */}
          {hiddenPrintColsList.length > 0 && (
            <div
              style={{
                display: "flex",
                gap: 4,
                marginBottom: 8,
                flexWrap: "wrap",
              }}
            >
              <span
                style={{
                  fontSize: 11,
                  color: "var(--text3)",
                  alignSelf: "center",
                }}
              >
                Col. PDF ocultas:
              </span>
              {hiddenPrintColsList.map((col) => (
                <button
                  key={col.id}
                  type="button"
                  onClick={() => toggleHidePrintCol(col.id)}
                  title="Mostrar columna"
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 3,
                    background: "var(--surface2)",
                    border: "1px solid var(--border)",
                    color: "var(--text3)",
                    borderRadius: 4,
                    padding: "2px 7px",
                    fontSize: 11,
                    cursor: "pointer",
                  }}
                >
                  <Eye size={10} />
                  {col.header || "—"}
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          <div style={{ overflowX: "auto" }}>
            <table
              ref={tableRef}
              style={{
                borderCollapse: "collapse",
                tableLayout: "fixed",
                fontSize: 13,
              }}
            >
              <colgroup>
                <col style={{ width: ADD_BTN_W }} />
                {visiblePrintColumns.map((col) => (
                  <col
                    key={col.id}
                    style={{ width: getColWidth(col.id, PRINT_COL_W) }}
                  />
                ))}
                <col
                  style={{ width: getColWidth(COLOR_COL, DEFAULT_COLOR_W) }}
                />
                <col style={{ width: getColWidth("__color_base__", 110) }} />
                {selectedWarehouses.length > 0 && (
                  <col style={{ width: 90 }} />
                )}
                {visibleSizes.map((size) => (
                  <col
                    key={size.id}
                    style={{ width: getColWidth(size.name, DEFAULT_SIZE_W) }}
                  />
                ))}
                <col style={{ width: 60 }} />
              </colgroup>
              <thead>
                <tr>
                  {/* + columna de impresión */}
                  <th
                    style={{
                      ...headerCellStyle,
                      width: ADD_BTN_W,
                      padding: "4px",
                      position: "sticky",
                      left: 0,
                      zIndex: 4,
                      background: "var(--surface3)",
                    }}
                  >
                    <Tooltip
                      label="Agregar columna de impresión"
                      withArrow
                      position="right"
                    >
                      <ActionIcon
                        variant="subtle"
                        color="gray"
                        size="xs"
                        tabIndex={-1}
                        onClick={onAddPrintColumn}
                      >
                        <Plus size={12} />
                      </ActionIcon>
                    </Tooltip>
                  </th>

                  {/* Columnas de impresión */}
                  {visiblePrintColumns.map((col, colIdx) => (
                    <th
                      key={col.id}
                      style={{
                        ...headerCellStyle,
                        position: "sticky",
                        left: printColLeftOffsets[colIdx],
                        zIndex: 3 + (visiblePrintColumns.length - colIdx),
                        background: "var(--surface3)",
                      }}
                    >
                      <div
                        style={{
                          display: "flex",
                          alignItems: "center",
                          gap: 2,
                          paddingRight: 2,
                        }}
                      >
                        <input
                          type="text"
                          value={col.header}
                          placeholder="Título..."
                          onChange={(e) =>
                            onUpdatePrintColumnHeader(col.id, e.target.value)
                          }
                          style={{
                            flex: 1,
                            minWidth: 0,
                            background: "transparent",
                            border: "none",
                            color: "var(--text)",
                            outline: "none",
                            fontSize: 12,
                            textAlign: "center",
                          }}
                        />
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size={14}
                          tabIndex={-1}
                          title="Ocultar columna"
                          onClick={() => toggleHidePrintCol(col.id)}
                          style={{ padding: 0, flexShrink: 0 }}
                        >
                          <EyeOff size={10} />
                        </ActionIcon>
                        <ActionIcon
                          variant="subtle"
                          color="red"
                          size={14}
                          tabIndex={-1}
                          title="Eliminar columna"
                          onClick={() => onRemovePrintColumn(col.id)}
                          style={{ padding: 0, flexShrink: 0 }}
                        >
                          <X size={10} />
                        </ActionIcon>
                      </div>
                    </th>
                  ))}

                  {/* Color Proveedor */}
                  <th
                    style={{
                      ...headerCellStyle,
                      textAlign: "left",
                      position: "sticky",
                      left: colorStickyLeft,
                      zIndex: 3,
                      background: "var(--surface3)",
                    }}
                  >
                    Color Proveedor
                    <div
                      style={resizeHandle}
                      onMouseDown={(e) =>
                        startResize(e, COLOR_COL, DEFAULT_COLOR_W)
                      }
                    />
                  </th>

                  {/* Color Base */}
                  <th style={{ ...headerCellStyle, minWidth: 110 }}>
                    Color Base
                    <div
                      style={resizeHandle}
                      onMouseDown={(e) =>
                        startResize(e, "__color_base__", 110)
                      }
                    />
                  </th>

                  {/* Sucursal — solo cuando hay sucursales seleccionadas */}
                  {selectedWarehouses.length > 0 && (
                    <th style={{ ...headerCellStyle, minWidth: 90 }}>
                      Sucursal
                    </th>
                  )}

                  {visibleSizes.map((size) => {
                    const realIdx = article.sizes.findIndex(
                      (s) => s.id === size.id,
                    );
                    const isInvalid = invalidSizes.includes(size.name);
                    return (
                      <th
                        key={size.id}
                        style={{
                          ...headerCellStyle,
                          ...(isInvalid
                            ? {
                                background: "rgba(239,68,68,0.15)",
                                color: "var(--red)",
                                border: "1px solid var(--red)",
                              }
                            : {}),
                        }}
                      >
                        <ActionIcon
                          variant="subtle"
                          color="gray"
                          size={14}
                          title="Eliminar talle"
                          onClick={() => removeSize(realIdx)}
                          style={{ position: "absolute", top: 2, right: 2 }}
                        >
                          <X size={10} />
                        </ActionIcon>
                        <div
                          style={{
                            display: "flex",
                            flexDirection: "column",
                            alignItems: "center",
                            gap: 1,
                          }}
                        >
                          <span style={{ fontWeight: 600, fontSize: 12 }}>{size.name}</span>
                          {size.equivalencia && (
                            <span style={{ fontSize: 10, color: "var(--text3)", fontWeight: 400 }}>
                              {size.equivalencia}
                            </span>
                          )}
                        </div>
                        <div
                          style={resizeHandle}
                          onMouseDown={(e) =>
                            startResize(e, size.name, DEFAULT_SIZE_W)
                          }
                        />
                      </th>
                    );
                  })}

                  <th style={headerCellStyle}>
                    <button
                      type="button"
                      onClick={() => {
                        onOpenSizeModal?.();
                        setSizePickerOpen(true);
                      }}
                      style={{
                        background: "none",
                        border: "1px dashed var(--border2)",
                        color: "var(--text3)",
                        cursor: "pointer",
                        padding: "2px 6px",
                        borderRadius: 4,
                        fontSize: 11,
                        whiteSpace: "nowrap",
                      }}
                    >
                      + talle
                    </button>
                  </th>
                </tr>
              </thead>
              <tbody>
                {article.rows.map((row) => {
                  const isColorInvalid =
                    row.color !== null &&
                    invalidColors.includes(row.color.name);
                  const hasQty = article.sizes.some(
                    (s) => parseInt(row.quantities[s.name] || "0", 10) > 0,
                  );

                  if (selectedWarehouses.length === 0) {
                    // ── Original single-row mode ────────────────────────────
                    return (
                      <tr key={row.id}>
                        {/* Celda bajo botón + */}
                        <td
                          style={{
                            ...cellStyle,
                            position: "sticky",
                            left: 0,
                            zIndex: 2,
                            background: "var(--surface)",
                          }}
                        />

                        {/* Celdas de columnas de impresión */}
                        {visiblePrintColumns.map((col, colIdx) => (
                          <td
                            key={col.id}
                            style={{
                              ...cellStyle,
                              position: "sticky",
                              left: printColLeftOffsets[colIdx],
                              zIndex: 1,
                              background: "var(--surface)",
                            }}
                          >
                            <input
                              type="text"
                              value={getPrintValue(row.id, col.id)}
                              onChange={(e) =>
                                onUpdatePrintValue(row.id, col.id, e.target.value)
                              }
                              style={{
                                width: "100%",
                                background: "transparent",
                                border: "none",
                                color: "var(--text)",
                                outline: "none",
                                textAlign: "center",
                                fontSize: 12,
                                padding: "2px",
                              }}
                            />
                          </td>
                        ))}

                        {/* Color Proveedor */}
                        <td
                          style={{
                            ...cellStyle,
                            textAlign: "left",
                            padding: "4px 8px",
                            overflow: "hidden",
                            maxWidth: 0,
                            position: "sticky",
                            left: colorStickyLeft,
                            zIndex: 1,
                            background: "var(--surface)",
                          }}
                        >
                          <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                            <div style={{ flex: 1, minWidth: 0 }}>
                              <ColorProveedorCell
                                value={row.color}
                                allColors={allColors}
                                colorBaseOptions={colorBaseOptions}
                                hasQty={hasQty}
                                usedColorKeys={new Set(article.rows.filter((r) => r.id !== row.id && r.color).map((r) => r.color!.id != null ? String(r.color!.id) : r.color!.name.toLowerCase()))}
                                onChange={(v) => handleColorChange(row.id, v, row.color)}
                              />
                            </div>
                            <ActionIcon
                              variant="subtle"
                              color="gray"
                              size="xs"
                              tabIndex={-1}
                              onClick={() => removeRow(row.id)}
                              style={{ flexShrink: 0, marginTop: 2 }}
                            >
                              <X size={12} />
                            </ActionIcon>
                          </div>
                        </td>

                        {/* Color Base */}
                        <td style={{ ...cellStyle, padding: 0 }}>
                          <ColorBaseCell
                            color={row.color}
                            colorBaseOptions={colorBaseOptions}
                            onChange={(updatedColor) => updateRow(row.id, { color: updatedColor })}
                          />
                        </td>

                        {visibleSizes.map((size) => (
                          <td key={size.id} style={cellStyle}>
                            <input
                              type="number"
                              min={0}
                              data-size-cell
                              value={row.quantities[size.name] ?? ""}
                              onChange={(e) =>
                                updateQty(row.id, size.name, e.target.value)
                              }
                              onKeyDown={handleSizeKeyDown}
                              style={{
                                width: "100%",
                                background: "transparent",
                                border: "none",
                                color: "var(--text)",
                                outline: "none",
                                textAlign: "center",
                                fontSize: 13,
                                padding: "2px",
                              }}
                            />
                            {article.priceGranular &&
                              (() => {
                                const hasSpecific = !!row.prices?.[size.name];
                                const hasFallback = !!article.price;
                                const missing = !hasSpecific && !hasFallback;
                                return (
                                  <input
                                    type="number"
                                    min={0}
                                    placeholder={missing ? "$ falta" : "$"}
                                    value={row.prices?.[size.name] ?? ""}
                                    onChange={(e) => {
                                      const newPrices = {
                                        ...(row.prices || {}),
                                        [size.name]: e.target.value,
                                      };
                                      updateRow(row.id, { prices: newPrices });
                                    }}
                                    style={{
                                      width: "100%",
                                      background: missing ? "rgba(239,68,68,0.12)" : "transparent",
                                      border: "none",
                                      borderTop: `1px solid ${missing ? "var(--red)" : "var(--border)"}`,
                                      color: missing ? "var(--red)" : "var(--text2)",
                                      outline: "none",
                                      textAlign: "center",
                                      fontSize: 11,
                                      padding: "2px",
                                    }}
                                  />
                                );
                              })()}
                          </td>
                        ))}
                        <td style={cellStyle} />
                      </tr>
                    );
                  }

                  // ── Warehouse subrow mode ───────────────────────────────────
                  return (
                    <React.Fragment key={row.id}>
                      {selectedWarehouses.map((warehouse, wIdx) => (
                        <tr key={`${row.id}:${warehouse.id}`}>
                          {/* Celda bajo botón + — solo primera subfila */}
                          {wIdx === 0 && (
                            <td
                              rowSpan={selectedWarehouses.length}
                              style={{
                                ...cellStyle,
                                position: "sticky",
                                left: 0,
                                zIndex: 2,
                                background: "var(--surface)",
                                borderTop: "2px solid var(--border2)",
                              }}
                            />
                          )}

                          {/* Columnas de impresión — solo primera subfila */}
                          {wIdx === 0 &&
                            visiblePrintColumns.map((col, colIdx) => (
                              <td
                                key={col.id}
                                rowSpan={selectedWarehouses.length}
                                style={{
                                  ...cellStyle,
                                  position: "sticky",
                                  left: printColLeftOffsets[colIdx],
                                  zIndex: 1,
                                  background: "var(--surface)",
                                  borderTop: "2px solid var(--border2)",
                                }}
                              >
                                <input
                                  type="text"
                                  value={getPrintValue(row.id, col.id)}
                                  onChange={(e) =>
                                    onUpdatePrintValue(row.id, col.id, e.target.value)
                                  }
                                  style={{
                                    width: "100%",
                                    background: "transparent",
                                    border: "none",
                                    color: "var(--text)",
                                    outline: "none",
                                    textAlign: "center",
                                    fontSize: 12,
                                    padding: "2px",
                                  }}
                                />
                              </td>
                            ))}

                          {/* Color Proveedor — solo primera subfila con rowSpan */}
                          {wIdx === 0 && (
                            <td
                              rowSpan={selectedWarehouses.length}
                              style={{
                                ...cellStyle,
                                textAlign: "left",
                                padding: "4px 8px",
                                overflow: "hidden",
                                maxWidth: 0,
                                position: "sticky",
                                left: colorStickyLeft,
                                zIndex: 1,
                                background: "var(--surface)",
                                borderTop: "2px solid var(--border2)",
                              }}
                            >
                              <div style={{ display: "flex", alignItems: "flex-start", gap: 6 }}>
                                <div style={{ flex: 1, minWidth: 0 }}>
                                  <ColorProveedorCell
                                    value={row.color}
                                    allColors={allColors}
                                    colorBaseOptions={colorBaseOptions}
                                    hasQty={hasQty}
                                    usedColorKeys={new Set(article.rows.filter((r) => r.id !== row.id && r.color).map((r) => r.color!.id != null ? String(r.color!.id) : r.color!.name.toLowerCase()))}
                                    onChange={(v) => handleColorChange(row.id, v, row.color)}
                                  />
                                </div>
                                <ActionIcon
                                  variant="subtle"
                                  color="gray"
                                  size="xs"
                                  tabIndex={-1}
                                  onClick={() => removeRow(row.id)}
                                  style={{ flexShrink: 0, marginTop: 2 }}
                                >
                                  <X size={12} />
                                </ActionIcon>
                              </div>
                            </td>
                          )}

                          {/* Color Base — solo primera subfila con rowSpan */}
                          {wIdx === 0 && (
                            <td
                              rowSpan={selectedWarehouses.length}
                              style={{
                                ...cellStyle,
                                padding: 0,
                                borderTop: "2px solid var(--border2)",
                              }}
                            >
                              <ColorBaseCell
                            color={row.color}
                            colorBaseOptions={colorBaseOptions}
                            onChange={(updatedColor) => updateRow(row.id, { color: updatedColor })}
                          />
                            </td>
                          )}

                          {/* Sucursal */}
                          <td
                            style={{
                              ...cellStyle,
                              fontSize: 12,
                              color: "var(--text2)",
                              padding: "4px 8px",
                              whiteSpace: "nowrap",
                              borderTop: wIdx === 0 ? "2px solid var(--border2)" : undefined,
                            }}
                          >
                            {warehouse.name}
                          </td>

                          {/* Cantidades por talle */}
                          {visibleSizes.map((size) => (
                            <td
                              key={size.id}
                              style={{
                                ...cellStyle,
                                borderTop: wIdx === 0 ? "2px solid var(--border2)" : undefined,
                              }}
                            >
                              <input
                                type="number"
                                min={0}
                                data-size-cell
                                value={getWarehouseQty(row.id, warehouse.id, size.name)}
                                onChange={(e) =>
                                  updateWarehouseQty(row.id, warehouse.id, size.name, e.target.value)
                                }
                                onKeyDown={handleSizeKeyDown}
                                style={{
                                  width: "100%",
                                  background: "transparent",
                                  border: "none",
                                  color: "var(--text)",
                                  outline: "none",
                                  textAlign: "center",
                                  fontSize: 13,
                                  padding: "2px",
                                }}
                              />
                            </td>
                          ))}

                          <td
                            style={{
                              ...cellStyle,
                              borderTop: wIdx === 0 ? "2px solid var(--border2)" : undefined,
                            }}
                          />
                        </tr>
                      ))}
                    </React.Fragment>
                  );
                })}
              </tbody>
            </table>
          </div>

          {/* Add row */}
          <Button
            variant="subtle"
            color="gray"
            size="xs"
            leftSection={<Plus size={12} />}
            mt="xs"
            onClick={addRow}
            style={{ border: "1px dashed var(--border2)" }}
          >
            color
          </Button>

          <SizePickerModal
            opened={sizePickerOpen}
            onClose={() => setSizePickerOpen(false)}
            sizeAttributes={sizeAttributes}
            currentSizes={article.sizes}
            currentSizeAttributeId={article.sizeAttributeId}
            onConfirm={handleSizeConfirm}
          />
        </Tabs.Panel>

        {/* Atributos tab */}
        <Tabs.Panel value="attributes" pt="sm">
          <ArticleAttributes
            article={article}
            colorAttributeId={colorAttributeId}
            sizeAttributeId={sizeAttributeId}
            allAttributes={allAttributes}
            productTypes={productTypes}
            onChangeTab={setActiveTab}
            onChange={onChange}
            missingRequiredKeys={missingRequiredKeys}
            onRefreshAttributes={handleRefreshAttributes}
          />
        </Tabs.Panel>

        {/* Datos Web tab */}
        <Tabs.Panel value="description" pt="sm">
          <Stack gap="md">

            {/* ── SECCIÓN IMÁGENES ── */}
            <div>
              <Text size="sm" fw={600} mb="xs" c="var(--text2)">
                Imágenes por color
              </Text>

              {!article.category ? (
                <Text size="xs" c="dimmed">
                  Ingresá la categoría del artículo antes de subir imágenes.
                </Text>
              ) : !article.referencia ? (
                <Text size="xs" c="dimmed">
                  Ingresá el código de referencia antes de subir imágenes.
                </Text>
              ) : article.rows.filter((r) => r.color).length === 0 ? (
                <Text size="xs" c="dimmed">
                  Cargá colores en el tab Cantidades para poder subir imágenes.
                </Text>
              ) : (
                <Stack gap="sm">
                  {Array.from(
                    new Map(
                      article.rows
                        .filter((r) => r.color)
                        .map((r) => [r.color!.name, r.color!]),
                    ).values(),
                  ).map((color) => {
                    const images = article.colorImages[color.name] || [];
                    const isUploading = uploadingColors.has(color.name);

                    return (
                      <div
                        key={color.name}
                        tabIndex={0}
                        onFocus={() => setFocusedColor(color.name)}
                        onBlur={() => setFocusedColor(null)}
                        onPaste={(e) => {
                          if (isUploading) return;
                          const items = Array.from(e.clipboardData.items);
                          const imageFiles = items
                            .filter((item) => item.type.startsWith("image/"))
                            .map((item) => item.getAsFile())
                            .filter((f): f is File => f !== null);
                          if (imageFiles.length === 0) return;
                          e.preventDefault();
                          const dt = new DataTransfer();
                          imageFiles.forEach((f) => dt.items.add(f));
                          handleImageUpload(color.name, dt.files);
                        }}
                        style={{
                          border: focusedColor === color.name
                            ? "1px solid var(--accent)"
                            : "1px solid var(--border)",
                          borderRadius: 8,
                          padding: 12,
                          background: "var(--surface2)",
                          outline: "none",
                          boxShadow: focusedColor === color.name
                            ? "0 0 0 2px color-mix(in srgb, var(--accent) 25%, transparent)"
                            : "none",
                          transition: "border-color 0.15s, box-shadow 0.15s",
                        }}
                      >
                        <Group justify="space-between" mb="xs">
                          <Text size="sm" fw={600}>
                            {color.name}
                          </Text>
                          <Text size="xs" c="dimmed">
                            {images.filter((i) => !i.error).length} imagen
                            {images.filter((i) => !i.error).length !== 1 ? "es" : ""}
                          </Text>
                        </Group>

                        {images.length > 0 && (
                          <div
                            style={{
                              display: "flex",
                              flexWrap: "wrap",
                              gap: 8,
                              marginBottom: 10,
                            }}
                          >
                            {images.map((img) => (
                              <div
                                key={img.id}
                                style={{
                                  position: "relative",
                                  width: 80,
                                  height: 80,
                                  borderRadius: 6,
                                  overflow: "hidden",
                                  border: img.error
                                    ? "1px solid var(--red)"
                                    : "1px solid var(--border)",
                                  background: "var(--surface3)",
                                }}
                              >
                                {img.error ? (
                                  <div
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      display: "flex",
                                      flexDirection: "column",
                                      alignItems: "center",
                                      justifyContent: "center",
                                      padding: 4,
                                    }}
                                  >
                                    <Text size="xs" c="red" ta="center" lh={1.2}>
                                      Error
                                    </Text>
                                    <Text size="xs" c="dimmed" ta="center" lh={1.2}>
                                      {img.fileName}
                                    </Text>
                                  </div>
                                ) : (
                                  // eslint-disable-next-line @next/next/no-img-element
                                  <img
                                    src={img.previewUrl}
                                    alt={img.fileName}
                                    style={{
                                      width: "100%",
                                      height: "100%",
                                      objectFit: "cover",
                                    }}
                                  />
                                )}

                                <ActionIcon
                                  size="xs"
                                  color="red"
                                  variant="filled"
                                  style={{
                                    position: "absolute",
                                    top: 2,
                                    right: 2,
                                    opacity: 0.85,
                                  }}
                                  onClick={() => handleRemoveImage(color.name, img.id)}
                                >
                                  <X size={10} />
                                </ActionIcon>
                              </div>
                            ))}
                          </div>
                        )}

                        <label
                          style={{
                            display: "inline-flex",
                            alignItems: "center",
                            gap: 6,
                            padding: "6px 12px",
                            borderRadius: 6,
                            border: "1px dashed var(--border2)",
                            cursor: isUploading ? "not-allowed" : "pointer",
                            fontSize: 12,
                            color: isUploading ? "var(--text3)" : "var(--accent)",
                            background: "none",
                            transition: "all 0.15s",
                          }}
                        >
                          {isUploading ? (
                            <>
                              <Loader size={12} color="amber" />
                              Subiendo...
                            </>
                          ) : (
                            <>
                              <Plus size={12} />
                              Agregar imágenes
                              <span style={{ color: "var(--text3)", fontSize: 11, marginLeft: 4 }}>
                                · o hacé click acá y pegá con Ctrl+V
                              </span>
                            </>
                          )}
                          <input
                            type="file"
                            accept="image/jpeg,image/png,image/webp,image/gif"
                            multiple
                            disabled={isUploading}
                            style={{ display: "none" }}
                            onChange={(e) => {
                              if (e.target.files) {
                                handleImageUpload(color.name, e.target.files);
                                e.target.value = "";
                              }
                            }}
                          />
                        </label>
                      </div>
                    );
                  })}
                </Stack>
              )}
            </div>

            {/* Divider */}
            <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }} />

            {/* ── SECCIÓN DESCRIPCIÓN ── */}
            <div>
              <Text size="sm" fw={600} mb="xs" c="var(--text2)">
                Descripción para la web
              </Text>

              <Stack gap="xs">
                <div style={{ position: "relative" }}>
                  <Textarea
                    placeholder={
                      isGenerating
                        ? ""
                        : "Escribí una sugerencia para guiar la descripción (opcional).\nEj: Remera ideal para el río, muy fresca y cómoda."
                    }
                    minRows={5}
                    autosize
                    disabled={isGenerating}
                    value={article.description}
                    onChange={(e) =>
                      onChange({ ...article, description: e.currentTarget.value })
                    }
                    styles={{
                      input: {
                        opacity: isGenerating ? 0.4 : 1,
                        transition: "opacity 0.2s",
                      },
                    }}
                  />
                  {isGenerating && (
                    <div
                      style={{
                        position: "absolute",
                        inset: 0,
                        display: "flex",
                        flexDirection: "column",
                        alignItems: "center",
                        justifyContent: "center",
                        gap: 8,
                        pointerEvents: "none",
                      }}
                    >
                      <Loader size="sm" color="amber" />
                      <Text size="xs" c="dimmed">
                        Generando descripción automática...
                      </Text>
                    </div>
                  )}
                </div>

                {generateError && (
                  <Text size="xs" c="red">{generateError}</Text>
                )}

                <Group justify="flex-end">
                  <Tooltip
                    label={
                      !article.name
                        ? "Ingresá el nombre del artículo primero"
                        : "Genera una descripción automática usando IA"
                    }
                    withArrow
                  >
                    <span>
                      <Button
                        variant="light"
                        color="amber"
                        size="xs"
                        disabled={!article.name || isGenerating}
                        loading={isGenerating}
                        onClick={handleGenerateDescription}
                        leftSection={<Sparkles size={14} />}
                      >
                        {isGenerating ? "Generando..." : "Generar descripción"}
                      </Button>
                    </span>
                  </Tooltip>
                </Group>

                <Text size="xs" c="dimmed">
                  La descripción generada se publicará en la web de Odoo. Podés
                  editarla antes de confirmar la orden.
                </Text>
              </Stack>
            </div>

          </Stack>
        </Tabs.Panel>
      </Tabs>
    </div>
    </>
  );
}
