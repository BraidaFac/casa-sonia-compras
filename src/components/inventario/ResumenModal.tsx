"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import {
  Modal,
  Button,
  Text,
  Group,
  Tooltip,
  Checkbox,
  Radio,
  Stack,
  Loader,
  Switch,
} from "@mantine/core";
import { notifications } from "@mantine/notifications";
import { Check, AlertTriangle, ChevronDown, ChevronRight } from "lucide-react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { InventoryStatusBadge } from "@/components/inventario/InventoryStatusBadge";
import type { InventoryArticle, LocalInventory } from "@/types";
import type {
  SummaryCategory,
  SummaryDataResponse,
  SummaryProduct,
} from "@/app/api/inventario/[id]/summary-data/route";

interface ResumenModalProps {
  opened: boolean;
  onClose: () => void;
  inventory: LocalInventory;
  articles: InventoryArticle[];
  onSuccess?: () => void;
}

export function ResumenModal({
  opened,
  onClose,
  inventory,
  articles,
  onSuccess,
}: ResumenModalProps) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [loading, setLoading] = useState(false);
  const [manuallyUnchecked, setManuallyUnchecked] = useState<Set<number>>(
    new Set(),
  );
  const [splitDialogOpen, setSplitDialogOpen] = useState(false);
  const [splitAction, setSplitAction] = useState<"discard" | "new_draft">(
    "discard",
  );
  const [zeroUncounted, setZeroUncounted] = useState(true);

  const isBorrador = inventory.status === "BORRADOR";

  const { data: summaryData, isLoading: summaryLoading } =
    useQuery<SummaryDataResponse>({
      queryKey: ["inventario-summary", inventory.id],
      queryFn: () =>
        fetch(`/api/inventario/${inventory.id}/summary-data`).then((r) =>
          r.json(),
        ),
      enabled: opened,
      staleTime: 0,
      gcTime: 0,
    });

  const allCategoryIds = summaryData?.categories.map((c) => c.categoryId) ?? [];
  const checkedCategoryIds = new Set(
    allCategoryIds.filter((id) => !manuallyUnchecked.has(id)),
  );

  function setCheckedIds(next: Set<number>) {
    setManuallyUnchecked(new Set(allCategoryIds.filter((id) => !next.has(id))));
  }

  function handleClose() {
    setManuallyUnchecked(new Set());
    onClose();
  }

  function afterAction() {
    queryClient.invalidateQueries({ queryKey: ["inventories"] });
    queryClient.invalidateQueries({ queryKey: ["inventory", inventory.id] });
    handleClose();
    if (onSuccess) {
      onSuccess();
    } else {
      router.push("/inventario");
    }
  }

  function handleConfirmarClick() {
    const unchecked = allCategoryIds.filter(
      (id) => !checkedCategoryIds.has(id),
    );
    if (unchecked.length > 0) {
      setSplitDialogOpen(true);
    } else {
      void executeConfirm([]);
    }
  }

  async function executeConfirm(excludedCategoryIds: number[]) {
    const spawnNewDraft = splitAction === "new_draft";
    setLoading(true);
    setSplitDialogOpen(false);
    try {
      const res = await fetch(`/api/inventario/${inventory.id}/confirm`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          excludedCategoryIds,
          spawnNewDraft,
          zeroUncounted,
        }),
      });
      if (!res.ok) {
        const err = await res.json();
        notifications.show({
          color: "red",
          title: "Error al confirmar",
          message: err?.error ?? "No se pudo confirmar el inventario.",
        });
        return;
      }
      notifications.show({
        color: "green",
        title: "Inventario confirmado",
        message: "El inventario fue sincronizado con Odoo.",
      });
      afterAction();
    } finally {
      setLoading(false);
    }
  }

  const uncheckedIds = allCategoryIds.filter(
    (id) => !checkedCategoryIds.has(id),
  );
  const uncheckedCategories =
    summaryData?.categories.filter((c) =>
      uncheckedIds.includes(c.categoryId),
    ) ?? [];

  return (
    <>
      <Modal
        opened={opened}
        onClose={handleClose}
        title={
          <Group gap={10} align="center" wrap="nowrap">
            <Text
              fw={700}
              size="md"
              style={{ fontFamily: "var(--font-display)" }}
            >
              Resumen #{inventory.id}
            </Text>
            <InventoryStatusBadge status={inventory.status} />
            {isBorrador && (
              <Switch
                size="xs"
                label="Llevar a cero no contados"
                checked={zeroUncounted}
                onChange={(e) => setZeroUncounted(e.currentTarget.checked)}
                color="amber"
                styles={{
                  label: {
                    fontSize: 11,
                    color: "var(--text3)",
                    cursor: "pointer",
                  },
                }}
              />
            )}
          </Group>
        }
        centered
        size="90%"
        overlayProps={{ blur: 2, backgroundOpacity: 0.55 }}
        closeOnClickOutside={!loading}
        closeOnEscape={!loading}
        styles={{
          content: {
            display: "flex",
            flexDirection: "column",
            maxHeight: "85vh",
          },
          body: {
            flex: 1,
            minHeight: 0,
            padding: 0,
            display: "flex",
            flexDirection: "column",
          },
        }}
      >
        <div style={{ flex: 1, minHeight: 0, overflowY: "auto", padding: 16 }}>
          <Text size="xs" c="dimmed" mb="md">
            {inventory.warehouseName}
            {inventory.countDate &&
              ` · Conteo: ${inventory.countDate.split("-").reverse().join("/")}`}
          </Text>

          {summaryLoading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                gap: 10,
                padding: "56px 0",
                color: "var(--text3)",
              }}
            >
              <Loader size="sm" color="amber" />
              <Text size="sm" c="dimmed">
                Generando resumen...
              </Text>
            </div>
          )}

          {!summaryLoading && summaryData && (
            <div>
              <Text size="xs" c="dimmed" mb="sm">
                Seleccioná las categorías a confirmar. Las categorías sin check
                quedarán excluidas.
              </Text>
              <CategoryCheckboxList
                categories={summaryData.categories}
                articles={articles}
                checkedIds={checkedCategoryIds}
                setCheckedIds={setCheckedIds}
                zeroUncounted={zeroUncounted}
              />
            </div>
          )}
        </div>

        <Group
          justify="flex-end"
          gap="xs"
          style={{
            borderTop: "1px solid var(--mantine-color-dark-5)",
            padding: "12px 16px",
            flexShrink: 0,
            background: "var(--mantine-color-dark-7)",
          }}
        >
          <Button
            size="sm"
            variant="subtle"
            color="gray"
            onClick={handleClose}
            disabled={loading}
          >
            Cerrar
          </Button>

          {isBorrador && (
            <Tooltip
              label={
                summaryLoading
                  ? "Generando resumen..."
                  : "No hay artículos para confirmar"
              }
              withArrow
              disabled={!summaryLoading && articles.length > 0}
            >
              <Button
                leftSection={<Check size={15} />}
                size="sm"
                color="amber"
                loading={loading}
                disabled={summaryLoading || articles.length === 0}
                onClick={handleConfirmarClick}
              >
                Confirmar Inventario
              </Button>
            </Tooltip>
          )}
        </Group>
      </Modal>

      {/* Split dialog: qué hacer con categorías no chequeadas */}
      <Modal
        opened={splitDialogOpen}
        onClose={() => setSplitDialogOpen(false)}
        title={
          <Text
            fw={700}
            size="md"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Categorías sin confirmar
          </Text>
        }
        centered
        size="sm"
        overlayProps={{ blur: 2, backgroundOpacity: 0.55 }}
      >
        <Text size="sm" mb="md">
          Las siguientes categorías quedaron sin seleccionar:
        </Text>
        <Stack gap={4} mb="lg">
          {uncheckedCategories.map((c) => (
            <Text key={c.categoryId} size="sm" c="dimmed">
              · {c.categoryParentName ? `${c.categoryParentName} › ` : ""}
              {c.categoryName}
            </Text>
          ))}
        </Stack>
        <Text size="sm" fw={600} mb="sm">
          ¿Qué hacemos con ellas?
        </Text>
        <Radio.Group
          value={splitAction}
          onChange={(v) => setSplitAction(v as "discard" | "new_draft")}
        >
          <Stack gap="sm" mb="xl">
            <Radio
              value="discard"
              label="Descartarlas (no se sincronizan con Odoo)"
            />
            <Radio
              value="new_draft"
              label="Crear un nuevo inventario en Borrador con esas categorías"
            />
          </Stack>
        </Radio.Group>
        <Group justify="flex-end" gap="xs">
          <Button
            size="sm"
            variant="subtle"
            color="gray"
            onClick={() => setSplitDialogOpen(false)}
          >
            Cancelar
          </Button>
          <Button
            size="sm"
            color="amber"
            onClick={() => void executeConfirm(uncheckedIds)}
          >
            Aceptar
          </Button>
        </Group>
      </Modal>
    </>
  );
}

