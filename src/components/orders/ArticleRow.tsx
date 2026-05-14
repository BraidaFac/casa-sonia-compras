"use client";
import { useRef, useState, useEffect } from "react";
import {
  Combobox,
  InputBase,
  useCombobox,
  ActionIcon,
  Badge,
  Button,
  Group,
  Loader,
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
} from "lucide-react";
import { ComboBox } from "@/components/ui/ComboBox";
import { SizeRangeModal } from "@/components/orders/SizeRangeModal";
import { ArticleAttributes } from "@/components/orders/ArticleAttributes";
import { useProducts } from "@/hooks/useProducts";
import { useAllAttributes } from "@/hooks/useAllAttributes";
import { useProductTypes } from "@/hooks/useProductTypes";
import type {
  Article,
  ArticleRow as ArticleRowType,
  AttributeValue,
  OdooProduct,
  PrintColumn,
} from "@/types";

const DEFAULT_COEF = parseFloat(
  process.env.NEXT_PUBLIC_DEFAULT_PRICE_COEFICIENTE || "2.2",
);

interface Props {
  article: Article;
  allColors: AttributeValue[];
  allSizes: AttributeValue[];
  colorAttributeId: number;
  sizeAttributeId: number;
  invalidColors?: string[];
  invalidSizes?: string[];
  printColumns: PrintColumn[];
  onAddPrintColumn: () => void;
  onUpdatePrintColumnHeader: (id: string, header: string) => void;
  onRemovePrintColumn: (id: string) => void;
  getPrintValue: (rowId: string, columnId: string) => string;
  onUpdatePrintValue: (rowId: string, columnId: string, value: string) => void;
  onChange: (article: Article) => void;
  onRemove: () => void;
}

const COLOR_COL = "__color__";
const DEFAULT_COLOR_W = 140;
const DEFAULT_SIZE_W = 52;
const PRINT_COL_W = 90;
const ADD_BTN_W = 32;

