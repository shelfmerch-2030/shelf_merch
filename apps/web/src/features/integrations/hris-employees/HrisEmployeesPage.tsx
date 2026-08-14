import { useHrisEmployeesController } from "./useHrisEmployeesController";
import { HrisEmployeesView } from "./HrisEmployeesView";

/** Tenant HRIS people directory; sync also mirrors into Workspace Contacts. */
export function HrisEmployeesPage() {
  const vm = useHrisEmployeesController();
  return <HrisEmployeesView {...vm} />;
}