// ── Lista plana de categorías con checkboxes ───────────────────────────────────

function CategoryCheckboxList({
  categories,
  articles,
  checkedIds,
  setCheckedIds,
  zeroUncounted,
}: {
  categories: SummaryCategory[];
  articles: InventoryArticle[];
  checkedIds: Set<number>;
  setCheckedIds: (v: Set<number>) => void;
  zeroUncounted: boolean;
}) {
  const sorted = [...categories].sort((a, b) =>
    a.categoryName.localeCompare(b.categoryName, "es"),
  );
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
      {sorted.map((cat) => (
        <LeafCategoryRow
          key={cat.categoryId}
          cat={cat}
          articles={articles}
          checked={checkedIds.has(cat.categoryId)}
          onToggle={(v) => {
            const next = new Set(checkedIds);
            if (v) next.add(cat.categoryId);
            else next.delete(cat.categoryId);
            setCheckedIds(next);
          }}
          zeroUncounted={zeroUncounted}
        />
      ))}
    </div>
  );
}

function StatPill({
  label,
  value,
  sign,
}: {
  label: string;
  value: string;
  sign: number;
}) {
  const color =
    sign === 0
      ? "var(--text3)"
      : sign > 0
        ? "var(--mantine-color-green-4)"
        : "var(--mantine-color-red-4)";
  const bg =
    sign === 0
      ? "color-mix(in srgb, var(--text3) 10%, transparent)"
      : sign > 0
        ? "color-mix(in srgb, var(--mantine-color-green-6) 12%, transparent)"
        : "color-mix(in srgb, var(--mantine-color-red-6) 12%, transparent)";

  return (
    <div
      style={{
        display: "inline-flex",
        alignItems: "center",
        gap: 4,
        background: bg,
        borderRadius: 4,
        padding: "2px 7px",
      }}
    >
      <span
        style={{
          fontSize: 10,
          color: "var(--text3)",
          fontFamily: "var(--font-sans)",
          letterSpacing: "0.03em",
          textTransform: "uppercase",
        }}
      >
        {label}
      </span>
      <span
        style={{
          fontSize: 11,
          color,
          fontFamily: "var(--font-mono)",
          fontWeight: 600,
        }}
      >
        {value}
      </span>
    </div>
  );
}

