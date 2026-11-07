"use client";
import { useRef, useState } from "react";
import { Badge, Button, Group, Modal, Text } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { FileText, Image as ImageIcon, Paperclip, Plus, X } from "lucide-react";
import { useQueryClient } from "@tanstack/react-query";
import { useTesoreriaAdjuntos } from "@/hooks/useTesoreria";
import { queryKeys } from "@/lib/queryKeys";

/** Archivo elegido en una operación todavía sin guardar: se sube al guardar el borrador. */
export type AdjuntoNuevo = { key: string; diarioId: number | null; file: File };

const MAX = 10 * 1024 * 1024;
// Misma lista que el servidor (tesoreriaAdjuntos.ts)
const PERMITIDOS = new Set(["application/pdf", "image/png", "image/jpeg", "image/gif", "image/webp", "image/heic", "image/heif"]);
const valido = (f: File) => PERMITIDOS.has(f.type.split(";")[0].trim().toLowerCase());
const Icono = ({ mime }: { mime: string }) => (mime.startsWith("image/") ? <ImageIcon size={14} /> : <FileText size={14} />);

/** Sube los archivos en cola de una operación ya guardada. Se corta en el primer error y devuelve los que faltan. */
export async function subirNuevos(opId: number, nuevos: AdjuntoNuevo[]): Promise<{ error: string | null; restantes: AdjuntoNuevo[] }> {
  // En paralelo; los que fallan quedan para reintentar
  const errores = await Promise.all(
    nuevos.map(async (n) => {
      const fd = new FormData();
      fd.append("archivo", n.file);
      if (n.diarioId !== null) fd.append("diarioId", String(n.diarioId));
      const r = await fetch(`/api/tesoreria/operaciones/${opId}/adjuntos`, { method: "POST", body: fd }).catch(() => null);
      return r?.ok ? null : (await r?.json().catch(() => null))?.error ?? `No se pudo subir ${n.file.name}`;
    }),
  );
  return { error: errores.find((e) => e) ?? null, restantes: nuevos.filter((_, i) => errores[i]) };
}

/**
 * Clip de un medio de pago (diarioId) o de la factura (null), con su diálogo.
 * Borrador: los archivos nuevos quedan en `nuevos` hasta guardar. `directo`: operación completada, sube a Odoo al elegir.
 */
