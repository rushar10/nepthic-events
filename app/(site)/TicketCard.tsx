import Link from "next/link";
import { qrDataUrl } from "@/core/tickets";
import { dateLong, time } from "@/ui/format";
import { Status } from "@/ui/Status";

type Props = {
  code: string; status: string; holderName: string; checkedInAt: Date | null;
  typeName: string; event: { name: string; startsAt: Date; venue: string };
  link?: boolean;
};

export async function TicketCard({ code, status, holderName, checkedInAt, typeName, event, link = true }: Props) {
  const dead = status === "REFUNDED" || status === "VOID";
  const qr = dead ? null : await qrDataUrl(code, 240);
  const body = (
    <>
      <div className={`qr${dead ? " void" : ""}`}>{qr ? <img src={qr} alt={`QR code for ticket ${code}`} /> : null}</div>
      <div className="stack-sm" style={{ gap: 6, minWidth: 0 }}>
        <div className="spread"><b>{event.name}</b><Status value={status} /></div>
        <span className="small dim">{dateLong(event.startsAt)} · {time(event.startsAt)} · {event.venue}</span>
        <span className="small">{typeName} · {holderName}</span>
        <span className="code">{code}</span>
        {status === "USED" && checkedInAt && <span className="small dim">Checked in at {time(checkedInAt)}</span>}
        {status === "REFUND_REQUESTED" && <span className="small dim">Refund requested. Still valid until we decide.</span>}
      </div>
    </>
  );
  return link ? <Link href={`/tickets/${code}`} className="ticket prox">{body}</Link> : <div className="ticket prox">{body}</div>;
}