function LeafCategoryRow({
  cat,
  articles,
  checked,
  onToggle,
  zeroUncounted,
}: {
  cat: SummaryCategory;
  articles: InventoryArticle[];
  checked: boolean;
  onToggle: (v: boolean) => void;
  zeroUncounted: boolean;
}) {
  const [expanded, setExpanded] = useState(false);

  const catArticles = articles.filter((a) => a.categoryId === cat.categoryId);
  const countedMap = new Map(catArticles.map((a) => [a.varianteId, a.qty]));
  const { aggDiff, aggCostDiff } = cat.products.reduce(
    (acc, p) => {
      const isCounted = countedMap.has(p.varianteId);
      const diff = isCounted
        ? countedMap.get(p.varianteId)! - p.qtyOnHand
        : zeroUncounted ? -p.qtyOnHand : 0;
      return {
        aggDiff: acc.aggDiff + diff,
        aggCostDiff: acc.aggCostDiff + diff * p.cost,
      };
    },
    { aggDiff: 0, aggCostDiff: 0 },
  );
  const hasWarning = Math.abs(aggDiff) > 10;
  const countedCount = cat.products.filter((p) =>
    countedMap.has(p.varianteId),
  ).length;

  return (
    <div style={{ marginBottom: 2 }}>
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          background:
            "color-mix(in srgb, var(--mantine-color-amber-6) 5%, transparent)",
          border:
            "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 20%, transparent)",
          borderRadius: 6,
          padding: "7px 10px",
        }}
      >
        <Checkbox
          checked={checked}
          onChange={(e) => onToggle(e.currentTarget.checked)}
        />
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flex: 1,
            background: "none",
            border: "none",
            cursor: "pointer",
            padding: 0,
            textAlign: "left",
          }}
        >
          {expanded ? (
            <ChevronDown size={13} color="var(--mantine-color-amber-5)" />
          ) : (
            <ChevronRight size={13} color="var(--mantine-color-amber-5)" />
          )}
          <Text size="sm" fw={500} c="amber.3" style={{ flex: 1 }}>
            {cat.categoryParentName ? (
              <span style={{ color: "var(--text3)", fontWeight: 400 }}>
                {cat.categoryParentName} ›{" "}
              </span>
            ) : null}
            {cat.categoryName}
          </Text>
          <Text size="xs" c="dimmed" style={{ marginRight: 8 }}>
            {countedCount} de {cat.products.length} variantes
          </Text>
        </button>
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 6,
            flexShrink: 0,
          }}
        >
          {hasWarning && (
            <AlertTriangle
              size={13}
              color="var(--mantine-color-orange-4)"
              style={{ flexShrink: 0 }}
            />
          )}
          <StatPill
            label="VAR."
            value={`${aggDiff > 0 ? "+" : ""}${aggDiff}`}
            sign={aggDiff}
          />
          {aggCostDiff !== 0 && (
            <StatPill
              label="Δ $"
              value={`${aggCostDiff > 0 ? "+" : ""}$ ${aggCostDiff.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`}
              sign={aggCostDiff}
            />
          )}
        </div>
      </div>

      {expanded && <ProductTable cat={cat} countedMap={countedMap} zeroUncounted={zeroUncounted} />}
    </div>
  );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function extractTemplateName(displayName: string): string {
  const idx = displayName.lastIndexOf(" (");
  return idx > 0 ? displayName.slice(0, idx) : displayName;
}

