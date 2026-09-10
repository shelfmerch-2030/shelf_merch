import { useState } from "react";
import { toast } from "sonner";
import { ApiError } from "@/services/api";
import { getStoredUser } from "@/services/auth-store";
import { canAccessArea } from "@/services/platform-access";
import {
  inviteDemoLeadSignup,
  inviteSignupByEmail,
  useDemoLeads,
  type DemoLeadRow,
} from "../model";

export type SalesVm = {
  leads: ReturnType<typeof useDemoLeads>;
  canWrite: boolean;
  invitingLeadId: string | null;
  draftEmail: string;
  draftName: string;
  draftCompany: string;
  draftBusy: boolean;
  draftErr: string;
  onDraftEmail: (value: string) => void;
  onDraftName: (value: string) => void;
  onDraftCompany: (value: string) => void;
  onInviteLead: (lead: DemoLeadRow) => void;
  onInviteDraft: () => void;
};

/** Controller for marketing sales leads + signup invite actions. */
export function useSalesController(): SalesVm {
  const [reloadKey, setReloadKey] = useState(0);
  const leads = useDemoLeads(reloadKey);
  const canWrite = canAccessArea(getStoredUser()?.role, "sales", "write");
  const [invitingLeadId, setInvitingLeadId] = useState<string | null>(null);
  const [draftEmail, setDraftEmail] = useState("");
  const [draftName, setDraftName] = useState("");
  const [draftCompany, setDraftCompany] = useState("");
  const [draftBusy, setDraftBusy] = useState(false);
  const [draftErr, setDraftErr] = useState("");

  async function onInviteLead(lead: DemoLeadRow) {
    if (!canWrite || invitingLeadId) return;
    setInvitingLeadId(lead._id);
    try {
      const result = await inviteDemoLeadSignup(lead._id);
      setReloadKey((k) => k + 1);
      toast.success(`Signup invite sent to ${result.email}`);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not send signup invite";
      toast.error(message);
    } finally {
      setInvitingLeadId(null);
    }
  }

  async function onInviteDraft() {
    if (!canWrite || draftBusy) return;
    const email = draftEmail.trim().toLowerCase();
    if (!email) {
      setDraftErr("Enter an email address");
      return;
    }
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      setDraftErr("Enter a valid email address");
      return;
    }
    setDraftBusy(true);
    setDraftErr("");
    try {
      const result = await inviteSignupByEmail({
        email,
        fullName: draftName.trim() || undefined,
        companyName: draftCompany.trim() || undefined,
      });
      setDraftEmail("");
      setDraftName("");
      setDraftCompany("");
      setReloadKey((k) => k + 1);
      toast.success(`Allowlisted and invited ${result.email}`);
    } catch (e) {
      const message =
        e instanceof ApiError
          ? e.message
          : e instanceof Error
            ? e.message
            : "Could not send signup invite";
      setDraftErr(message);
      toast.error(message);
    } finally {
      setDraftBusy(false);
    }
  }

  return {
    leads,
    canWrite,
    invitingLeadId,
    draftEmail,
    draftName,
    draftCompany,
    draftBusy,
    draftErr,
    onDraftEmail: setDraftEmail,
    onDraftName: setDraftName,
    onDraftCompany: setDraftCompany,
    onInviteLead,
    onInviteDraft,
  };
}
