import { ActionForm, Submit } from "@/ui/Forms";
import { saveEvent } from "@/lib/admin/actions/events";
import { toLocalInput } from "@/lib/admin/run";

type E = {
  id: string; name: string; slug: string; description: string; venue: string; address: string; city: string;
  startsAt: Date; ageRestriction: string; hue: number; status: "DRAFT" | "PUBLISHED" | "CANCELLED";
};

export function EventForm({ event }: { event?: E }) {
  return (
    <ActionForm action={saveEvent} className="panel prox">
      {event && <input type="hidden" name="id" value={event.id} />}
      <div className="form-grid">
        <label className="f">Event name<input type="text" name="name" defaultValue={event?.name} required /></label>
        <label className="f">Link (events.nepthic.com/e/…)<input type="text" name="slug" defaultValue={event?.slug} placeholder="auto from name" /></label>
        <label className="f">Date and doors (Brisbane time)<input type="datetime-local" name="startsAt" defaultValue={event ? toLocalInput(event.startsAt) : ""} required /></label>
        <label className="f">Status
          <select name="status" defaultValue={event?.status ?? "DRAFT"}>
            <option value="DRAFT">Draft (hidden)</option><option value="PUBLISHED">Published (on sale)</option><option value="CANCELLED">Cancelled</option>
          </select>
        </label>
        <label className="f">Venue<input type="text" name="venue" defaultValue={event?.venue} required /></label>
        <label className="f">Street address<input type="text" name="address" defaultValue={event?.address} /></label>
        <label className="f">Suburb, city<input type="text" name="city" defaultValue={event?.city} required /></label>
        <label className="f">Entry<input type="text" name="ageRestriction" defaultValue={event?.ageRestriction ?? "18+"} /></label>
        <label className="f full">Description<textarea name="description" defaultValue={event?.description} /></label>
        <label className="f">Poster colour (0–359, used without a cover image)<input type="number" name="hue" min={0} max={359} defaultValue={event?.hue ?? 265} /></label>
        <label className="f">Cover image<input type="file" name="cover" accept="image/jpeg,image/png,image/webp" /></label>
        <label className="f full">Add gallery photos<input type="file" name="gallery" accept="image/jpeg,image/png,image/webp" multiple /></label>
      </div>
      {!event && (
        <>
          <h2 className="h3">Ticket types</h2>
          <div className="scroll"><table className="tbl">
            <thead><tr><th>Name</th><th>Price ($ inc GST)</th><th>Capacity</th></tr></thead>
            <tbody>
              {[["General admission", "45", "500"], ["VIP", "95", "60"], ["", "", ""], ["", "", ""]].map(([n, p, c], i) => (
                <tr key={i}>
                  <td><input type="text" name={`type_name_${i}`} defaultValue={n} aria-label={`Ticket type ${i + 1} name`} /></td>
                  <td><input type="number" name={`type_price_${i}`} step="0.01" min="0" defaultValue={p} aria-label={`Ticket type ${i + 1} price`} /></td>
                  <td><input type="number" name={`type_cap_${i}`} min="0" defaultValue={c} aria-label={`Ticket type ${i + 1} capacity`} /></td>
                </tr>
              ))}
            </tbody>
          </table></div>
        </>
      )}
      <Submit pendingText="Saving…">{event ? "Save changes" : "Create event"}</Submit>
    </ActionForm>
  );
}
