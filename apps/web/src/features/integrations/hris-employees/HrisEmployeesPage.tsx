import { useHrisEmployeesController } from "./useHrisEmployeesController";
import { HrisEmployeesView } from "./HrisEmployeesView";

/** Tenant HRIS people directory backed by MergeHrisEmployee (not Contacts). */
export function HrisEmployeesPage() {
  const vm = useHrisEmployeesController();
  return <HrisEmployeesView {...vm} />;
}
