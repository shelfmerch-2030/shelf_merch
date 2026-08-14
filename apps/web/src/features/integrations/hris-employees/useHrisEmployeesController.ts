import { useMemo, useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  fetchMergeConnections,
  fetchMergeEmployees,
  type MergeConnectionPublic,
  type MergeHrisEmployeePublic,
} from "@/services/merge-api";

export const MERGE_EMPLOYEES_QUERY_KEY = ["integrations", "merge", "employees"] as const;
export const MERGE_CONNECTIONS_QUERY_KEY = ["integrations", "merge", "connections"] as const;

export type HrisEmployeesVm = {
  employees: MergeHrisEmployeePublic[];
  connections: MergeConnectionPublic[];
  loading: boolean;
  error: string | null;
  search: string;
  onSearch: (value: string) => void;
  providerFilter: string;
  onProviderFilter: (value: string) => void;
  providerOptions: string[];
};

export function useHrisEmployeesController(): HrisEmployeesVm {
  const [search, setSearch] = useState("");
  const [providerFilter, setProviderFilter] = useState("all");

  const connectionsQuery = useQuery({
    queryKey: MERGE_CONNECTIONS_QUERY_KEY,
    queryFn: fetchMergeConnections,
    staleTime: 30_000,
  });

  const employeesQuery = useQuery({
    queryKey: MERGE_EMPLOYEES_QUERY_KEY,
    queryFn: () => fetchMergeEmployees(),
    staleTime: 30_000,
  });

  const providerOptions = useMemo(() => {
    const set = new Set<string>();
    for (const e of employeesQuery.data ?? []) {
      if (e.provider) set.add(e.provider);
    }
    return Array.from(set).sort();
  }, [employeesQuery.data]);

  const employees = useMemo(() => {
    const q = search.trim().toLowerCase();
    return (employeesQuery.data ?? []).filter((e) => {
      if (providerFilter !== "all" && e.provider !== providerFilter) return false;
      if (!q) return true;
      const hay = [
        e.displayName,
        e.firstName,
        e.lastName,
        e.workEmail,
        e.jobTitle,
        e.employmentStatus,
        e.employmentType,
        e.departmentName,
        e.country,
        e.provider,
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return hay.includes(q);
    });
  }, [employeesQuery.data, search, providerFilter]);

  return {
    employees,
    connections: connectionsQuery.data ?? [],
    loading: employeesQuery.isLoading || connectionsQuery.isLoading,
    error:
      employeesQuery.error instanceof Error
        ? employeesQuery.error.message
        : employeesQuery.isError
          ? "Could not load HRIS employees"
          : null,
    search,
    onSearch: setSearch,
    providerFilter,
    onProviderFilter: setProviderFilter,
    providerOptions,
  };
}
