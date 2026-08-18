"use client";
import { useRef, useCallback, useImperativeHandle, forwardRef, useState } from "react";
import { TextInput, Loader } from "@mantine/core";
import { ScanBarcode } from "lucide-react";

export interface BarcodeInputHandle {
  focus: () => void;
}

interface BarcodeInputProps {
  onResult: (result: {
    variantId: number;
    templateId: number;
    colorAttributeValueId: number | null;
    sizeAttributeValueId: number | null;
  }) => void;
  onNotFound: (barcode: string) => void;
  onError: (msg: string) => void;
  disabled?: boolean;
}

export const BarcodeInput = forwardRef<BarcodeInputHandle, BarcodeInputProps>(
  function BarcodeInput({ onResult, onNotFound, onError, disabled }, ref) {
    const inputRef = useRef<HTMLInputElement>(null);
    const [loading, setLoading] = useState(false);
    const scanIdRef = useRef(0);

    useImperativeHandle(ref, () => ({ focus: () => inputRef.current?.focus() }));

    const handleKeyDown = useCallback(
      async (e: React.KeyboardEvent<HTMLInputElement>) => {
        if (e.key !== "Enter") return;
        const barcode = (e.currentTarget.value ?? "").trim();
        if (!barcode) return;
        e.currentTarget.value = "";
        const scanId = ++scanIdRef.current;
        setLoading(true);
        try {
          const res = await fetch(
            `/api/existencias/barcode?barcode=${encodeURIComponent(barcode)}`
          );
          if (scanId !== scanIdRef.current) return; // stale
          if (res.status === 404) {
            onNotFound(barcode);
            return;
          }
          if (!res.ok) {
            onError("Error al consultar código");
            return;
          }
          onResult(await res.json());
        } catch {
          if (scanId === scanIdRef.current) onError("Error de conexión");
        } finally {
          if (scanId === scanIdRef.current) {
            setLoading(false);
            inputRef.current?.focus();
          }
        }
      },
      [onResult, onNotFound, onError]
    );

    return (
      <TextInput
        ref={inputRef}
        placeholder="Escanear código de barras..."
        leftSection={
          loading ? (
            <Loader size={14} />
          ) : (
            <ScanBarcode size={14} color="var(--mantine-color-amber-5)" />
          )
        }
        onKeyDown={handleKeyDown}
        disabled={disabled || loading}
        autoFocus
        styles={{ input: { fontFamily: "var(--font-mono)", letterSpacing: 2 } }}
      />
    );
  }
);
