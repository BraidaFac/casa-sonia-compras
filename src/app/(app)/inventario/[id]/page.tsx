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
  Combobox,
  useCombobox,
  ScrollArea,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import {
  Plus,
  Trash2,
  ScanBarcode,
  ArrowLeft,
  ArrowRight,
  Check,
  X,
  Minus,
  AlertCircle,
  CheckCircle2,
  Zap,
} from "lucide-react";
import { useInventory } from "@/hooks/useInventory";
import { InventoryStatusBadge } from "@/components/inventario/InventoryStatusBadge";
import { ResumenModal } from "@/components/inventario/ResumenModal";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { InventoryArticle, LocalInventory } from "@/types";

type Params = Promise<{ id: string }>;
type SearchParamsType = Promise<{ categories?: string }>;

interface VariantSearchResult {
  varianteId: number;
  name: string;
  barcode: string | null;
  defaultCode: string | null;
  qtyOnHand: number;
}

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

export default function InventarioCargarPage({
  params,
  searchParams,
}: {
  params: Params;
  searchParams: SearchParamsType;
}) {
  const { id } = use(params);
  const { categories } = use(searchParams);
  const warmupCategories = categories
    ? categories
        .split(",")
        .map(Number)
        .filter((n) => !isNaN(n) && n > 0)
    : [];

  const { data: inventory, isLoading } = useInventory(parseInt(id));

  if (isLoading) {
    return (
      <div
        style={{
          display: "flex",
          gap: 8,
          padding: 48,
          justifyContent: "center",
          color: "var(--text2)",
        }}
      >
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

  return (
    <InventarioCargarContent
      inventory={inventory}
      warmupCategories={warmupCategories}
    />
  );
}

// ── Warmup banner ─────────────────────────────────────────────────────────────

type WarmupStatus = "loading" | "done" | "error";

function WarmupBanner({
  status,
  count,
}: {
  status: WarmupStatus;
  count: number;
}) {
  if (status === "loading") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "8px 24px 0",
          padding: "8px 12px",
          background:
            "color-mix(in srgb, var(--mantine-color-amber-9) 20%, transparent)",
          border:
            "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 30%, transparent)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--mantine-color-amber-3)",
        }}
      >
        <Loader size={12} color="amber" />
        <Zap size={12} />
        Preparando caché de artículos — el scanner se habilitará al terminar...
      </div>
    );
  }

  if (status === "done") {
    return (
      <div
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          margin: "8px 24px 0",
          padding: "8px 12px",
          background:
            "color-mix(in srgb, var(--mantine-color-green-9) 20%, transparent)",
          border:
            "1px solid color-mix(in srgb, var(--mantine-color-green-6) 30%, transparent)",
          borderRadius: 6,
          fontSize: 12,
          color: "var(--mantine-color-green-3)",
        }}
      >
        <CheckCircle2 size={12} />
        <Zap size={12} />
        Caché lista — {count} producto{count !== 1 ? "s" : ""} precargado
        {count !== 1 ? "s" : ""}
      </div>
    );
  }

  return (
    <div
      style={{
        display: "flex",
        alignItems: "center",
        gap: 8,
        margin: "8px 24px 0",
        padding: "8px 12px",
        background:
          "color-mix(in srgb, var(--mantine-color-red-9) 20%, transparent)",
        border:
          "1px solid color-mix(in srgb, var(--mantine-color-red-6) 30%, transparent)",
        borderRadius: 6,
        fontSize: 12,
        color: "var(--mantine-color-red-3)",
      }}
    >
      <AlertCircle size={12} />
      Error al precargar caché — el scanner seguirá funcionando con fallback a
      Odoo
    </div>
  );
}

// ── Main content ──────────────────────────────────────────────────────────────

