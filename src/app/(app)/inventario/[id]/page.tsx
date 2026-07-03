"use client";
import { useState, useEffect, useRef, use, useCallback } from "react";
import { useRouter } from "next/navigation";
import {
  Button,
  Text,
  Group,
  Tooltip,
  ActionIcon,
  NumberInput,
  TextInput,
  Loader,
  Badge,
  Alert,
  Modal,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { Plus, Trash2, ScanBarcode, ArrowLeft, ArrowRight, Check, X, Minus, AlertCircle } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useInventory } from "@/hooks/useInventory";
import { InventoryStatusBadge } from "@/components/inventario/InventoryStatusBadge";
import { ResumenModal } from "@/components/inventario/ResumenModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { InventoryArticle, LocalInventory } from "@/types";

type Params = Promise<{ id: string }>;

function formatCurrency(n: number) {
  return n.toLocaleString("es-AR", {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  });
}

function formatDate(s: string | null) {
  if (!s) return "-";
  return s.slice(0, 10).split("-").reverse().join("/");
}

export default function InventarioCargarPage({ params }: { params: Params }) {
  const { id } = use(params);
  const { data: inventory, isLoading } = useInventory(parseInt(id));

  if (isLoading) {
    return (
      <div style={{ display: "flex", gap: 8, padding: 48, justifyContent: "center", color: "var(--text2)" }}>
        <LoadingSpinner size={20} /> Cargando inventario...
      </div>
    );
  }
  if (!inventory) {
    return (
      <div style={{ padding: 48, textAlign: "center" }}>
        <Text c="red">Inventario no encontrado</Text>
      </div>
    );
  }

  return <InventarioCargarContent inventory={inventory} />;
}

// ── Main content ──────────────────────────────────────────────────────────────

