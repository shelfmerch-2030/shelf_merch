import { useRequestSampleController } from "../controllers/useRequestSampleController";
import { RequestSampleView } from "../views/RequestSampleView";

export function RequestSampleWizard() {
  const vm = useRequestSampleController();
  return <RequestSampleView {...vm} />;
}
