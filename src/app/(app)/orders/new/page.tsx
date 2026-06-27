"use client";
import { useState, useCallback, useEffect, useRef } from "react";
import { Group, Text, Badge, Alert } from "@mantine/core";

import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import type { Supplier } from "@/types";

const ORDER_DRAFT_KEY = "order_new_draft";

export default function NewOrderPage() {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [draftBanner, setDraftBanner] = useState(false);
  const [gridKey, setGridKey] = useState(0);
  const skipFirstSaveRef = useRef(true);

  useEffect(() => {
    setDate(new Date());
    // Restore supplier + date from draft
    try {
      const raw = localStorage.getItem(ORDER_DRAFT_KEY);
      if (raw) {
        const draft = JSON.parse(raw);
        if (draft.supplier) setSupplier(draft.supplier);
        if (draft.date) setDate(new Date(draft.date));
        setDraftBanner(true);
      }
    } catch {}
  }, []);

  // Auto-save supplier + date into draft (skip initial mount to avoid overwriting restored draft)
  useEffect(() => {
    if (skipFirstSaveRef.current) {
      skipFirstSaveRef.current = false;
      return;
    }
    try {
      const raw = localStorage.getItem(ORDER_DRAFT_KEY);
      if (!raw && !supplier && !date) return;
      const current = raw ? JSON.parse(raw) : {};
      localStorage.setItem(ORDER_DRAFT_KEY, JSON.stringify({
        ...current,
        supplier,
        date: date?.toISOString() ?? null,
      }));
    } catch {}
  }, [supplier, date]);

  function discardDraft() {
    localStorage.removeItem(ORDER_DRAFT_KEY);
    setSupplier(null);
    setDate(new Date());
    setDraftBanner(false);
    setGridKey((k) => k + 1);
  }

  const [totals, setTotals] = useState({ units: 0, amount: 0 });
  const handleTotalsChange = useCallback((units: number, amount: number) => {
    setTotals({ units, amount });
  }, []);

  const dateStr = date
    ? date.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  return (
    <div
      style={{
        minHeight: "100vh",
        background: "var(--bg)",
        padding: "0 0 60px",
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
                style={{ background: "none", border: "1px solid var(--mantine-color-amber-5)", borderRadius: 4, cursor: "pointer", color: "var(--mantine-color-amber-5)", fontSize: 12, padding: "2px 10px" }}
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
          onDraftCleared={() => setDraftBanner(false)}
        />
      </div>
    </div>
  );
}
