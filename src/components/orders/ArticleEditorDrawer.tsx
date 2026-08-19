// src/components/orders/ArticleEditorDrawer.tsx
"use client";
import { useState, useEffect, startTransition } from "react";
import {
  Drawer,
  Tabs,
  Button,
  Group,
  Text,
  Stack,
  TextInput,
  Textarea,
  NumberInput,
  Select,
  Alert,
  ScrollArea,
  ActionIcon,
  Badge,
  FileButton,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { AlertTriangle, Plus, X, Trash2 } from "lucide-react";
import { ArticleAttributes } from "@/components/orders/ArticleAttributes";
import { BarcodeTab } from "@/components/orders/BarcodeTab";
import { ColorProveedorCell } from "@/components/orders/ColorProveedorCell";
import { useAttributes } from "@/hooks/useAttributes";
import { useAllAttributes } from "@/hooks/useAllAttributes";
import { useCategories } from "@/hooks/useCategories";
import { useColorBaseOptions } from "@/hooks/useColorBaseOptions";
import { useSizeAttributes } from "@/hooks/useSizeAttributes";
import { useProductTypes } from "@/hooks/useProductTypes";
import type { Article, ArticleRow, ProductImage, ColorImages } from "@/types";
import type { ProductCategory } from "@/types";

interface Props {
  orderId: number;
  articleIndex: number;
  article: Article;
  opened: boolean;
  onClose: () => void;
  onArticleUpdate: (updated: Article) => void;
}

export function ArticleEditorDrawer({
  orderId,
  articleIndex,
  article,
  opened,
  onClose,
  onArticleUpdate,
}: Props) {
  const [local, setLocal] = useState<Article>(article);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // Resetear estado local cuando se abre con un artículo nuevo
  useEffect(() => {
    if (opened) {
      startTransition(() => {
        setLocal(article);
        setSaveError(null);
      });
    }
  }, [opened, article]);

  const { data: attrData } = useAttributes();
  const { data: allAttributes = [] } = useAllAttributes();
  const { data: categories = [] } = useCategories();
  const { data: colorBaseOptions = [] } = useColorBaseOptions();
  const { data: sizeAttributes = [] } = useSizeAttributes();
  const { data: productTypes = [] } = useProductTypes();

  const colorAttributeId = attrData?.colorAttributeId ?? 0;
  const sizeAttributeId = attrData?.sizeAttributeId ?? 0;
  const allColors = attrData?.colors ?? [];

  async function handleSave() {
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/local-orders/${orderId}/articles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          articleIndex,
          article: local,
          colorAttributeId,
          sizeAttributeId,
        }),
      });
      const data = await res.json();
      if (!res.ok) {
        setSaveError(data.error ?? "Error al guardar");
        return;
      }
      notifications.show({
        color: "green",
        title: "Artículo actualizado",
        message: "Los cambios fueron guardados en Odoo.",
      });
      onArticleUpdate(local);
      onClose();
    } finally {
      setSaving(false);
    }
  }

  const categoryOptions = (categories as ProductCategory[]).map((c) => ({
    value: String(c.id),
    label: c.name,
  }));

  return (
    <Drawer
      opened={opened}
      onClose={onClose}
      position="right"
      size="xl"
      title={
        <Text fw={600} size="sm" style={{ color: "var(--text2)" }}>
          Editar artículo — {local.name || "(sin nombre)"}
        </Text>
      }
      styles={{
        body: { padding: 0, display: "flex", flexDirection: "column", height: "100%" },
        content: { background: "var(--surface)" },
        header: {
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
        },
      }}
    >
      <ScrollArea style={{ flex: 1 }}>
        <Tabs defaultValue="general" styles={{ root: { height: "100%" } }}>
          <Tabs.List px="md" pt="xs">
            <Tabs.Tab value="general">General</Tabs.Tab>
            <Tabs.Tab value="colores">Colores</Tabs.Tab>
            <Tabs.Tab value="talles">Talles</Tabs.Tab>
            <Tabs.Tab value="atributos">Atributos</Tabs.Tab>
            <Tabs.Tab value="barcodes">Códigos de barra</Tabs.Tab>
            <Tabs.Tab value="imagenes">Imágenes</Tabs.Tab>
          </Tabs.List>

          {/* Tab General */}
          <Tabs.Panel value="general" p="md">
            <Stack gap="md">
              <TextInput
                label="Nombre"
                value={local.name}
                onChange={(e) => setLocal((p) => ({ ...p, name: e.currentTarget.value }))}
              />
              <Select
                label="Categoría"
                data={categoryOptions}
                value={local.category ? String(local.category.id) : null}
                onChange={(val) => {
                  const cat = (categories as ProductCategory[]).find(
                    (c) => String(c.id) === val,
                  );
                  setLocal((p) => ({ ...p, category: cat ?? null }));
                }}
                searchable
                clearable
              />
              <Group grow>
                <NumberInput
                  label="Precio costo"
                  value={parseFloat(local.price) || 0}
                  onChange={(val) =>
                    setLocal((p) => ({ ...p, price: String(val ?? 0) }))
                  }
                  decimalScale={2}
                  prefix="$"
                />
                <NumberInput
                  label="Precio venta"
                  value={parseFloat(local.salePrice) || 0}
                  onChange={(val) =>
                    setLocal((p) => ({ ...p, salePrice: String(val ?? 0) }))
                  }
                  decimalScale={2}
                  prefix="$"
                />
              </Group>
              <Textarea
                label="Descripción web"
                value={local.description}
                onChange={(e) =>
                  setLocal((p) => ({ ...p, description: e.currentTarget.value }))
                }
                rows={4}
              />
            </Stack>
          </Tabs.Panel>

          {/* Tab Colores — Task 4 */}
          <Tabs.Panel value="colores" p="md">
            <Stack gap="sm">
              <Text size="xs" c="dimmed">
                Los colores existentes en Odoo no se pueden renombrar. Podés agregar colores nuevos.
              </Text>

              {local.rows.map((row, idx) => (
                <Group
                  key={row.id}
                  align="center"
                  gap="sm"
                  p="xs"
                  style={{ border: "1px solid var(--border)", borderRadius: 6 }}
                >
                  {/* Swatch de color */}
                  {row.color?.hexColor && (
                    <div
                      style={{
                        width: 20,
                        height: 20,
                        borderRadius: "50%",
                        background: row.color.hexColor,
                        border: "1px solid var(--border)",
                        flexShrink: 0,
                      }}
                    />
                  )}

                  {row.color?.isNew ? (
                    /* Color nuevo — editable */
                    <div style={{ flex: 1 }}>
                      <ColorProveedorCell
                        value={row.color}
                        allColors={allColors}
                        colorBaseOptions={colorBaseOptions}
                        onChange={(newColor) => {
                          const newRows = local.rows.map((r, i) =>
                            i === idx ? { ...r, color: newColor } : r,
                          );
                          setLocal((p) => ({ ...p, rows: newRows }));
                        }}
                        hasQty={false}
                        usedColorKeys={new Set(
                          local.rows
                            .filter((r, i) => i !== idx && r.color)
                            .map((r) => r.color!.name.toLowerCase()),
                        )}
                      />
                    </div>
                  ) : (
                    /* Color existente en Odoo — solo lectura */
                    <Text size="sm" style={{ flex: 1, color: "var(--text2)" }}>
                      {row.color?.name ?? "(sin color)"}
                    </Text>
                  )}

                  {/* Eliminar solo si es nuevo */}
                  {row.color?.isNew && (
                    <ActionIcon
                      variant="subtle"
                      color="red"
                      size="sm"
                      onClick={() => {
                        setLocal((p) => ({
                          ...p,
                          rows: p.rows.filter((_, i) => i !== idx),
                        }));
                      }}
                    >
                      <X size={12} />
                    </ActionIcon>
                  )}
                </Group>
              ))}

              <Button
                variant="subtle"
                color="amber"
                size="xs"
                leftSection={<Plus size={12} />}
                onClick={() => {
                  const newRow: ArticleRow = {
                    id: crypto.randomUUID(),
                    color: {
                      id: null,
                      name: "",
                      colorBase: "",
                      hexColor: "",
                      isNew: true,
                    },
                    quantities: {},
                    warehouseQuantities: {},
                    barcodes: {},
                  };
                  setLocal((p) => ({ ...p, rows: [...p.rows, newRow] }));
                }}
              >
                Agregar color
              </Button>
            </Stack>
          </Tabs.Panel>

          {/* Tab Talles — Task 4 */}
          <Tabs.Panel value="talles" p="md">
            <Stack gap="sm">
              <Text size="xs" c="dimmed">
                Los talles existentes en la orden no se pueden eliminar. Podés agregar talles nuevos del sistema.
              </Text>

              {/* Talles actuales */}
              <Group gap="xs" wrap="wrap">
                {local.sizes.map((size) => {
                  const isOriginal = (local.originalSizeIds ?? []).includes(size.id);
                  return (
                    <Badge
                      key={size.id}
                      variant={isOriginal ? "filled" : "outline"}
                      color="amber"
                      rightSection={
                        !isOriginal ? (
                          <ActionIcon
                            size="xs"
                            variant="transparent"
                            color="amber"
                            onClick={() => {
                              setLocal((p) => ({
                                ...p,
                                sizes: p.sizes.filter((s) => s.id !== size.id),
                              }));
                            }}
                          >
                            <X size={10} />
                          </ActionIcon>
                        ) : undefined
                      }
                    >
                      {size.name}
                    </Badge>
                  );
                })}
              </Group>

              {/* Agregar talle desde el sistema */}
              <Select
                placeholder="Agregar talle..."
                data={sizeAttributes
                  .flatMap((sa) => sa.values)
                  .filter((sv) => !local.sizes.some((s) => s.id === sv.id))
                  .map((sv) => ({ value: String(sv.id), label: sv.name }))}
                onChange={(val) => {
                  if (!val) return;
                  const allSizes = sizeAttributes.flatMap((sa) => sa.values);
                  const found = allSizes.find((s) => String(s.id) === val);
                  if (!found) return;
                  setLocal((p) => ({
                    ...p,
                    sizes: [...p.sizes, found],
                  }));
                }}
                value={null}
                searchable
                clearable
              />
            </Stack>
          </Tabs.Panel>

          {/* Tab Atributos */}
          <Tabs.Panel value="atributos" p="md">
            <ArticleAttributes
              article={local}
              colorAttributeId={colorAttributeId}
              sizeAttributeId={sizeAttributeId}
              allAttributes={allAttributes}
              productTypes={productTypes}
              onChange={(updated) => setLocal(updated)}
            />
          </Tabs.Panel>

          {/* Tab Códigos de barra */}
          <Tabs.Panel value="barcodes" p="md">
            <BarcodeTab
              article={local}
              onChange={(updated) => setLocal(updated)}
            />
          </Tabs.Panel>

          {/* Tab Imágenes — Task 4 */}
          <Tabs.Panel value="imagenes" p="md">
            <Stack gap="md">
              <Text size="xs" c="dimmed">
                Primera imagen de cada color es la imagen principal. Las demás son adicionales.
              </Text>

              {local.rows
                .filter((row) => row.color)
                .map((row) => {
                  const colorName = row.color!.name;
                  const images: ProductImage[] = local.colorImages[colorName] ?? [];

                  return (
                    <Stack key={row.id} gap="xs">
                      <Group gap="xs">
                        {row.color?.hexColor && (
                          <div
                            style={{
                              width: 12,
                              height: 12,
                              borderRadius: "50%",
                              background: row.color.hexColor,
                              border: "1px solid var(--border)",
                            }}
                          />
                        )}
                        <Text size="sm" fw={500} style={{ color: "var(--text2)" }}>
                          {colorName}
                        </Text>
                      </Group>

                      <Group gap="xs" wrap="wrap">
                        {images.map((img, imgIdx) => (
                          <div
                            key={img.id}
                            style={{ position: "relative", width: 72, height: 72 }}
                          >
                            {/* eslint-disable-next-line @next/next/no-img-element */}
                            <img
                              src={img.previewUrl || `data:${img.mimeType};base64,${img.base64}`}
                              alt={img.fileName}
                              style={{
                                width: 72,
                                height: 72,
                                objectFit: "cover",
                                borderRadius: 4,
                                border: "1px solid var(--border)",
                              }}
                            />
                            <ActionIcon
                              size="xs"
                              color="red"
                              variant="filled"
                              style={{ position: "absolute", top: 2, right: 2 }}
                              onClick={() => {
                                const newImages = images.filter((_, i) => i !== imgIdx);
                                const isLastForColor = newImages.length === 0;

                                setLocal((p) => {
                                  const updated: ColorImages = {
                                    ...p.colorImages,
                                    [colorName]: newImages,
                                  };

                                  // Track deleted Odoo images
                                  const newDeleted = img.odooId
                                    ? [...p.deletedOdooImageIds, img.odooId]
                                    : p.deletedOdooImageIds;

                                  // Track cleared primary colors
                                  const newCleared =
                                    img.isFromOdoo && imgIdx === 0 && isLastForColor
                                      ? [...p.clearedPrimaryColorNames, colorName]
                                      : p.clearedPrimaryColorNames;

                                  return {
                                    ...p,
                                    colorImages: updated,
                                    deletedOdooImageIds: newDeleted,
                                    clearedPrimaryColorNames: newCleared,
                                  };
                                });
                              }}
                            >
                              <Trash2 size={8} />
                            </ActionIcon>
                          </div>
                        ))}

                        {/* Agregar imagen nueva */}
                        <FileButton
                          onChange={(files) => {
                            if (!files || files.length === 0) return;
                            Array.from(files).forEach((file) => {
                              const reader = new FileReader();
                              reader.onload = (e) => {
                                const dataUrl = e.target?.result as string;
                                const base64 = dataUrl.split(",")[1] ?? "";
                                const newImg: ProductImage = {
                                  id: crypto.randomUUID(),
                                  fileName: file.name,
                                  base64,
                                  mimeType: file.type,
                                  previewUrl: dataUrl,
                                };
                                setLocal((p) => ({
                                  ...p,
                                  colorImages: {
                                    ...p.colorImages,
                                    [colorName]: [...(p.colorImages[colorName] ?? []), newImg],
                                  },
                                }));
                              };
                              reader.readAsDataURL(file);
                            });
                          }}
                          accept="image/*"
                          multiple
                        >
                          {(props) => (
                            <ActionIcon
                              {...props}
                              variant="outline"
                              color="gray"
                              style={{
                                width: 72,
                                height: 72,
                                borderRadius: 4,
                                border: "1px dashed var(--border)",
                              }}
                            >
                              <Plus size={16} />
                            </ActionIcon>
                          )}
                        </FileButton>
                      </Group>
                    </Stack>
                  );
                })}
            </Stack>
          </Tabs.Panel>
        </Tabs>
      </ScrollArea>

      {/* Footer fijo con botones */}
      <div
        style={{
          borderTop: "1px solid var(--border)",
          padding: "12px 16px",
          background: "var(--surface)",
          display: "flex",
          flexDirection: "column",
          gap: 8,
        }}
      >
        {saveError && (
          <Alert
            color="red"
            variant="light"
            icon={<AlertTriangle size={14} />}
            p="xs"
          >
            <Text size="xs">{saveError}</Text>
          </Alert>
        )}
        <Group justify="flex-end">
          <Button variant="subtle" color="gray" onClick={onClose} disabled={saving}>
            Cancelar
          </Button>
          <Button
            color="amber"
            loading={saving}
            onClick={() => void handleSave()}
          >
            Guardar
          </Button>
        </Group>
      </div>
    </Drawer>
  );
}
