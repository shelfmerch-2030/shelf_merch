import { useReducer, useState, type Dispatch } from "react";
import { useLocation, useSearchParams } from "react-router";
import { useWorkspace } from "@/hooks/useWorkspace";
import { orgForWallet, type WorkspaceSnapshot } from "@/services/workspace-api";
import {
  clearFundingSuccess,
  readFundingSuccess,
  wizardFromFundingSuccess,
} from "../fundingSuccess";
import { seedAllocateWizard, seedNewWizard, wizardReducer, type WizardAction } from "../reducer";
import type { OrgSnapshot, WizardState } from "../types";

export type WalletsScreen =
  | { kind: "loading" }
  | { kind: "error"; message: string }
  | { kind: "done"; account: string; state: WizardState; onGoToDashboard: () => void }
  | {
      kind: "wizard";
      account: string;
      state: WizardState;
      dispatch: Dispatch<WizardAction>;
      onExit: () => void;
      onFinished: () => void;
    }
  | { kind: "entityManager"; account: string; workspace: WorkspaceSnapshot }
  | {
      kind: "dashboard";
      account: string;
      org: OrgSnapshot;
      hasBudget: boolean;
      onSetup: () => void;
      onAllocate: (step?: number) => void;
      openTopupOnMount: boolean;
    };

/**
 * Controller for the wallets screen. Owns the org-wizard reducer + `inWizard`
 * state and resolves which screen to render (dashboard / wizard / done /
 * entity-manager) from the workspace snapshot, role, and URL params.
 */
export function useWalletsController(): WalletsScreen {
  const [searchParams] = useSearchParams();
  const location = useLocation();
  const walletId = searchParams.get("wallet") ?? undefined;
  const addFunds = searchParams.get("addFunds") ?? undefined;
  const { data: workspace, isLoading, isError, error } = useWorkspace();
  const [inWizard, setInWizard] = useState(
    () => (location.state as { startCreateWallet?: boolean } | null)?.startCreateWallet === true,
  );
  const [wizard, dispatch] = useReducer(wizardReducer, undefined, seedNewWizard);

  function dismissDoneScreen() {
    clearFundingSuccess();
    setInWizard(false);
  }

  if (isLoading && !workspace) {
    return { kind: "loading" };
  }
  if (isError || !workspace) {
    return {
      kind: "error",
      message: error instanceof Error ? error.message : "Could not load budget",
    };
  }

  const { account } = workspace;
  const org = orgForWallet(workspace, walletId);
  const role = workspace.userPatch.role;
  const hasBudget = workspace.wallets.length > 0;

  function startBudgetSetup() {
    if (hasBudget) return;
    clearFundingSuccess();
    dispatch(seedNewWizard());
    setInWizard(true);
  }

  function startAllocateFunds(step = 2) {
    dispatch(seedAllocateWizard(org, step));
    setInWizard(true);
  }

  const storedSuccess = readFundingSuccess();
  const doneState =
    wizard.done && wizard.flow === "wallet"
      ? wizard
      : storedSuccess
        ? wizardFromFundingSuccess(storedSuccess)
        : null;

  if (doneState) {
    return {
      kind: "done",
      account,
      state: doneState,
      onGoToDashboard: dismissDoneScreen,
    };
  }

  if (inWizard) {
    return {
      kind: "wizard",
      account,
      state: wizard,
      dispatch,
      onExit: () => setInWizard(false),
      onFinished: () => {
        /* wallet create — done screen renders via wizard.done / session snapshot */
      },
    };
  }

  if (role === "entity_manager") {
    return { kind: "entityManager", account, workspace };
  }

  return {
    kind: "dashboard",
    account,
    org,
    hasBudget,
    onSetup: startBudgetSetup,
    onAllocate: startAllocateFunds,
    openTopupOnMount: addFunds === "1",
  };
}
