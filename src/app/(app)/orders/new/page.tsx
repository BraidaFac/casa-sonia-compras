"use client";
import { useState, useCallback } from "react";
import { Group, Text, Badge } from "@mantine/core";

import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import type { Supplier } from "@/types";

export default function NewOrderPage() {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(new Date());
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
        <img
          src="/CS.png"
          alt="Casa Sonia"
          style={{ height: 32, width: "auto", flexShrink: 0 }}
        />
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
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
        />
      </div>
    </div>
  );
}
