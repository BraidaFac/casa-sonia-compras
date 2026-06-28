"use client";
import { MantineProvider, createTheme } from "@mantine/core";
import { Notifications } from "@mantine/notifications";

const theme = createTheme({
  primaryColor: "amber",
  fontFamily: "var(--font-sans)",
  headings: { fontFamily: "var(--font-display)" },
  colors: {
    dark: [
      "#f5f0eb",
      "#a89880",
      "#6b5e52",
      "#4a4845",
      "#3a3835",
      "#343230",
      "#2c2a27",
      "#242220",
      "#1c1917",
      "#0f0e0c",
    ],
    amber: [
      "#fffbeb",
      "#fef3c7",
      "#fde68a",
      "#fcd34d",
      "#fbbf24",
      "#f59e0b",
      "#d97706",
      "#b45309",
      "#92400e",
      "#78350f",
    ],
  },
});

export function AppMantineProvider({ children }: { children: React.ReactNode }) {
  return (
    <MantineProvider theme={theme} defaultColorScheme="dark">
      <Notifications position="top-right" zIndex={200} />
      {children}
    </MantineProvider>
  );
}
