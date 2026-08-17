import { useDemoLeads } from "../model";

export type SalesVm = {
  leads: ReturnType<typeof useDemoLeads>;
};

/** Controller for marketing sales leads captured from the public demo form. */
export function useSalesController(): SalesVm {
  const leads = useDemoLeads();

  return { leads };
}
