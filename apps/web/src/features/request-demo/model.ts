export type DemoLeadFormValues = {
  fullName: string;
  companyName: string;
  workEmail: string;
  mobileNumber: string;
  requirement: string;
};

export const requestDemoCapabilities = [
  "Branded company stores",
  "Employee onboarding kits",
  "On-demand and bulk swag",
  "Rewards and milestone gifting",
  "Department budgets and approvals",
  "Prospect and client gifting",
  "Pan-India production and fulfilment",
];

export const requestDemoRequirements = [
  "Company Swag Store",
  "Employee Onboarding Kits",
  "Rewards and Recognition",
  "Bulk Swag Orders",
  "Prospect and Client Gifting",
  "Multiple Requirements",
];

export const requestDemoNextSteps = [
  "Our team reviews your request",
  "A Shelf Merch specialist contacts you",
  "We understand your swag requirements",
  "We schedule a personalised platform demo",
];

const REQUEST_DEMO_WHATSAPP_PHONE = "917337221188";

export function getRequestDemoFirstName(fullName: string) {
  return fullName.trim().split(/\s+/)[0] || "there";
}

export function buildRequestDemoWhatsAppMessage(values?: Partial<DemoLeadFormValues>) {
  const lines = ["Hi Shelf Merch, I would like to discuss a corporate merch requirement."];
  const details = [
    values?.fullName ? `Full name: ${values.fullName}` : "",
    values?.companyName ? `Company: ${values.companyName}` : "",
    values?.workEmail ? `Work email: ${values.workEmail}` : "",
    values?.mobileNumber ? `Mobile: ${values.mobileNumber}` : "",
    values?.requirement ? `Requirement: ${values.requirement}` : "",
  ].filter(Boolean);

  if (details.length) {
    lines.push("", "My details:", ...details);
  }

  return lines.join("\n");
}

export function buildRequestDemoWhatsAppHref(message = buildRequestDemoWhatsAppMessage()) {
  return `https://wa.me/${REQUEST_DEMO_WHATSAPP_PHONE}?text=${encodeURIComponent(message)}`;
}
