'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { Row } from './types';

export default function DeliveryTab({
  clients,
  events,
  deliveries,
  focusEventId,
  setMsg,
}: {
  clients: Row[];
  events: Row[];
  deliveries: Row[];
  focusEventId: string | null;
  setMsg: (m: string) => void;
}) {
  const [eventId, setEventId] = useState(focusEventId || events[0]?.id || '');
  const router = useRouter();
  const db = browserDB();

  async function addDelivery(form: FormData) {
    setMsg('');
    const { error } = await db.from('deliveries').insert({
      event_id: String(form.get('event_id')),
      link: String(form.get('link') || ''),
      note: String(form.get('note') || ''),
    });
    if (error) setMsg(error.message);
    else router.refresh();
  }

  function eventName(id: string) {
    const ev = events.find((e) => e.id === id);
    if (!ev) return '—';
    const client = clients.find((c) => c.id === ev.client_id);
    return `${ev.name} — ${client?.name || ''}`;
  }

  function whatsappUrl(d: Row) {
    const ev = events.find((e) => e.id === d.event_id);
    const client = clients.find((c) => c.id === ev?.client_id);
    const text = `Bonjour ${client?.name || ''}, voici le lien de livraison de vos photos/vidéos (${ev?.name || ''}) : ${d.link}`;
    const phone = (client?.phone || '').replace(/[^0-9]/g, '');
    return `https://wa.me/${phone}?text=${encodeURIComponent(text)}`;
  }

  return (
    <section>
      <h2>Livraison</h2>
      <form action={addDelivery}>
        <select name="event_id" required value={eventId} onChange={(e) => setEventId(e.target.value)}>
          <option value="" disabled>
            Événement
          </option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {eventName(e.id)}
            </option>
          ))}
        </select>
        <input name="link" placeholder="Lien (Google Drive, WeTransfer…)" required />
        <input name="note" placeholder="Note (optionnel)" />
        <button>Enregistrer la livraison</button>
      </form>

      <table>
        <tbody>
          {deliveries.map((d) => (
            <tr key={d.id}>
              <td>{eventName(d.event_id)}</td>
              <td>
                <a href={d.link} target="_blank" rel="noreferrer">
                  {d.link}
                </a>
              </td>
              <td>{d.note}</td>
              <td>
                <a href={whatsappUrl(d)} target="_blank" rel="noreferrer">
                  Partager par WhatsApp
                </a>
              </td>
            </tr>
          ))}
          {deliveries.length === 0 && (
            <tr>
              <td className="muted">Aucune livraison enregistrée.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
