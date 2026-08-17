import { useSalesController } from "./controllers/useSalesController";
import { SalesView } from "./views/SalesView";

export function SalesPage() {
  const vm = useSalesController();
  return <SalesView {...vm} />;
}
