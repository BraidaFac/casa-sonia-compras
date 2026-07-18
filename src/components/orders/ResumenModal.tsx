"use client";
import { Modal, ScrollArea, Text } from "@mantine/core";
import type { Article } from "@/types";
import { computeOrderSummary } from "@/lib/orderSummary";

interface Props {
  opened: boolean;
  onClose: () => void;
  articles: Article[];
}

const thBase: React.CSSProperties = {
  background: "var(--surface3)",
  color: "var(--text2)",
  fontSize: 11,
  fontFamily: "var(--font-mono)",
  border: "1px solid var(--border2)",
  padding: "4px 8px",
  textAlign: "center",
  fontWeight: 500,
  whiteSpace: "nowrap",
};

const thAccent: React.CSSProperties = {
  ...thBase,
  color: "var(--accent)",
  background: "rgba(217,119,6,0.06)",
};

const tdBase: React.CSSProperties = {
  background: "var(--surface2)",
  color: "var(--text)",
  fontFamily: "var(--font-mono)",
  fontSize: 13,
  border: "1px solid var(--border)",
  padding: "6px 8px",
  textAlign: "center",
  fontVariantNumeric: "tabular-nums",
};

const tdAccent: React.CSSProperties = {
  ...tdBase,
  color: "var(--accent)",
  background: "rgba(217,119,6,0.06)",
};

const tdZero: React.CSSProperties = {
  ...tdBase,
  color: "var(--text3)",
};

function formatCost(n: number): string {
  return "$" + n.toLocaleString("es-AR", { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function ResumenModal({ opened, onClose, articles }: Props) {
  const summaries = computeOrderSummary(articles);

  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title="Resumen de orden"
      size="xl"
      scrollAreaComponent={ScrollArea.Autosize}
      styles={{
        content: { background: "var(--surface)" },
        header: { background: "var(--surface)", borderBottom: "1px solid var(--border)" },
        title: { fontSize: 14, fontWeight: 600, color: "var(--text)" },
      }}
    >
      {summaries.length === 0 ? (
        <Text
          size="sm"
          style={{ color: "var(--text3)", textAlign: "center", padding: "32px 0" }}
        >
          No hay artículos cargados.
        </Text>
      ) : (
        summaries.map((cat, catIdx) => (
          <div key={cat.categoryName} style={{ marginBottom: 24 }}>
            {/* Category header */}
            <div
              style={{
                fontSize: 10,
                fontFamily: "var(--font-sans)",
                letterSpacing: "0.08em",
                textTransform: "uppercase",
                color: "var(--text3)",
                borderBottom: "1px solid var(--border)",
                paddingBottom: 6,
                marginBottom: 8,
                marginTop: catIdx === 0 ? 0 : 20,
              }}
            >
              {cat.categoryName}
            </div>

            {/* Summary table */}
            <div style={{ overflowX: "auto" }}>
              <table style={{ borderCollapse: "collapse", width: "100%" }}>
                <thead>
                  <tr>
                    <th scope="col" style={{ ...thBase, textAlign: "left", minWidth: 120 }}>
                      Categoría
                    </th>
                    {cat.canonicalSizes.map((cs) => (
                      <th scope="col" key={cs} style={{ ...thBase, width: 52 }}>
                        {cs}
                      </th>
                    ))}
                    <th scope="col" style={{ ...thAccent, width: 80 }}>Total</th>
                    <th scope="col" style={{ ...thAccent, width: 100 }}>Costo total</th>
                    <th scope="col" style={{ ...thAccent, width: 100 }}>Costo prom.</th>
                  </tr>
                </thead>
                <tbody>
                  <tr>
                    <td style={{ ...tdBase, textAlign: "left", color: "var(--text2)", fontFamily: "var(--font-sans)", fontSize: 12 }}>
                      Totales
                    </td>
                    {cat.canonicalSizes.map((cs) => {
                      const qty = cat.quantityBySize[cs] ?? 0;
                      return (
                        <td key={cs} style={qty === 0 ? tdZero : tdBase}>
                          {qty === 0 ? "—" : qty}
                        </td>
                      );
                    })}
                    <td style={tdAccent}>{cat.totalUnits}</td>
                    <td style={tdAccent}>{formatCost(cat.totalCost)}</td>
                    <td style={tdAccent}>{formatCost(cat.avgCost)}</td>
                  </tr>
                </tbody>
              </table>
            </div>
          </div>
        ))
      )}
    </Modal>
  );
}