function InventarioCargarContent({
  inventory,
  warmupCategories,
}: {
  inventory: LocalInventory;
  warmupCategories: number[];
}) {
  const router = useRouter();
  const invId = inventory.id;

  const [articles, setArticles] = useState<InventoryArticle[]>(
    inventory.articles,
  );
  const [scanBuffer, setScanBuffer] = useState("");
  const [showManual, setShowManual] = useState(false);
  const [scanning, setScanning] = useState(false);
  const [scanError, setScanError] = useState<string | null>(null);
  const [savingIds, setSavingIds] = useState<Set<number>>(new Set());
  const [resumenOpen, setResumenOpen] = useState(false);

  // Auto-save feedback
  const [persistCount, setPersistCount] = useState(0);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const savedTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const persistDebounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Last scanned highlight
  const [lastScannedId, setLastScannedId] = useState<number | null>(null);

  function flashScanned(varianteId: number) {
    setLastScannedId(varianteId);
  }

  // Warmup state
  const [warmupStatus, setWarmupStatus] = useState<WarmupStatus | null>(null);
  const [warmupCount, setWarmupCount] = useState(0);
  const warmupDoneRef = useRef(false);
  const warmupBannerTimerRef = useRef<ReturnType<typeof setTimeout> | null>(
    null,
  );

  // On-demand barcode cache: barcode → InventoryArticle
  const articleCache = useRef<Map<string, InventoryArticle>>(new Map());
  // Guard: which productoIds have had their siblings prefetched
  const prefetchedTemplates = useRef<Set<number>>(new Set());

  // ── Scan queue — prevents lost scans and stale-closure issues ───────────────
  // articlesRef mirrors articles state; updated synchronously before setArticles
  // so queue items always read the latest list without relying on React closures.
  const articlesRef = useRef<InventoryArticle[]>(inventory.articles);
  const scanQueue = useRef<string[]>([]);
  const isProcessingQueue = useRef(false);

  const hiddenInputRef = useRef<HTMLInputElement>(null);

  // ── Warmup: populate articleCache from selected categories ──────────────────
  useEffect(() => {
    if (warmupDoneRef.current || warmupCategories.length === 0) return;
    warmupDoneRef.current = true;

    setWarmupStatus("loading");

    fetch(
      `/api/inventario/category-warmup?categoryIds=${warmupCategories.join(",")}&warehouseId=${inventory.warehouseId}`,
    )
      .then((r) =>
        r.ok ? r.json() : Promise.reject(new Error("warmup fetch failed")),
      )
      .then((items: InventoryArticle[]) => {
        let loaded = 0;
        for (const item of items) {
          if (item.barcode && !articleCache.current.has(item.barcode)) {
            articleCache.current.set(item.barcode, item);
            loaded++;
          }
          // Mark template as prefetched — no need to re-fetch siblings
          if (item.productoId) {
            prefetchedTemplates.current.add(item.productoId);
          }
        }
        setWarmupCount(loaded);
        setWarmupStatus("done");

        // Hide banner after 4s
        warmupBannerTimerRef.current = setTimeout(
          () => setWarmupStatus(null),
          4000,
        );
      })
      .catch(() => {
        setWarmupStatus("error");
        // Hide error banner after 6s
        warmupBannerTimerRef.current = setTimeout(
          () => setWarmupStatus(null),
          6000,
        );
      });

    return () => {
      if (warmupBannerTimerRef.current)
        clearTimeout(warmupBannerTimerRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  // Debounced: batches rapid scans/changes into a single PATCH.
  // No invalidateQueries — client state is authoritative (single user, in-memory).
  const persistArticles = useCallback(
    (updated: InventoryArticle[]) => {
      if (persistDebounceRef.current) clearTimeout(persistDebounceRef.current);
      persistDebounceRef.current = setTimeout(async () => {
        setPersistCount((n) => n + 1);
        try {
          await fetch(`/api/inventario/${invId}`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ articles: updated }),
          });
          setSavedAt(new Date());
          if (savedTimerRef.current) clearTimeout(savedTimerRef.current);
          savedTimerRef.current = setTimeout(() => setSavedAt(null), 2500);
        } finally {
          setPersistCount((n) => n - 1);
        }
      }, 2000);
    },
    [invId],
  );

  // ── Core scan processor ────────────────────────────────────────────────────
  // Uses articlesRef (not articles closure) to always work on fresh state.
  const processOneScan = useCallback(
    async (code: string) => {
      const trimmed = code.trim();
      if (!trimmed) return;
      setScanError(null);

      const current = articlesRef.current;

      // Helper: add-or-increment by varianteId, always move to top
      function addOrIncrement(list: InventoryArticle[], article: InventoryArticle): InventoryArticle[] {
        const dupe = list.find((a) => a.varianteId === article.varianteId);
        if (dupe) {
          return [{ ...dupe, qty: dupe.qty + 1 }, ...list.filter((a) => a.varianteId !== dupe.varianteId)];
        }
        return [{ ...article, qty: article.qty }, ...list];
      }

      // Already in list by barcode → increment qty and move to top
      const existing = current.find((a) => a.barcode === trimmed);
      if (existing) {
        const updated = [
          { ...existing, qty: existing.qty + 1 },
          ...current.filter((a) => a.varianteId !== existing.varianteId),
        ];
        articlesRef.current = updated;
        setArticles(updated);
        flashScanned(existing.varianteId);
        await persistArticles(updated);
        return;
      }

      // Cache hit → add-or-increment (same varianteId may already be in list via different barcode)
      const cached = articleCache.current.get(trimmed);
      if (cached) {
        const updated = addOrIncrement(current, { ...cached, qty: 1 });
        articlesRef.current = updated;
        setArticles(updated);
        flashScanned(updated[0].varianteId);
        await persistArticles(updated);
        return;
      }

      // Fetch from API (cache miss)
      setScanning(true);
      try {
        const res = await fetch(
          `/api/inventario/barcode?code=${encodeURIComponent(trimmed)}&warehouseId=${inventory.warehouseId}`,
        );
        if (!res.ok) {
          setScanError(`Producto no encontrado: ${trimmed}`);
          return;
        }
        const article = (await res.json()) as InventoryArticle;
        articleCache.current.set(trimmed, article);

        // Read articlesRef again — another queue item may have modified it during the fetch
        const fresh = articlesRef.current;
        const updated = addOrIncrement(fresh, { ...article, qty: 1 });
        articlesRef.current = updated;
        setArticles(updated);
        flashScanned(updated[0].varianteId);
        await persistArticles(updated);

        // Background prefetch siblings of this template
        if (
          article.productoId &&
          !prefetchedTemplates.current.has(article.productoId)
        ) {
          prefetchedTemplates.current.add(article.productoId);
          void fetch(
            `/api/inventario/variants?productoId=${article.productoId}&warehouseId=${inventory.warehouseId}`,
          )
            .then((r) => (r.ok ? r.json() : null))
            .then((siblings: InventoryArticle[] | null) => {
              if (!siblings) return;
              for (const sibling of siblings) {
                if (
                  sibling.barcode &&
                  !articleCache.current.has(sibling.barcode)
                ) {
                  articleCache.current.set(sibling.barcode, sibling);
                }
              }
            });
        }
      } finally {
        setScanning(false);
      }
    },
    [inventory.warehouseId, persistArticles],
  );

  // ── Queue drain — sequential, never loses a scan ───────────────────────────
  const drainQueue = useCallback(async () => {
    if (isProcessingQueue.current) return;
    isProcessingQueue.current = true;
    try {
      while (scanQueue.current.length > 0) {
        const code = scanQueue.current.shift()!;
        await processOneScan(code);
      }
    } finally {
      isProcessingQueue.current = false;
    }
  }, [processOneScan]);

  function enqueueScan(code: string) {
    if (warmupStatus === "loading") return;
    scanQueue.current.push(code);
    void drainQueue();
  }

  function handleHiddenKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (warmupStatus === "loading") {
      setScanBuffer("");
      return;
    }
    if (e.key === "Enter") {
      const code = scanBuffer.trim();
      setScanBuffer("");
      if (code) enqueueScan(code);
    } else if (e.key.length === 1) {
      setScanBuffer((prev) => prev + e.key);
    }
  }

  async function handleAddVariant(varianteId: number) {
    setShowManual(false);
    setScanError(null);

    const current = articlesRef.current;
    const existing = current.find((a) => a.varianteId === varianteId);
    if (existing) {
      const incremented = { ...existing, qty: existing.qty + 1 };
      const updated = [
        incremented,
        ...current.filter((a) => a.varianteId !== varianteId),
      ];
      articlesRef.current = updated;
      setArticles(updated);
      flashScanned(varianteId);
      await persistArticles(updated);
      return;
    }

    setScanning(true);
    try {
      const res = await fetch(
        `/api/inventario/barcode?varianteId=${varianteId}&warehouseId=${inventory.warehouseId}`,
      );
      if (!res.ok) {
        setScanError("Producto no encontrado");
        return;
      }
      const article = (await res.json()) as InventoryArticle;
      if (article.barcode) {
        articleCache.current.set(article.barcode, article);
      }
      const fresh = articlesRef.current;
      const updated = [article, ...fresh];
      articlesRef.current = updated;
      setArticles(updated);
      flashScanned(article.varianteId);
      await persistArticles(updated);

      if (
        article.productoId &&
        !prefetchedTemplates.current.has(article.productoId)
      ) {
        prefetchedTemplates.current.add(article.productoId);
        void fetch(
          `/api/inventario/variants?productoId=${article.productoId}&warehouseId=${inventory.warehouseId}`,
        )
          .then((r) => (r.ok ? r.json() : null))
          .then((siblings: InventoryArticle[] | null) => {
            if (!siblings) return;
            for (const sibling of siblings) {
              if (
                sibling.barcode &&
                !articleCache.current.has(sibling.barcode)
              ) {
                articleCache.current.set(sibling.barcode, sibling);
              }
            }
          });
      }
    } finally {
      setScanning(false);
    }
  }

  async function saveArticle(
    updated: InventoryArticle,
    original: InventoryArticle,
  ) {
    const next = articlesRef.current.map((a) =>
      a.varianteId === updated.varianteId ? updated : a,
    );
    articlesRef.current = next;
    setArticles(next);
    setSavingIds((prev) => new Set(prev).add(updated.varianteId));
    try {
      await persistArticles(next);
      if (
        updated.salePrice !== original.salePrice ||
        updated.cost !== original.cost
      ) {
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
    const updated = articlesRef.current.filter(
      (a) => a.varianteId !== varianteId,
    );
    articlesRef.current = updated;
    setArticles(updated);
    void persistArticles(updated);
  }

  async function handleQtyChange(varianteId: number, qty: number) {
    const next = articlesRef.current.map((a) =>
      a.varianteId === varianteId ? { ...a, qty } : a,
    );
    articlesRef.current = next;
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
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 12,
            minWidth: 0,
          }}
        >
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
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.color = "var(--text)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.color = "var(--text3)")
            }
          >
            <ArrowLeft size={16} />
          </button>
          <div>
            <div
              style={{
                fontSize: 15,
                fontWeight: 700,
                color: "var(--text)",
                fontFamily: "var(--font-display)",
              }}
            >
              {inventory.warehouseName}
            </div>
            <div style={{ fontSize: 12, color: "var(--text3)", marginTop: 1 }}>
              {inventory.countDate && (
                <span>
                  Conteo: {inventory.countDate.split("-").reverse().join("/")}
                </span>
              )}
              {inventory.accountingDate && (
                <span style={{ marginLeft: 8 }}>
                  · Contable:{" "}
                  {inventory.accountingDate.split("-").reverse().join("/")}
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
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>
                    Guardando...
                  </span>
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
                  <span style={{ fontSize: 11, color: "var(--text3)" }}>
                    Guardado
                  </span>
                </>
              ) : null}
            </div>

            {scanning && <Loader size={14} color="amber" />}
            <Badge
              color="green"
              variant="dot"
              size="sm"
              style={{ cursor: "default" }}
            >
              Scanner activo
            </Badge>
            <Tooltip
              label={
                warmupStatus === "loading"
                  ? "Esperá a que termine la carga de caché"
                  : "Ingresar código manualmente"
              }
              withArrow
            >
              <Button
                size="xs"
                variant="subtle"
                color="gray"
                leftSection={<Plus size={13} />}
                onClick={() => setShowManual(true)}
                disabled={warmupStatus === "loading"}
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

      {/* Warmup banner */}
      {warmupStatus !== null && (
        <WarmupBanner status={warmupStatus} count={warmupCount} />
      )}

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
          style={{
            position: "absolute",
            opacity: 0,
            width: 1,
            height: 1,
            pointerEvents: "none",
          }}
          aria-hidden="true"
          tabIndex={-1}
        />
      )}

      {/* Manual search modal */}
      <VariantSearchModal
        opened={showManual}
        warehouseId={inventory.warehouseId}
        existingVarianteIds={new Set(articles.map((a) => a.varianteId))}
        onSelectVariant={(varianteId) => void handleAddVariant(varianteId)}
        onSubmitBarcode={(code) => {
          setShowManual(false);
          enqueueScan(code);
        }}
        onClose={() => setShowManual(false)}
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
          <div
            style={{
              textAlign: "center",
              padding: "64px 24px",
              color: "var(--text3)",
              fontSize: 13,
            }}
          >
            <ScanBarcode size={32} style={{ opacity: 0.3, marginBottom: 12 }} />
            <div>Escaneá un código de barras para comenzar</div>
            <div style={{ fontSize: 11, marginTop: 4, opacity: 0.6 }}>
              o usá el botón &quot;Manual&quot; para ingresar uno a mano
            </div>
          </div>
        ) : (
          <div style={{ overflowX: "auto" }}>
            <table
              style={{
                width: "100%",
                borderCollapse: "collapse",
                fontSize: 13,
                fontFamily: "var(--font-sans)",
              }}
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
                    { label: "En Mano", w: 80 },
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
                    isLastScanned={lastScannedId === a.varianteId}
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

// ── VariantSearchModal ────────────────────────────────────────────────────────

function VariantSearchModal({
  opened,
  warehouseId,
  existingVarianteIds,
  onSelectVariant,
  onSubmitBarcode,
  onClose,
}: {
  opened: boolean;
  warehouseId: number;
  existingVarianteIds: Set<number>;
  onSelectVariant: (varianteId: number) => void;
  onSubmitBarcode: (code: string) => void;
  onClose: () => void;
}) {
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<VariantSearchResult[]>([]);
  const [loading, setLoading] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  useEffect(() => {
    if (!opened) return;
    setQuery(""); // eslint-disable-line react-hooks/set-state-in-effect
    setResults([]); // eslint-disable-line react-hooks/set-state-in-effect
    combobox.closeDropdown();
    const t = setTimeout(() => inputRef.current?.focus(), 80);
    return () => clearTimeout(t);
  }, [opened]); // eslint-disable-line react-hooks/exhaustive-deps

  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    if (!query.trim() || query.trim().length < 2) {
      setResults([]); // eslint-disable-line react-hooks/set-state-in-effect
      combobox.closeDropdown();
      return;
    }
    debounceRef.current = setTimeout(async () => {
      setLoading(true);
      try {
        const res = await fetch(
          `/api/inventario/variant-search?q=${encodeURIComponent(query.trim())}&warehouseId=${warehouseId}`,
        );
        if (res.ok) {
          const data = (await res.json()) as VariantSearchResult[];
          setResults(data);
          if (data.length > 0) combobox.openDropdown();
          else combobox.closeDropdown();
        }
      } finally {
        setLoading(false);
      }
    }, 400);
    return () => {
      if (debounceRef.current) clearTimeout(debounceRef.current);
    };
  }, [query, warehouseId]); // eslint-disable-line react-hooks/exhaustive-deps

  function handleSelect(varianteId: number) {
    combobox.closeDropdown();
    setQuery("");
    setResults([]);
    onSelectVariant(varianteId);
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "Enter" && query.trim() && !combobox.dropdownOpened) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      const code = query.trim();
      setQuery("");
      setResults([]);
      onSubmitBarcode(code);
    }
    if (e.key === "Tab" && combobox.dropdownOpened) {
      e.preventDefault();
      combobox.selectNextOption();
    }
  }

  const noResults =
    !loading && query.trim().length >= 2 && results.length === 0;

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      zIndex={300}
      title={
        <Group gap={10} align="center">
          <div
            style={{
              width: 32,
              height: 32,
              borderRadius: 8,
              background:
                "color-mix(in srgb, var(--mantine-color-amber-6) 12%, transparent)",
              border:
                "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 25%, transparent)",
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              flexShrink: 0,
            }}
          >
            <ScanBarcode size={16} color="var(--mantine-color-amber-4)" />
          </div>
          <Text
            fw={700}
            size="md"
            style={{ fontFamily: "var(--font-display)" }}
          >
            Buscar Artículo
          </Text>
        </Group>
      }
      size="md"
      overlayProps={{ blur: 2, backgroundOpacity: 0.45 }}
      styles={{ inner: { alignItems: "flex-start", paddingTop: 60 } }}
    >
      <Text size="xs" c="dimmed" mb="sm">
        Buscá por descripción, referencia o talle.
      </Text>

      <Combobox
        store={combobox}
        onOptionSubmit={(val) => handleSelect(parseInt(val))}
        zIndex={500}
      >
        <Combobox.Target>
          <TextInput
            ref={inputRef}
            placeholder="Ej: remera azul, XL, 7790001234567…"
            value={query}
            onChange={(e) => {
              setQuery(e.currentTarget.value);
              combobox.updateSelectedOptionIndex();
            }}
            onKeyDown={handleKeyDown}
            rightSection={loading ? <Loader size={14} color="amber" /> : null}
            autoComplete="off"
          />
        </Combobox.Target>

        <Combobox.Dropdown hidden={results.length === 0}>
          <Combobox.Options>
            <ScrollArea.Autosize mah={320} type="scroll">
              {results.map((r) => {
                const alreadyInList = existingVarianteIds.has(r.varianteId);
                const meta = [r.defaultCode, r.barcode]
                  .filter(Boolean)
                  .join(" · ");
                return (
                  <Combobox.Option
                    key={r.varianteId}
                    value={String(r.varianteId)}
                  >
                    <Group justify="space-between" wrap="nowrap" gap="xs">
                      <div style={{ minWidth: 0, flex: 1 }}>
                        <Text
                          size="sm"
                          fw={500}
                          style={{
                            lineHeight: 1.35,
                            overflow: "hidden",
                            textOverflow: "ellipsis",
                            whiteSpace: "nowrap",
                          }}
                        >
                          {r.name}
                        </Text>
                        {meta && (
                          <Text
                            size="xs"
                            c="dimmed"
                            style={{
                              fontFamily: "var(--font-mono)",
                              overflow: "hidden",
                              textOverflow: "ellipsis",
                              whiteSpace: "nowrap",
                            }}
                          >
                            {meta}
                          </Text>
                        )}
                      </div>
                      <Group gap={4} style={{ flexShrink: 0 }}>
                        {r.qtyOnHand > 0 && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="blue"
                            radius="sm"
                          >
                            Stock: {r.qtyOnHand}
                          </Badge>
                        )}
                        {alreadyInList && (
                          <Badge
                            size="xs"
                            variant="light"
                            color="amber"
                            radius="sm"
                          >
                            En lista
                          </Badge>
                        )}
                      </Group>
                    </Group>
                  </Combobox.Option>
                );
              })}
            </ScrollArea.Autosize>
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>

      {noResults && (
        <Text size="xs" c="dimmed" mt="xs" style={{ paddingLeft: 2 }}>
          Sin resultados para &quot;{query.trim()}&quot;
        </Text>
      )}

      <Group
        justify="flex-end"
        pt="sm"
        mt="md"
        style={{ borderTop: "1px solid var(--mantine-color-dark-5)" }}
      >
        <Button size="sm" variant="subtle" color="gray" onClick={onClose}>
          Cancelar
        </Button>
      </Group>
    </Modal>
  );
}

