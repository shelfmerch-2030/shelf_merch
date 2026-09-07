import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COUNTRIES } from "../types";
import type { ContactFormVm } from "../controllers/useContactFormController";
import { ImportContactsPanel } from "../ImportContactsPanel";

function FieldError({ message }: { message?: string }) {
  if (!message) return null;
  return (
    <div className="mut3" style={{ color: "var(--danger)", fontSize: 11, marginTop: 4 }}>
      {message}
    </div>
  );
}

export function ContactFormDialogView(vm: ContactFormVm) {
  return (
    <Dialog open={vm.open} onOpenChange={vm.onOpenChange}>
      <DialogContent className="sm-modal">
        <DialogHeader className="contact-dialog-header">
          <DialogTitle>
            {vm.mode === "edit"
              ? "Fix recipient information"
              : vm.tab === "csv"
                ? "Import contacts"
                : "Add contacts"}
          </DialogTitle>
          {vm.mode === "edit" && (
            <DialogDescription>
              Update this person's details so they can be added to orders. HRIS-synced fields will
              override manual entries.
            </DialogDescription>
          )}
        </DialogHeader>

        {vm.mode === "add" && vm.canImportContacts && (
          <div className="tabs" style={{ maxWidth: 280, margin: "4px 0 16px" }}>
            {(
              [
                ["manual", "Manually"],
                ["csv", "Upload file"],
              ] as const
            ).map(([key, label]) => (
              <button
                type="button"
                key={key}
                className={vm.tab === key ? "on" : ""}
                onClick={() => vm.onTab(key)}
              >
                {label}
              </button>
            ))}
          </div>
        )}

        {vm.mode === "add" && vm.tab === "csv" ? (
          <ImportContactsPanel onDone={vm.onImportDone} />
        ) : (
          <form className="contact-form" onSubmit={vm.onSubmit} noValidate>
            <div className="contact-form-row">
              <div className="field">
                <label className="lbl" htmlFor="ac-first">
                  First name
                </label>
                <input id="ac-first" className="inp" {...vm.register("firstName")} />
                <FieldError message={vm.errors.firstName?.message} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-last">
                  Last name
                </label>
                <input id="ac-last" className="inp" {...vm.register("lastName")} />
              </div>
            </div>
            <div className="contact-form-row">
              <div className="field">
                <label className="lbl" htmlFor="ac-email">
                  Email
                </label>
                <input id="ac-email" type="email" className="inp" {...vm.register("email")} />
                <FieldError message={vm.errors.email?.message} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-phone">
                  Phone
                </label>
                <input id="ac-phone" className="inp" {...vm.register("phone")} />
              </div>
            </div>
            <div className="contact-form-row">
              <div className="field">
                <label className="lbl" htmlFor="ac-role">
                  Role
                </label>
                {vm.canManageContactRoles ? (
                  <select id="ac-role" className="inp" {...vm.register("role")}>
                    {vm.roleOptions.map((r) => (
                      <option key={r} value={r}>
                        {r}
                      </option>
                    ))}
                  </select>
                ) : (
                  <>
                    <input type="hidden" {...vm.register("role")} />
                    <div className="inp" style={{ display: "flex", alignItems: "center" }} aria-readonly>
                      {vm.roleDisplay}
                    </div>
                  </>
                )}
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-dept">
                  Department
                </label>
                <input id="ac-dept" className="inp" {...vm.register("department")} />
              </div>
            </div>
            <div className="contact-form-row">
              <div className="field">
                <label className="lbl" htmlFor="ac-emp">
                  Employee Code
                </label>
                <input id="ac-emp" className="inp" {...vm.register("employeeCode")} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-country">
                  Country
                </label>
                <select id="ac-country" className="inp" {...vm.register("country")}>
                  {COUNTRIES.map((c) => (
                    <option key={c.value} value={c.value}>
                      {c.label}
                    </option>
                  ))}
                </select>
              </div>
            </div>
            <div className="field">
              <label className="lbl" htmlFor="ac-address">
                Address
              </label>
              <input id="ac-address" className="inp" {...vm.register("line1")} />
            </div>
            <div className="contact-form-row contact-form-row--3">
              <div className="field">
                <label className="lbl" htmlFor="ac-city">
                  City
                </label>
                <input id="ac-city" className="inp" {...vm.register("city")} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-state">
                  State
                </label>
                <input id="ac-state" className="inp" {...vm.register("state")} />
              </div>
              <div className="field contact-form-pin">
                <label className="lbl" htmlFor="ac-pin">
                  PIN Code
                </label>
                <input id="ac-pin" className="inp" {...vm.register("pincode")} />
              </div>
            </div>
            <div className="contact-form-footer">
              <button type="button" className="btn btn-ghost" onClick={vm.onCancel}>
                Cancel
              </button>
              <button type="submit" className="btn btn-brand" disabled={vm.busy}>
                {vm.busy ? "Saving…" : vm.mode === "edit" ? "Save" : "Add contacts"}
              </button>
            </div>
          </form>
        )}
      </DialogContent>
    </Dialog>
  );
}
