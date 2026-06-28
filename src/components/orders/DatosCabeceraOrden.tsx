"use client";
import { useState, useEffect, useRef } from "react";
import {
  Group,
  Text,
  Combobox,
  useCombobox,
  InputBase,
  TextInput,
  CheckIcon,
} from "@mantine/core";
import { DatePickerInput } from "@mantine/dates";
import "dayjs/locale/es";
import { SupplierSearch } from "./SupplierSearch";
import { useBrands } from "@/hooks/useBrands";
import { useWarehouses } from "@/hooks/useWarehouses";
import { useCompradora } from "@/hooks/useCompradora";
import type { Supplier, AttributeValue, Warehouse } from "@/types";

// Inline clear button — same pattern used in OrderGrid previously
function ActionIconClear({ onClick }: { onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={(e) => { e.stopPropagation(); onClick(); }}
      style={{
        background: "none",
        border: "none",
        cursor: "pointer",
        padding: 2,
        display: "flex",
        alignItems: "center",
        color: "var(--mantine-color-dimmed)",
      }}
      aria-label="Limpiar"
    >
      ✕
    </button>
  );
}

interface Compradora {
  id: number;
  name: string;
}

interface Props {
  supplier: Supplier | null;
  onSupplierChange: (s: Supplier | null) => void;
  date: Date | null;
  onDateChange: (d: Date | null) => void;
  globalBrand: AttributeValue | null;
  onGlobalBrandChange: (b: AttributeValue | null) => void;
  compradoras: Compradora[];
  onCompradorasChange: (cs: Compradora[]) => void;
  /** For edit mode: hydrate compradoras from stored IDs once compradora list loads */
  initialCompradoraIds?: number[];
  selectedWarehouses: Warehouse[];
  onSelectedWarehousesChange: (ws: Warehouse[]) => void;
  /** For edit mode: hydrate selectedWarehouses from stored IDs once warehouse list loads */
  initialWarehouseIds?: number[];
  disabled?: boolean;
  /** Extra content rendered at the end of the Group (e.g. units badge) */
  extraContent?: React.ReactNode;
}