function extractVariantLabel(displayName: string): string {
  const idx = displayName.lastIndexOf(" (");
  return idx > 0 ? displayName.slice(idx + 2, -1) : "";
}

interface ProductGroupData {
  productoId: number;
  templateName: string;
  variants: SummaryProduct[];
  countedCount: number;
  aggCounted: number;
  aggOnHand: number;
  aggDiff: number;
  aggCostDiff: number;
}

// ── ProductTable ──────────────────────────────────────────────────────────────

function ProductTable({
  cat,
  countedMap,
  zeroUncounted,
}: {
  cat: SummaryCategory;
  countedMap: Map<number, number>;
  zeroUncounted: boolean;
}) {
  // Group variants by productoId (template)
  const groupMap = new Map<
    number,
    { templateName: string; variants: SummaryProduct[] }
  >();
  for (const p of cat.products) {
    if (!groupMap.has(p.productoId)) {
      groupMap.set(p.productoId, {
        templateName: extractTemplateName(p.name),
        variants: [],
      });
    }
    groupMap.get(p.productoId)!.variants.push(p);
  }

  const groups: ProductGroupData[] = Array.from(groupMap.entries()).map(
    ([productoId, { templateName, variants }]) => ({
      productoId,
      templateName,
      variants,
      countedCount: variants.filter((v) => countedMap.has(v.varianteId)).length,
      aggCounted: variants.reduce(
        (s, v) => s + (countedMap.get(v.varianteId) ?? 0),
        0,
      ),
      aggOnHand: variants.reduce((s, v) => s + v.qtyOnHand, 0),
      aggDiff: variants.reduce((s, v) => {
        const isCounted = countedMap.has(v.varianteId);
        const diff = isCounted
          ? countedMap.get(v.varianteId)! - v.qtyOnHand
          : zeroUncounted ? -v.qtyOnHand : 0;
        return s + diff;
      }, 0),
      aggCostDiff: variants.reduce((s, v) => {
        const isCounted = countedMap.has(v.varianteId);
        const diff = isCounted
          ? countedMap.get(v.varianteId)! - v.qtyOnHand
          : zeroUncounted ? -v.qtyOnHand : 0;
        return s + diff * v.cost;
      }, 0),
    }),
  );

  // Sort by aggCostDiff: negative first (most negative), positive after (most positive), zero/neutral last (alpha)
  const costBucket = (c: number) => (c < 0 ? 0 : c > 0 ? 1 : 2);
  groups.sort((a, b) => {
    const aBucket = costBucket(a.aggCostDiff);
    const bBucket = costBucket(b.aggCostDiff);
    if (aBucket !== bBucket) return aBucket - bBucket;
    if (aBucket === 0) return a.aggCostDiff - b.aggCostDiff;
    if (aBucket === 1) return b.aggCostDiff - a.aggCostDiff;
    return a.templateName.localeCompare(b.templateName, "es");
  });

  const countedGroups = groups.filter((g) => g.countedCount > 0);
  const uncountedGroups = groups.filter((g) => g.countedCount === 0);

  return (
    <div style={{ marginLeft: 24, marginTop: 4, marginBottom: 8 }}>
      {/* Column header */}
      <div
        style={{
          display: "grid",
          gridTemplateColumns: "130px 1fr 58px 58px 52px 96px",
          padding: "3px 8px 5px",
          borderBottom: "1px solid var(--border)",
          marginBottom: 4,
        }}
      >
        {[
          { label: "Código", align: "left" },
          { label: "Variante", align: "left" },
          { label: "Contado", align: "right" },
          { label: "En Mano", align: "right" },
          { label: "Dif.", align: "right" },
          { label: "Costo", align: "right" },
        ].map(({ label, align }) => (
          <span
            key={label}
            style={{
              fontSize: 10,
              fontWeight: 500,
              color: "white",
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              textAlign: align as "left" | "right",
            }}
          >
            {label}
          </span>
        ))}
      </div>

      {/* Counted / partial groups */}
      <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
        {countedGroups.map((g) => (
          <ProductGroup key={g.productoId} group={g} countedMap={countedMap} zeroUncounted={zeroUncounted} />
        ))}
      </div>

      {/* Uncounted groups — dimmed section */}
      {uncountedGroups.length > 0 && (
        <>
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 8,
              margin: "10px 0 6px",
            }}
          >
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
            <span
              style={{
                fontSize: 10,
                color: "white",
                textTransform: "uppercase",
                letterSpacing: "0.06em",
                fontWeight: 500,
                whiteSpace: "nowrap",
              }}
            >
              Sin conteo ({uncountedGroups.length})
            </span>
            <div style={{ flex: 1, height: 1, background: "var(--border)" }} />
          </div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {uncountedGroups.map((g) => (
              <ProductGroup
                key={g.productoId}
                group={g}
                countedMap={countedMap}
                zeroUncounted={zeroUncounted}
              />
            ))}
          </div>
        </>
      )}
    </div>
  );
}

