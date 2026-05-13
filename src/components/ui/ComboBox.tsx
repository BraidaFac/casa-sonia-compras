"use client";
import { useState, useRef, useEffect } from "react";
import type { AttributeValue } from "@/types";

interface Props {
  value: AttributeValue | null;
  options: AttributeValue[];
  placeholder?: string;
  error?: boolean;
  onChange: (value: AttributeValue) => void;
}

export function ComboBox({ value, options, placeholder = "Buscar...", error = false, onChange }: Props) {
  const [open, setOpen] = useState(false);
  const [input, setInput] = useState(value?.name || "");
  const [dropdownPos, setDropdownPos] = useState({ top: 0, left: 0, width: 0 });
  const ref = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setInput(value?.name || "");
  }, [value?.name]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        // Reset input to selected value if no match
        setInput(value?.name || "");
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value?.name]);

  function openDropdown() {
    if (inputRef.current) {
      const rect = inputRef.current.getBoundingClientRect();
      setDropdownPos({ top: rect.bottom + window.scrollY + 2, left: rect.left + window.scrollX, width: rect.width });
    }
    setOpen(true);
  }

  const filtered = options.filter((o) =>
    o.name.toLowerCase().includes(input.toLowerCase()),
  );

  const exactMatch = options.find(
    (o) => o.name.toLowerCase() === input.toLowerCase(),
  );

  const showCreate = input.trim().length > 0 && !exactMatch;

  function handleSelect(opt: AttributeValue) {
    onChange(opt);
    setInput(opt.name);
    setOpen(false);
  }

  function handleCreate() {
    const newVal: AttributeValue = {
      id: Date.now(), // placeholder, resolved on submit
      name: input.trim(),
      isNew: true,
    };
    onChange(newVal);
    setOpen(false);
  }

  return (
    <div ref={ref} style={{ position: "relative", width: "100%" }}>
      <input
        ref={inputRef}
        type="text"
        value={input}
        placeholder={placeholder}
        onChange={(e) => {
          setInput(e.target.value);
          openDropdown();
        }}
        onFocus={(e) => {
          e.currentTarget.style.borderColor = "var(--accent)";
          openDropdown();
        }}
        onBlur={(e) => {
          e.currentTarget.style.borderColor = "var(--border)";
        }}
        style={{
          width: "100%",
          background: error ? "rgba(239,68,68,0.1)" : "var(--surface2)",
          border: `1px solid ${error ? "var(--red)" : "var(--border)"}`,
          color: "var(--text)",
          borderRadius: 4,
          padding: "4px 8px",
          fontSize: 13,
          outline: "none",
        }}
      />

      {open && (filtered.length > 0 || showCreate) && (
        <div
          style={{
            position: "fixed",
            top: dropdownPos.top,
            left: dropdownPos.left,
            width: dropdownPos.width,
            zIndex: 9999,
            background: "var(--surface2)",
            border: "1px solid var(--border2)",
            borderRadius: 4,
            maxHeight: 200,
            overflowY: "auto",
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {filtered.map((opt) => (
            <button
              key={opt.id}
              type="button"
              onMouseDown={() => handleSelect(opt)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                background: "none",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 13,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--surface3)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
              }}
            >
              {opt.name}
            </button>
          ))}

          {showCreate && (
            <button
              type="button"
              onMouseDown={handleCreate}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "6px 10px",
                background: "none",
                border: "none",
                borderTop: "1px solid var(--border)",
                color: "var(--accent)",
                cursor: "pointer",
                fontSize: 13,
              }}
              onMouseEnter={(e) => {
                e.currentTarget.style.background = "var(--accent-bg)";
              }}
              onMouseLeave={(e) => {
                e.currentTarget.style.background = "none";
              }}
            >
              + Crear &ldquo;{input.trim()}&rdquo; en Odoo
            </button>
          )}
        </div>
      )}
    </div>
  );
}