export function ClipAdjuntos({ opId, diarioId, titulo, nuevos = [], onNuevos, directo = false, soloLectura = false, abierto: abiertoExt, onCerrar }: {
  opId?: number | null;
  diarioId: number | null;
  titulo: string;
  nuevos?: AdjuntoNuevo[];
  onNuevos?: (n: AdjuntoNuevo[]) => void;
  directo?: boolean;
  soloLectura?: boolean;
  /** Controlado desde afuera (p. ej. un menú): no dibuja el clip, solo el diálogo. */
  abierto?: boolean;
  onCerrar?: () => void;
}) {
  const qc = useQueryClient();
  const movil = useMediaQuery("(max-width: 640px)");
  const input = useRef<HTMLInputElement>(null);
  const [abiertoLocal, setAbierto] = useState(false);
  const controlado = abiertoExt !== undefined;
  const abierto = controlado ? abiertoExt : abiertoLocal;
  const cerrar = () => (controlado ? onCerrar?.() : setAbierto(false));
  const [ocupado, setOcupado] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { data } = useTesoreriaAdjuntos(opId);
  const existentes = (data?.adjuntos ?? []).filter((a) => a.diarioId === diarioId);
  const cantidad = existentes.length + nuevos.length;
  const refrescar = () => opId && qc.invalidateQueries({ queryKey: queryKeys.tesoreria.adjuntos(opId) });

  if (soloLectura && !cantidad && !controlado) return null;

  async function elegir(files: FileList | null) {
    setError(null);
    const fs = [...(files ?? [])];
    const malo = fs.find((f) => !valido(f) || f.size > MAX);
    if (malo) return setError(`${malo.name}: solo PDF o imágenes de hasta 10 MB.`);
    if (!directo) return onNuevos?.([...nuevos, ...fs.map((file) => ({ key: `${Date.now()}-${Math.random()}`, diarioId, file }))]);
    setOcupado(true);
    setError((await subirNuevos(opId!, fs.map((file) => ({ key: "", diarioId, file })))).error);
    setOcupado(false);
    refrescar();
  }

  async function quitar(id: number) {
    setOcupado(true);
    const r = await fetch(`/api/tesoreria/operaciones/${opId}/adjuntos/${id}`, { method: "DELETE" }).catch(() => null);
    setOcupado(false);
    if (!r?.ok) setError("No se pudo quitar el archivo.");
    refrescar();
  }

  const fila = (k: string | number, nombre: string, mime: string, estado: React.ReactNode, href: string | null, onQuitar?: () => void) => (
    <Group key={k} justify="space-between" wrap="nowrap" gap={8} style={{ padding: "6px 8px", border: "1px solid var(--border)", borderRadius: 6 }}>
      <Group gap={6} wrap="nowrap" style={{ minWidth: 0 }}>
        <Icono mime={mime} />
        {href ? (
          <a href={href} target="_blank" rel="noreferrer" style={{ color: "var(--text)", fontSize: 13, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{nombre}</a>
        ) : (
          <Text size="sm" truncate>{nombre}</Text>
        )}
        {estado}
      </Group>
      {onQuitar && !soloLectura && (
        <Button size="compact-xs" variant="subtle" color="gray" px={4} aria-label={`Quitar ${nombre}`} disabled={ocupado} onClick={onQuitar}><X size={13} /></Button>
      )}
    </Group>
  );

  return (
    <>
      {!controlado && (
        <Button size="compact-xs" variant={cantidad ? "light" : "subtle"} color={cantidad ? "amber" : "gray"} px={4}
          leftSection={<Paperclip size={12} />} aria-label={`Adjuntos de ${titulo}`} title={`Adjuntos de ${titulo}`} onClick={() => setAbierto(true)}>
          {cantidad || null}
        </Button>
      )}
      <Modal opened={abierto} onClose={() => !ocupado && cerrar()} title={`Adjuntos · ${titulo}`} centered fullScreen={movil} size="md" overlayProps={{ backgroundOpacity: 0.6 }}>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {!cantidad && <Text size="sm" c="dimmed">Sin archivos adjuntos.</Text>}
          {existentes.map((a) =>
            a.origen === "odoo"
              ? fila(`o${a.id}`, a.nombre, a.mimetype, <Badge size="xs" variant="light" color="green">En Odoo</Badge>, `/api/tesoreria/operaciones/${opId}/adjuntos/${a.id}?origen=odoo`)
              : fila(`a${a.id}`, a.nombre, a.mimetype, <Badge size="xs" variant="light" color="gray">Se sube al confirmar</Badge>, `/api/tesoreria/operaciones/${opId}/adjuntos/${a.id}`, () => quitar(a.id)),
          )}
          {nuevos.map((n) => fila(n.key, n.file.name, n.file.type, <Badge size="xs" variant="light" color="gray">Se guarda con el borrador</Badge>, null, () => onNuevos?.(nuevos.filter((x) => x.key !== n.key))))}
          {data?.odooError && <Text size="xs" style={{ color: "var(--red)" }}>{data.odooError}</Text>}
          {error && <Text size="xs" style={{ color: "var(--red)" }}>{error}</Text>}
          <input ref={input} type="file" accept="application/pdf,image/*" multiple hidden onChange={(e) => { elegir(e.currentTarget.files); e.currentTarget.value = ""; }} />
          <Group justify="space-between" mt={8}>
            {soloLectura ? <span /> : <Button variant="light" leftSection={<Plus size={14} />} loading={ocupado} onClick={() => input.current?.click()}>Agregar archivo</Button>}
            <Button variant="default" disabled={ocupado} onClick={cerrar}>Cerrar</Button>
          </Group>
          {!soloLectura && <Text size="xs" c="dimmed">PDF o imagen, hasta 10 MB. En el celular podés sacar una foto.</Text>}
        </div>
      </Modal>
    </>
  );
}
