"use client";
import { useState, useMemo } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { InventoryArticle } from "@/types";

interface CategoryTreeProps {
  articles: InventoryArticle[];
}

export function CategoryTree({ articles }: CategoryTreeProps) {
  // Collect unique leaf categories
  const leafCategories = useMemo(() => {
    const map = new Map<number, {
      categoryId: number;
      categoryName: string;
      categoryParentId: number | null;
      categoryParentName: string | null;
    }>();
    for (const a of articles) {
      if (!map.has(a.categoryId)) {
        map.set(a.categoryId, {
          categoryId: a.categoryId,
          categoryName: a.categoryName,
          categoryParentId: a.categoryParentId,
          categoryParentName: a.categoryParentName,
        });
      }
    }
    return Array.from(map.values());
  }, [articles]);

  // Group leaf categories by parent (null parent = top-level)
  const grouped = useMemo(() => {
    const byParent = new Map<string, typeof leafCategories>();
    for (const cat of leafCategories) {
      const key = cat.categoryParentId !== null ? String(cat.categoryParentId) : "__root__";
      if (!byParent.has(key)) byParent.set(key, []);
      byParent.get(key)!.push(cat);
    }
    return byParent;
  }, [leafCategories]);

  const parentKeys = Array.from(grouped.keys());

  if (articles.length === 0) {
    return (
      <div style={{
        textAlign: "center", padding: "48px 24px", color: "var(--text3)",
        border: "1px dashed var(--border)", borderRadius: 8, fontSize: 13,
      }}>
        Escaneá un artículo para comenzar.
      </div>
    );
  }

  return (
    <div>
      {parentKeys.map((parentKey) => {
        const cats = grouped.get(parentKey)!;
        const parentName = cats[0].categoryParentName;
        const isRoot = parentKey === "__root__";

        const parentArticles = articles.filter((a) =>
          cats.some((c) => c.categoryId === a.categoryId),
        );
        const parentTotal = parentArticles.reduce((s, a) => s + a.qty, 0);
        const parentDistinct = new Set(parentArticles.map((a) => a.varianteId)).size;

        return (
          <ParentSection
            key={parentKey}
            parentName={isRoot ? null : parentName}
            parentTotal={parentTotal}
            parentDistinct={parentDistinct}
            categories={cats}
            articles={articles}
          />
        );
      })}
    </div>
  );
}

function ParentSection({
  parentName,
  parentTotal,
  parentDistinct,
  categories,
  articles,
}: {
  parentName: string | null;
  parentTotal: number;
  parentDistinct: number;
  categories: { categoryId: number; categoryName: string }[];
  articles: InventoryArticle[];
}) {
  const [expanded, setExpanded] = useState(true);

  return (
    <div style={{ marginBottom: 16 }}>
      {parentName && (
        <button
          onClick={() => setExpanded((v) => !v)}
          style={{
            display: "flex", alignItems: "center", gap: 8, width: "100%",
            background: "var(--surface)", border: "1px solid var(--border)",
            borderRadius: 6, padding: "8px 12px", cursor: "pointer",
            color: "var(--text)", fontFamily: "var(--font-sans)", fontSize: 13,
            fontWeight: 600, marginBottom: 4,
          }}
        >
          {expanded ? <ChevronDown size={14} /> : <ChevronRight size={14} />}
          <span style={{ flex: 1, textAlign: "left" }}>{parentName}</span>
          <span style={{ color: "var(--text3)", fontWeight: 400, fontSize: 12 }}>
            {parentDistinct} art. · {parentTotal} uds
          </span>
        </button>
      )}

      {expanded && categories.map((cat) => {
        const catArticles = articles.filter((a) => a.categoryId === cat.categoryId);
        return (
          <LeafCategory
            key={cat.categoryId}
            categoryName={cat.categoryName}
            articles={catArticles}
            indented={!!parentName}
          />
        );
      })}
    </div>
  );
}

function LeafCategory({
  categoryName,
  articles,
  indented,
}: {
  categoryName: string;
  articles: InventoryArticle[];
  indented: boolean;
}) {
  const [expanded, setExpanded] = useState(true);
  const total = articles.reduce((s, a) => s + a.qty, 0);

  return (
    <div style={{ marginLeft: indented ? 16 : 0, marginBottom: 8 }}>
      <button
        onClick={() => setExpanded((v) => !v)}
        style={{
          display: "flex", alignItems: "center", gap: 8, width: "100%",
          background: "color-mix(in srgb, var(--mantine-color-amber-6) 6%, transparent)",
          border: "1px solid color-mix(in srgb, var(--mantine-color-amber-6) 25%, transparent)",
          borderRadius: 6, padding: "6px 12px", cursor: "pointer",
          color: "var(--mantine-color-amber-3)", fontFamily: "var(--font-sans)",
          fontSize: 12, fontWeight: 600, marginBottom: 4,
        }}
      >
        {expanded ? <ChevronDown size={13} /> : <ChevronRight size={13} />}
        <span style={{ flex: 1, textAlign: "left" }}>{categoryName}</span>
        <span style={{ color: "var(--mantine-color-amber-5)", fontWeight: 400 }}>
          {articles.length} art. · {total} uds
        </span>
      </button>

      {expanded && (
        <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 12, fontFamily: "var(--font-sans)" }}>
          <tbody>
            {articles.map((a) => (
              <tr key={a.varianteId} style={{ borderBottom: "1px solid var(--border)" }}>
                <td style={{ padding: "6px 12px", color: "var(--text3)", fontFamily: "var(--font-mono)", fontSize: 11 }}>
                  {a.barcode}
                </td>
                <td style={{ padding: "6px 12px", color: "var(--text)" }}>{a.name}</td>
                <td style={{ padding: "6px 12px", color: "var(--text2)", fontSize: 11 }}>
                  {a.brand}{a.brand && a.size ? " · " : ""}{a.size}
                </td>
                <td style={{ padding: "6px 12px", textAlign: "right", color: "var(--mantine-color-amber-4)", fontWeight: 700, fontFamily: "var(--font-mono)" }}>
                  {a.qty}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