// ── ProductGroup ──────────────────────────────────────────────────────────────

function ProductGroup({
  group,
  countedMap,
  zeroUncounted,
}: {
  group: ProductGroupData;
  countedMap: Map<number, number>;
  zeroUncounted: boolean;
}) {
  const [expanded, setExpanded] = useState(group.countedCount > 0);
  const isMulti = group.variants.length > 1;

  if (!isMulti) {
    return (
      <VariantRow
        variant={group.variants[0]}
        label={group.templateName}
        countedMap={countedMap}
        zeroUncounted={zeroUncounted}
      />
    );
  }

  const allCounted = group.countedCount === group.variants.length;
  const partiallyCounted = group.countedCount > 0 && !allCounted;

  return (
    <div>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 7,
          width: "100%",
          background:
            group.countedCount > 0
              ? "color-mix(in srgb, var(--mantine-color-amber-6) 7%, transparent)"
              : "color-mix(in srgb, var(--mantine-color-dark-5) 40%, transparent)",
          border: "1px solid",
          borderColor:
            group.countedCount > 0
              ? "color-mix(in srgb, var(--mantine-color-amber-6) 20%, transparent)"
              : "var(--mantine-color-dark-4)",
          borderRadius: 5,
          padding: "5px 8px",
          cursor: "pointer",
          textAlign: "left",
        }}
      >
        {expanded ? (
          <ChevronDown
            size={11}
            color="var(--mantine-color-amber-5)"
            style={{ flexShrink: 0 }}
          />
        ) : (
          <ChevronRight
            size={11}
            color="var(--mantine-color-amber-5)"
            style={{ flexShrink: 0 }}
          />
        )}

        <span
          style={{
            flex: 1,
            fontSize: 12,
            fontFamily: "var(--font-sans)",
            fontWeight: 600,
            color: group.countedCount > 0 ? "var(--text)" : "var(--text3)",
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
          }}
        >
          {group.templateName}
        </span>

        <span
          style={{
            fontSize: 10,
            color: partiallyCounted
              ? "var(--mantine-color-orange-4)"
              : allCounted
                ? "var(--mantine-color-green-5)"
                : "var(--text3)",
            flexShrink: 0,
            marginRight: 6,
            fontFamily: "var(--font-mono)",
          }}
        >
          {group.countedCount}/{group.variants.length}
        </span>

        {group.countedCount > 0 && (
          <div
            style={{
              display: "flex",
              alignItems: "center",
              gap: 10,
              flexShrink: 0,
            }}
          >
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--mantine-color-amber-4)",
                fontWeight: 700,
              }}
            >
              {group.aggCounted}
            </span>
            <span style={{ fontSize: 10, color: "var(--text3)" }}>·</span>
            <span
              style={{
                fontSize: 11,
                fontFamily: "var(--font-mono)",
                color: "var(--text3)",
              }}
            >
              {group.aggOnHand}
            </span>
            <StatPill
              label="Δ"
              value={`${group.aggDiff > 0 ? "+" : ""}${group.aggDiff}`}
              sign={group.aggDiff}
            />
          </div>
        )}
      </button>

      {expanded && (
        <div
          style={{
            marginLeft: 18,
            marginTop: 2,
            display: "flex",
            flexDirection: "column",
            gap: 1,
          }}
        >
          {[...group.variants]
            .sort((a, b) => {
              const aCounted = countedMap.has(a.varianteId);
              const bCounted = countedMap.has(b.varianteId);
              // Truly uncounted (zeroUncounted=false, not in countedMap) → last
              const aTrulyUncounted = !aCounted && !zeroUncounted;
              const bTrulyUncounted = !bCounted && !zeroUncounted;
              if (aTrulyUncounted !== bTrulyUncounted)
                return aTrulyUncounted ? 1 : -1;
              if (aTrulyUncounted && bTrulyUncounted) return 0;
              // Compute costDiff
              const aDiff = aCounted
                ? countedMap.get(a.varianteId)! - a.qtyOnHand
                : -a.qtyOnHand;
              const bDiff = bCounted
                ? countedMap.get(b.varianteId)! - b.qtyOnHand
                : -b.qtyOnHand;
              const aCostDiff = aDiff * a.cost;
              const bCostDiff = bDiff * b.cost;
              // Bucket: negative=0, positive=1, zero=2
              const bucket = (c: number) => (c < 0 ? 0 : c > 0 ? 1 : 2);
              const aBucket = bucket(aCostDiff);
              const bBucket = bucket(bCostDiff);
              if (aBucket !== bBucket) return aBucket - bBucket;
              if (aBucket === 0) return aCostDiff - bCostDiff;
              if (aBucket === 1) return bCostDiff - aCostDiff;
              return 0;
            })
            .map((v) => (
              <VariantRow
                key={v.varianteId}
                variant={v}
                label={extractVariantLabel(v.name) || v.name}
                countedMap={countedMap}
                zeroUncounted={zeroUncounted}
              />
            ))}
        </div>
      )}
    </div>
  );
}