// ── ArticleRow ────────────────────────────────────────────────────────────────

interface ArticleRowProps {
  article: InventoryArticle;
  readonly: boolean;
  isSaving: boolean;
  isLastScanned: boolean;
  onSave: (
    updated: InventoryArticle,
    original: InventoryArticle,
  ) => Promise<void>;
  onQtyChange: (varianteId: number, qty: number) => Promise<void>;
  onRemove: (varianteId: number) => void;
}

function ArticleRow({
  article,
  readonly,
  isSaving,
  isLastScanned,
  onSave,
  onQtyChange,
  onRemove,
}: ArticleRowProps) {
  const [local, setLocal] = useState<InventoryArticle>(article);
  const [editingPrice, setEditingPrice] = useState(false);
  const [editingCost, setEditingCost] = useState(false);

  useEffect(() => {
    setLocal(article);
  }, [article]);

  const isDirty =
    local.salePrice !== article.salePrice ||
    local.cost !== article.cost ||
    local.lastPurchaseDate !== article.lastPurchaseDate;

  function setField<K extends keyof InventoryArticle>(
    field: K,
    value: InventoryArticle[K],
  ) {
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
    <tr
      style={{
        borderBottom: "1px solid var(--border)",
        background: isLastScanned
          ? "rgba(251,191,36,0.18)"
          : isDirty
            ? "rgba(251,191,36,0.04)"
            : undefined,
        boxShadow: isLastScanned
          ? "inset 4px 0 0 var(--mantine-color-amber-4), 0 0 16px rgba(251,191,36,0.25)"
          : undefined,
      }}
    >
      {/* Código */}
      <td
        style={{
          padding: "10px 12px",
          color: "var(--text2)",
          fontFamily: "var(--font-mono)",
          fontSize: 12,
        }}
      >
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
          <span
            style={{
              padding: "10px 4px",
              color: "var(--text2)",
              display: "block",
            }}
          >
            {formatCurrency(local.salePrice)}
          </span>
        ) : editingPrice ? (
          <NumberInput
            value={local.salePrice}
            onChange={(v) =>
              setField("salePrice", typeof v === "number" ? v : 0)
            }
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
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "var(--border)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "transparent")
            }
          >
            {formatCurrency(local.salePrice)}
          </div>
        )}
      </td>

      {/* Costo */}
      <td style={{ padding: "4px 8px" }}>
        {readonly ? (
          <span
            style={{
              padding: "10px 4px",
              color: "var(--text2)",
              display: "block",
            }}
          >
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
            onMouseEnter={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "var(--border)")
            }
            onMouseLeave={(e) =>
              ((e.currentTarget as HTMLElement).style.borderColor =
                "transparent")
            }
          >
            {formatCurrency(local.cost)}
          </div>
        )}
      </td>

      {/* Últ. Compra */}
      <td style={{ padding: "4px 8px" }}>
        {readonly ? (
          <span
            style={{
              padding: "10px 4px",
              color: "var(--text3)",
              display: "block",
              fontSize: 13,
            }}
          >
            {formatDate(local.lastPurchaseDate)}
          </span>
        ) : (
          <DatePickerInput
            value={
              local.lastPurchaseDate
                ? new Date(local.lastPurchaseDate.slice(0, 10) + "T12:00:00")
                : null
            }
            onChange={(v) =>
              setField(
                "lastPurchaseDate",
                v ? (v as unknown as Date).toISOString().slice(0, 10) : null,
              )
            }
            valueFormat="DD/MM/YYYY"
            locale="es"
            clearable
            size="xs"
            w={130}
            styles={{ input: { color: "var(--text3)", fontSize: 13 } }}
          />
        )}
      </td>

      {/* En Mano */}
      <td style={{ padding: "10px 12px", textAlign: "right" }}>
        <span
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 13,
            fontWeight: 600,
            color:
              local.qty === local.qtyOnHand
                ? "var(--mantine-color-green-5)"
                : "var(--mantine-color-red-5)",
          }}
        >
          {article.qtyOnHand}
        </span>
      </td>

      {/* Cantidad */}
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
                const next =
                  typeof v === "number" ? Math.max(0, Math.round(v)) : 0;
                setField("qty", next);
              }}
              onBlur={() => {
                if (local.qty !== article.qty)
                  void onQtyChange(article.varianteId, local.qty);
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
