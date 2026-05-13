"use client";
import { useState } from "react";
import { SupplierSearch } from "@/components/orders/SupplierSearch";
import { OrderGrid } from "@/components/orders/OrderGrid";
import type { Supplier } from "@/types";

export default function NewOrderPage() {
  const [supplier, setSupplier] = useState<Supplier | null>(null);
  const [date, setDate] = useState(
    () => new Date().toISOString().split("T")[0],
  );

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
      </header>

      <div style={{ maxWidth: 1200, margin: "0 auto", padding: "24px 24px 0" }}>
        {/* Supplier + Date bar */}
        <div
          style={{
            display: "flex",
            alignItems: "center",
            gap: 20,
            marginBottom: 24,
            flexWrap: "wrap",
          }}
        >
          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text2)",
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              Proveedor
            </label>
            <SupplierSearch value={supplier} onChange={setSupplier} />
          </div>

          <div>
            <label
              style={{
                display: "block",
                fontSize: 12,
                color: "var(--text2)",
                marginBottom: 6,
                fontWeight: 500,
              }}
            >
              Fecha
            </label>
            <input
              type="date"
              value={date}
              onChange={(e) => setDate(e.target.value)}
              style={{
                background: "var(--surface2)",
                border: "1px solid var(--border)",
                color: "var(--text)",
                borderRadius: 6,
                padding: "8px 12px",
                fontSize: 14,
                outline: "none",
              }}
              onFocus={(e) => (e.currentTarget.style.borderColor = "var(--accent)")}
              onBlur={(e) => (e.currentTarget.style.borderColor = "var(--border)")}
            />
          </div>

          {supplier && (
            <div
              style={{
                marginLeft: "auto",
                background: "var(--accent-bg)",
                border: "1px solid var(--accent)",
                borderRadius: 6,
                padding: "6px 12px",
                fontSize: 13,
                color: "var(--accent)",
              }}
            >
              {supplier.name}
            </div>
          )}
        </div>

        {/* Order grid */}
        <OrderGrid supplier={supplier} date={date} />
      </div>
    </div>
  );
}
