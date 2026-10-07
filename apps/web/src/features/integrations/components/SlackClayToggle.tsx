type SlackClayToggleProps = {
  checked: boolean;
  disabled?: boolean;
  label: string;
  onCheckedChange: (checked: boolean) => void;
};

/** Claymorphic ON/OFF switch used on Slack notification prefs. */
export function SlackClayToggle({
  checked,
  disabled,
  label,
  onCheckedChange,
}: SlackClayToggleProps) {
  return (
    <button
      type="button"
      className="bonus-integ-slack-clay-toggle"
      role="switch"
      aria-checked={checked}
      aria-label={label}
      disabled={disabled}
      onClick={() => {
        if (disabled) return;
        onCheckedChange(!checked);
      }}
    >
      <span className="bonus-integ-slack-clay-toggle__track" aria-hidden="true" />
      <span className="bonus-integ-slack-clay-toggle__text bonus-integ-slack-clay-toggle__text--on" aria-hidden="true">
        ON
      </span>
      <span className="bonus-integ-slack-clay-toggle__text bonus-integ-slack-clay-toggle__text--off" aria-hidden="true">
        OFF
      </span>
      <span className="bonus-integ-slack-clay-toggle__knob" aria-hidden="true" />
    </button>
  );
}
