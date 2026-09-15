import { type ReactNode } from "react";
import {
  DataTable,
  PlatformError,
  PlatformLoading,
  PlatformPageHeader,
  StatusTag,
} from "../../../platform-ui";
import type { TeamVm } from "../controllers/useTeamController";
import { isBuiltInPlatformEmail, roleLabel, type TeamRow } from "../model";
import { TeamInviteModal } from "./TeamInviteModal";
import { TeamManageModal } from "./TeamManageModal";

function AllowlistBadge() {
  return (
    <span className="tag tag-live">
      <span className="dot" />
      Whitelisted
    </span>
  );
}

/** Internal ShelfMerch team and roles. */
export function TeamView({
  data,
  error,
  loading,
  canWrite,
  managing,
  inviting,
  onManage,
  onCloseManage,
  onOpenInvite,
  onCloseInvite,
  onReload,
  onInviteDone,
}: TeamVm) {
  const columns: {
    key: string;
    label: string;
    render?: (row: Record<string, unknown>) => ReactNode;
  }[] = [
    { key: "name", label: "Name" },
    {
      key: "email",
      label: "Email",
      render: (r) => {
        const email = String(r.email ?? "");
        const whitelisted =
          Boolean(r.allowlisted) || Boolean(r.protected) || isBuiltInPlatformEmail(email);
        return (
          <span className="row" style={{ gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>{email}</span>
            {whitelisted ? <AllowlistBadge /> : null}
          </span>
        );
      },
    },
    { key: "role", label: "Role", render: (r) => roleLabel(String(r.role)) },
    { key: "status", label: "Status", render: (r) => <StatusTag status={String(r.status)} /> },
  ];

  if (canWrite) {
    columns.push({
      key: "manage",
      label: "",
      render: (r) => (
        <button
          type="button"
          className="btn btn-ghost btn-sm"
          onClick={() => onManage(r as unknown as TeamRow)}
        >
          Manage
        </button>
      ),
    });
  }

  return (
    <>
      <PlatformPageHeader
        title="Platform Users"
        subtitle="Internal ShelfMerch team and roles."
        actions={
          canWrite ? (
            <button type="button" className="btn btn-brand btn-sm" onClick={onOpenInvite}>
              + Invite
            </button>
          ) : null
        }
      />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {data && (
        <DataTable
          empty="No platform users."
          rows={data as unknown as Record<string, unknown>[]}
          columns={columns}
        />
      )}
      {inviting && <TeamInviteModal onClose={onCloseInvite} onDone={onInviteDone} />}
      {managing && (
        <TeamManageModal row={managing} onClose={onCloseManage} onChanged={onReload} />
      )}
    </>
  );
}