export function DatosCabeceraOrden({
  supplier,
  onSupplierChange,
  date,
  onDateChange,
  globalBrand,
  onGlobalBrandChange,
  compradoras,
  onCompradorasChange,
  initialCompradoraIds,
  selectedWarehouses,
  onSelectedWarehousesChange,
  initialWarehouseIds,
  disabled = false,
  extraContent,
}: Props) {
  const { data: brandsData } = useBrands();
  const { data: allWarehouses = [] } = useWarehouses();
  const { data: compradoraData } = useCompradora();

  const allBrands = brandsData?.brands ?? [];
  const [brandSearch, setBrandSearch] = useState<string>(
    () => globalBrand?.name ?? "",
  );

  // Sync brandSearch when globalBrand changes from outside (e.g. draft restore)
  const prevBrandRef = useRef<AttributeValue | null>(null);
  useEffect(() => {
    if (globalBrand !== prevBrandRef.current) {
      prevBrandRef.current = globalBrand;
      setBrandSearch(globalBrand?.name ?? "");
    }
  }, [globalBrand]);

  // Hydrate selectedWarehouses from initialWarehouseIds once warehouse list loads (edit mode)
  const warehousesHydratedRef = useRef(false);
  useEffect(() => {
    if (
      !initialWarehouseIds?.length ||
      !allWarehouses.length ||
      warehousesHydratedRef.current
    )
      return;
    warehousesHydratedRef.current = true;
    const matched = allWarehouses.filter((w) =>
      initialWarehouseIds.includes(w.id),
    );
    if (matched.length > 0) onSelectedWarehousesChange(matched);
  }, [allWarehouses]); // eslint-disable-line react-hooks/exhaustive-deps

  const filteredBrands = allBrands.filter((b) =>
    b.name.toLowerCase().includes(brandSearch.toLowerCase()),
  );

  const brandCombobox = useCombobox({
    onDropdownClose: () => brandCombobox.resetSelectedOption(),
  });

  // ── Comprador multiselect ──────────────────────────────────────────────────
  const allCompradoras: Compradora[] = compradoraData?.compradoras ?? [];
  const [compradoraSearch, setCompradoraSearch] = useState("");
  const compradoraCombobox = useCombobox({
    onDropdownClose: () => {
      compradoraCombobox.resetSelectedOption();
      setCompradoraSearch("");
    },
  });
  const compradoraSearchRef = useRef<HTMLInputElement>(null);

  // Hydrate compradoras from initialCompradoraIds once list loads (edit mode)
  const compradorasHydratedRef = useRef(false);
  useEffect(() => {
    if (
      !initialCompradoraIds?.length ||
      !allCompradoras.length ||
      compradorasHydratedRef.current
    )
      return;
    compradorasHydratedRef.current = true;
    const matched = allCompradoras.filter((c) =>
      initialCompradoraIds.includes(c.id),
    );
    if (matched.length > 0) onCompradorasChange(matched);
  }, [allCompradoras]); // eslint-disable-line react-hooks/exhaustive-deps

  // Focus search input when dropdown opens
  useEffect(() => {
    if (compradoraCombobox.dropdownOpened) {
      setTimeout(() => compradoraSearchRef.current?.focus(), 0);
    }
  }, [compradoraCombobox.dropdownOpened]);

  const filteredCompradoras = allCompradoras.filter((c) =>
    c.name.toLowerCase().includes(compradoraSearch.toLowerCase()),
  );

  function toggleCompradora(c: Compradora) {
    const already = compradoras.some((x) => x.id === c.id);
    onCompradorasChange(
      already ? compradoras.filter((x) => x.id !== c.id) : [...compradoras, c],
    );
  }

  // Display label — fixed, never grows the input
  const compradoraLabel =
    compradoras.length === 0
      ? ""
      : compradoras.length === 1
        ? compradoras[0].name
        : `${compradoras[0].name} +${compradoras.length - 1}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 12,
        marginBottom: 8,
      }}
    >
      {/* Row 1: Proveedor · Fecha · Marca · Comprador · extraContent */}
      <Group gap="xl" align="flex-end" wrap="wrap">
        {/* Proveedor */}
        <div>
          <Text size="xs" c="dimmed" fw={500} mb={6}>
            Proveedor
          </Text>
          <SupplierSearch
            value={supplier}
            onChange={disabled ? () => {} : onSupplierChange}
            disabled={disabled}
          />
        </div>

        {/* Fecha */}
        <DatePickerInput
          label={
            <Text size="xs" c="dimmed" fw={500}>
              Fecha
            </Text>
          }
          value={date}
          onChange={disabled ? () => {} : (v) => onDateChange(v as Date | null)}
          valueFormat="DD/MM/YYYY"
          locale="es"
          w={180}
          disabled={disabled}
        />

        {/* Marca (global) */}
        {allBrands.length > 0 && (
          <div>
            <Text size="xs" c="dimmed" fw={500} mb={6}>
              Marca
            </Text>
            <Combobox
              store={brandCombobox}
              onOptionSubmit={(val) => {
                const brand =
                  allBrands.find((b) => String(b.id) === val) ?? null;
                setBrandSearch(brand?.name ?? "");
                onGlobalBrandChange(brand);
                brandCombobox.closeDropdown();
              }}
              withinPortal
            >
              <Combobox.Target>
                <InputBase
                  value={brandSearch}
                  placeholder="Seleccionar marca..."
                  size="sm"
                  w={200}
                  disabled={disabled}
                  onChange={(e) => {
                    setBrandSearch(e.currentTarget.value);
                    brandCombobox.openDropdown();
                  }}
                  onFocus={() => brandCombobox.openDropdown()}
                  onBlur={() => {
                    brandCombobox.closeDropdown();
                    setBrandSearch(globalBrand?.name ?? "");
                  }}
                  onKeyDown={(e) => {
                    if (!brandCombobox.dropdownOpened) return;
                    if (
                      (e.key === "Tab" || e.key === "ArrowDown") &&
                      filteredBrands.length > 0
                    ) {
                      e.preventDefault();
                      brandCombobox.selectNextOption();
                    } else if (
                      e.key === "ArrowUp" &&
                      filteredBrands.length > 0
                    ) {
                      e.preventDefault();
                      brandCombobox.selectPreviousOption();
                    } else if (e.key === "Enter" && filteredBrands.length > 0) {
                      e.preventDefault();
                      if (filteredBrands.length === 1) {
                        const brand = filteredBrands[0];
                        setBrandSearch(brand.name);
                        onGlobalBrandChange(brand);
                        brandCombobox.closeDropdown();
                      } else {
                        brandCombobox.clickSelectedOption();
                      }
                    }
                  }}
                  rightSection={
                    globalBrand && !disabled ? (
                      <ActionIconClear
                        onClick={() => {
                          onGlobalBrandChange(null);
                          setBrandSearch("");
                        }}
                      />
                    ) : null
                  }
                />
              </Combobox.Target>
              <Combobox.Dropdown>
                <Combobox.Options
                  mah={200}
                  style={{ overflowY: "auto", overscrollBehavior: "contain" }}
                >
                  {filteredBrands.length > 0 ? (
                    filteredBrands.map((b) => (
                      <Combobox.Option key={b.id} value={String(b.id)}>
                        {b.name}
                      </Combobox.Option>
                    ))
                  ) : (
                    <Combobox.Empty>Sin resultados</Combobox.Empty>
                  )}
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
          </div>
        )}

        {/* Comprador — multiselect con altura fija */}
        {allCompradoras.length > 0 && (
          <div>
            <Text size="xs" c="dimmed" fw={500} mb={6}>
              Comprador
            </Text>
            <Combobox
              store={compradoraCombobox}
              onOptionSubmit={(val) => {
                const c = allCompradoras.find((x) => String(x.id) === val);
                if (c) toggleCompradora(c);
                // Do NOT close — allow multi-pick
              }}
              withinPortal
            >
              <Combobox.Target>
                {/* Fixed-height trigger — shows summary, never grows */}
                <InputBase
                  component="button"
                  type="button"
                  pointer
                  size="sm"
                  w={210}
                  disabled={disabled}
                  onClick={() => compradoraCombobox.toggleDropdown()}
                  rightSection={
                    compradoras.length > 0 && !disabled ? (
                      <ActionIconClear
                        onClick={() => {
                          onCompradorasChange([]);
                          compradoraCombobox.closeDropdown();
                        }}
                      />
                    ) : (
                      <Combobox.Chevron />
                    )
                  }
                  rightSectionPointerEvents="all"
                  styles={{
                    input: {
                      textAlign: "left",
                      color:
                        compradoras.length === 0
                          ? "var(--mantine-color-placeholder)"
                          : undefined,
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    },
                  }}
                >
                  {compradoraLabel || (
                    <span style={{ color: "var(--mantine-color-placeholder)" }}>
                      Seleccionar...
                    </span>
                  )}
                </InputBase>
              </Combobox.Target>

              <Combobox.Dropdown>
                {/* Search box inside dropdown */}
                <div style={{ padding: "6px 8px 4px" }}>
                  <TextInput
                    ref={compradoraSearchRef}
                    placeholder="Buscar..."
                    size="xs"
                    value={compradoraSearch}
                    onChange={(e) => {
                      setCompradoraSearch(e.currentTarget.value);
                      compradoraCombobox.updateSelectedOptionIndex();
                    }}
                    onKeyDown={(e) => {
                      if (e.key === "Escape")
                        compradoraCombobox.closeDropdown();
                    }}
                  />
                </div>
                <Combobox.Options
                  mah={200}
                  style={{ overflowY: "auto", overscrollBehavior: "contain" }}
                >
                  {filteredCompradoras.length > 0 ? (
                    filteredCompradoras.map((c) => {
                      const isSelected = compradoras.some((x) => x.id === c.id);
                      return (
                        <Combobox.Option
                          key={c.id}
                          value={String(c.id)}
                          active={isSelected}
                        >
                          <Group gap="xs" wrap="nowrap">
                            {isSelected ? (
                              <CheckIcon size={12} />
                            ) : (
                              <div style={{ width: 12 }} />
                            )}
                            <span>{c.name}</span>
                          </Group>
                        </Combobox.Option>
                      );
                    })
                  ) : (
                    <Combobox.Empty>Sin resultados</Combobox.Empty>
                  )}
                </Combobox.Options>
              </Combobox.Dropdown>
            </Combobox>
          </div>
        )}

        {extraContent}
      </Group>

      {/* Row 2: Sucursales — inline toggle chips, always visible, no dropdown */}
      {allWarehouses.length > 0 && (
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          <Text size="xs" c="dimmed" fw={500}>
            Sucursales
          </Text>
          <div
            role="group"
            aria-label="Sucursales"
            style={{ display: "flex", gap: 6, flexWrap: "wrap" }}
          >
            {allWarehouses.map((w) => {
              const isSelected = selectedWarehouses.some((s) => s.id === w.id);
              return (
                <button
                  key={w.id}
                  type="button"
                  role="checkbox"
                  aria-checked={isSelected}
                  disabled={disabled}
                  onClick={() => {
                    if (disabled) return;
                    const next = isSelected
                      ? selectedWarehouses.filter((s) => s.id !== w.id)
                      : [...selectedWarehouses, w];
                    onSelectedWarehousesChange(next);
                  }}
                  style={{
                    display: "inline-flex",
                    alignItems: "center",
                    gap: 6,
                    padding: "5px 12px",
                    borderRadius: 6,
                    border: `1px solid ${isSelected ? "var(--accent)" : "var(--border2)"}`,
                    background: isSelected
                      ? "var(--accent-bg)"
                      : "var(--surface2)",
                    color: isSelected ? "var(--accent)" : "var(--text2)",
                    fontSize: 13,
                    fontFamily: "var(--font-sans)",
                    fontWeight: isSelected ? 600 : 400,
                    cursor: disabled ? "not-allowed" : "pointer",
                    opacity: disabled ? 0.5 : 1,
                    transition:
                      "border-color 150ms ease, background 150ms ease, color 150ms ease",
                    userSelect: "none",
                    whiteSpace: "nowrap",
                  }}
                  onMouseEnter={(e) => {
                    if (disabled) return;
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--border2)";
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "var(--surface3)";
                    }
                  }}
                  onMouseLeave={(e) => {
                    if (disabled) return;
                    if (!isSelected) {
                      (e.currentTarget as HTMLButtonElement).style.borderColor =
                        "var(--border2)";
                      (e.currentTarget as HTMLButtonElement).style.background =
                        "var(--surface2)";
                    }
                  }}
                >
                  {isSelected && (
                    <svg
                      width="11"
                      height="11"
                      viewBox="0 0 12 12"
                      fill="none"
                      aria-hidden
                    >
                      <path
                        d="M2 6l3 3 5-5"
                        stroke="currentColor"
                        strokeWidth="1.8"
                        strokeLinecap="round"
                        strokeLinejoin="round"
                      />
                    </svg>
                  )}
                  {w.name}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
