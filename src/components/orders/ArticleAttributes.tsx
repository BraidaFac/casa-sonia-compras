"use client";
import { useState } from "react";
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
} from "@mantine/core";
import { X, Plus } from "lucide-react";
import { useAttributeValues } from "@/hooks/useAttributeValues";
import type { Article, ProductAttribute, AttributeValue } from "@/types";

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
}

interface ConfirmDeleteState {
  open: boolean;
  idx: number;
  isColor: boolean;
  isSize: boolean;
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
      }}
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
}: Props) {
  const [confirmDelete, setConfirmDelete] = useState<ConfirmDeleteState>({
    open: false,
    idx: -1,
    isColor: false,
    isSize: false,
  });

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
        color,
        quantities: Object.fromEntries(article.sizes.map((s) => [s.name, ""])),
      }));
      updatedRows = [...article.rows, ...newRows];
    }

    if (isSize) {
      const existingSizeIds = new Set(article.sizes.map((s) => s.id));
      const newSizes = values.filter((v) => !existingSizeIds.has(v.id));
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
      updatedRows = [{ id: crypto.randomUUID(), color: null, quantities: {} }];
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
    ? { attributeId: colorAttributeId, attributeName: "Color o Diseño", values: article.rows.filter((r) => r.color).map((r) => r.color!), generatesVariants: true }
    : null;
  const sizeRow = article.sizes.length > 0
    ? { attributeId: sizeAttributeId, attributeName: "Talle", values: article.sizes, generatesVariants: true }
    : null;

  // Filter out color/size from editable attributes (shown as read-only)
  const editableAttributes = article.attributes.filter(
    (a) => a.attributeId !== colorAttributeId && a.attributeId !== sizeAttributeId,
  );

  const selectableAttributes = allAttributes
    .filter((a) => !usedAttributeIds.has(a.id) || a.id === 0)
    .filter((a) => a.id !== colorAttributeId && a.id !== sizeAttributeId)
    .map((a) => ({ value: String(a.id), label: a.name }));

  return (
    <div style={{ marginTop: 8 }}>
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
                      key={v.id}
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
                      key={v.id}
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

            return (
              <tr key={`${attr.attributeId}-${actualIdx}`}>
                <td style={{ padding: "4px 8px", verticalAlign: "middle" }}>
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
                </td>
                <td style={{ padding: "4px 8px", verticalAlign: "middle" }}>
                  {attr.attributeId > 0 ? (
                    <AttributeValueSelector
                      attributeId={attr.attributeId}
                      selectedValues={attr.values}
                      onSelect={(vals) => handleValuesChange(actualIdx, vals)}
                    />
                  ) : (
                    <Text size="xs" c="dimmed">Seleccioná un atributo primero</Text>
                  )}
                </td>
                <td style={{ padding: "4px 8px", verticalAlign: "middle" }}>
                  <ActionIcon
                    variant="subtle"
                    color="gray"
                    size="xs"
                    onClick={() => handleRemoveAttribute(actualIdx)}
                  >
                    <X size={12} />
                  </ActionIcon>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>

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
