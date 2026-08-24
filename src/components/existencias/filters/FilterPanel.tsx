"use client";
import { Accordion, Button, Loader, Tooltip } from "@mantine/core";
import { ChevronDown, PanelLeftClose, Search, X } from "lucide-react";
import type { FilterState, FilterHistoryEntry } from "@/types";
import type { FilterOptions } from "@/hooks/useFilterOptions";
import { CategoryFilterGroup } from "./CategoryFilterGroup";
import { TalleChipGroup } from "./TalleChipGroup";
import { ColorChipGroup } from "./ColorChipGroup";
import { ChipFilterGroup } from "./ChipFilterGroup";
import { FilterHistoryBar } from "./FilterHistoryBar";

interface FilterPanelProps {
  filters: FilterState;
  onChange: (filters: FilterState) => void;
  onSearch: () => void;
  onClear: () => void;
  onCollapse?: () => void;
  options: FilterOptions;
  history: FilterHistoryEntry[];
  onApplyHistory: (entry: FilterHistoryEntry) => void;
  onRemoveHistory: (id: string) => void;
  isSearching?: boolean;
}

function hasActiveFilters(f: FilterState): boolean {
  return (
    f.categoryIds.length > 0 ||
    f.colorBases.length > 0 ||
    f.equivalencias.length > 0 ||
    f.brandValueIds.length > 0 ||
    f.corteValueIds.length > 0 ||
    f.materialValueIds.length > 0
  );
}

function CountBadge({ count }: { count: number }) {
  if (count === 0) return null;
  return (
    <span
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        minWidth: 18,
        height: 18,
        padding: "0 5px",
        borderRadius: 9,
        background: "var(--mantine-color-amber-6)",
        color: "#000",
        fontSize: 10,
        fontWeight: 700,
        fontFamily: "var(--font-sans)",
        lineHeight: 1,
      }}
    >
      {count}
    </span>
  );
}

function AccordionLabel({ label, count }: { label: string; count: number }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
      <span
        style={{
          fontSize: 12,
          fontWeight: 600,
          fontFamily: "var(--font-sans)",
          color: "var(--text1)",
        }}
      >
        {label}
      </span>
      <CountBadge count={count} />
    </div>
  );
}

