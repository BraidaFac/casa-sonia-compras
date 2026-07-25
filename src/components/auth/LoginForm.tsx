"use client";
import { useState } from "react";
import { useRouter } from "next/navigation";
import { useQueryClient } from "@tanstack/react-query";
import {
  TextInput,
  PasswordInput,
  Button,
  Stack,
  Text,
  Paper,
  Center,
} from "@mantine/core";

export function LoginForm() {
  const router = useRouter();
  const queryClient = useQueryClient();
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setLoading(true);
    setError("");

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ username, password }),
        credentials: "include",
      });

      if (!res.ok) {
        const data = await res.json();
        setError(data.error || "Credenciales inválidas");
        return;
      }

      queryClient.removeQueries({ queryKey: ["currentEmployee"] });
      router.push("/orders/new");
      router.refresh();
    } catch {
      setError("Error de conexión");
    } finally {
      setLoading(false);
    }
  }

  return (
    <Center mih="100vh" p="md" bg="var(--bg)">
      <Paper w="100%" maw={380} p={40} radius="md" withBorder>
        <Stack align="center" mb="xl" gap="xs">
          <Text ff="var(--font-display)" fw={700} size="xl">
            Casa Sonia Compras
          </Text>
        </Stack>

        <form onSubmit={handleSubmit}>
          <Stack gap="md">
            <TextInput
              label="Usuario"
              value={username}
              onChange={(e) => setUsername(e.currentTarget.value)}
              disabled={loading}
              autoComplete="username"
              autoFocus
              size="md"
            />

            <PasswordInput
              label="Contraseña"
              value={password}
              onChange={(e) => setPassword(e.currentTarget.value)}
              disabled={loading}
              autoComplete="current-password"
              size="md"
            />

            {error && (
              <Text c="red" size="sm">
                {error}
              </Text>
            )}

            <Button
              type="submit"
              fullWidth
              size="md"
              color="amber"
              loading={loading}
              disabled={!username || !password}
              mt="xs"
            >
              Ingresar →
            </Button>
          </Stack>
        </form>
      </Paper>
    </Center>
  );
}