function InventarioCargarContent({ inventory }: { inventory: LocalInventory }) {
  const router = useRouter();
  const queryClient = useQueryClient();
  const invId = inventory.id;

  const [articles, setArticles] = useState<InventoryArticle[]>(inventory.articles);
  const [scanBuffer, setScanBuffer] = useState("");
  const [manualInput, setManualInput] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [resumenOpen, setResumenOpen] = useState(false);
  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // Auto-save feedback
  const [persistCount, setPersistCount] = useState(0); // number of in-flight persists
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // On-demand barcode cache: prevents duplicate Odoo fetches for the same barcode
  const articleCache = useRef<Map<string, InventoryArticle>>(new Map());

  // Refocus hidden input only when no real input is focused
  useEffect(() => {
    function refocus() {
      const active = document.activeElement;
      const isRealInput =
        active instanceof HTMLInputElement ||
        active instanceof HTMLTextAreaElement ||
        active instanceof HTMLSelectElement;
      if (active !== hiddenInputRef.current && !showManual && !isRealInput) {
        hiddenInputRef.current?.focus({ preventScroll: true });
      }
    }
    document.addEventListener("click", refocus);
    if (!showManual) {
      hiddenInputRef.current?.focus({ preventScroll: true });
    }
    return () => document.removeEventListener("click", refocus);
  }, [showManual]);

  const persistArticles = useCallback(async (updated: InventoryArticle[]) => {
    setPersistCount((n) => n + 1);
    try {
      await fetch(`/api/inventario/${invId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ articles: updated }),
      });
      queryClient.invalidateQueries({ queryKey: ["inventory", invId] });
      setSavedAt(new Date());
      if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
      savedTimerRef.current = setTimeout(() => setSavedAt(null), 2500);
    } finally {
      setPersistCount((n) => n - 1);
    }
  }, [invId, queryClient]);

  async function lookupBarcode(code: string) {
    const trimmed = code.trim();
    if (!trimmed) return;
    setScanError(null);

    // Already in list → increment qty
    const existing = articles.find((a) => a.barcode === trimmed);
    if (existing) {
      const updated = articles.map((a) =>
        a.barcode === trimmed ? { ...a, qty: a.qty + 1 } : a,
      );
      setArticles(updated);
      await persistArticles(updated);
      return;
    }

    // Cache hit → add immediately
    const cached = articleCache.current.get(trimmed);
    if (cached) {
      const article: InventoryArticle = { ...cached, qty: 1 };
      const updated = [...articles, article];
      setArticles(updated);
      await persistArticles(updated);
      return;
    }

    // Fetch from API
    setScanning(true);
    try {
      const res = await fetch(`/api/inventario/barcode?code=${encodeURIComponent(trimmed)}`);
      if (!res.ok) {
        setScanError(`Producto no encontrado: ${trimmed}`);
        return;
      }
      const article = (await res.json()) as InventoryArticle;
      articleCache.current.set(trimmed, article);
      const updated = [...articles, article];
      setArticles(updated);
      await persistArticles(updated);
    } finally {
      setScanning(false);
    }
  }

  function handleHiddenKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter") {
      const code = scanBuffer.trim();
      setScanBuffer("");
      if (code) void lookupBarcode(code);
    } else if (e.key.length === 1) {
      setScanBuffer((prev) => prev + e.key);
    }
  }

  async function handleManualSubmit() {
    const code = manualInput.trim();
    if (!code) return;
    setManualInput("");
    setShowManual(false);
    await lookupBarcode(code);
  }

  async function saveArticle(updated: InventoryArticle, original: InventoryArticle) {
    const next = articles.map((a) => (a.varianteId === updated.varianteId ? updated : a));
    setArticles(next);
    setSavingIds((prev) => new Set(prev).add(updated.varianteId));
    try {
      await persistArticles(next);
      // Sync price/cost changes to Odoo product
      if (updated.salePrice !== original.salePrice || updated.cost !== original.cost) {
        await fetch("/api/inventario/product-update", {
          method: "PATCH",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            varianteId: updated.varianteId,
            salePrice: updated.salePrice,
            cost: updated.cost,
          }),
        });
      }
    } finally {
      setSavingIds((prev) => {
        const next = new Set(prev);
        next.delete(updated.varianteId);
        return next;
      });
    }
  }

  function removeArticle(varianteId: number) {
    const updated = articles.filter((a) => a.varianteId !== varianteId);
    setArticles(updated);
    void persistArticles(updated);
  }

  async function handleQtyChange(varianteId: number, qty: number) {
    const next = articles.map((a) => (a.varianteId === varianteId ? { ...a, qty } : a));
    setArticles(next);
    await persistArticles(next);
  }

  const isReadonly = inventory.status === "CONFIRMADO";
  const canEdit = inventory.status === "BORRADOR";

  return (
    <div style={{ paddingBottom: 100 }}>
      {/* Sticky header */}
      <div
        style={{
          position: "sticky",
          top: 0,
          zIndex: 50,
          background: "var(--mantine-color-dark-8)",
          borderBottom: "1px solid var(--mantine-color-dark-5)",
          padding: "14px 24px",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 12,
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 12, minWidth: 0 }}>
          <button
            onClick={() => router.push("/inventario")}
            aria-label="Volver a inventarios"
            style={{
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text3)",
              display: "flex",
              alignItems: "center",
              padding: "4px 2px",
              flexShrink: 0,
              transition: "color 120ms ease",
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text3)")}
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div style={{ fontSize: 15, fontWeight: 700, color: "var(--text)", fontFamily: "var(--font-display)" }}>
              {inventory.warehouseName}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>
              {inventory.countDate && (
                <span>Conteo: {inventory.countDate.split("-").reverse().join("/")}</span>
              )}
              {inventory.accountingDate && (
                <span style={{ marginLeft: 8 }}>
                  · Contable: {inventory.accountingDate.split("-").reverse().join("/")}
                </span>
              )}
            </div>
          </div>
        </div>

        {canEdit && (
          <Group gap={8}>
            {/* Auto-save indicator */}
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 5,
                opacity: persistCount > 0 || savedAt ? 1 : 0,
                transition: "opacity 400ms ease",
                pointerEvents: "none",
              }}
            >
              {persistCount > 0 ? (
                <>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--mantine-color-amber-4)",
                      animation: "pulse 1s ease-in-out infinite",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>Guardando...</span>
                </>
              ) : savedAt ? (
                <>
                  <div
                    style={{
                      width: 6,
                      height: 6,
                      borderRadius: "50%",
                      background: "var(--mantine-color-green-5)",
                    }}
                  />
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>Guardado</span>
                </>
              ) : null}
            </div>

            {scanning && <Loader size={14} color="amber" />}
            <Badge color="green" variant="dot" size="sm" style={{ cursor: "default" }}>
              Scanner activo
            </Badge>
            <Tooltip label="Ingresar código manualmente" withArrow>
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<Plus size={13} />}
                onClick={() => setShowManual(true)}
              >
                Manual
              </Button>
            </Tooltip>
          </Group>
        )}

        {isReadonly && (
          <Button
            size="xs"
            variant="subtle"
            color="amber"
            rightSection={<ArrowRight size={13} />}
            onClick={() => setResumenOpen(true)}
          >
            Ver Resumen
          </Button>
        )}
      </div>

      {/* Scan error banner */}
      {scanError && (
        <Alert
          icon={<AlertCircle size={14} />}
          color="red"
          withCloseButton
          onClose={() => setScanError(null)}
          style={{ margin: "8px 24px 0" }}
          styles={{ message: { fontSize: 13 } }}
        >
          {scanError}
        </Alert>
      )}

      {/* Hidden barcode input */}
      {canEdit && (
        <input
          ref={hiddenInputRef}
          value={scanBuffer}
          onKeyDown={handleHiddenKeyDown}
          onChange={() => {}}
          style={{ position: "absolute", opacity: 0, width: 1, height: 1, pointerEvents: "none" }}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}

      {/* Manual barcode modal */}
      <ManualBarcodeModal
        opened={showManual}
        value={manualInput}
        onChange={setManualInput}
        onSubmit={() => void handleManualSubmit()}
        onClose={() => {
          setShowManual(false);
          setManualInput("");
        }}
      />

      {/* Sticky bottom action bar */}
      {inventory.status === "BORRADOR" && (
        <div
          style={{
            position: "fixed",
            bottom: 0,
            left: "var(--sidebar-width, 0px)",
            right: 0,
            zIndex: 50,
            background: "var(--mantine-color-dark-8)",
            borderTop: "1px solid var(--mantine-color-dark-5)",
            padding: "12px 24px",
            display: "flex",
            alignItems: "center",
            justifyContent: "space-between",
            gap: 12,
          }}
        >
          <span style={{ fontSize: 12, color: "var(--text3)" }}>
            Los cambios se guardan automáticamente al escanear
          </span>
          <Tooltip
            label="Agregá al menos un artículo para confirmar"
            withArrow
            disabled={articles.length > 0}
          >
            <Button
              leftSection={<Check size={14} />}
              color="amber"
              size="sm"
              disabled={articles.length === 0}
              onClick={() => setResumenOpen(true)}
            >
              Confirmar Inventario
            </Button>
          </Tooltip>
        </div>
      )}

      {/* Articles table */}
      <div style={{ padding: "0 24px" }}>
        {articles.length === 0 ? (
          <div style={{ textAlign: "center", padding: "64px 24px", color: "var(--text3)", fontSize: 13 }}>
            <ScanBarcode size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div>Escaneá un código de barras para comenzar</div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              o usá el botón &quot;Manual&quot; para ingresar uno a mano
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{ width: "100%", borderCollapse: "collapse", fontSize: 13, fontFamily: "var(--font-sans)" }}
            >
              <thead>
                <tr style={{ borderBottom: "1px solid var(--border)" }}>
                  {[
                    { label: "Código", w: 120 },
                    { label: "Descripción", w: undefined },
                    { label: "Marca", w: 110 },
                    { label: "Talle", w: 70 },
                    { label: "Precio Venta", w: 130 },
                    { label: "Costo", w: 120 },
                    { label: "Últ. Compra", w: 120 },
                    { label: "Cantidad", w: 140 },
                    { label: "", w: 64 },
                  ].map(({ label, w }) => (
                    <th
                      key={label || "acc"}
                      style={{
                        padding: "10px 12px",
                        textAlign: "left",
                        color: "var(--text3)",
                        fontWeight: 500,
                        fontSize: 11,
                        letterSpacing: "0.04em",
                        textTransform: "uppercase",
                        whiteSpace: "nowrap",
                        width: w,
                      }}
                    >
                      {label}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {articles.map((a) => (
                  <ArticleRow
                    key={a.varianteId}
                    article={a}
                    readonly={isReadonly}
                    isSaving={savingIds.has(a.varianteId)}
                    onSave={saveArticle}
                    onQtyChange={handleQtyChange}
                    onRemove={removeArticle}
                  />
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Resumen modal */}
      <ResumenModal
        opened={resumenOpen}
        onClose={() => setResumenOpen(false)}
        inventory={inventory}
        articles={articles}
      />
    </div>
  );
}

// ── ManualBarcodeModal ────────────────────────────────────────────────────────

function ManualBarcodeModal({
  opened,
  value,
  onChange,
  onSubmit,
  onClose,
}: {
  opened: boolean;
  value: string;
  onChange: (v: string) => void;
  onSubmit: () => void;
  onClose: () => void;
}) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Group gap={10} align="center">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background: "color-mix(in srgb, var(--mantine-color-amber-6) 12%, transparent)",
              border: "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 25%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ScanBarcode size={16} color="var(--mantine-color-amber-4)" />
          </div>
          <Text fw={700} size="md" style={{ fontFamily: "var(--font-display)" }}>
            Ingresar Código
          </Text>
        </Group>
      }
      centered
      size="sm"
      overlayProps={{ blur: 2, backgroundOpacity: 0.45 }}
    >
      <Text size="xs" c="dimmed" mb="md">
        Ingresá el código de barras o usá la pistola con el campo activo.
      </Text>

      <TextInput
        autoFocus
        placeholder="7790001234567"
        value={value}
        onChange={(e) => onChange(e.currentTarget.value)}
        onKeyDown={(e) => {
          if (e.key === "Enter" && value.trim()) onSubmit();
        }}
        size="lg"
        styles={{
          input: {
            fontFamily: "var(--font-mono)",
            fontSize: 15,
            letterSpacing: "0.06em",
          },
        }}
        mb="lg"
      />

      <Group justify="flex-end" gap="xs" pt="sm" style={{ borderTop: "1px solid var(--border)" }}>
        <Button size="sm" variant="subtle" color="gray" onClick={onClose}>
          Cancelar
        </Button>
        <Button
          size="sm"
          color="amber"
          disabled={!value.trim()}
          onClick={onSubmit}
        >
          Agregar Artículo
        </Button>
      </Group>
    </Modal>
  );
}

// ── ArticleRow — owns local state, tracks dirty ───────────────────────────────

interface ArticleRowProps {
  article: InventoryArticle;
  readonly: boolean;
  isSaving: boolean;
  onSave: (updated: InventoryArticle, original: InventoryArticle) => Promise<void>;
  onQtyChange: (varianteId: number, qty: number) => Promise<void>;
  onRemove: (varianteId: number) => void;
}

function ArticleRow({ article, readonly, isSaving, onSave, onQtyChange, onRemove }: ArticleRowProps) {
  const [local, setLocal] = useState<InventoryArticle>(article);
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingCost, setEditingCost] = useState(false);

  // Sync if parent article changes (e.g. after save)
  useEffect(() => {
    setLocal(article);
  }, [article]);

  // Only prop changes require manual save — qty auto-saves
  const isDirty =
    local.salePrice !== article.salePrice ||
    local.cost !== article.cost ||
    local.lastPurchaseDate !== article.lastPurchaseDate;

  function setField<K extends keyof InventoryArticle>(field: K, value: InventoryArticle[K]) {
    setLocal((prev) => ({ ...prev, [field]: value }));
  }

  function handleCancel() {
    setLocal(article);
    setEditingPrice(false);
    setEditingCost(false);
  }

  async function handleSave() {
    await onSave(local, article);
    setEditingPrice(false);
    setEditingCost(false);
  }

  return (
    <tr style={{ borderBottom: "1px solid var(--border)", background: isDirty ? "rgba(251,191,36,0.04)" : undefined }}>
      {/* Código */}
      <td style={{ padding: "10px 12px", color: "var(--text2)", fontFamily: "var(--font-mono)", fontSize: 12 }}>
        {article.barcode}
      </td>

      {/* Descripción */}
      <td style={{ padding: "10px 12px", color: "var(--text2)" }}>
        {article.name}
      </td>

      {/* Marca */}
      <td style={{ padding: "10px 12px", color: "var(--text3)", fontSize: 12 }}>
        {article.brand ?? "-"}
      </td>

      {/* Talle */}
      <td style={{ padding: "10px 12px", color: "var(--text3)", fontSize: 12 }}>
        {article.size ?? "-"}
      </td>

      {/* Precio Venta */}
      <td style={{ padding: "4px 8px" }}>
        {readonly ? (
          <span style={{ padding: "10px 4px", color: "var(--text2)", display: "block" }}>
            {formatCurrency(local.salePrice)}
          </span>
        ) : editingPrice ? (
          <NumberInput
            value={local.salePrice}
            onChange={(v) => setField("salePrice", typeof v === "number" ? v : 0)}
            onBlur={() => setEditingPrice(false)}
            size="xs"
            w={110}
            decimalScale={2}
            min={0}
            autoFocus
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
        ) : (
          <div
            onClick={() => setEditingPrice(true)}
            style={{
              padding: "6px 4px",
              borderRadius: 4,
              color: "var(--text2)",
              border: "1px solid transparent",
              cursor: "text",
              fontSize: 13,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "transparent")}
          >
            {formatCurrency(local.salePrice)}
          </div>
        )}
      </td>

      {/* Costo */}
      <td style={{ padding: "4px 8px" }}>
        {readonly ? (
          <span style={{ padding: "10px 4px", color: "var(--text2)", display: "block" }}>
            {formatCurrency(local.cost)}
          </span>
        ) : editingCost ? (
          <NumberInput
            value={local.cost}
            onChange={(v) => setField("cost", typeof v === "number" ? v : 0)}
            onBlur={() => setEditingCost(false)}
            size="xs"
            w={100}
            decimalScale={2}
            min={0}
            autoFocus
            hideControls
            styles={{ input: { fontFamily: "var(--font-mono)" } }}
          />
        ) : (
          <div
            onClick={() => setEditingCost(true)}
            style={{
              padding: "6px 4px",
              borderRadius: 4,
              color: "var(--text2)",
              border: "1px solid transparent",
              cursor: "text",
              fontSize: 13,
            }}
            onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "var(--border)")}
            onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.borderColor = "transparent")}
          >
            {formatCurrency(local.cost)}
          </div>
        )}
      </td>

      {/* Últ. Compra */}
      <td style={{ padding: "4px 8px" }}>
        {readonly ? (
          <span style={{ padding: "10px 4px", color: "var(--text3)", display: "block", fontSize: 13 }}>
            {formatDate(local.lastPurchaseDate)}
          </span>
        ) : (
          <DatePickerInput
            value={local.lastPurchaseDate ? new Date(local.lastPurchaseDate.slice(0, 10) + "T12:00:00") : null}
            onChange={(v) => setField("lastPurchaseDate", v ? (v as unknown as Date).toISOString().slice(0, 10) : null)}
            valueFormat="DD/MM/YYYY"
            locale="es"
            clearable
            size="xs"
            w={130}
            styles={{
              input: { color: "var(--text3)", fontSize: 13 },
            }}
          />
        )}
      </td>

      {/* Cantidad con botones +/- */}
      <td style={{ padding: "4px 8px" }}>
        {readonly ? (
          <span
            style={{
              padding: "6px 4px",
              color: "var(--mantine-color-amber-4)",
              fontFamily: "var(--font-mono)",
              fontWeight: 700,
              fontSize: 15,
              display: "block",
            }}
          >
            {local.qty}
          </span>
        ) : (
          <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                const next = Math.max(0, local.qty - 1);
                setField("qty", next);
                void onQtyChange(article.varianteId, next);
              }}
            >
              <Minus size={11} />
            </ActionIcon>
            <NumberInput
              value={local.qty}
              onChange={(v) => {
                const next = typeof v === "number" ? Math.max(0, Math.round(v)) : 0;
                setField("qty", next);
              }}
              onBlur={() => {
                if (local.qty !== article.qty) void onQtyChange(article.varianteId, local.qty);
              }}
              onFocus={(e) => e.currentTarget.select()}
              onKeyDown={(e) => {
                if (e.key === "Backspace" || e.key === "Delete") {
                  const el = e.currentTarget;
                  setTimeout(() => el.select(), 0);
                }
              }}
              size="xs"
              w={60}
              decimalScale={0}
              min={0}
              hideControls
              styles={{
                input: {
                  fontFamily: "var(--font-mono)",
                  color: "var(--mantine-color-amber-4)",
                  fontWeight: 700,
                  fontSize: 15,
                  textAlign: "center",
                },
              }}
            />
            <ActionIcon
              size="xs"
              variant="subtle"
              color="gray"
              onClick={() => {
                const next = local.qty + 1;
                setField("qty", next);
                void onQtyChange(article.varianteId, next);
              }}
            >
              <Plus size={11} />
            </ActionIcon>
          </div>
        )}
      </td>

      {/* Acciones */}
      <td style={{ padding: "6px 8px" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 4 }}>
          {!readonly && isDirty && (
            <>
              {isSaving ? (
                <Loader size={12} color="amber" />
              ) : (
                <Tooltip label="Guardar cambios" withArrow>
                  <ActionIcon
                    size="xs"
                    variant="filled"
                    color="amber"
                    onClick={() => void handleSave()}
                  >
                    <Check size={11} />
                  </ActionIcon>
                </Tooltip>
              )}
              <Tooltip label="Cancelar cambios" withArrow>
                <ActionIcon
                  size="xs"
                  variant="subtle"
                  color="gray"
                  onClick={handleCancel}
                  disabled={isSaving}
                >
                  <X size={11} />
                </ActionIcon>
              </Tooltip>
            </>
          )}
          {!readonly && !isDirty && (
            <Tooltip label="Eliminar" withArrow>
              <ActionIcon
                size="xs"
                variant="subtle"
                color="red"
                onClick={() => onRemove(article.varianteId)}
              >
                <Trash2 size={12} />
              </ActionIcon>
            </Tooltip>
          )}
        </div>
      </td>
    </tr>
  );
}
