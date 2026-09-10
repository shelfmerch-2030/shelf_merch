import type { ChangeEvent, ChangeEventHandler } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { COUNTRIES, sanitizeContactField, type ContactFieldKind } from "../types";
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

function withSanitize(
  onChange: ChangeEventHandler<HTMLInputElement>,
  kind: ContactFieldKind,
): ChangeEventHandler<HTMLInputElement> {
  return (e: ChangeEvent<HTMLInputElement>) => {
    e.target.value = sanitizeContactField(kind, e.target.value);
    onChange(e);
  };
}

export function ContactFormDialogView(vm: ContactFormVm) {
  const firstName = vm.register("firstName");
  const lastName = vm.register("lastName");
  const email = vm.register("email");
  const phone = vm.register("phone");
  const department = vm.register("department");
  const employeeCode = vm.register("employeeCode");
  const line1 = vm.register("line1");
  const city = vm.register("city");
  const state = vm.register("state");
  const pincode = vm.register("pincode");

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
                <input
                  id="ac-first"
                  className="inp"
                  {...firstName}
                  onChange={withSanitize(firstName.onChange, "personName")}
                  aria-invalid={Boolean(vm.errors.firstName)}
                />
                <FieldError message={vm.errors.firstName?.message} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-last">
                  Last name
                </label>
                <input
                  id="ac-last"
                  className="inp"
                  {...lastName}
                  onChange={withSanitize(lastName.onChange, "personName")}
                  aria-invalid={Boolean(vm.errors.lastName)}
                />
                <FieldError message={vm.errors.lastName?.message} />
              </div>
            </div>
            <div className="contact-form-row">
              <div className="field">
                <label className="lbl" htmlFor="ac-email">
                  Email
                </label>
                <input
                  id="ac-email"
                  type="email"
                  className="inp"
                  {...email}
                  onChange={withSanitize(email.onChange, "email")}
                  aria-invalid={Boolean(vm.errors.email)}
                />
                <FieldError message={vm.errors.email?.message} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-phone">
                  Phone
                </label>
                <input
                  id="ac-phone"
                  className="inp"
                  inputMode="numeric"
                  maxLength={10}
                  placeholder="10-digit mobile"
                  {...phone}
                  onChange={withSanitize(phone.onChange, "phone")}
                  aria-invalid={Boolean(vm.errors.phone)}
                />
                <FieldError message={vm.errors.phone?.message} />
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
                <input id="ac-dept" className="inp" {...department} />
              </div>
            </div>
            <div className="contact-form-row">
              <div className="field">
                <label className="lbl" htmlFor="ac-emp">
                  Employee Code
                </label>
                <input id="ac-emp" className="inp" {...employeeCode} />
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
              <input id="ac-address" className="inp" {...line1} />
            </div>
            <div className="contact-form-row contact-form-row--3">
              <div className="field">
                <label className="lbl" htmlFor="ac-city">
                  City
                </label>
                <input
                  id="ac-city"
                  className="inp"
                  {...city}
                  onChange={withSanitize(city.onChange, "city")}
                  aria-invalid={Boolean(vm.errors.city)}
                />
                <FieldError message={vm.errors.city?.message} />
              </div>
              <div className="field">
                <label className="lbl" htmlFor="ac-state">
                  State
                </label>
                <input
                  id="ac-state"
                  className="inp"
                  {...state}
                  onChange={withSanitize(state.onChange, "state")}
                  aria-invalid={Boolean(vm.errors.state)}
                />
                <FieldError message={vm.errors.state?.message} />
              </div>
              <div className="field contact-form-pin">
                <label className="lbl" htmlFor="ac-pin">
                  PIN Code
                </label>
                <input
                  id="ac-pin"
                  className="inp"
                  inputMode="numeric"
                  maxLength={10}
                  {...pincode}
                  onChange={withSanitize(pincode.onChange, "postal")}
                  aria-invalid={Boolean(vm.errors.pincode)}
                />
                <FieldError message={vm.errors.pincode?.message} />
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
