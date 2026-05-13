"use client";
import { useState, useRef, useEffect } from "react";
import { useSuppliers } from "@/hooks/useSuppliers";
import { LoadingSpinner } from "@/components/ui/LoadingSpinner";
import type { Supplier } from "@/types";

interface Props {
  value: Supplier | null;
  onChange: (supplier: Supplier | null) => void;
}

export function SupplierSearch({ value, onChange }: Props) {
  const [input, setInput] = useState(value?.name || "");
  const [open, setOpen] = useState(false);
  const [debouncedQuery, setDebouncedQuery] = useState("");
  const ref = useRef<HTMLDivElement>(null);
  const timerRef = useRef<ReturnType<typeof setTimeout>>(null);

  const { data: suppliers, isFetching } = useSuppliers(debouncedQuery);

  useEffect(() => {
    if (timerRef.current) clearTimeout(timerRef.current);
    timerRef.current = setTimeout(() => setDebouncedQuery(input), 300);
    return () => {
      if (timerRef.current) clearTimeout(timerRef.current);
    };
  }, [input]);

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setOpen(false);
        if (!value) setInput("");
        else setInput(value.name);
      }
    }
    document.addEventListener("mousedown", handleClickOutside);
    return () => document.removeEventListener("mousedown", handleClickOutside);
  }, [value]);

  function handleSelect(s: Supplier) {
    onChange(s);
    setInput(s.name);
    setOpen(false);
  }

  function handleInputChange(e: React.ChangeEvent<HTMLInputElement>) {
    setInput(e.target.value);
    if (value && e.target.value !== value.name) {
      onChange(null);
    }
    setOpen(true);
  }

  return (
    <div ref={ref} style={{ position: "relative", width: 320 }}>
      <div style={{ position: "relative" }}>
        <input
          type="text"
          value={input}
          placeholder="Buscar proveedor..."
          onChange={handleInputChange}
          onFocus={(e) => {
            e.currentTarget.style.borderColor = "var(--accent)";
            setOpen(true);
          }}
          onBlur={(e) => {
            e.currentTarget.style.borderColor = "var(--border)";
          }}
          style={{
            width: "100%",
            background: "var(--surface2)",
            border: "1px solid var(--border)",
            color: "var(--text)",
            borderRadius: 6,
            padding: "8px 36px 8px 12px",
            fontSize: 14,
            outline: "none",
          }}
        />
        {isFetching && (
          <div
            style={{
              position: "absolute",
              right: 10,
              top: "50%",
              transform: "translateY(-50%)",
            }}
          >
            <LoadingSpinner size={14} />
          </div>
        )}
      </div>

      {open && suppliers && suppliers.length > 0 && (
        <div
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            background: "var(--surface2)",
            border: "1px solid var(--border2)",
            borderRadius: 6,
            maxHeight: 240,
            overflowY: "auto",
            marginTop: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,0.4)",
          }}
        >
          {suppliers.map((s) => (
            <button
              key={s.id}
              type="button"
              onMouseDown={() => handleSelect(s)}
              style={{
                display: "block",
                width: "100%",
                textAlign: "left",
                padding: "8px 12px",
                background: "none",
                border: "none",
                color: "var(--text)",
                cursor: "pointer",
                fontSize: 14,
              }}
              onMouseEnter={(e) => (e.currentTarget.style.background = "var(--surface3)")}
              onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
            >
              {s.name}
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
