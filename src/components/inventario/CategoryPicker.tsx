"use client";
import { useState, useMemo, useCallback } from "react";
import { TextInput, Checkbox, Loader } from "@mantine/core";
import { Search, ChevronDown, ChevronRight, X } from "lucide-react";
import { useCategories } from "@/hooks/useCategories";

// ── Types ─────────────────────────────────────────────────────────────────────

interface CategoryPickerProps {
  value: number[]; // selected leaf category IDs
  onChange: (ids: number[]) => void;
}

interface TreeNode {
  label: string;
  path: string; // unique key: "Indumentaria / Remeras"
  children: TreeNode[];
  leafId: number | null; // non-null for actual leaf categories
}

interface FlatLeaf {
  id: number;
  completeName: string;
}

// ── Tree builder ──────────────────────────────────────────────────────────────

function buildTree(categories: { id: number; completeName: string }[]): TreeNode[] {
  const root: TreeNode[] = [];
  const nodeMap = new Map<string, TreeNode>();

  for (const cat of [...categories].sort((a, b) => a.completeName.localeCompare(b.completeName))) {
    const parts = cat.completeName.split(" / ").map((p) => p.trim());
    let siblings = root;

    for (let i = 0; i < parts.length; i++) {
      const path = parts.slice(0, i + 1).join(" / ");
      let node = nodeMap.get(path);
      if (!node) {
        node = { label: parts[i], path, children: [], leafId: null };
        nodeMap.set(path, node);
        siblings.push(node);
      }
      if (i === parts.length - 1) {
        node.leafId = cat.id;
      }
      siblings = node.children;
    }
  }

  return root;
}

function collectLeafIds(node: TreeNode): number[] {
  if (node.children.length === 0 && node.leafId !== null) return [node.leafId];
  return node.children.flatMap(collectLeafIds);
}

// ── Fuzzy search ──────────────────────────────────────────────────────────────

function fuzzyMatch(completeName: string, query: string): boolean {
  if (!query.trim()) return true;
  const terms = query.toLowerCase().trim().split(/\s+/);
  const lower = completeName.toLowerCase();
  return terms.every((t) => lower.includes(t));
}

// ── Highlight matching terms ──────────────────────────────────────────────────

function HighlightedText({ text, query }: { text: string; query: string }) {
  if (!query.trim()) return <>{text}</>;
  const terms = query.toLowerCase().trim().split(/\s+/).filter(Boolean);
  let parts: { t: string; hi: boolean }[] = [{ t: text, hi: false }];
  for (const term of terms) {
    const next: typeof parts = [];
    for (const part of parts) {
      if (part.hi) { next.push(part); continue; }
      const idx = part.t.toLowerCase().indexOf(term);
      if (idx === -1) { next.push(part); continue; }
      if (idx > 0) next.push({ t: part.t.slice(0, idx), hi: false });
      next.push({ t: part.t.slice(idx, idx + term.length), hi: true });
      if (idx + term.length < part.t.length) next.push({ t: part.t.slice(idx + term.length), hi: false });
    }
    parts = next;
  }
  return (
    <>
      {parts.map((p, i) =>
        p.hi ? (
          <mark
            key={i}
            style={{
              background: "color-mix(in srgb, var(--mantine-color-amber-6) 28%, transparent)",
              color: "var(--mantine-color-amber-3)",
              padding: 0,
              borderRadius: 2,
            }}
          >
            {p.t}
          </mark>
        ) : (
          <span key={i}>{p.t}</span>
        ),
      )}
    </>
  );
}

// ── Tree row (recursive) ──────────────────────────────────────────────────────

