import { CollapsiblePanel } from "./CollapsiblePanel.jsx";
import { CreatorsEmailCard } from "./CreatorsEmailCard.jsx";
import { SmtpSettingsCard } from "./SmtpSettingsCard.jsx";

/** Email triggers: SMTP details and per-creator email tracking. */
export function EmailTriggersPage() {
  return (
    <div className="d-flex flex-column gap-3">
      <SmtpSettingsCard />
      <CollapsiblePanel
        id="email-triggers-creators"
        icon="groups"
        title="Creators"
        description="Greeting mail, profile completeness and session booked mails for every creator."
      >
        <CreatorsEmailCard />
      </CollapsiblePanel>
    </div>
  );
}