export function FilterPanel({
  filters,
  onChange,
  onSearch,
  onClear,
  onCollapse,
  options,
  history,
  onApplyHistory,
  onRemoveHistory,
  isSearching,
}: FilterPanelProps) {
  const active = hasActiveFilters(filters);

  function set<K extends keyof FilterState>(key: K, value: FilterState[K]) {
    onChange({ ...filters, [key]: value });
  }

  return (
    <div style={{ display: "flex", flexDirection: "column", height: "100%" }}>

      {/* ── Header — always visible, never scrolls ── */}
      <div
        style={{
          flexShrink: 0,
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          borderBottom: "1px solid var(--border)",
        }}
      >
        <span
          style={{
            fontSize: 13,
            fontWeight: 700,
            fontFamily: "var(--font-display)",
            color: "var(--text1)",
            letterSpacing: "0.02em",
            flex: 1,
          }}
        >
          Filtros
        </span>

        {active && (
          <button
            onClick={onClear}
            style={{
              display: "flex",
              alignItems: "center",
              gap: 4,
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text3)",
              fontFamily: "var(--font-sans)",
              fontSize: 11,
              padding: 0,
              flexShrink: 0,
            }}
          >
            <X size={11} />
            Limpiar todo
          </button>
        )}

        <Tooltip label="Buscar con filtros seleccionados" disabled={!active}>
          <Button
            onClick={onSearch}
            disabled={!active || isSearching}
            loading={isSearching}
            color="amber"
            size="xs"
            leftSection={<Search size={12} />}
            style={{ flexShrink: 0 }}
          >
            Buscar
          </Button>
        </Tooltip>

        {onCollapse && (
          <button
            onClick={onCollapse}
            title="Ocultar filtros"
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
              background: "none",
              border: "none",
              cursor: "pointer",
              color: "var(--text3)",
              padding: 2,
              borderRadius: 4,
              flexShrink: 0,
            }}
          >
            <PanelLeftClose size={15} />
          </button>
        )}
      </div>

      {/* ── Scrollable content ── */}
      <div style={{ flex: 1, overflowY: "auto", paddingBottom: 8 }}>

        {/* Recent searches */}
        <div style={{ padding: "0 16px" }}>
          <FilterHistoryBar
            history={history}
            onApply={onApplyHistory}
            onRemove={onRemoveHistory}
          />
        </div>

        {options.isLoading ? (
          <div style={{ display: "flex", justifyContent: "center", paddingTop: 32 }}>
            <Loader size="sm" color="amber" />
          </div>
        ) : (
          <Accordion
            multiple
            chevron={<ChevronDown size={13} />}
            styles={{
              item: { borderBottom: "1px solid var(--border)" },
              control: { padding: "10px 16px" },
              panel: { padding: "0 16px 12px" },
              chevron: { color: "var(--text3)" },
            }}
          >
            <Accordion.Item value="categoria">
              <Accordion.Control>
                <AccordionLabel label="Categoría" count={filters.categoryIds.length} />
              </Accordion.Control>
              <Accordion.Panel>
                <CategoryFilterGroup
                  selected={filters.categoryIds}
                  onChange={(ids) => set("categoryIds", ids)}
                  showLabel={false}
                />
              </Accordion.Panel>
            </Accordion.Item>

            {options.talles.length > 0 && (
              <Accordion.Item value="talle">
                <Accordion.Control>
                  <AccordionLabel label="Talle" count={filters.equivalencias.length} />
                </Accordion.Control>
                <Accordion.Panel>
                  <TalleChipGroup
                    talles={options.talles}
                    selected={filters.equivalencias}
                    onChange={(eq) => set("equivalencias", eq)}
                    showLabel={false}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {options.colors.length > 0 && (
              <Accordion.Item value="color">
                <Accordion.Control>
                  <AccordionLabel label="Color" count={filters.colorBases.length} />
                </Accordion.Control>
                <Accordion.Panel>
                  <ColorChipGroup
                    colors={options.colors}
                    selected={filters.colorBases}
                    onChange={(bases) => set("colorBases", bases)}
                    showLabel={false}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {options.brands.length > 0 && (
              <Accordion.Item value="marca">
                <Accordion.Control>
                  <AccordionLabel label="Marca" count={filters.brandValueIds.length} />
                </Accordion.Control>
                <Accordion.Panel>
                  <ChipFilterGroup
                    label="Marca"
                    options={options.brands}
                    selected={filters.brandValueIds}
                    onChange={(ids) => set("brandValueIds", ids)}
                    showLabel={false}
                    searchable
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {options.cortes.length > 0 && (
              <Accordion.Item value="corte">
                <Accordion.Control>
                  <AccordionLabel label="Corte" count={filters.corteValueIds.length} />
                </Accordion.Control>
                <Accordion.Panel>
                  <ChipFilterGroup
                    label="Corte"
                    options={options.cortes}
                    selected={filters.corteValueIds}
                    onChange={(ids) => set("corteValueIds", ids)}
                    showLabel={false}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}

            {options.materials.length > 0 && (
              <Accordion.Item value="material">
                <Accordion.Control>
                  <AccordionLabel label="Material principal" count={filters.materialValueIds.length} />
                </Accordion.Control>
                <Accordion.Panel>
                  <ChipFilterGroup
                    label="Material principal"
                    options={options.materials}
                    selected={filters.materialValueIds}
                    onChange={(ids) => set("materialValueIds", ids)}
                    showLabel={false}
                  />
                </Accordion.Panel>
              </Accordion.Item>
            )}
          </Accordion>
        )}
      </div>

    </div>
  );
}
