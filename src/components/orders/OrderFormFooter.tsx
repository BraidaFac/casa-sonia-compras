"use client";
import { Button, Group } from "@mantine/core";
import { useMediaQuery } from "@mantine/hooks";
import { Save, Send } from "lucide-react";

interface OrderFormFooterProps {
  onBack: () => void;
  onSaveDraft: () => void;
  onConfirm?: () => void;
  isSaving: boolean;
  isConfirming: boolean;
  showConfirm?: boolean;
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
  const isMobile = useMediaQuery("(max-width: 639px)");

  return (
    <div
      className="footer-bar-pad"
      style={{
        position: "fixed",
        bottom: 0,
        left: "var(--sidebar-width, 0px)",
        right: 0,
        background: "var(--mantine-color-dark-8)",
        borderTop: "1px solid var(--mantine-color-dark-5)",
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

      <Group gap={isMobile ? "xs" : "sm"} align="center">
        <Button
          variant={showConfirm ? "outline" : "filled"}
          color="amber"
          size="sm"
          leftSection={!isMobile ? <Save size={14} /> : undefined}
          onClick={onSaveDraft}
          loading={isSaving}
          disabled={isConfirming}
        >
          {isMobile ? <Save size={14} /> : "Guardar"}
        </Button>

        {showConfirm && (
          <Button
            color="amber"
            size="sm"
            leftSection={!isMobile ? <Send size={14} /> : undefined}
            onClick={onConfirm}
            loading={isConfirming}
            disabled={isSaving}
          >
            {isMobile ? <Send size={14} /> : "Confirmar Orden"}
          </Button>
        )}
      </Group>
    </div>
  );
}
