export const FULFILLMENT_STEPS = [
  "Review",
  "Production",
  "QC & packing",
  "Dispatch",
  "Delivery",
] as const;

type WorkflowInput = {
  status: string;
  taskStatus: string;
  hasShipment: boolean;
  packingComplete: boolean;
  canStartProduction: boolean;
  qcStatus: string;
};

export type FulfillmentStep = {
  index: number | null;
  title: string;
  description: string;
  action: "advance" | "production" | "task" | "replacement" | "none";
  nextStatus?: string;
  buttonLabel?: string;
  complete?: boolean;
};

/** Present one useful next step while the API remains authoritative for transitions. */
export function fulfillmentStep(input: WorkflowInput): FulfillmentStep {
  const { status } = input;
  if (status === "created")
    return {
      index: 0,
      title: "Review this order",
      description: "Check the items, personalization and delivery address before approving.",
      action: "advance",
      nextStatus: "approved",
      buttonLabel: "Approve order",
    };
  if (input.canStartProduction)
    return {
      index: 1,
      title: "Start production",
      description:
        "Assign a vendor or assignee if needed, then create the production task. Mockup review is optional.",
      action: "production",
    };
  if (["approved", "mockup_pending", "mockup_approved", "in_production"].includes(status))
    return {
      index: 1,
      title: input.taskStatus === "issue" ? "Production needs attention" : "Production in progress",
      description: "Open the production task to update progress and send finished products for QC.",
      action: "task",
    };
  if (status === "qc_pending" || (status === "packed" && !input.packingComplete))
    return {
      index: 2,
      title:
        input.qcStatus === "rework" || input.qcStatus === "failed"
          ? "Rework required"
          : input.qcStatus === "passed"
            ? "Complete packing"
            : "Complete the quality check",
      description:
        "Record the physical inspection in Production. After QC passes, complete packing to make this order ready to ship.",
      action: "task",
    };
  if (status === "packed" && !input.hasShipment)
    return {
      index: 3,
      title: "Book the shipment",
      description:
        "QC and packing are complete. Request courier pickup from the production task, or add an AWB in Shipments.",
      action: "task",
    };
  if (status === "packed")
    return {
      index: 3,
      title: "Ready to dispatch",
      description: "Once the package has been handed to the courier, mark this order dispatched.",
      action: "advance",
      nextStatus: "shipped",
      buttonLabel: "Mark dispatched",
    };
  if (status === "shipped")
    return {
      index: 4,
      title: "Delivery in progress",
      description:
        "Follow the courier tracking. Mark delivered only after delivery has been confirmed.",
      action: "advance",
      nextStatus: "delivered",
      buttonLabel: "Mark delivered",
    };
  if (status === "delivered")
    return {
      index: 4,
      title: "Order delivered",
      description:
        "Fulfillment is complete. Notes and replacement options are available below if needed.",
      action: "none",
      complete: true,
    };
  if (status === "issue_raised")
    return {
      index: null,
      title: "Resolve the order issue",
      description:
        "Review the issue and add an internal note. Create a replacement if the items need to be made again, or cancel through Manual status change.",
      action: "replacement",
    };
  if (status === "replacement_processing")
    return {
      index: null,
      title: "Replacement in progress",
      description:
        "Continue fulfillment on the replacement order. This original order remains linked to it.",
      action: "none",
    };
  if (status === "cancelled")
    return {
      index: null,
      title: "Order cancelled",
      description:
        "This order will not continue through production or shipping. You can still add an internal note below.",
      action: "none",
    };
  return {
    index: null,
    title: "Review fulfillment",
    description: "Review the order and use the available actions below.",
    action: "none",
  };
}
