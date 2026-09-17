import { useState } from "react";
import { getStoredUser } from "@/services/auth-store";
import { canAccessArea } from "@/services/platform-access";
import { usePlatformSettings } from "../model";
import { useDemoLoginPasswordController, type DemoLoginPasswordVm } from "./useDemoLoginPasswordController";
import { useEmailAllowlistController, type EmailAllowlistVm } from "./useEmailAllowlistController";

const HIDDEN_SETTING_KEYS = new Set(["auth.emailAllowlist"]);

export type SettingsVm = ReturnType<typeof usePlatformSettings> & {
  canWrite: boolean;
  editing: { key: string; value: unknown } | null;
  onEdit: (key: string, value: unknown) => void;
  onCloseEdit: () => void;
  onSettingSaved: () => void;
  generalSettings: Record<string, unknown> | null;
  emailAllowlist: EmailAllowlistVm;
  demoLoginPassword: DemoLoginPasswordVm;
};

/** Controller for the platform settings page. */
export function useSettingsController(): SettingsVm {
  const [reloadKey, setReloadKey] = useState(0);
  const [editing, setEditing] = useState<{ key: string; value: unknown } | null>(null);
  const load = usePlatformSettings(reloadKey);
  const canWrite = canAccessArea(getStoredUser()?.role, "settings", "write");

  const onReload = () => setReloadKey((k) => k + 1);

  const emailAllowlist = useEmailAllowlistController(
    load.data?.["auth.emailAllowlist"],
    canWrite,
    onReload,
  );
  const demoLoginPassword = useDemoLoginPasswordController(canWrite);

  const generalSettings = load.data
    ? Object.fromEntries(Object.entries(load.data).filter(([key]) => !HIDDEN_SETTING_KEYS.has(key)))
    : null;

  return {
    ...load,
    canWrite,
    editing,
    onEdit: (key, value) => setEditing({ key, value }),
    onCloseEdit: () => setEditing(null),
    onSettingSaved: () => {
      setEditing(null);
      onReload();
    },
    generalSettings,
    emailAllowlist,
    demoLoginPassword,
  };
}
