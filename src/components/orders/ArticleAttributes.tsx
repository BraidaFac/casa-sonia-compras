"use client";
import { useState, useEffect, useRef } from "react";
import {
  Select,
  MultiSelect,
  ActionIcon,
  Button,
  Text,
  Modal,
  Stack,
  Group,
  Loader,
  Tooltip,
} from "@mantine/core";
import { X, Plus, RefreshCw } from "lucide-react";
import { useAttributeValues } from "@/hooks/useAttributeValues";
import type { Article, AttributeValue } from "@/types";

interface ProductType {
  id: number;
  name: string;
  coeficiente: number;
}

interface Props {
  article: Article;
  colorAttributeId: number;
  sizeAttributeId: number;
  allAttributes: { id: number; name: string }[];
  productTypes: ProductType[];
  onChangeTab?: (tab: string) => void;
  onChange: (article: Article) => void;
  missingRequiredKeys?: string[];
  onRefreshAttributes?: () => void;
  readOnly?: boolean;
}

interface ConfirmDeleteState {
  open: boolean;
  idx: number;
  isColor: boolean;
  isSize: boolean;
}

export { REQUIRED_ATTR_FAMILIES } from "@/lib/required-attrs";
import { REQUIRED_ATTR_FAMILIES } from "@/lib/required-attrs";

// Flat list para uso interno
const REQUIRED_ATTR_NAMES = REQUIRED_ATTR_FAMILIES.flatMap((f) => f.names);
// Atributos que se pre-cargan pero se pueden eliminar (opcionales) — orden de visualización
export const OPTIONAL_PRELOADED_NAMES = ["material", "temporada", "genero", "género", "corte", "cuello", "composicion", "composición", "tipo de producto", "ocacion", "ocasión", "ocasion"];
const ALL_PRELOADED_NAMES = [...REQUIRED_ATTR_NAMES, ...OPTIONAL_PRELOADED_NAMES];

function isRequiredAttr(name: string): boolean {
  const lower = name.toLowerCase();
  return REQUIRED_ATTR_NAMES.some((r) => lower.includes(r));
}

function isPreloadedAttr(name: string): boolean {
  const lower = name.toLowerCase();
  return ALL_PRELOADED_NAMES.some((r) => lower.includes(r));
}

function AttributeValueSelector({
  attributeId,
  selectedValues,
  onSelect,
}: {
  attributeId: number;
  selectedValues: AttributeValue[];
  onSelect: (values: AttributeValue[]) => void;
}) {
  const { data, isLoading } = useAttributeValues(attributeId > 0 ? attributeId : null);
  const [opened, setOpened] = useState(false);

  if (isLoading) return <Loader size="xs" color="amber" />;

  const options = (data || []).map((v) => ({ value: String(v.id), label: v.name }));
  const value = selectedValues.map((v) => String(v.id));

  return (
    <MultiSelect
      data={options}
      value={value}
      onChange={(vals) => {
        const selected = vals.map((id) => {
          const found = (data || []).find((v) => String(v.id) === id);
          return found ? { id: found.id, name: found.name } : null;
        }).filter(Boolean) as AttributeValue[];
        onSelect(selected);
        setOpened(false);
      }}
      dropdownOpened={opened}
      onDropdownOpen={() => setOpened(true)}
      onDropdownClose={() => setOpened(false)}
      placeholder="Seleccionar valores..."
      size="xs"
      searchable
      style={{ flex: 1 }}
    />
  );
}

