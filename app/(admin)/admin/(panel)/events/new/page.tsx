import Link from "next/link";
import { guard } from "@/lib/admin/guard";
import { EventForm } from "../EventForm";

export const metadata = { title: "New event" };

export default async function NewEvent() {
  const user = await guard("events");
  if (user.role !== "ADMIN") return <p className="note warn">Only admins can create events.</p>;
  return (
    <>
      <Link className="btn btn-ghost btn-sm" href="/admin/events" style={{ justifySelf: "start" }}>← Events</Link>
      <div><p className="eyebrow">Events</p><h1 className="page" style={{ marginTop: 6 }}>New event</h1>
        <p className="dim small" style={{ marginTop: 6 }}>Save as a draft first if you&apos;re not ready to sell. Publishing puts it on events.nepthic.com straight away.</p></div>
      <EventForm />
    </>
  );
}
