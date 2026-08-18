import { useQuery } from "@tanstack/react-query";

export type CurrentEmployee = {
  employeeId: number;
  username: string;
  name: string;
  role: "ADMIN" | "MANAGER" | "EMPLEADO" | "EMPLEADO_BASICO";
};

async function fetchCurrentEmployee(): Promise<CurrentEmployee> {
  const res = await fetch("/api/auth/me");
  if (!res.ok) throw new Error("Not authenticated");
  return res.json();
}

export function useCurrentEmployee() {
  return useQuery<CurrentEmployee>({
    queryKey: ["currentEmployee"],
    queryFn: fetchCurrentEmployee,
    staleTime: Infinity,
    retry: false,
  });
}
