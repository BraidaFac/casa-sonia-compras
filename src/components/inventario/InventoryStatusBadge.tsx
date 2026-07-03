"use client";
import { Badge } from "@mantine/core";
import type { InventoryStatus } from "@/types";

const STATUS_CONFIG: Record<InventoryStatus, { label: string; color: string }> = {
  BORRADOR: { label: "Borrador", color: "gray" },
  CONFIRMADO: { label: "Confirmado", color: "green" },
};

export function InventoryStatusBadge({ status }: { status: InventoryStatus }) {
  const cfg = STATUS_CONFIG[status] ?? { label: status, color: "gray" };
  return (
    <Badge color={cfg.color} variant="light" size="sm">
      {cfg.label}
    </Badge>
  );
}
