import { redirect } from "next/navigation";

/** Profile moved into Settings. */
export default function ProfilePage() {
  redirect("/admin/settings");
}
