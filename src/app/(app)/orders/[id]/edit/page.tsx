"use client";
import { useState, useCallback, useEffect, use } from "react";
import { useRouter } from "next/navigation";
import { Group, Text, Badge, Button } from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { ArrowLeft } from "lucide-react";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Article, OrderHeader, Supplier } from "@/types";

interface LoadedOrder {
  order: OrderHeader;
  articles: Article[];
}

export default function EditOrderPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = use(params);
  const router = useRouter();

  const [loadedData, setLoadedData] = useState<LoadedOrder | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  // Controlled header state — initialized from loaded order
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState<Date | null>(null);
  const [totals, setTotals] = useState({ units: 0, amount: 0 });
  const handleTotalsChange = useCallback((units: number, amount: number) => {
    setTotals({ units, amount });
  }, []);

  useEffect(() => {
    async function load() {
      try {
        const res = await fetch(`/api/orders/${id}`);
        const data = await res.json();
        if (!res.ok) {
          setLoadError(data.error || "Error al cargar la orden");
          return;
        }
        const loaded = data as LoadedOrder;
        setLoadedData(loaded);
        setSupplier({ id: loaded.order.supplierId, name: loaded.order.supplierName });
        if (loaded.order.date) {
          const [year, month, day] = loaded.order.date.split("-").map(Number);
          setDate(new Date(year, month - 1, day));
        }
      } catch {
        setLoadError("Error de conexión al cargar la orden");
      } finally {
        setLoading(false);
      }
    }
    load();
  }, [id]);

  const dateStr = date
    ? date.toISOString().split("T")[0]
    : new Date().toISOString().split("T")[0];

  if (loading) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 12,
          color: "var(--text2)",
        }}
      >
        <LoadingSpinner size={24} />
        Cargando orden...
      </div>
    );
  }

  if (loadError) {
    return (
      <div
        style={{
          minHeight: "100vh",
          background: "var(--bg)",
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          justifyContent: "center",
          gap: 16,
        }}
      >
        <Text c="red" size="sm">
          {loadError}
        </Text>
        <Button variant="subtle" color="gray" onClick={() => router.push("/orders")}>
          Volver a órdenes
        </Button>
      </div>
    );
  }

  if (!loadedData) return null;

  return (
    <div style={{ minHeight: "100vh", background: "var(--bg)", padding: "0 0 60px" }}>
      {/* Header */}
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
        <img src="/CS.png" alt="Casa Sonia" style={{ height: 32, width: "auto", flexShrink: 0 }} />

        <Button
          variant="subtle"
          color="gray"
          size="xs"
          leftSection={<ArrowLeft size={14} />}
          onClick={() => router.push("/orders")}
          style={{ padding: "4px 8px" }}
        >
          Órdenes
        </Button>

        <h1
          style={{
            margin: 0,
            fontFamily: "var(--font-display)",
            fontWeight: 700,
            fontSize: 16,
            color: "var(--text)",
          }}
        >
          Editando {loadedData.order.name}
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

        {/* Order grid in edit mode */}
        <OrderGrid
          supplier={supplier}
          date={dateStr}
          onTotalsChange={handleTotalsChange}
          mode="edit"
          initialArticles={loadedData.articles}
          orderId={loadedData.order.id}
          orderWriteDate={loadedData.order.writeDate}
          onSaveChanges={(_articles) => {
            // Phase 4: implement diff engine + PATCH /api/orders/:id
            alert("Guardado en construcción (Fase 4)");
          }}
        />
      </div>
    </div>
  );
}
