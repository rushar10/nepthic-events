import { BottomNav } from "@/ui/Mobile";
import { railNav } from "@/lib/admin/nav";
import { logout } from "@/lib/admin/actions/auth";
import { Rail } from "@/components/admin/Rail";

export default async function PanelLayout({ children }: { children: React.ReactNode }) {
  const { main, admin, bottom } = await railNav();
  return (
    <div className="adm-shell">
      <Rail main={main} admin={admin} logout={logout} />
      <div className="adm-page">{children}</div>
      <BottomNav label="Admin" items={bottom} />
    </div>
  );
}
