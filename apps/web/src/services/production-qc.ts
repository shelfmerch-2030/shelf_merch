export const QC_FILTERS = [
  { value: "", label: "All QC statuses" },
  { value: "not_started", label: "QC not started" },
  { value: "pending", label: "Pending inspection" },
  { value: "rework", label: "Rework required" },
  { value: "failed", label: "QC failed / on hold" },
  { value: "passed", label: "QC passed" },
];

export const QC_CHECKS = [
  { key: "product", label: "Product, size, colour and personalization match the order" },
  { key: "artwork", label: "Artwork, placement and dimensions match the approved mockup" },
  { key: "workmanship", label: "Print / embroidery, alignment and finish are free of defects" },
  { key: "quantity", label: "All ordered quantities have been verified" },
  { key: "contents", label: "Kit contents and accessories are correct (or not applicable)" },
] as const;
export type QcCheckKey = (typeof QC_CHECKS)[number]["key"];
export type QcChecks = Record<QcCheckKey, boolean>;
export type QcInspectionInput = {
  passed: boolean;
  reason: string;
  notes: string;
  inspectedQuantity: number;
  failedQuantity: number;
  checks: QcChecks;
  photoUrls: string[];
};
export type QcInspection = QcInspectionInput & {
  _id: string;
  expectedQuantity: number;
  inspectorUserId: string;
  inspectorName?: string;
  at: string;
};
export function qcLabel(status: unknown): string {
  return QC_FILTERS.find((option) => option.value === status)?.label ?? "QC not started";
}
