"use client";
import { useEffect, useState } from "react";
import { Alert, Button, Checkbox, Combobox, Group, Loader, Modal, Select, TextInput, useCombobox } from "@mantine/core";
import { useDebouncedValue, useMediaQuery } from "@mantine/hooks";
import { cuitValido, fmt, formatCuit, parseImporte } from "@/lib/tesoreria";
import { useTesoreriaContactos } from "@/hooks/useTesoreria";
import { DateInput } from "@/components/ui/DateInput";
import { teclasLista } from "@/components/ui/ComboBox";

export const MONO = { fontFamily: "var(--font-mono)", fontVariantNumeric: "tabular-nums" } as const;

/** Importe con signo, coloreado (rojo sale, verde entra). */
export function Monto({ v, pend }: { v?: number; pend?: boolean }) {
  if (!v) return null;
  const txt = pend ? `(${fmt(v)})` : fmt(v);
  return <span style={{ ...MONO, color: pend ? "var(--text2)" : v < 0 ? "var(--red)" : "var(--green)", whiteSpace: "nowrap" }}>{txt}</span>;
}

/** Input de importe positivo en formato es-AR. Valida al salir. */
export function ImporteInput({ value, onChange, placeholder, autoFocus, ariaLabel }: { value: number | undefined; onChange: (v: number | undefined) => void; placeholder?: string; autoFocus?: boolean; ariaLabel?: string }) {
  const [txt, setTxt] = useState(value ? fmt(value) : "");
  const [invalido, setInvalido] = useState(false);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setTxt(value ? fmt(value) : "");
  }
  return (
    <TextInput
      size="xs"
      value={txt}
      autoFocus={autoFocus}
      aria-label={ariaLabel ?? "Importe"}
      placeholder={placeholder ?? "0,00"}
      error={invalido}
      styles={{ input: { ...MONO, textAlign: "right" } }}
      inputMode="decimal"
      onChange={(e) => setTxt(e.currentTarget.value.replace(/-/g, ""))}
      onBlur={() => {
        if (!txt.trim()) {
          setInvalido(false);
          return onChange(undefined);
        }
        const n = parseImporte(txt);
        setInvalido(n === null);
        if (n !== null) {
          setTxt(fmt(n));
          onChange(n);
        } else onChange(undefined);
      }}
    />
  );
}

const aDate = (f?: string) => (f ? new Date(`${f}T12:00:00`) : null);

/** Fecha YYYY-MM-DD con el DateInput de la app. */
export function FechaInput({ value, onChange, min, max, label, ariaLabel, w, clearable }: {
  value: string;
  onChange: (v: string) => void;
  min?: string;
  max?: string;
  label?: string;
  ariaLabel?: string;
  w?: number;
  clearable?: boolean;
}) {
  return (
    <DateInput
      size="xs"
      label={label}
      aria-label={ariaLabel ?? label}
      value={aDate(value)}
      minDate={aDate(min) ?? undefined}
      maxDate={aDate(max) ?? undefined}
      onChange={(d) => onChange(d ? d.toISOString().slice(0, 10) : "")}
      clearable={clearable}
      w={w}
    />
  );
}

/** Texto que se edita localmente y se pasa al salir del campo (no redibuja la grilla en cada tecla). */
export function TextoInput({ value, onChange, placeholder, ariaLabel }: { value: string; onChange: (v: string) => void; placeholder?: string; ariaLabel?: string }) {
  const [txt, setTxt] = useState(value);
  const [prev, setPrev] = useState(value);
  if (prev !== value) {
    setPrev(value);
    setTxt(value);
  }
  return (
    <TextInput
      size="xs"
      value={txt}
      placeholder={placeholder}
      aria-label={ariaLabel}
      onChange={(e) => setTxt(e.currentTarget.value)}
      onBlur={() => txt !== value && onChange(txt)}
    />
  );
}

/** Diálogo centrado (pantalla completa en celular). Cancelar descarta lo cambiado adentro. */
export function Dialogo({ opened, title, onCancel, onAccept, children, aceptarDisabled, size = "lg" }: {
  opened: boolean;
  title: string;
  onCancel: () => void;
  onAccept: () => void;
  children: React.ReactNode;
  aceptarDisabled?: boolean;
  size?: string;
}) {
  const movil = useMediaQuery("(max-width: 640px)");
  return (
    <Modal opened={opened} onClose={onCancel} title={title} centered fullScreen={movil} size={size} overlayProps={{ backgroundOpacity: 0.6 }}>
      <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
        {children}
        <Group justify="flex-end" mt={8}>
          <Button variant="default" onClick={onCancel}>Cancelar</Button>
          <Button onClick={onAccept} disabled={aceptarDisabled}>Aceptar</Button>
        </Group>
      </div>
    </Modal>
  );
}

// ─── Contacto ───────────────────────────────────────────────────────────────

