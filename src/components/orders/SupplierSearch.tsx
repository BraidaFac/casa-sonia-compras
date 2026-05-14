"use client";
import { useState } from "react";
import { Combobox, InputBase, useCombobox, Loader } from "@mantine/core";
import { useSuppliers } from "@/hooks/useSuppliers";
import type { Supplier } from "@/types";

interface Props {
  value: Supplier | null;
  onChange: (supplier: Supplier | null) => void;
}

export function SupplierSearch({ value, onChange }: Props) {
  const [search, setSearch] = useState(value?.name || "");

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  const { data: suppliers, isLoading } = useSuppliers();

  const filtered =
    search.trim().length === 0
      ? (suppliers ?? [])
      : (suppliers ?? []).filter((s) =>
          s.name.toLowerCase().includes(search.toLowerCase()),
        );

  function handleSearchChange(val: string) {
    setSearch(val);
    if (value && val !== value.name) onChange(null);
    combobox.openDropdown();
  }

  function handleSelect(val: string) {
    const s = suppliers?.find((s) => String(s.id) === val);
    if (s) {
      onChange(s);
      setSearch(s.name);
    }
    combobox.closeDropdown();
  }

  return (
    <Combobox store={combobox} onOptionSubmit={handleSelect} withinPortal>
      <Combobox.Target>
        <InputBase
          value={search}
          placeholder="Buscar proveedor..."
          w={320}
          rightSection={isLoading ? <Loader size="xs" color="amber" /> : null}
          onChange={(e) => handleSearchChange(e.currentTarget.value)}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            if (!value) setSearch("");
            else setSearch(value.name);
          }}
          onKeyDown={(e) => {
            if (!combobox.dropdownOpened) return;
            if (e.key === "Tab" && filtered.length > 0) {
              e.preventDefault();
              combobox.selectNextOption();
            } else if (e.key === "Enter" && filtered.length === 1) {
              e.preventDefault();
              handleSelect(String(filtered[0].id));
            }
          }}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options
          mah={200}
          style={{ overflowY: "auto", overscrollBehavior: "contain" }}
        >
          {isLoading ? (
            <Combobox.Empty>Cargando...</Combobox.Empty>
          ) : filtered.length > 0 ? (
            filtered.map((s) => (
              <Combobox.Option key={s.id} value={String(s.id)}>
                {s.name}
              </Combobox.Option>
            ))
          ) : (
            <Combobox.Empty>Sin resultados</Combobox.Empty>
          )}
        </Combobox.Options>
      </Combobox.Dropdown>
    </Combobox>
  );
}