export function ArticleRow({
  article,
  allColors,
  allSizes,
  colorAttributeId,
  sizeAttributeId,
  invalidColors = [],
  invalidSizes = [],
  printColumns,
  onAddPrintColumn,
  onUpdatePrintColumnHeader,
  onRemovePrintColumn,
  getPrintValue,
  onUpdatePrintValue,
  onChange,
  onRemove,
}: Props) {
  const [debouncedNameQuery, setDebouncedNameQuery] = useState("");
  const [sizeRangeModalOpen, setSizeRangeModalOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<string | null>("quantities");
  const [isGenerating, setIsGenerating] = useState(false);
  const [generateError, setGenerateError] = useState<string | null>(null);
  const nameTimerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const [colWidths, setColWidths] = useState<Record<string, number>>({});
  const [hiddenSizes, setHiddenSizes] = useState<Set<string>>(new Set());
  const [hiddenPrintCols, setHiddenPrintCols] = useState<Set<string>>(
    new Set(),
  );
  const resizingRef = useRef<{
    col: string;
    startX: number;
    startWidth: number;
  } | null>(null);

  const { data: products, isFetching: isFetchingProducts } =
    useProducts(debouncedNameQuery);
  const { data: allAttributes = [] } = useAllAttributes();
  const { data: productTypes = [] } = useProductTypes();

  const nameCombobox = useCombobox({
    onDropdownClose: () => nameCombobox.resetSelectedOption(),
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

  function toggleHideSize(name: string) {
    setHiddenSizes((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  }

  function toggleHidePrintCol(id: string) {
    setHiddenPrintCols((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  }

  function handleSelectProduct(p: OdooProduct) {
    const newRows: ArticleRowType[] =
      p.colors.length > 0
        ? p.colors.map((color) => ({
            id: crypto.randomUUID(),
            color,
            quantities: Object.fromEntries(p.sizes.map((s) => [s.name, ""])),
          }))
        : [
            {
              id: crypto.randomUUID(),
              color: null,
              quantities: Object.fromEntries(p.sizes.map((s) => [s.name, ""])),
            },
          ];

    onChange({
      ...article,
      name: p.name,
      existingProductId: p.id,
      referencia: p.referencia || p.defaultCode || "",
      salePrice: p.listPrice ? String(p.listPrice) : "",
      maxCoeficiente: p.maxCoeficiente || 0,
      sizes: p.sizes,
      rows: newRows,
      attributes: p.extraAttributes || [],
    });
    nameCombobox.closeDropdown();
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

  function handleAddSizes(newSizes: AttributeValue[]) {
    const existingIds = new Set(article.sizes.map((s) => s.id));
    const toAdd = newSizes.filter((s) => !existingIds.has(s.id));
    if (toAdd.length === 0) return;

    const updatedRows = article.rows.map((r) => ({
      ...r,
      quantities: {
        ...r.quantities,
        ...Object.fromEntries(toAdd.map((s) => [s.name, ""])),
      },
    }));

    onChange({
      ...article,
      sizes: [...article.sizes, ...toAdd],
      rows: updatedRows,
    });
    setSizeRangeModalOpen(false);
  }

  function updateQty(rowId: string, sizeName: string, val: string) {
    const row = article.rows.find((r) => r.id === rowId);
    if (!row) return;
    updateRow(rowId, { quantities: { ...row.quantities, [sizeName]: val } });
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

  const visibleSizes = article.sizes.filter((s) => !hiddenSizes.has(s.name));
  const hiddenSizesList = article.sizes.filter((s) => hiddenSizes.has(s.name));
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

  return (
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
      {/* Remove article — top-right corner */}
      <ActionIcon
        variant="subtle"
        color="gray"
        onClick={onRemove}
        title="Eliminar artículo"
        size="sm"
        style={{ position: "absolute", top: 6, right: 8 }}
      >
        <X size={14} />
      </ActionIcon>

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
                value={article.name}
                placeholder="Nombre del artículo..."
                size="sm"
                style={{ width: "100%" }}
                styles={{ input: { fontWeight: 600 } }}
                rightSection={
                  isFetchingProducts ? <Loader size="xs" color="amber" /> : null
                }
                onChange={(e) => {
                  onChange({
                    ...article,
                    name: e.currentTarget.value,
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
          <Tabs.Tab value="description">Descripción</Tabs.Tab>
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

          {/* Hidden sizes chips */}
          {hiddenSizesList.length > 0 && (
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
                Ocultos:
              </span>
              {hiddenSizesList.map((size) => (
                <button
                  key={size.id}
                  type="button"
                  onClick={() => toggleHideSize(size.name)}
                  title="Mostrar talle"
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
                  {size.name}
                </button>
              ))}
            </div>
          )}

          {/* Grid */}
          <div style={{ overflowX: "auto" }}>
            <table
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

                  {/* Color */}
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
                    Color
                    <div
                      style={resizeHandle}
                      onMouseDown={(e) =>
                        startResize(e, COLOR_COL, DEFAULT_COLOR_W)
                      }
                    />
                  </th>

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
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 2,
                            justifyContent: "center",
                          }}
                        >
                          {size.name}
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size={14}
                            onClick={() => toggleHideSize(size.name)}
                            title="Ocultar talle"
                            style={{ padding: 0 }}
                          >
                            <EyeOff size={9} />
                          </ActionIcon>
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
                      onClick={() => setSizeRangeModalOpen(true)}
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

                      {/* Color */}
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
                        <div
                          style={{
                            display: "flex",
                            alignItems: "center",
                            gap: 6,
                          }}
                        >
                          <ComboBox
                            value={row.color}
                            options={allColors}
                            placeholder="Color..."
                            error={(!row.color && hasQty) || isColorInvalid}
                            tabIndex={-1}
                            onChange={(v) => updateRow(row.id, { color: v })}
                          />
                          <ActionIcon
                            variant="subtle"
                            color="gray"
                            size="xs"
                            tabIndex={-1}
                            onClick={() => removeRow(row.id)}
                            style={{ flexShrink: 0 }}
                          >
                            <X size={12} />
                          </ActionIcon>
                        </div>
                      </td>
                      {visibleSizes.map((size) => (
                        <td key={size.id} style={cellStyle}>
                          <input
                            type="number"
                            min={0}
                            value={row.quantities[size.name] ?? ""}
                            onChange={(e) =>
                              updateQty(row.id, size.name, e.target.value)
                            }
                            onKeyDown={(e) => {
                              if (e.key === "Escape") e.currentTarget.blur();
                            }}
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
                                    background: missing
                                      ? "rgba(239,68,68,0.12)"
                                      : "transparent",
                                    border: "none",
                                    borderTop: `1px solid ${missing ? "var(--red)" : "var(--border)"}`,
                                    color: missing
                                      ? "var(--red)"
                                      : "var(--text2)",
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

          <SizeRangeModal
            opened={sizeRangeModalOpen}
            onClose={() => setSizeRangeModalOpen(false)}
            availableSizes={allSizes}
            onConfirm={handleAddSizes}
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
          />
        </Tabs.Panel>

        {/* Descripción tab */}
        <Tabs.Panel value="description" pt="sm">
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
              <Text size="xs" c="red">
                {generateError}
              </Text>
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
          </Stack>
        </Tabs.Panel>
      </Tabs>
    </div>
  );
}
