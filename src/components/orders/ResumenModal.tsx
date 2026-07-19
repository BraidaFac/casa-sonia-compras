"use client";
import { useMemo, useState } from "react";
import { Modal, ScrollArea, Text } from "@mantine/core";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { Article } from "@/types";
import { computeOrderSummary, type CategorySummary } from "@/lib/orderSummary";

interface Props {
  opened: boolean;
  onClose: () => void;
  articles: Article[];
}

// ── Tree types ────────────────────────────────────────────────────────────────

interface TreeNode {
  label: string;
  completeName: string;
  children: Map<string, TreeNode>;
  summary?: CategorySummary; // only on leaves
  totalUnits: number;
  totalCost: number;
  avgCost: number;
}

function buildTree(summaries: CategorySummary[]): Map<string, TreeNode> {
  const root = new Map<string, TreeNode>();
  for (const summary of summaries) {
    const parts = summary.completeName.split(" / ");
    let level = root;
    for (let i = 0; i < parts.length; i++) {
      const part = parts[i];
      const pathSoFar = parts.slice(0, i + 1).join(" / ");
      if (!level.has(part)) {
        level.set(part, {
          label: part,
          completeName: pathSoFar,
          children: new Map(),
          totalUnits: 0,
          totalCost: 0,
          avgCost: 0,
        });
      }
      const node = level.get(part)!;
      if (i === parts.length - 1) node.summary = summary;
      node.totalUnits += summary.totalUnits;
      node.totalCost += summary.totalCost;
      node.avgCost = node.totalUnits > 0 ? node.totalCost / node.totalUnits : 0;
      level = node.children;
    }
  }
  return root;
}

// ── Shared styles ─────────────────────────────────────────────────────────────

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

// ── Size table (leaf level) ───────────────────────────────────────────────────

function SizeTable({ summary }: { summary: CategorySummary }) {
  return (
    <div style={{ overflowX: "auto", marginTop: 4, marginBottom: 4 }}>
      <table style={{ borderCollapse: "collapse", width: "100%" }}>
        <thead>
          <tr>
            <th scope="col" style={{ ...thBase, textAlign: "left", minWidth: 80, color: "transparent" }}>
              —
            </th>
            {summary.canonicalSizes.map((cs) => (
              <th scope="col" key={cs} style={{ ...thBase, width: 52 }}>{cs}</th>
            ))}
            <th scope="col" style={{ ...thAccent, width: 80 }}>Total</th>
            <th scope="col" style={{ ...thAccent, width: 100 }}>Costo total</th>
            <th scope="col" style={{ ...thAccent, width: 100 }}>Costo prom.</th>
          </tr>
        </thead>
        <tbody>
          <tr>
            <td style={{ ...tdBase, textAlign: "left", color: "var(--text2)", fontFamily: "var(--font-sans)", fontSize: 11 }}>
              Totales
            </td>
            {summary.canonicalSizes.map((cs) => {
              const qty = summary.quantityBySize[cs] ?? 0;
              return (
                <td key={cs} style={qty === 0 ? tdZero : tdBase}>
                  {qty === 0 ? "—" : qty}
                </td>
              );
            })}
            <td style={tdAccent}>{summary.totalUnits}</td>
            <td style={tdAccent}>{formatCost(summary.totalCost)}</td>
            <td style={tdAccent}>{formatCost(summary.avgCost)}</td>
          </tr>
        </tbody>
      </table>
    </div>
  );
}

// ── Tree node row (recursive) ─────────────────────────────────────────────────

function TreeNodeRow({ node, depth }: { node: TreeNode; depth: number }) {
  const [expanded, setExpanded] = useState(false);
  const isLeaf = node.children.size === 0;
  const isTopLevel = depth === 0;
  const indent = depth * 20;

  const sortedChildren = useMemo(
    () =>
      Array.from(node.children.entries()).sort(([a], [b]) =>
        a.localeCompare(b, "es"),
      ),
    [node.children],
  );

  return (
    <div style={{ marginBottom: 2 }}>
      <button
        type="button"
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          width: "100%",
          background: isTopLevel
            ? "rgba(217,119,6,0.09)"
            : "var(--surface2)",
          border: `1px solid ${isTopLevel ? "rgba(217,119,6,0.28)" : "var(--border)"}`,
          borderRadius: 6,
          padding: isTopLevel ? "9px 12px" : "6px 12px",
          paddingLeft: 12 + indent,
          cursor: "pointer",
          textAlign: "left",
          transition: "background 120ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background = isTopLevel
            ? "rgba(217,119,6,0.14)"
            : "var(--surface3)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = isTopLevel
            ? "rgba(217,119,6,0.09)"
            : "var(--surface2)";
        }}
      >
        {expanded ? (
          <ChevronDown size={13} color={isTopLevel ? "var(--accent)" : "var(--text3)"} />
        ) : (
          <ChevronRight size={13} color={isTopLevel ? "var(--accent)" : "var(--text3)"} />
        )}

        <span
          style={{
            flex: 1,
            fontSize: isTopLevel ? 12 : 11,
            fontFamily: "var(--font-sans)",
            fontWeight: isTopLevel ? 700 : 500,
            color: isTopLevel ? "var(--accent)" : "var(--text)",
            letterSpacing: isTopLevel ? "0.05em" : 0,
            textTransform: isTopLevel ? "uppercase" : "none",
          }}
        >
          {node.label}
        </span>

        <div
          style={{
            display: "flex",
            gap: 16,
            alignItems: "center",
            flexShrink: 0,
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            fontVariantNumeric: "tabular-nums",
          }}
        >
          <span style={{ color: "var(--text2)" }}>{node.totalUnits} u.</span>
          <span style={{ color: "var(--accent)" }}>{formatCost(node.totalCost)}</span>
          {node.totalUnits > 0 && (
            <span style={{ color: "var(--text3)" }}>{formatCost(node.avgCost)}/u.</span>
          )}
        </div>
      </button>

      {expanded && (
        <div style={{ marginLeft: indent + 12, marginTop: 2 }}>
          {isLeaf && node.summary ? (
            <SizeTable summary={node.summary} />
          ) : (
            sortedChildren.map(([, child]) => (
              <TreeNodeRow key={child.completeName} node={child} depth={depth + 1} />
            ))
          )}
        </div>
      )}
    </div>
  );
}

// ── Main modal ────────────────────────────────────────────────────────────────

export function ResumenModal({ opened, onClose, articles }: Props) {
  const summaries = useMemo(() => computeOrderSummary(articles), [articles]);
  const tree = useMemo(() => buildTree(summaries), [summaries]);

  const rootEntries = useMemo(
    () =>
      Array.from(tree.entries()).sort(([a], [b]) => a.localeCompare(b, "es")),
    [tree],
  );

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
      {rootEntries.length === 0 ? (
        <Text
          size="sm"
          style={{ color: "var(--text3)", textAlign: "center", padding: "32px 0" }}
        >
          No hay artículos cargados.
        </Text>
      ) : (
        <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
          {rootEntries.map(([, node]) => (
            <TreeNodeRow key={node.completeName} node={node} depth={0} />
          ))}
        </div>
      )}
    </Modal>
  );
}