export function ArticleAttributes({
  article,
  colorAttributeId,
  sizeAttributeId,
  allAttributes,
  productTypes,
  onChangeTab,
  onChange,
  missingRequiredKeys = [],
  onRefreshAttributes,
  readOnly = false,
}: Props) {
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState>({
    open: false,
    idx: -1,
    isColor: false,
    isSize: false,
  });

  async function handleRefresh() {
    if (!onRefreshAttributes || isRefreshing) return;
    setIsRefreshing(true);
    seededRef.current.clear();
    await onRefreshAttributes();
    setIsRefreshing(false);
  }

  // Track which (articleId + existingProductId) combos have been seeded
  const seededRef = useRef<Set<string>>(new Set());

  // Seed default attributes when allAttributes loads or when existing product changes
  useEffect(() => {
    if (allAttributes.length === 0) return;
    const seedKey = `${article.id}::${article.existingProductId ?? "new"}`;
    if (seededRef.current.has(seedKey)) return;
    seededRef.current.add(seedKey);

    const currentIds = new Set(article.attributes.map((a) => a.attributeId));

    const toAdd = allAttributes.filter((a) => {
      return isPreloadedAttr(a.name) && !currentIds.has(a.id);
    });

    if (toAdd.length === 0) return;

    onChange({
      ...article,
      attributes: [
        ...article.attributes,
        ...toAdd.map((a) => ({
          attributeId: a.id,
          attributeName: a.name,
          values: [],
          generatesVariants: false,
        })),
      ],
    });
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [allAttributes, article.id, article.existingProductId]);

  const usedAttributeIds = new Set(article.attributes.map((a) => a.attributeId));

  function addAttributeLine() {
    onChange({
      ...article,
      attributes: [
        ...article.attributes,
        { attributeId: 0, attributeName: "", values: [], generatesVariants: false },
      ],
    });
  }

  function handleAttributeSelect(idx: number, attrIdStr: string | null) {
    if (!attrIdStr) return;
    const attrId = parseInt(attrIdStr);
    const attrName = allAttributes.find((a) => a.id === attrId)?.name || "";
    const isColor = attrId === colorAttributeId;
    const isSize = attrId === sizeAttributeId;

    const updatedAttributes = article.attributes.map((attr, i) =>
      i === idx
        ? { attributeId: attrId, attributeName: attrName, values: [], generatesVariants: isColor || isSize }
        : attr,
    );
    onChange({ ...article, attributes: updatedAttributes });
  }

  function handleValuesChange(idx: number, values: AttributeValue[]) {
    const attr = article.attributes[idx];
    const isColor = attr.attributeId === colorAttributeId;
    const isSize = attr.attributeId === sizeAttributeId;

    const updatedAttributes = article.attributes.map((a, i) =>
      i === idx ? { ...a, values } : a,
    );

    let updatedRows = article.rows;
    let updatedSizes = article.sizes;
    let maxCoeficiente = article.maxCoeficiente;

    if (isColor) {
      const existingColorIds = new Set(article.rows.map((r) => r.color?.id));
      const newColors = values.filter((v) => !existingColorIds.has(v.id));
      const newRows = newColors.map((color) => ({
        id: crypto.randomUUID(),
        color: { id: color.id, name: color.name, colorBase: "", hexColor: "", isNew: false },
        quantities: Object.fromEntries(article.sizes.map((s) => [s.name, ""])),
        warehouseQuantities: {},
      }));
      updatedRows = [...article.rows, ...newRows];
    }

    if (isSize) {
      const existingSizeIds = new Set(article.sizes.map((s) => s.id));
      const newSizes = values
        .filter((v) => !existingSizeIds.has(v.id))
        .map((v) => ({ ...v, equivalencia: "" }));
      updatedSizes = [...article.sizes, ...newSizes];
      updatedRows = updatedRows.map((r) => ({
        ...r,
        quantities: {
          ...r.quantities,
          ...Object.fromEntries(newSizes.map((s) => [s.name, ""])),
        },
      }));
    }

    if (attr.attributeName.toLowerCase().includes("tipo de producto")) {
      const coefs = values.map((v) => {
        const pt = productTypes.find((t) => t.id === v.id);
        return pt?.coeficiente || 0;
      });
      maxCoeficiente = coefs.length > 0 ? Math.max(...coefs) : 0;
    }

    onChange({
      ...article,
      attributes: updatedAttributes,
      rows: updatedRows,
      sizes: updatedSizes,
      maxCoeficiente,
    });
  }

  function handleRemoveAttribute(idx: number) {
    const attr = article.attributes[idx];
    const isColor = attr.attributeId === colorAttributeId;
    const isSize = attr.attributeId === sizeAttributeId;

    if (isColor || isSize) {
      const hasQty = article.rows.some((r) =>
        article.sizes.some((s) => parseInt(r.quantities[s.name] || "0", 10) > 0),
      );
      if (hasQty) {
        setConfirmDelete({ open: true, idx, isColor, isSize });
        return;
      }
    }

    removeAttribute(idx, isColor, isSize);
  }

  function removeAttribute(idx: number, isColor: boolean, isSize: boolean) {
    const updatedAttributes = article.attributes.filter((_, i) => i !== idx);
    let updatedRows = article.rows;
    let updatedSizes = article.sizes;

    if (isColor) {
      updatedRows = [{ id: crypto.randomUUID(), color: null, quantities: {}, warehouseQuantities: {} }];
    }
    if (isSize) {
      updatedSizes = [];
      updatedRows = updatedRows.map((r) => ({ ...r, quantities: {} }));
    }

    onChange({
      ...article,
      attributes: updatedAttributes,
      rows: updatedRows,
      sizes: updatedSizes,
    });
  }

  // Sync color/size from quantities grid as read-only rows
  const colorRow = article.rows.some((r) => r.color !== null)
    ? { attributeId: colorAttributeId, attributeName: "Color o Diseño", values: Array.from(new Map(article.rows.filter((r) => r.color).map((r) => [r.color!.id ?? r.color!.name, r.color!])).values()), generatesVariants: true }
    : null;
  const sizeAttrName = article.sizeAttributeId
    ? (allAttributes.find((a) => a.id === article.sizeAttributeId)?.name ?? "Talle")
    : "Talle";
  const sizeRow = article.sizes.length > 0
    ? { attributeId: article.sizeAttributeId ?? sizeAttributeId, attributeName: sizeAttrName, values: article.sizes, generatesVariants: true }
    : null;

  // Filter out color/size from editable attributes, sort by defined preload order
  const editableAttributes = article.attributes
    .filter((a) => a.attributeId !== colorAttributeId && a.attributeId !== sizeAttributeId)
    .sort((a, b) => {
      const getOrder = (attr: { attributeId: number; attributeName: string }) => {
        if (attr.attributeId <= 0) return 9999;
        const lower = attr.attributeName.toLowerCase();
        const idx = ALL_PRELOADED_NAMES.findIndex((n) => lower.includes(n));
        return idx === -1 ? 9998 : idx;
      };
      return getOrder(a) - getOrder(b);
    });

  const selectableAttributes = allAttributes
    .filter((a) => !usedAttributeIds.has(a.id) || a.id === 0)
    .filter((a) => a.id !== colorAttributeId && a.id !== sizeAttributeId)
    .map((a) => ({ value: String(a.id), label: a.name }));

  return (
    <div style={{ marginTop: 8 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 2 }}>
        <span style={{ fontSize: 12, fontWeight: 600, color: "var(--text2)", paddingLeft: 8 }}>Atributos</span>
        {onRefreshAttributes && (
          <Tooltip label="Refrescar atributos desde Odoo" position="left" withArrow>
            <ActionIcon
              variant="subtle"
              color="gray"
              size="sm"
              onClick={handleRefresh}
              loading={isRefreshing}
            >
              <RefreshCw size={13} />
            </ActionIcon>
          </Tooltip>
        )}
      </div>
      <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 13 }}>
        <thead>
          <tr>
            <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text2)", fontWeight: 600, fontSize: 12, width: 200 }}>
              Atributo
            </th>
            <th style={{ textAlign: "left", padding: "4px 8px", color: "var(--text2)", fontWeight: 600, fontSize: 12 }}>
              Valores
            </th>
            <th style={{ width: 32 }} />
          </tr>
        </thead>
        <tbody>
          {/* Read-only Color row synced from Cantidades */}
          {colorRow && (
            <tr>
              <td style={{ padding: "4px 8px", color: "var(--text3)", fontSize: 12 }}>
                {colorRow.attributeName}
              </td>
              <td style={{ padding: "4px 8px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {colorRow.values.map((v) => (
                    <span
                      key={v.id ?? v.name}
                      style={{
                        background: "var(--surface3)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontSize: 11,
                        color: "var(--text2)",
                      }}
                    >
                      {v.name}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => onChangeTab?.("quantities")}
                    style={{
                      background: "none",
                      border: "1px dashed var(--border2)",
                      borderRadius: 4,
                      padding: "1px 6px",
                      fontSize: 11,
                      color: "var(--text3)",
                      cursor: "pointer",
                    }}
                  >
                    Editar en Cantidades
                  </button>
                </div>
              </td>
              <td />
            </tr>
          )}

          {/* Read-only Size row synced from Cantidades */}
          {sizeRow && (
            <tr>
              <td style={{ padding: "4px 8px", color: "var(--text3)", fontSize: 12 }}>
                {sizeRow.attributeName}
              </td>
              <td style={{ padding: "4px 8px" }}>
                <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                  {sizeRow.values.map((v) => (
                    <span
                      key={v.id ?? v.name}
                      style={{
                        background: "var(--surface3)",
                        border: "1px solid var(--border)",
                        borderRadius: 4,
                        padding: "1px 6px",
                        fontSize: 11,
                        color: "var(--text2)",
                      }}
                    >
                      {v.name}
                    </span>
                  ))}
                  <button
                    type="button"
                    onClick={() => onChangeTab?.("quantities")}
                    style={{
                      background: "none",
                      border: "1px dashed var(--border2)",
                      borderRadius: 4,
                      padding: "1px 6px",
                      fontSize: 11,
                      color: "var(--text3)",
                      cursor: "pointer",
                    }}
                  >
                    Editar en Cantidades
                  </button>
                </div>
              </td>
              <td />
            </tr>
          )}

          {/* Editable attribute rows */}
          {editableAttributes.map((attr) => {
            const actualIdx = article.attributes.indexOf(attr);
            const required = attr.attributeId > 0 && isRequiredAttr(attr.attributeName);
            const isOptionalPreloaded = attr.attributeId > 0 && OPTIONAL_PRELOADED_NAMES.some((n) => attr.attributeName.toLowerCase().includes(n));
            const locked = attr.locked === true || required;
            const canRemove = !required && (!attr.locked || isOptionalPreloaded);

            // Determine if this attr is in the missing list (highlight red)
            const isMissingHighlight = required && attr.values.length === 0 && missingRequiredKeys.length > 0 &&
              REQUIRED_ATTR_FAMILIES.some((f) =>
                missingRequiredKeys.includes(f.key) &&
                f.names.some((n) => attr.attributeName.toLowerCase().includes(n))
              );

            return (
              <tr key={`${attr.attributeId}-${actualIdx}`}>
                <td style={{ padding: "4px 8px", verticalAlign: "middle" }}>
                  {locked ? (
                    <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
                      <Text size="xs" style={{ width: 190, padding: "0 4px" }}>
                        {attr.attributeName}
                      </Text>
                      {required && attr.values.length === 0 && (
                        <span style={{ color: "var(--mantine-color-red-6)", fontSize: 11 }}>*</span>
                      )}
                    </div>
                  ) : (
                    <Select
                      data={[
                        ...(attr.attributeId > 0
                          ? [{ value: String(attr.attributeId), label: attr.attributeName }]
                          : []),
                        ...selectableAttributes.filter(
                          (a) => a.value !== String(attr.attributeId),
                        ),
                      ]}
                      value={attr.attributeId > 0 ? String(attr.attributeId) : null}
                      onChange={(val) => handleAttributeSelect(actualIdx, val)}
                      placeholder="Seleccionar atributo..."
                      size="xs"
                      searchable
                      style={{ width: 190 }}
                    />
                  )}
                </td>
                <td style={{ padding: "4px 8px", verticalAlign: "middle" }}>
                  {attr.attributeId > 0 ? (
                    <div style={isMissingHighlight ? { outline: "1.5px solid var(--mantine-color-red-6)", borderRadius: 4 } : undefined}>
                    <AttributeValueSelector
                      attributeId={attr.attributeId}
                      selectedValues={attr.values}
                      onSelect={(vals) => handleValuesChange(actualIdx, vals)}
                    />
                    </div>
                  ) : (
                    <Text size="xs" c="dimmed">Seleccioná un atributo primero</Text>
                  )}
                </td>
                <td style={{ padding: "4px 8px", verticalAlign: "middle" }}>
                  {canRemove && !readOnly && (
                    <ActionIcon
                      variant="subtle"
                      color="gray"
                      size="xs"
                      onClick={() => handleRemoveAttribute(actualIdx)}
                    >
                      <X size={12} />
                    </ActionIcon>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

      {!readOnly && (
        <Button
          variant="subtle"
          color="gray"
          size="xs"
          leftSection={<Plus size={12} />}
          mt="xs"
          onClick={addAttributeLine}
          style={{ border: "1px dashed var(--border2)" }}
        >
          Agregar línea
        </Button>
      )}

      {/* Confirm delete modal for color/size with quantities */}
      <Modal
        opened={confirmDelete.open}
        onClose={() => setConfirmDelete((s) => ({ ...s, open: false }))}
        title="Eliminar atributo"
        centered
        size="sm"
      >
        <Stack gap="md">
          <Text size="sm">
            Hay cantidades cargadas para este atributo.
            ¿Seguro que querés eliminarlo? Se perderán las cantidades.
          </Text>
          <Group justify="flex-end">
            <Button
              variant="default"
              size="xs"
              onClick={() => setConfirmDelete((s) => ({ ...s, open: false }))}
            >
              Cancelar
            </Button>
            <Button
              color="red"
              size="xs"
              onClick={() => {
                removeAttribute(confirmDelete.idx, confirmDelete.isColor, confirmDelete.isSize);
                setConfirmDelete((s) => ({ ...s, open: false }));
              }}
            >
              Eliminar
            </Button>
          </Group>
        </Stack>
      </Modal>
    </div>
  );
}
