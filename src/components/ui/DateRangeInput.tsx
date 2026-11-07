"use client";
import { useState } from "react";
import { DatePickerInput, type DatePickerInputProps } from "@mantine/dates";
import { useMediaQuery } from "@mantine/hooks";
import "dayjs/locale/es";

type Rango = [string | null, string | null];

type Props = Omit<DatePickerInputProps<"range">, "type" | "value" | "onChange" | "maxDate" | "minDate"> & {
  value: [string, string]; // YYYY-MM-DD
  onChange: (desde: string, hasta: string) => void;
  minDate?: string;
  maxDate?: string;
};

const dia = (v: unknown) => (v ? String(v).slice(0, 10) : null);

/** Rango de fechas tipo selector de vuelos. Avisa solo cuando están elegidas las dos fechas. */
export function DateRangeInput({ value, onChange, valueFormat = "DD/MM/YYYY", locale = "es", ...props }: Props) {
  const movil = useMediaQuery("(max-width: 768px)");
  // Selección a medias (solo inicio) local; se resincroniza si cambia el valor de afuera
  const [sel, setSel] = useState<Rango>(value);
  const [prev, setPrev] = useState(value);
  if (prev[0] !== value[0] || prev[1] !== value[1]) {
    setPrev(value);
    setSel(value);
  }
  return (
    <DatePickerInput
      type="range"
      allowSingleDateInRange
      numberOfColumns={movil ? 1 : 2}
      valueFormat={valueFormat}
      locale={locale}
      {...props}
      value={sel}
      onChange={(v) => {
        const [d, h] = [dia(v[0]), dia(v[1])];
        setSel([d, h]);
        if (d && h) onChange(d, h);
      }}
      // Cerrar con una sola fecha elegida vuelve al rango vigente
      onDropdownClose={() => setSel((s) => (s[1] ? s : value))}
    />
  );
}