function TreeRow({
  node,
  selected,
  expandedPaths,
  onToggle,
  onToggleExpand,
  depth,
}: {
  node: TreeNode;
  selected: Set<number>;
  expandedPaths: Set<string>;
  onToggle: (ids: number[]) => void;
  onToggleExpand: (path: string) => void;
  depth: number;
}) {
  const leafIds = useMemo(() => collectLeafIds(node), [node]);
  const isLeaf = node.children.length === 0;
  const selectedCount = leafIds.filter((id) => selected.has(id)).length;
  const checked = isLeaf ? selected.has(node.leafId!) : selectedCount === leafIds.length && leafIds.length > 0;
  const indeterminate = !isLeaf && selectedCount > 0 && selectedCount < leafIds.length;
  const expanded = expandedPaths.has(node.path);

  const handleRowClick = useCallback(() => {
    onToggle(leafIds);
  }, [leafIds, onToggle]);

  return (
    <>
      <div
        role="row"
        onClick={handleRowClick}
        style={{
          display: "flex",
          alignItems: "center",
          gap: 6,
          paddingLeft: 8 + depth * 18,
          paddingRight: 8,
          paddingTop: 5,
          paddingBottom: 5,
          borderRadius: 4,
          cursor: "pointer",
          userSelect: "none",
          transition: "background 100ms ease",
        }}
        onMouseEnter={(e) => {
          (e.currentTarget as HTMLElement).style.background =
            "color-mix(in srgb, var(--mantine-color-dark-5) 60%, transparent)";
        }}
        onMouseLeave={(e) => {
          (e.currentTarget as HTMLElement).style.background = "transparent";
        }}
      >
        {/* Expand/collapse toggle — only for non-leaf */}
        {!isLeaf ? (
          <button
            onClick={(e) => {
              e.stopPropagation();
              onToggleExpand(node.path);
            }}
            aria-label={expanded ? "Colapsar" : "Expandir"}
            style={{
              background: "none",
              border: "none",
              padding: 0,
              cursor: "pointer",
              color: "var(--text3)",
              display: "flex",
              alignItems: "center",
              flexShrink: 0,
              lineHeight: 1,
            }}
          >
            {expanded ? <ChevronDown size={12} /> : <ChevronRight size={12} />}
          </button>
        ) : (
          <span style={{ width: 12, flexShrink: 0 }} />
        )}

        <Checkbox
          size="xs"
          checked={checked}
          indeterminate={indeterminate}
          onChange={() => {}}
          onClick={(e) => {
            e.stopPropagation();
            onToggle(leafIds);
          }}
          color="amber"
          styles={{ input: { cursor: "pointer" } }}
        />

        <span
          style={{
            fontSize: isLeaf ? 13 : 13,
            fontWeight: isLeaf ? 400 : 500,
            color: checked || indeterminate ? "var(--mantine-color-amber-3)" : "var(--text2)",
            flex: 1,
            overflow: "hidden",
            textOverflow: "ellipsis",
            whiteSpace: "nowrap",
            transition: "color 100ms ease",
          }}
        >
          {node.label}
        </span>

        {!isLeaf && (
          <span
            style={{
              fontSize: 11,
              color: selectedCount > 0 ? "var(--mantine-color-amber-5)" : "var(--text3)",
              flexShrink: 0,
              fontVariantNumeric: "tabular-nums",
            }}
          >
            {selectedCount > 0 ? `${selectedCount}/` : ""}
            {leafIds.length}
          </span>
        )}
      </div>

      {!isLeaf && expanded &&
        node.children.map((child) => (
          <TreeRow
            key={child.path}
            node={child}
            selected={selected}
            expandedPaths={expandedPaths}
            onToggle={onToggle}
            onToggleExpand={onToggleExpand}
            depth={depth + 1}
          />
        ))}
    </>
  );
}

// ── Main component ─────────────────────────────────────────────────────────────

