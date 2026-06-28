"use client";
import { Modal, Button, Text } from "@mantine/core";

interface Props {
  opened: boolean;
  onClose: () => void;
  warnings: string[];
  onEdit: () => void;
}

export function ValidationErrorModal({ opened, onClose, warnings, onEdit }: Props) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      withCloseButton={false}
      centered
      size="sm"
      padding={0}
      radius="md"
      styles={{
        content: {
          background: "var(--surface)",
          border: "1px solid var(--border)",
          overflow: "hidden",
        },
        body: { padding: 0 },
      }}
    >
      {/* ── Header ───────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "28px 24px 20px",
          display: "flex",
          flexDirection: "column",
          alignItems: "flex-start",
          gap: 12,
        }}
      >
        {/* Icon */}
        <div
          style={{
            width: 44,
            height: 44,
            borderRadius: 10,
            background: "var(--accent-bg)",
            border: "1px solid rgba(217,119,6,0.2)",
            display: "flex",
            alignItems: "center",
            justifyContent: "center",
            flexShrink: 0,
          }}
        >
          <svg
            width="22"
            height="22"
            viewBox="0 0 22 22"
            fill="none"
            aria-hidden
          >
            <path
              d="M11 2L20.5 19H1.5L11 2Z"
              stroke="var(--accent)"
              strokeWidth="1.6"
              strokeLinejoin="round"
            />
            <path
              d="M11 9v4"
              stroke="var(--accent)"
              strokeWidth="1.6"
              strokeLinecap="round"
            />
            <circle cx="11" cy="15.5" r="0.8" fill="var(--accent)" />
          </svg>
        </div>

        {/* Title + subtitle */}
        <div>
          <Text
            size="md"
            fw={600}
            style={{ color: "var(--text)", lineHeight: 1.3 }}
          >
            Datos incompletos
          </Text>
          <Text
            size="sm"
            style={{ color: "var(--text2)", marginTop: 2, lineHeight: 1.4 }}
          >
            Completá estos campos antes de confirmar la orden.
          </Text>
        </div>
      </div>

      {/* ── Warning list ──────────────────────────────────────────────────── */}
      <div
        style={{
          margin: "0 24px",
          borderRadius: 8,
          border: "1px solid var(--border)",
          background: "var(--surface2)",
          overflow: "hidden",
        }}
      >
        {warnings.map((w, i) => (
          <div
            key={i}
            style={{
              display: "flex",
              alignItems: "baseline",
              gap: 10,
              padding: "10px 14px",
              borderBottom:
                i < warnings.length - 1
                  ? "1px solid var(--border)"
                  : undefined,
            }}
          >
            {/* Amber bullet */}
            <span
              style={{
                width: 5,
                height: 5,
                borderRadius: "50%",
                background: "var(--accent)",
                flexShrink: 0,
                marginTop: 2,
              }}
            />
            <Text
              size="sm"
              style={{ color: "var(--text2)", lineHeight: 1.45 }}
            >
              {w}
            </Text>
          </div>
        ))}
      </div>

      {/* ── Footer ───────────────────────────────────────────────────────── */}
      <div
        style={{
          padding: "16px 24px 20px",
          display: "flex",
          justifyContent: "flex-end",
          gap: 8,
        }}
      >
        <Button variant="default" size="sm" onClick={onClose}>
          Cerrar
        </Button>
        <Button color="amber" size="sm" onClick={onEdit}>
          Ir a editar
        </Button>
      </div>
    </Modal>
  );
}