export function ContactoSelect({ value, onChange, responsabilidades, disabled }: {
  value: { id: number | null; nombre: string | null };
  onChange: (v: { id: number | null; nombre: string | null }) => void;
  responsabilidades: { id: number; nombre: string }[];
  disabled?: boolean;
}) {
  const combobox = useCombobox();
  const [q, setQ] = useState(value.nombre ?? "");
  const [debounced] = useDebouncedValue(q, 300);
  const { data = [], isFetching } = useTesoreriaContactos(debounced);
  const [alta, setAlta] = useState(false);
  const [prev, setPrev] = useState(value.nombre);
  if (prev !== value.nombre) {
    setPrev(value.nombre);
    setQ(value.nombre ?? "");
  }

  return (
    <>
      <Combobox store={combobox} onOptionSubmit={(v) => {
        if (v === "__alta") {
          setAlta(true);
        } else {
          const c = data.find((x) => String(x.id) === v);
          if (c) onChange({ id: c.id, nombre: c.nombre });
        }
        combobox.closeDropdown();
      }}>
        <Combobox.Target>
          <TextInput
            size="xs"
            disabled={disabled}
            value={q}
            placeholder="Buscar contacto o CUIT…"
            aria-label="Contacto"
            rightSection={isFetching ? <Loader size={12} /> : null}
            onChange={(e) => {
              setQ(e.currentTarget.value);
              if (value.id) onChange({ id: null, nombre: null });
              combobox.openDropdown();
            }}
            onFocus={() => combobox.openDropdown()}
            onBlur={() => combobox.closeDropdown()}
            error={!value.id && q.trim() && !combobox.dropdownOpened ? "Elegí un contacto de la lista" : undefined}
            onKeyDown={(e) => teclasLista(e, combobox, data.length, () => data.length === 1 && onChange({ id: data[0].id, nombre: data[0].nombre }))}
            styles={{ input: { minWidth: 170 } }}
          />
        </Combobox.Target>
        <Combobox.Dropdown>
          <Combobox.Options>
            {data.map((c) => (
              <Combobox.Option key={c.id} value={String(c.id)}>
                {c.nombre} {c.cuit && <span style={{ color: "var(--text3)", fontSize: 11 }}>{formatCuit(c.cuit)}</span>}
              </Combobox.Option>
            ))}
            {debounced.trim().length >= 2 && !isFetching && !data.length && <Combobox.Empty>Sin resultados</Combobox.Empty>}
            <Combobox.Option value="__alta" style={{ color: "var(--accent)" }}>+ Alta rápida…</Combobox.Option>
          </Combobox.Options>
        </Combobox.Dropdown>
      </Combobox>
      <AltaContacto
        opened={alta}
        nombreInicial={q}
        responsabilidades={responsabilidades}
        onClose={() => setAlta(false)}
        onOk={(c) => {
          setAlta(false);
          onChange(c);
        }}
      />
    </>
  );
}

function AltaContacto({ opened, nombreInicial, responsabilidades, onClose, onOk }: {
  opened: boolean;
  nombreInicial: string;
  responsabilidades: { id: number; nombre: string }[];
  onClose: () => void;
  onOk: (c: { id: number; nombre: string }) => void;
}) {
  const [nombre, setNombre] = useState(nombreInicial);
  const [cuit, setCuit] = useState("");
  const [resp, setResp] = useState<string | null>(null);
  const [cliente, setCliente] = useState(false);
  const [proveedor, setProveedor] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [existente, setExistente] = useState<{ id: number; nombre: string } | null>(null);
  const [guardando, setGuardando] = useState(false);

  useEffect(() => {
    if (!opened) return;
    const d = cuit.replace(/\D/g, "");
    if (!cuitValido(d)) return;
    const ctl = new AbortController();
    fetch(`/api/tesoreria/contactos?cuit=${d}`, { signal: ctl.signal })
      .then((r) => r.json())
      .then((b) => setExistente(b.existente ?? null))
      .catch(() => {});
    return () => ctl.abort();
  }, [cuit, opened]);

  const cuitOk = cuitValido(cuit);
  async function guardar() {
    setError(null);
    setGuardando(true);
    const r = await fetch("/api/tesoreria/contactos", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ nombre, cuit, responsabilidadId: resp ? Number(resp) : null, cliente, proveedor }),
    });
    const b = await r.json().catch(() => ({}));
    setGuardando(false);
    if (r.status === 409 && b.existente) return setExistente(b.existente);
    if (!r.ok) return setError(b.error ?? "No se pudo crear el contacto");
    onOk({ id: b.id, nombre: b.nombre });
  }

  return (
    <Dialogo opened={opened} title="Alta rápida de contacto" onCancel={onClose} onAccept={guardar} aceptarDisabled={guardando || !nombre.trim() || !cuitOk || !resp || (!cliente && !proveedor) || !!existente} size="md">
      <TextInput label="Nombre" value={nombre} onChange={(e) => setNombre(e.currentTarget.value)} />
      <TextInput
        label="CUIT"
        value={cuit}
        placeholder="20-12345678-6"
        onChange={(e) => {
          setCuit(e.currentTarget.value);
          setExistente(null);
        }}
        error={cuit.replace(/\D/g, "").length === 11 && !cuitOk ? "El dígito verificador no es válido" : undefined}
      />
      {existente && (
        <Alert color="yellow">
          Ya existe <b>{existente.nombre}</b> con ese CUIT.{" "}
          <Button size="compact-xs" variant="light" onClick={() => onOk(existente)}>Usar este contacto</Button>
        </Alert>
      )}
      <Select label="Condición frente al IVA" data={responsabilidades.map((r) => ({ value: String(r.id), label: r.nombre }))} value={resp} onChange={setResp} searchable />
      <Group>
        <Checkbox label="Cliente" checked={cliente} onChange={(e) => setCliente(e.currentTarget.checked)} />
        <Checkbox label="Proveedor" checked={proveedor} onChange={(e) => setProveedor(e.currentTarget.checked)} />
      </Group>
      {error && <Alert color="red">{error}</Alert>}
    </Dialogo>
  );
}