export function CategoryPicker({ value, onChange }: CategoryPickerProps) {
  const { data: categories = [], isLoading, isError } = useCategories();
  const [query, setQuery] = useState("");
  const [expandedPaths, setExpandedPaths] = useState<Set<string>>(() => new Set());

  const tree = useMemo(() => buildTree(categories), [categories]);

  const flatLeaves: FlatLeaf[] = useMemo(
    () => categories.map((c) => ({ id: c.id, completeName: c.completeName })),
    [categories],
  );

  const searchResults = useMemo(() => {
    if (!query.trim()) return [];
    return flatLeaves.filter((leaf) => fuzzyMatch(leaf.completeName, query));
  }, [flatLeaves, query]);

  const selectedSet = useMemo(() => new Set(value), [value]);

  const handleToggle = useCallback(
    (ids: number[]) => {
      const allSelected = ids.every((id) => selectedSet.has(id));
      if (allSelected) {
        onChange(value.filter((id) => !ids.includes(id)));
      } else {
        const toAdd = ids.filter((id) => !selectedSet.has(id));
        onChange([...value, ...toAdd]);
      }
    },
    [selectedSet, value, onChange],
  );

  const handleToggleExpand = useCallback((path: string) => {
    setExpandedPaths((prev) => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  }, []);

  const handleClearAll = useCallback(() => onChange([]), [onChange]);

  const isSearching = query.trim().length > 0;

  return (
    <div>
      {/* Header row */}
      <div
        style={{
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          marginBottom: 8,
        }}
      >
        <span
          style={{
            fontSize: 11,
            fontWeight: 600,
            color: "var(--text3)",
            textTransform: "uppercase",
            letterSpacing: "0.06em",
          }}
        >
          Categorías
        </span>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          {value.length > 0 && (
            <>
              <span
                style={{
                  fontSize: 12,
                  color: "var(--mantine-color-amber-4)",
                  fontWeight: 600,
                }}
              >
                {value.length} seleccionada{value.length !== 1 ? "s" : ""}
              </span>
              <button
                onClick={handleClearAll}
                title="Limpiar selección"
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--text3)",
                  display: "flex",
                  alignItems: "center",
                  padding: 2,
                  borderRadius: 3,
                  transition: "color 100ms ease",
                }}
                onMouseEnter={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text)")}
                onMouseLeave={(e) => ((e.currentTarget as HTMLElement).style.color = "var(--text3)")}
              >
                <X size={12} />
              </button>
            </>
          )}
        </div>
      </div>

      {/* Search input */}
      <TextInput
        placeholder="Buscar categoría..."
        value={query}
        onChange={(e) => setQuery(e.currentTarget.value)}
        leftSection={<Search size={13} color="var(--text3)" />}
        rightSection={
          query ? (
            <button
              onClick={() => setQuery("")}
              style={{
                background: "none",
                border: "none",
                cursor: "pointer",
                color: "var(--text3)",
                display: "flex",
                alignItems: "center",
                padding: 0,
              }}
            >
              <X size={12} />
            </button>
          ) : null
        }
        size="sm"
        autoComplete="off"
        mb={8}
        styles={{
          input: { fontSize: 13 },
        }}
      />

      {/* Tree / search results */}
      <div
        style={{
          border: "1px solid var(--mantine-color-dark-5)",
          borderRadius: 6,
          background: "var(--mantine-color-dark-7)",
          overflow: "hidden",
        }}
      >
        <div
          style={{
            maxHeight: 240,
            overflowY: "auto",
            padding: "4px 4px",
          }}
        >
          {isLoading && (
            <div
              style={{
                display: "flex",
                alignItems: "center",
                gap: 8,
                padding: "16px 12px",
                color: "var(--text3)",
                fontSize: 13,
              }}
            >
              <Loader size={14} color="gray" />
              Cargando categorías...
            </div>
          )}

          {isError && !isLoading && (
            <div
              style={{
                padding: "16px 12px",
                color: "var(--mantine-color-red-4)",
                fontSize: 13,
              }}
            >
              Error al cargar categorías.{" "}
              <button
                onClick={() => window.location.reload()}
                style={{
                  background: "none",
                  border: "none",
                  cursor: "pointer",
                  color: "var(--mantine-color-amber-4)",
                  padding: 0,
                  fontSize: 13,
                  textDecoration: "underline",
                }}
              >
                Reintentar
              </button>
            </div>
          )}

          {!isLoading && !isError && isSearching && (
            <>
              {searchResults.length === 0 ? (
                <div
                  style={{
                    padding: "16px 12px",
                    color: "var(--text3)",
                    fontSize: 13,
                  }}
                >
                  Sin resultados para &quot;{query.trim()}&quot;
                </div>
              ) : (
                searchResults.map((leaf) => {
                  const checked = selectedSet.has(leaf.id);
                  return (
                    <div
                      key={leaf.id}
                      onClick={() => handleToggle([leaf.id])}
                      style={{
                        display: "flex",
                        alignItems: "center",
                        gap: 8,
                        padding: "5px 8px",
                        borderRadius: 4,
                        cursor: "pointer",
                        userSelect: "none",
                        transition: "background 100ms ease",
                      }}
                      onMouseEnter={(e) => {
                        (e.currentTarget as HTMLElement).style.background =
                          "color-mix(in srgb, var(--mantine-color-dark-5) 60%, transparent)";
                      }}
                      onMouseLeave={(e) => {
                        (e.currentTarget as HTMLElement).style.background = "transparent";
                      }}
                    >
                      <Checkbox
                        size="xs"
                        checked={checked}
                        onChange={() => {}}
                        onClick={(e) => {
                          e.stopPropagation();
                          handleToggle([leaf.id]);
                        }}
                        color="amber"
                        styles={{ input: { cursor: "pointer" } }}
                      />
                      <span
                        style={{
                          fontSize: 13,
                          color: checked ? "var(--mantine-color-amber-3)" : "var(--text2)",
                          flex: 1,
                          overflow: "hidden",
                          textOverflow: "ellipsis",
                          whiteSpace: "nowrap",
                          transition: "color 100ms ease",
                        }}
                      >
                        <HighlightedText text={leaf.completeName} query={query} />
                      </span>
                    </div>
                  );
                })
              )}
            </>
          )}

          {!isLoading && !isError && !isSearching &&
            tree.map((node) => (
              <TreeRow
                key={node.path}
                node={node}
                selected={selectedSet}
                expandedPaths={expandedPaths}
                onToggle={handleToggle}
                onToggleExpand={handleToggleExpand}
                depth={0}
              />
            ))}
        </div>
      </div>

      {/* Required hint */}
      {value.length === 0 && !isLoading && (
        <div
          style={{
            fontSize: 11,
            color: "var(--text3)",
            marginTop: 6,
            paddingLeft: 2,
          }}
        >
          Seleccioná al menos una categoría para continuar
        </div>
      )}
    </div>
  );
}
