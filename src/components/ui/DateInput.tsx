"use client";
import { DatePickerInput, type DatePickerInputProps } from "@mantine/dates";
import "dayjs/locale/es";

function toDate(v: unknown): Date | null {
  if (!v) return null;
  const d = new Date(v as string | number | Date);
  return isNaN(d.getTime()) ? null : d;
}

type Props = Omit<DatePickerInputProps, "onChange"> & {
  onChange?: (value: Date | null) => void;
};

export function DateInput({
  onChange,
  valueFormat = "DD/MM/YYYY",
  locale = "es",
  ...props
}: Props) {
  return (
    <DatePickerInput
      valueFormat={valueFormat}
      locale={locale}
      {...props}
      onChange={(v) => onChange?.(toDate(v))}
    />
  );
}
