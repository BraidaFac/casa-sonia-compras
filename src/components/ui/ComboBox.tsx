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
          onKeyDown={(e) => {
            if (!combobox.dropdownOpened) return;
            if (e.key === "Tab" && filtered.length > 0) {
              e.preventDefault();
              combobox.selectNextOption();
            } else if (e.key === "Enter" && filtered.length === 1) {
              e.preventDefault();
              handleSubmit(String(filtered[0].id));
            }
          }}
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
