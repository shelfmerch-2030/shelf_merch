import { PlatformError, PlatformLoading, PlatformPageHeader } from "../../../platform-ui";
import { DemoLoginPasswordCard } from "./DemoLoginPasswordCard";
import type { SettingsVm } from "../controllers/useSettingsController";
import { EmailAllowlistCard } from "./EmailAllowlistCard";
import { SettingEditModal } from "./SettingEditModal";

/** Platform-wide configuration. */
export function SettingsView({
  error,
  loading,
  canWrite,
  editing,
  onEdit,
  onCloseEdit,
  onSettingSaved,
  generalSettings,
  emailAllowlist,
  demoLoginPassword,
}: SettingsVm) {
  return (
    <>
      <PlatformPageHeader title="Settings" subtitle="Platform-wide configuration." />
      {loading && <PlatformLoading />}
      {error && <PlatformError message={error} />}
      {generalSettings && (
        <>
          <EmailAllowlistCard {...emailAllowlist} />
          <DemoLoginPasswordCard {...demoLoginPassword} />
          <div className="card" style={{ padding: 16 }}>
            <table className="tbl">
              <thead>
                <tr>
                  <th>Key</th>
                  <th>Value</th>
                  {canWrite && <th></th>}
                </tr>
              </thead>
              <tbody>
                {Object.entries(generalSettings).map(([key, value]) => (
                  <tr key={key}>
                    <td>
                      <code>{key}</code>
                    </td>
                    <td>
                      <code>{JSON.stringify(value)}</code>
                    </td>
                    {canWrite && (
                      <td style={{ textAlign: "right" }}>
                        <button
                          type="button"
                          className="btn btn-ghost btn-sm"
                          onClick={() => onEdit(key, value)}
                        >
                          Edit
                        </button>
                      </td>
                    )}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </>
      )}
      {editing && (
        <SettingEditModal
          settingKey={editing.key}
          initial={editing.value}
          onClose={onCloseEdit}
          onDone={onSettingSaved}
        />
      )}
    </>
  );
}
