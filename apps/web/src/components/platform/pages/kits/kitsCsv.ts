import type { fetchPlatformKits } from "@/services/platform-api";
import { downloadCsv, toCsv } from "@/lib/csv";

type KitListItem = Awaited<ReturnType<typeof fetchPlatformKits>>[number];

export function kitsCsv(kits: KitListItem[]) {
  return toCsv([
    ["Kit ID", "Kit", "Status", "Approx value (INR)", "Items"],
    ...kits.map((kit) => [
      kit._id,
      kit.name,
      kit.status,
      kit.approxValueInr,
      kit.items?.length ?? 0,
    ]),
  ]);
}

export function downloadKitsCsv(kits: KitListItem[]) {
  downloadCsv(kitsCsv(kits), `shelfmerch-kits-${new Date().toISOString().slice(0, 10)}.csv`);
}
