"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Group, Text, Badge, Alert } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { useRouter } from "next/navigation";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import { OrderFormFooter } from "@/components/orders/OrderFormFooter";
import { DraftWarningModal } from "@/components/orders/DraftWarningModal";
import { OrderProgressModal } from "@/components/orders/OrderProgressModal";
import { validateForDraft } from "@/lib/orderValidation";
import { stripImagesForDB } from "@/lib/localOrders";
import type { Article, Supplier } from "@/types";

const ORDER_DRAFT_KEY = "order_new_draft";

export default function NewOrderPage() {
  const router = useRouter();
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(new Date());
  const [draftBanner, setDraftBanner] = useState<boolean>(false);

  // Restore draft on mount — runs only client-side, avoids hydration mismatch
  useEffect(() => {
    try {
      const raw = localStorage.getItem(ORDER_DRAFT_KEY);
      if (!raw) return;
      const draft = JSON.parse(raw);
      const articles: unknown[] = Array.isArray(draft.articles) ? draft.articles : [];
      // Only restore + show banner if draft has supplier AND ≥2 articles
      if (!draft.supplier || articles.length < 2) {
        localStorage.removeItem(ORDER_DRAFT_KEY);
        return;
      }
      if (draft.supplier) setSupplier(draft.supplier);
      if (draft.date) setDate(new Date(draft.date));
      setDraftBanner(true);
    } catch {
      // ignore
    }
  }, []);
  const [gridKey, setGridKey] = useState(0);
  const [articles, setArticles] = useState<Article[]>([]);
  const [isSaving, setIsSaving] = useState(false);
  const [isConfirming, setIsConfirming] = useState(false);
  const [progressStep, setProgressStep] = useState("Guardando borrador...");
  const [progressError, setProgressError] = useState<string | undefined>(undefined);
  const [draftWarning, setDraftWarning] = useState<{ open: boolean; warnings: string[] }>({
    open: false,
    warnings: [],
  });
  const [totals, setTotals] = useState({ units: 0, amount: 0 });
  const skipFirstSaveRef = useRef(true);
  const autosaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Auto-save supplier + date into draft — only if draft already exists OR conditions are met
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    if (autosaveTimerRef.current) clearTimeout(autosaveTimerRef.current);
    autosaveTimerRef.current = setTimeout(() => {
      try {
        const raw = localStorage.getItem(ORDER_DRAFT_KEY);
        // Only create a new draft entry if supplier set + ≥2 articles already in draft
        if (!raw) {
          const draftArticles = Array.isArray(articles) ? articles : [];
          if (!supplier || draftArticles.length < 2) return;
        }
        const current = raw ? JSON.parse(raw) : {};
        localStorage.setItem(
          ORDER_DRAFT_KEY,
          JSON.stringify({
            ...current,
            supplier,
            date: date?.toISOString() ?? null,
          }),
        );
      } catch {}
    }, 5000);
  }, [supplier, date, articles]);

  const handleTotalsChange = useCallback((units: number, amount: number) => {
    setTotals({ units, amount });
  }, []);

  const handleArticlesChange = useCallback((updated: Article[]) => {
    setArticles(updated);
  }, []);

  function discardDraft() {
    localStorage.removeItem(ORDER_DRAFT_KEY);
    setSupplier(null);
    setDate(new Date());
    setDraftBanner(false);
    setGridKey((k) => k + 1);
  }

  const dateStr = date
    ? date.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  async function doSaveDraft(): Promise<{ id: string } | null> {
    if (!supplier) return null;
    setIsSaving(true);
    try {
      const localArticles = stripImagesForDB(articles);
      const res = await fetch("/api/local-orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          supplierId: supplier.id,
          supplierName: supplier.name,
          date: dateStr,
          articles: localArticles,
          warehouseIds: [],
          printColumns: [],
          printValues: {},
        }),
      });
      const data = await res.json();
      if (res.ok) {
        localStorage.removeItem(ORDER_DRAFT_KEY);
        return data;
      }
      return null;
    } finally {
      setIsSaving(false);
    }
  }

  function handleSaveDraft() {
    const localArticles = stripImagesForDB(articles);
    const validation = validateForDraft({
      supplierId: supplier?.id ?? null,
      date: dateStr,
      articles: localArticles,
    });
    if (!validation.valid) {
      setDraftWarning({ open: true, warnings: validation.missing });
      return;
    }
    void doSaveDraft().then((data) => {
      if (data) router.push(`/orders/${data.id}/edit`);
    });
  }

  async function handleConfirm() {
    setProgressError(undefined);
    setProgressStep("Guardando borrador...");
    setIsConfirming(true);
    let errorOccurred = false;
    try {
      const savedDraft = await doSaveDraft();
      if (!savedDraft) {
        setProgressError("No se pudo guardar el borrador. Verificá que el proveedor esté seleccionado.");
        errorOccurred = true;
        return;
      }

      setProgressStep("Enviando a Odoo...");
      const confirmRes = await fetch(`/api/local-orders/${savedDraft.id}/confirm`, {
        method: "POST",
      });
      const confirmData = await confirmRes.json();
      if (!confirmRes.ok) {
        setProgressError(confirmData?.error ?? "Error al confirmar la orden.");
        errorOccurred = true;
        return;
      }

      router.push("/orders");
    } catch (err) {
      setProgressError(err instanceof Error ? err.message : "Error inesperado.");
      errorOccurred = true;
    } finally {
      // On success, navigation handles unmount; on error, keep modal open for user to dismiss
      if (!errorOccurred) setIsConfirming(false);
    }
  }

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        paddingBottom: 80,
      }}
    >
      {/* Top bar */}
      <header
        style={{
          background: "var(--surface)",
          borderBottom: "1px solid var(--border)",
          padding: "12px 24px",
          display: "flex",
          alignItems: "center",
          gap: 16,
          position: "sticky",
          top: 0,
          zIndex: 20,
        }}
      >
        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--text)",
          }}
        >
          Nueva Orden de Compra
        </h1>

        {(supplier || totals.units > 0) && (
          <Group gap="sm" ml="auto" wrap="nowrap">
            {supplier && (
              <Text size="sm" c="dimmed" style={{ whiteSpace: "nowrap" }}>
                {supplier.name}
              </Text>
            )}
            {totals.units > 0 && (
              <>
                <Badge color="amber" variant="light" size="md">
                  {totals.units} u.
                </Badge>
                <Badge color="amber" variant="outline" size="md">
                  $
                  {totals.amount.toLocaleString("es-AR", {
                    minimumFractionDigits: 2,
                    maximumFractionDigits: 2,
                  })}
                </Badge>
              </>
            )}
          </Group>
        )}
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 0" }}>
        {/* Draft restore banner */}
        {draftBanner && (
          <Alert
            color="amber"
            variant="light"
            mb="md"
            title="Borrador restaurado"
            withCloseButton
            onClose={() => setDraftBanner(false)}
          >
            <Group gap="sm" align="center">
              <Text size="sm">Se recuperaron los datos de una sesión anterior.</Text>
              <button
                onClick={discardDraft}
                style={{
                  background: "none",
                  border: "1px solid var(--mantine-color-amber-5)",
                  borderRadius: 4,
                  cursor: "pointer",
                  color: "var(--mantine-color-amber-5)",
                  fontSize: 12,
                  padding: "2px 10px",
                }}
              >
                Descartar borrador
              </button>
            </Group>
          </Alert>
        )}

        {/* Supplier + Date bar */}
        <Group gap="xl" mb="xs" align="flex-end" wrap="wrap">
          <div>
            <Text size="xs" c="dimmed" fw={500} mb={6}>
              Proveedor
            </Text>
            <SupplierSearch value={supplier} onChange={setSupplier} />
          </div>

          <DatePickerInput
            label={
              <Text size="xs" c="dimmed" fw={500}>
                Fecha
              </Text>
            }
            value={date}
            onChange={(val) => setDate(val as Date | null)}
            valueFormat="DD/MM/YYYY"
            locale="es"
            w={180}
          />

          {supplier && (
            <Badge
              color="amber"
              variant="outline"
              size="lg"
              style={{ marginLeft: "auto" }}
            >
              {supplier.name}
            </Badge>
          )}
        </Group>

        {/* Order grid */}
        <OrderGrid
          key={gridKey}
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
          onArticlesChange={handleArticlesChange}
          onDraftCleared={() => setDraftBanner(false)}
        />
      </div>

      <OrderFormFooter
        onBack={() => router.push("/orders")}
        onSaveDraft={handleSaveDraft}
        isSaving={isSaving}
        isConfirming={isConfirming}
        showConfirm={false}
        isNewOrder
      />

      <DraftWarningModal
        opened={draftWarning.open}
        warnings={draftWarning.warnings}
        onCorrect={() => setDraftWarning({ open: false, warnings: [] })}
        onSaveAnyway={() => {
          setDraftWarning({ open: false, warnings: [] });
          void doSaveDraft().then((data) => {
            if (data) router.push(`/orders/${data.id}/edit`);
          });
        }}
      />

      <OrderProgressModal
        opened={isConfirming}
        step={progressStep}
        error={progressError}
        onClose={progressError ? () => setIsConfirming(false) : undefined}
      />
    </div>
  );
}
