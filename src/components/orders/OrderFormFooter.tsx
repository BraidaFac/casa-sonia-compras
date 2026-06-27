"use client";
import { Button, Group, Text } from "@mantine/core";
import { Save, Send } from "lucide-react";

interface OrderFormFooterProps {
  onBack: () => void;
  onSaveDraft: () => void;
  onConfirm: () => void;
  isSaving: boolean;
  isConfirming: boolean;
  isNewOrder?: boolean;
}

export function OrderFormFooter({
  onBack,
  onSaveDraft,
  onConfirm,
  isSaving,
  isConfirming,
  isNewOrder,
}: OrderFormFooterProps) {
  return (
    <div
      style={{
        position: "fixed",
        bottom: 0,
        left: 0,
        right: 0,
        background: "var(--mantine-color-dark-8)",
        borderTop: "1px solid var(--mantine-color-dark-5)",
        padding: "12px 24px",
        display: "flex",
        alignItems: "center",
        justifyContent: "space-between",
        zIndex: 30,
      }}
    >
      {!isNewOrder && (
        <Button
          variant="subtle"
          color="gray"
          onClick={onBack}
          size="sm"
          disabled={isSaving || isConfirming}
        >
          ← Volver
        </Button>
      )}
      {isNewOrder && <div />}

      <Group gap="sm" align="center">
        <Button
          variant="outline"
          color="amber"
          size="sm"
          leftSection={<Save size={14} />}
          onClick={onSaveDraft}
          loading={isSaving}
          disabled={isConfirming}
        >
          Guardar borrador
        </Button>

        <div style={{ width: 1, height: 24, background: "var(--mantine-color-dark-5)" }} />

        <div style={{ display: "flex", flexDirection: "column", alignItems: "flex-end" }}>
          <Button
            color="amber"
            size="sm"
            leftSection={<Send size={14} />}
            onClick={onConfirm}
            loading={isConfirming}
            disabled={isSaving}
          >
            Confirmar Orden
          </Button>
          <Text size="xs" c="dimmed" mt={2}>
            Envía a Odoo
          </Text>
        </div>
      </Group>
    </div>
  );
}
