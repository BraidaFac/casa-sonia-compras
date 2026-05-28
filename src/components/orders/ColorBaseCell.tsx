import { useState } from "react";
import { Combobox, InputBase, useCombobox } from "@mantine/core";
import type { ColorValue } from "@/types";

interface Props {
  color: ColorValue | null;
  colorBaseOptions: string[];
  onChange: (color: ColorValue) => void;
}

export function ColorBaseCell({ color, colorBaseOptions, onChange }: Props) {
  const [search, setSearch] = useState(color?.colorBase || "");

  const combobox = useCombobox({
    onDropdownClose: () => combobox.resetSelectedOption(),
  });

  if (!color) {
    return (
      <div style={{ padding: "4px 8px", fontSize: 12, color: "var(--text3)", fontStyle: "italic" }}>
        —
      </div>
    );
  }

  if (!color.isNew) {
    return (
      <div
        style={{
          padding: "4px 8px",
          fontSize: 12,
          color: color.colorBase ? "var(--text2)" : "var(--text3)",
          fontStyle: color.colorBase ? "normal" : "italic",
          whiteSpace: "nowrap",
          overflow: "hidden",
          textOverflow: "ellipsis",
        }}
      >
        {color.colorBase || "—"}
      </div>
    );
  }

  const filtered = colorBaseOptions.filter((opt) =>
    opt.toLowerCase().includes(search.toLowerCase()),
  );

  function selectOption(val: string) {
    onChange({ ...color!, colorBase: val });
    setSearch(val);
    combobox.closeDropdown();
  }

  return (
    <Combobox
      store={combobox}
      onOptionSubmit={selectOption}
      withinPortal
    >
      <Combobox.Target>
        <InputBase
          value={search}
          placeholder="Color base..."
          size="xs"
          error={!color.colorBase}
          styles={{
            input: { fontSize: 11, background: "transparent" },
            wrapper: { padding: "2px 4px" },
          }}
          onChange={(e) => {
            setSearch(e.currentTarget.value);
            combobox.openDropdown();
          }}
          onFocus={() => combobox.openDropdown()}
          onBlur={() => {
            combobox.closeDropdown();
            setSearch(color.colorBase || "");
          }}
          onKeyDown={(e) => {
            if (!combobox.dropdownOpened) return;
            if ((e.key === "Tab" || e.key === "ArrowDown") && filtered.length > 0) {
              e.preventDefault();
              combobox.selectNextOption();
            } else if (e.key === "ArrowUp" && filtered.length > 0) {
              e.preventDefault();
              combobox.selectPreviousOption();
            } else if (e.key === "Enter" && filtered.length > 0) {
              e.preventDefault();
              if (filtered.length === 1) {
                selectOption(filtered[0]);
              } else {
                combobox.clickSelectedOption();
              }
            }
          }}
        />
      </Combobox.Target>
      <Combobox.Dropdown style={{ minWidth: 200 }}>
        <Combobox.Options mah={200} style={{ overflowY: "auto" }}>
          {filtered.length > 0 ? (
            filtered.map((opt) => (
              <Combobox.Option key={opt} value={opt}>
                {opt}
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
