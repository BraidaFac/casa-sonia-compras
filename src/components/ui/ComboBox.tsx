"use client";
import { useState, useEffect } from "react";
import { Combobox, InputBase, useCombobox } from "@mantine/core";
import type { AttributeValue } from "@/types";

interface Props {
  value: AttributeValue | null;
  options: AttributeValue[];
  placeholder?: string;
  error?: boolean;
  tabIndex?: number;
  onChange: (value: AttributeValue) => void;
}

// ─── Teclado en listas desplegables ─────────────────────────────────────────

/**
 * Con la lista abierta: un solo resultado → Tab o Enter lo eligen (Tab sigue al próximo campo);
 * varios → Tab / Shift+Tab recorren las opciones y Enter elige la marcada (eso lo resuelve el Combobox).
 */
export function teclasLista(e: React.KeyboardEvent, combobox: ReturnType<typeof useCombobox>, cantidad: number, elegirUnico: () => void) {
  if (!combobox.dropdownOpened) return;
  const nadaMarcado = combobox.getSelectedOptionIndex() === -1;
  if (cantidad === 1 && nadaMarcado && (e.key === "Tab" || e.key === "Enter")) {
    if (e.key === "Enter") e.preventDefault();
    elegirUnico();
    combobox.closeDropdown();
    return;
  }
  if (e.key === "Tab" && cantidad > 1) {
    e.preventDefault();
    if (e.shiftKey) combobox.selectPreviousOption();
    else combobox.selectNextOption();
  }
}

export function ComboBox({ value, options, placeholder = "Buscar...", error = false, tabIndex, onChange }: Props) {
  const [search, setSearch] = useState(value?.name || "");

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setSearch(value?.name || ""); // sync search from controlled value
  }, [value?.name]);

  const filtered =
    search.trim() === ""
      ? options
      : options.filter((o) => o.name.toLowerCase().includes(search.toLowerCase()));

  function handleSubmit(val: string) {
    const opt = options.find((o) => String(o.id) === val);
    if (opt) {
      onChange(opt);
      setSearch(opt.name);
    }
    combobox.closeDropdown();
  }

  return (
    <Combobox store={combobox} onOptionSubmit={handleSubmit} withinPortal>
      <Combobox.Target>
        <InputBase
          value={search}
          placeholder={placeholder}
          error={error}
          size="xs"
          tabIndex={tabIndex}
          styles={{ input: { fontSize: 13 } }}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            combobox.openDropdown();
            combobox.updateSelectedOptionIndex();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            // Reset to selected value — no free text allowed
            setSearch(value?.name || "");
          }}
          onKeyDown={(e) => teclasLista(e, combobox, filtered.length, () => handleSubmit(String(filtered[0].id)))}
        />
      </Combobox.Target>

      <Combobox.Dropdown>
        <Combobox.Options mah={200} style={{ overflowY: "auto", overscrollBehavior: "contain" }}>
          {filtered.length > 0 ? (
            filtered.map((opt) => (
              <Combobox.Option key={opt.id} value={String(opt.id)}>
                {opt.name}
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
