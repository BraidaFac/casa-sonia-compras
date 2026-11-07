"use client";
import { useRef, useState } from "react";
import { Button, Menu } from "@mantine/core";
import { Columns3, Square, SquareCheck } from "lucide-react";

const CLAVE = "tesoreria.anchos";
const MIN = 70;
const MAX = 700;

function leer(): Record<string, number> {
  try {
    return JSON.parse(localStorage.getItem(CLAVE) ?? "{}");
  } catch {
    return {};
  }
}

/** Anchos de columna editables, recordados en este navegador. */
export function useAnchos(defaults: Record<string, number>) {
  const [guardados, setGuardados] = useState<Record<string, number>>(() => (typeof window === "undefined" ? {} : leer()));
  const ancho = (k: string) => guardados[k] ?? defaults[k] ?? 130;
  const setAncho = (k: string, v: number | null) =>
    setGuardados((g) => {
      const n = { ...g };
      if (v === null) delete n[k];
      else n[k] = Math.round(Math.max(MIN, Math.min(MAX, v)));
      try {
        localStorage.setItem(CLAVE, JSON.stringify(n));
      } catch {
        // sin almacenamiento: el ancho vale solo para esta sesión
      }
      return n;
    });
  return { ancho, setAncho };
}

/** Manija en el borde derecho de un <th> (que debe estar posicionado). Doble clic vuelve al ancho original. */
export function Manija({ ancho, onCambio, onReset }: { ancho: number; onCambio: (v: number) => void; onReset: () => void }) {
  const inicio = useRef<{ x: number; w: number } | null>(null);
  return (
    <span
      role="separator"
      aria-orientation="vertical"
      aria-label="Cambiar ancho de la columna"
      onPointerDown={(e) => {
        e.preventDefault();
        inicio.current = { x: e.clientX, w: ancho };
        e.currentTarget.setPointerCapture(e.pointerId);
      }}
      onPointerMove={(e) => {
        if (inicio.current) onCambio(inicio.current.w + e.clientX - inicio.current.x);
      }}
      onPointerUp={(e) => {
        inicio.current = null;
        e.currentTarget.releasePointerCapture(e.pointerId);
      }}
      onDoubleClick={onReset}
      style={{ position: "absolute", top: 0, right: -3, width: 8, height: "100%", cursor: "col-resize", touchAction: "none", zIndex: 4 }}
    />
  );
}

/** Columnas ocultas de una grilla, recordadas en este navegador. */
export function useOcultas(clave: string) {
  const [ocultas, setOcultas] = useState<string[]>(() => {
    if (typeof window === "undefined") return [];
    try {
      return JSON.parse(localStorage.getItem(clave) ?? "[]");
    } catch {
      return [];
    }
  });
  const alternar = (k: string) =>
    setOcultas((o) => {
      const n = o.includes(k) ? o.filter((x) => x !== k) : [...o, k];
      try {
        localStorage.setItem(clave, JSON.stringify(n));
      } catch {
        // sin almacenamiento: vale solo para esta sesión
      }
      return n;
    });
  return { ocultas, alternar };
}

/**
 * Oculta por posición las celdas de las columnas ocultas en todas las filas de la tabla `[data-grilla=grilla]`,
 * sin tocar cómo se arma cada fila. `claves` va en el orden de las columnas; el <colgroup> se arma solo con las visibles.
 */
export function EstiloOcultas({ grilla, claves, ocultas }: { grilla: string; claves: string[]; ocultas: string[] }) {
  const sel = claves.flatMap((k, i) => (ocultas.includes(k) ? [`table[data-grilla="${grilla}"] > * > tr > :nth-child(${i + 1})`] : []));
  return sel.length ? <style>{`${sel.join(",")}{display:none}`}</style> : null;
}

/** Botón con la lista de columnas para mostrar u ocultar. */
export function MenuColumnas({ columnas, ocultas, onAlternar }: { columnas: { clave: string; titulo: string }[]; ocultas: string[]; onAlternar: (k: string) => void }) {
  const n = columnas.filter((c) => ocultas.includes(c.clave)).length;
  return (
    <Menu position="bottom-end" shadow="md" closeOnItemClick={false}>
      <Menu.Target>
        <Button size="xs" variant={n ? "light" : "default"} leftSection={<Columns3 size={14} />}>
          Columnas{n ? ` (${n} oculta${n > 1 ? "s" : ""})` : ""}
        </Button>
      </Menu.Target>
      <Menu.Dropdown>
        {columnas.map((c) => (
          <Menu.Item key={c.clave} leftSection={ocultas.includes(c.clave) ? <Square size={14} /> : <SquareCheck size={14} />} onClick={() => onAlternar(c.clave)}>
            {c.titulo}
          </Menu.Item>
        ))}
      </Menu.Dropdown>
    </Menu>
  );
}
