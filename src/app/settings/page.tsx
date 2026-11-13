import { DisconnectButton } from "@/shared/wallet";

import { PlaceholderPage } from "../_shell/placeholder-page";

export const metadata = { title: "Settings · The Cut" };

export default function SettingsPage() {
  return (
    <PlaceholderPage title="Settings" about="Your account, notifications, test mode and the four risks to know before you save.">
      <DisconnectButton />
    </PlaceholderPage>
  );
}
