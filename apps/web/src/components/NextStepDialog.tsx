import { useEffect, useRef } from "react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { firePartyBomb } from "@/lib/partyBomb";

/** Guided success modal — same visual language as ShopWelcomeDialog. */
export function NextStepDialog({
  open,
  title,
  description,
  detail,
  primaryLabel,
  secondaryLabel = "Do this later",
  kicker = "Congratulations",
  celebrate = true,
  onPrimary,
  onSecondary,
}: {
  open: boolean;
  title: string;
  description: string;
  detail?: string;
  primaryLabel: string;
  secondaryLabel?: string;
  kicker?: string;
  celebrate?: boolean;
  onPrimary: () => void;
  onSecondary: () => void;
}) {
  const firedRef = useRef(false);

  useEffect(() => {
    if (!open || !celebrate) {
      firedRef.current = false;
      return;
    }
    if (firedRef.current) return;
    firedRef.current = true;
    firePartyBomb();
  }, [open, celebrate]);

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onSecondary();
      }}
    >
      <DialogContent
        className="sm-shop-welcome"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">{title}</DialogTitle>
        <div className="sm-shop-welcome-body">
          <p className="sm-shop-welcome-kicker">{kicker}</p>
          <h2 className="sm-shop-welcome-heading">{title}</h2>
          <p className="sm-shop-welcome-copy muted">
            {description}
            {detail ? (
              <>
                <br />
                <br />
                {detail}
              </>
            ) : null}
          </p>
          <div className="sm-shop-welcome-actions">
            <button type="button" className="btn btn-ghost" onClick={onSecondary}>
              {secondaryLabel}
            </button>
            <button type="button" className="btn btn-dark" onClick={onPrimary}>
              {primaryLabel}
            </button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}