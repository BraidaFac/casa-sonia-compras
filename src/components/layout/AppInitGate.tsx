"use client";
import { useIsFetching } from "@tanstack/react-query";
import { Skeleton } from "@mantine/core";
import { useRef, useState, useEffect } from "react";

export function AppInitGate({ children }: { children: React.ReactNode }) {
  const isFetching = useIsFetching();
  const phaseRef = useRef<"idle" | "loading" | "done">("idle");
  const [done, setDone] = useState(false);

  // Fallback: if WarmupTierA never fires (no queries), unblock after 400ms
  useEffect(() => {
    const t = setTimeout(() => {
      if (phaseRef.current === "idle") {
        phaseRef.current = "done";
        setDone(true);
      }
    }, 400);
    return () => clearTimeout(t);
  }, []);

  useEffect(() => {
    if (phaseRef.current === "done") return;
    if (isFetching > 0) phaseRef.current = "loading";
    if (phaseRef.current === "loading" && isFetching === 0) {
      phaseRef.current = "done";
      setDone(true);
    }
  }, [isFetching]);

  if (done) return <>{children}</>;

  return (
    <div
      style={{
        minHeight: "100dvh",
        background: "var(--bg)",
        display: "flex",
        flexDirection: "column",
      }}
    >
      {/* Header bar */}
      <div
        style={{
          padding: "12px 24px",
          display: "flex",
          gap: 12,
          alignItems: "center",
          borderBottom: "1px solid var(--border)",
          background: "var(--surface)",
          height: 57,
          flexShrink: 0,
        }}
      >
        <Skeleton height={20} width={130} radius="sm" />
        <Skeleton height={34} style={{ flex: 1, maxWidth: 480 }} radius="sm" />
      </div>

      {/* Body */}
      <div style={{ flex: 1, display: "flex", overflow: "hidden" }}>
        {/* Filter panel */}
        <div
          style={{
            width: 280,
            flexShrink: 0,
            borderRight: "1px solid var(--border)",
            background: "var(--surface)",
            padding: "14px 16px",
            display: "flex",
            flexDirection: "column",
            gap: 0,
          }}
        >
          <div
            style={{
              display: "flex",
              justifyContent: "space-between",
              alignItems: "center",
              paddingBottom: 14,
              borderBottom: "1px solid var(--border)",
              marginBottom: 4,
            }}
          >
            <Skeleton height={13} width={55} radius="sm" />
            <Skeleton height={28} width={72} radius="sm" />
          </div>
          {([52, 40, 64, 36, 48] as const).map((w, i) => (
            <div
              key={i}
              style={{
                display: "flex",
                justifyContent: "space-between",
                alignItems: "center",
                padding: "11px 0",
                borderBottom: "1px solid var(--border)",
              }}
            >
              <Skeleton height={11} width={`${w}%`} radius="sm" />
              <Skeleton height={11} width={11} radius="sm" />
            </div>
          ))}
        </div>

        {/* Main content */}
        <div
          style={{
            flex: 1,
            padding: "28px 28px",
            display: "flex",
            flexDirection: "column",
            gap: 14,
          }}
        >
          <Skeleton height={22} width={180} radius="sm" />
          <Skeleton height={13} width={300} radius="sm" />
          <div
            style={{
              display: "grid",
              gridTemplateColumns: "repeat(auto-fill, minmax(150px, 1fr))",
              gap: 12,
              marginTop: 8,
            }}
          >
            {Array.from({ length: 9 }).map((_, i) => (
              <Skeleton key={i} height={175} radius="md" />
            ))}
          </div>
        </div>
      </div>
    </div>
  );
}
