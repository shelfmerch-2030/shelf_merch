import { useNavigate } from "react-router";
import {
  ChevronRight,
  Gift,
  Send,
  Store,
  Users,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import welcomeArt from "../../../assets/onboarding-welcome.png";

const STEPS: {
  title: string;
  body: string;
  icon: LucideIcon;
  tone: "green" | "blue" | "orange" | "violet" | "pink";
}[] = [
  {
    title: "Create your wallet",
    body: "Set up your payment wallet to manage budgets and transactions.",
    icon: Wallet,
    tone: "green",
  },
  {
    title: "Set up your store",
    body: "Create your branded swag store with your logo, colors and domain.",
    icon: Store,
    tone: "blue",
  },
  {
    title: "Choose and design swag",
    body: "Explore products and create your custom swag with your branding.",
    icon: Gift,
    tone: "orange",
  },
  {
    title: "Add your contacts",
    body: "Upload or add your recipients manually.",
    icon: Users,
    tone: "violet",
  },
  {
    title: "Create your first campaign",
    body: "Send swag or points to your team, clients or event attendees.",
    icon: Send,
    tone: "pink",
  },
];

export function NewUserWelcomeDialog({
  open,
  onClose,
}: {
  open: boolean;
  onClose: () => void;
}) {
  const navigate = useNavigate();

  function startWalletSetup() {
    onClose();
    navigate("/app/wallets", { state: { startCreateWallet: true } });
  }

  return (
    <Dialog
      open={open}
      onOpenChange={(next) => {
        if (!next) onClose();
      }}
    >
      <DialogContent
        className="sm-new-user-welcome"
        onPointerDownOutside={(e) => e.preventDefault()}
        onInteractOutside={(e) => e.preventDefault()}
      >
        <DialogTitle className="sr-only">Welcome aboard</DialogTitle>
        <div className="sm-new-user-welcome__layout">
          <aside className="sm-new-user-welcome__visual" aria-hidden="true">
            <img src={welcomeArt} alt="" className="sm-new-user-welcome__visual-img" />
          </aside>

          <div className="sm-new-user-welcome__panel">
            <div className="sm-new-user-welcome__intro">
              <h2>Welcome aboard! 👋</h2>
              <p>Let&apos;s set up your workspace so you can start sending amazing swag in minutes.</p>
            </div>

            <ol className="sm-new-user-welcome__steps">
              {STEPS.map((step, index) => {
                const Icon = step.icon;
                const active = index === 0;
                return (
                  <li
                    key={step.title}
                    className={`sm-new-user-welcome__step${active ? " is-active" : ""}`}
                  >
                    <span className="sm-new-user-welcome__num" aria-hidden="true">
                      {index + 1}
                    </span>
                    <div className="sm-new-user-welcome__card">
                      <span
                        className={`sm-new-user-welcome__icon sm-new-user-welcome__icon--${step.tone}`}
                        aria-hidden="true"
                      >
                        <Icon size={18} strokeWidth={2.1} />
                      </span>
                      <span className="sm-new-user-welcome__text">
                        <strong>{step.title}</strong>
                        <small>{step.body}</small>
                      </span>
                      <ChevronRight size={16} className="sm-new-user-welcome__chevron" aria-hidden="true" />
                    </div>
                  </li>
                );
              })}
            </ol>

            <div className="sm-new-user-welcome__footer">
              <button type="button" className="sm-new-user-welcome__cta" onClick={startWalletSetup}>
                Let&apos;s get started <span aria-hidden="true">→</span>
              </button>
              <p className="sm-new-user-welcome__eta">Approx 12min</p>
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
