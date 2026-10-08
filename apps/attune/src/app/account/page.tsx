import type { Metadata } from "next";
import { AccountView } from "@/components/account-view";

export const metadata: Metadata = { title: "Account" };

/** Protected by `src/proxy.ts`: signed-out visitors are sent to /login?next=/account. */
export default function AccountPage() {
  return <AccountView />;
}
