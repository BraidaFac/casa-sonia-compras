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
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { AlertTriangle } from "lucide-react";
import { ArticleAttributes } from "@/components/orders/ArticleAttributes";
import { BarcodeTab } from "@/components/orders/BarcodeTab";
import { useAttributes } from "@/hooks/useAttributes";
import { useAllAttributes } from "@/hooks/useAllAttributes";
import { useCategories } from "@/hooks/useCategories";
import { useColorBaseOptions } from "@/hooks/useColorBaseOptions";
import { useSizeAttributes } from "@/hooks/useSizeAttributes";
import { useProductTypes } from "@/hooks/useProductTypes";
import type { Article } from "@/types";
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
  const { data: _colorBaseOptions = [] } = useColorBaseOptions();
  const { data: _sizeAttributes = [] } = useSizeAttributes();
  const { data: productTypes = [] } = useProductTypes();

  const colorAttributeId = attrData?.colorAttributeId ?? 0;
  const sizeAttributeId = attrData?.sizeAttributeId ?? 0;
  const _allColors = attrData?.colors ?? [];

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
            <Text size="sm" c="dimmed">
              (Implementado en Task 4)
            </Text>
          </Tabs.Panel>

          {/* Tab Talles — Task 4 */}
          <Tabs.Panel value="talles" p="md">
            <Text size="sm" c="dimmed">
              (Implementado en Task 4)
            </Text>
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
            <Text size="sm" c="dimmed">
              (Implementado en Task 4)
            </Text>
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
