"use client";
import { Modal, Text, ScrollArea } from "@mantine/core";
import { History, Clock } from "lucide-react";
import type { SearchHistoryEntry } from "@/types";

interface SearchHistoryModalProps {
  opened: boolean;
  onClose: () => void;
  entries: SearchHistoryEntry[];
  onSelect: (entry: SearchHistoryEntry) => void;
}

function formatDate(iso: string) {
  return new Date(iso).toLocaleString("es-AR", {
    day: "2-digit",
    month: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function SearchHistoryModal({
  opened,
  onClose,
  entries,
  onSelect,
}: SearchHistoryModalProps) {
  return (
    <Modal
      opened={opened}
      onClose={onClose}
      title={
        <Text fw={700} size="md" style={{ fontFamily: "var(--font-display)" }}>
          Historial de consultas
        </Text>
      }
      centered
      size="md"
      overlayProps={{ blur: 2, backgroundOpacity: 0.55 }}
    >
      {entries.length === 0 ? (
        <div style={{ padding: "24px 0", textAlign: "center" }}>
          <History size={32} color="var(--text3)" style={{ marginBottom: 8 }} />
          <Text c="dimmed" size="sm">
            Sin consultas previas
          </Text>
        </div>
      ) : (
        <ScrollArea.Autosize mah={400}>
          <div style={{ display: "flex", flexDirection: "column", gap: 2 }}>
            {entries.map((entry) => (
              <button
                key={entry.id}
                onClick={() => {
                  onSelect(entry);
                  onClose();
                }}
                style={{
                  display: "flex",
                  alignItems: "center",
                  gap: 12,
                  padding: "10px 12px",
                  borderRadius: 8,
                  border: "none",
                  background: "none",
                  cursor: "pointer",
                  textAlign: "left",
                  width: "100%",
                  transition: "background 100ms",
                }}
                onMouseEnter={(e) =>
                  (e.currentTarget.style.background = "var(--surface)")
                }
                onMouseLeave={(e) => (e.currentTarget.style.background = "none")}
              >
                {entry.thumbUrl ? (
                  <img
                    src={entry.thumbUrl}
                    alt=""
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 6,
                      objectFit: "cover",
                      border: "1px solid var(--border)",
                      flexShrink: 0,
                    }}
                  />
                ) : (
                  <div
                    style={{
                      width: 40,
                      height: 40,
                      borderRadius: 6,
                      background: "var(--bg)",
                      border: "1px solid var(--border)",
                      display: "flex",
                      alignItems: "center",
                      justifyContent: "center",
                      flexShrink: 0,
                    }}
                  >
                    <History size={16} color="var(--text3)" />
                  </div>
                )}
                <div style={{ flex: 1, minWidth: 0 }}>
                  <Text
                    size="sm"
                    fw={500}
                    style={{
                      whiteSpace: "nowrap",
                      overflow: "hidden",
                      textOverflow: "ellipsis",
                    }}
                  >
                    {entry.productName}
                  </Text>
                  {entry.productRef && (
                    <Text size="xs" c="dimmed">
                      {entry.productRef}
                    </Text>
                  )}
                </div>
                <div
                  style={{
                    display: "flex",
                    alignItems: "center",
                    gap: 4,
                    flexShrink: 0,
                  }}
                >
                  <Clock size={11} color="var(--text3)" />
                  <Text size="xs" c="dimmed">
                    {formatDate(entry.searchedAt)}
                  </Text>
                </div>
              </button>
            ))}
          </div>
        </ScrollArea.Autosize>
      )}
    </Modal>
  );
}
