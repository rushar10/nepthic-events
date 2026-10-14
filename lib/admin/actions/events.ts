"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { and, db, eq, events, ne, payments, refundRequests, ticketTypes, tickets } from "@/db";
import { saveImages } from "@/core/uploads";
import { refundPayment } from "@/core/payments";
import { releaseSeats } from "@/core/tickets";
import { emails } from "@/core/email";
import { audit } from "@/core/audit";
import { cents, int, str, type FormState } from "@/core/forms";
import { refundNo } from "@/ui/format";
import { requireAdmin } from "@/lib/admin/guard";
import { fromLocalInput, run } from "@/lib/admin/run";

const slugify = (s: string) => s.toLowerCase().normalize("NFKD").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "").slice(0, 60);

export async function saveEvent(_: FormState, fd: FormData): Promise<FormState> {
  let savedId = "";
  const result = await run(async () => {
    const admin = await requireAdmin();
    const id = str(fd, "id");
    const name = str(fd, "name");
    const startsRaw = str(fd, "startsAt");
    if (name.length < 3) return { error: "Give the event a name." };
    if (!startsRaw) return { error: "Set the date and time." };
    const slug = slugify(str(fd, "slug") || name);
    const clash = await db.query.events.findFirst({ where: and(eq(events.slug, slug), id ? ne(events.id, id) : undefined) });
    if (clash) return { error: `Another event already uses the link /e/${slug}. Change the link.` };
    const status = (["DRAFT", "PUBLISHED", "CANCELLED"] as const).find((s) => s === str(fd, "status")) ?? "DRAFT";
    const values = {
      name, slug, status,
      description: str(fd, "description"),
      venue: str(fd, "venue"),
      address: str(fd, "address"),
      city: str(fd, "city"),
      startsAt: fromLocalInput(startsRaw),
      ageRestriction: str(fd, "ageRestriction") || "18+",
      hue: Math.min(359, Math.max(0, int(fd, "hue"))),
    };
    if (!values.venue || !values.city) return { error: "Add the venue and city." };

    const cover = await saveImages([fd.get("cover") as File], admin.id, { max: 1, isPublic: true });
    const gallery = await saveImages(fd.getAll("gallery") as File[], admin.id, { max: 24, isPublic: true });

    if (id) {
      const existing = await db.query.events.findFirst({ where: eq(events.id, id) });
      if (!existing) return { error: "Event not found." };
      await db.update(events).set({
        ...values,
        coverUploadId: cover[0] ?? existing.coverUploadId,
        galleryIds: [...existing.galleryIds, ...gallery],
      }).where(eq(events.id, id));
      savedId = id;
      await audit(admin.id, "event.updated", "Event", id);
    } else {
      const [e] = await db.insert(events).values({ ...values, coverUploadId: cover[0] ?? null, galleryIds: gallery }).returning();
      const types = [0, 1, 2, 3]
        .map((i) => ({ name: str(fd, `type_name_${i}`), priceCents: cents(fd, `type_price_${i}`), capacity: int(fd, `type_cap_${i}`), sortOrder: i }))
        .filter((t) => t.name && t.capacity > 0);
      if (types.length) await db.insert(ticketTypes).values(types.map((t) => ({ ...t, eventId: e.id })));
      savedId = e.id;
      await audit(admin.id, "event.created", "Event", e.id);
    }
    revalidatePath("/admin/events");
    return { ok: "Saved." };
  });
  if (result?.ok && !str(fd, "id")) redirect(`/admin/events/${savedId}?created=1`);
  return result;
}

export async function saveTicketType(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAdmin();
    const id = str(fd, "typeId");
    const name = str(fd, "name");
    const priceCents = cents(fd, "price");
    const capacity = int(fd, "capacity");
    if (!name) return { error: "Name the ticket type." };
    if (id) {
      const t = await db.query.ticketTypes.findFirst({ where: eq(ticketTypes.id, id) });
      if (!t) return { error: "Ticket type not found." };
      if (capacity < t.sold) return { error: `${t.sold} are already sold or held. Capacity can't go below that.` };
      await db.update(ticketTypes).set({ name, priceCents, capacity }).where(eq(ticketTypes.id, id));
    } else {
      if (capacity < 1) return { error: "Set a capacity." };
      await db.insert(ticketTypes).values({ eventId: str(fd, "eventId"), name, priceCents, capacity, sortOrder: int(fd, "sortOrder") });
    }
    await audit(admin.id, "ticket_type.saved", "Event", str(fd, "eventId"), { name, priceCents, capacity });
    revalidatePath(`/admin/events/${str(fd, "eventId")}`);
    return { ok: `${name} saved.` };
  });
}

export async function removeGalleryImage(fd: FormData) {
  const admin = await requireAdmin();
  const id = str(fd, "eventId");
  const e = await db.query.events.findFirst({ where: eq(events.id, id) });
  if (!e) return;
  await db.update(events).set({ galleryIds: e.galleryIds.filter((g) => g !== str(fd, "uploadId")) }).where(eq(events.id, id));
  await audit(admin.id, "event.gallery_removed", "Event", id);
  revalidatePath(`/admin/events/${id}`);
}

export async function decideRefund(_: FormState, fd: FormData): Promise<FormState> {
  return run(async () => {
    const admin = await requireAdmin();
    const r = await db.query.refundRequests.findFirst({
      where: eq(refundRequests.id, str(fd, "refundId")),
      with: { user: true, ticket: { with: { ticketType: true } } },
    });
    if (!r || r.status !== "PENDING") return { error: "This refund has already been decided." };
    const approve = str(fd, "decision") === "APPROVED";
    const note = str(fd, "note");

    if (approve) {
      const paid = await db.query.payments.findMany({
        where: and(eq(payments.ticketOrderId, r.ticket.ticketOrderId), eq(payments.status, "SUCCEEDED"), eq(payments.kind, "TICKET")),
      });
      if (!paid[0]) return { error: "No completed payment found for this ticket." };
      await refundPayment(paid[0].id, r.amountCents, `${refundNo(r.number)} · ticket ${r.ticket.code}`);
      await db.transaction(async (tx) => {
        await tx.update(tickets).set({ status: "REFUNDED" }).where(eq(tickets.id, r.ticketId));
        await releaseSeats(tx, [{ typeId: r.ticket.ticketTypeId, quantity: 1 }]);
        await tx.update(refundRequests).set({ status: "APPROVED", decisionNote: note || null, reviewedById: admin.id, reviewedAt: new Date() }).where(eq(refundRequests.id, r.id));
      });
    } else {
      await db.transaction(async (tx) => {
        await tx.update(tickets).set({ status: "VALID" }).where(and(eq(tickets.id, r.ticketId), eq(tickets.status, "REFUND_REQUESTED")));
        await tx.update(refundRequests).set({ status: "REJECTED", decisionNote: note || null, reviewedById: admin.id, reviewedAt: new Date() }).where(eq(refundRequests.id, r.id));
      });
    }
    await emails.refundDecision(r.user.email, r.number, approve, r.amountCents, note);
    await audit(admin.id, approve ? "refund.approved" : "refund.rejected", "RefundRequest", r.id);
    revalidatePath("/", "layout");
    redirect(`/admin/refunds?done=${encodeURIComponent(`${refundNo(r.number)} ${approve ? "refunded" : "rejected"}. ${r.user.name} has been emailed.`)}`);
  });
}