// ── VariantRow ────────────────────────────────────────────────────────────────

function VariantRow({
  variant,
  label,
  countedMap,
  zeroUncounted,
}: {
  variant: SummaryProduct;
  label: string;
  countedMap: Map<number, number>;
  zeroUncounted: boolean;
}) {
  const counted = countedMap.get(variant.varianteId) ?? 0;
  const isCounted = countedMap.has(variant.varianteId);
  const diff = isCounted
    ? counted - variant.qtyOnHand
    : zeroUncounted ? -variant.qtyOnHand : 0;
  const diffColor =
    diff === 0
      ? "var(--text3)"
      : diff > 0
        ? "var(--mantine-color-green-5)"
        : "var(--mantine-color-red-5)";

  return (
    <div
      style={{
        display: "grid",
        gridTemplateColumns: "130px 1fr 58px 58px 52px 96px",
        alignItems: "center",
        padding: "3px 8px",
        borderRadius: 3,
        opacity: isCounted ? 1 : 0.75,
      }}
    >
      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: "var(--text3)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
        }}
      >
        {variant.barcode}
      </span>

      <span
        style={{
          fontSize: 12,
          color: "var(--text2)",
          overflow: "hidden",
          textOverflow: "ellipsis",
          whiteSpace: "nowrap",
          paddingRight: 8,
        }}
      >
        {label}
      </span>

      <span
        style={{
          fontSize: 13,
          fontFamily: "var(--font-mono)",
          color: "var(--mantine-color-amber-4)",
          fontWeight: 700,
          textAlign: "right",
        }}
      >
        {isCounted ? counted : "—"}
      </span>

      <span
        style={{
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          color: "var(--text3)",
          textAlign: "right",
        }}
      >
        {variant.qtyOnHand}
      </span>

      <span
        style={{
          fontSize: 12,
          fontFamily: "var(--font-mono)",
          color: diffColor,
          textAlign: "right",
        }}
      >
        {diff === 0
          ? isCounted
            ? "0"
            : ""
          : diff > 0
            ? `+${diff}`
            : String(diff)}
      </span>

      <span
        style={{
          fontSize: 11,
          fontFamily: "var(--font-mono)",
          color: diffColor,
          textAlign: "right",
        }}
      >
        ${" "}
        {variant.cost.toLocaleString("es-AR", {
          minimumFractionDigits: 2,
          maximumFractionDigits: 2,
        })}
      </span>
    </div>
  );
}
