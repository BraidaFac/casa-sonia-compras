"use client";
import { Button, Group } from "@mantine/core";
import { Save, Send } from "lucide-react";

interface OrderFormFooterProps {
  onBack: () => void;
  onSaveDraft: () => void;
  onConfirm?: () => void;
  isSaving: boolean;
  isConfirming: boolean;
  showConfirm?: boolean; // edit page shows both; new page shows only save
  isNewOrder?: boolean;
}

export function OrderFormFooter({
  onBack,
  onSaveDraft,
  onConfirm,
  isSaving,
  isConfirming,
  showConfirm = false,
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
      {!isNewOrder ? (
        <Button
          variant="subtle"
          color="gray"
          onClick={onBack}
          size="sm"
          disabled={isSaving || isConfirming}
        >
          ← Volver
        </Button>
      ) : (
        <div />
      )}

      <Group gap="sm" align="center">
        <Button
          variant={showConfirm ? "outline" : "filled"}
          color="amber"
          size="sm"
          leftSection={<Save size={14} />}
          onClick={onSaveDraft}
          loading={isSaving}
          disabled={isConfirming}
        >
          Guardar
        </Button>

        {showConfirm && (
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
        )}
      </Group>
    </div>
  );
}
