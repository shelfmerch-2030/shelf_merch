import mongoose from 'mongoose';

export const DEMO_LEAD_REQUIREMENTS = [
  'Company Swag Store',
  'Employee Onboarding Kits',
  'Rewards and Recognition',
  'Bulk Swag Orders',
  'Prospect and Client Gifting',
  'Multiple Requirements',
];

export const DEMO_LEAD_STATUSES = ['new', 'contacted', 'qualified', 'closed'];

const demoLeadSchema = new mongoose.Schema(
  {
    fullName: { type: String, required: true, trim: true },
    companyName: { type: String, required: true, trim: true },
    workEmail: { type: String, required: true, lowercase: true, trim: true },
    mobileNumber: { type: String, required: true, trim: true },
    requirement: { type: String, enum: DEMO_LEAD_REQUIREMENTS, default: null },
    status: {
      type: String,
      enum: DEMO_LEAD_STATUSES,
      default: 'new',
      index: true,
    },
    source: { type: String, default: 'request-demo-page' },
    confirmationEmailSentAt: { type: Date, default: null },
  },
  { timestamps: true },
);

demoLeadSchema.index({ workEmail: 1, createdAt: -1 });
demoLeadSchema.index({ companyName: 1, createdAt: -1 });

export const DemoLead = mongoose.model('DemoLead', demoLeadSchema);
