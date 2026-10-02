'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { QuoteItem, Row } from './types';
import { money, quoteTotal } from './types';
import { DELIVERY_DELAY, frDate } from './contract-templates';

// Limite contractuelle de livraison : 2 mois après l'événement (voir DELIVERY_DELAY)
const DELIVERY_MAX_MONTHS = 2;

// Lien valide : http(s) uniquement. Sans préfixe, on ajoute https://
// Si du texte entoure le lien (ex. « Lien : https://... »), on garde seulement le lien.
function parseLink(raw: string): { url: string | null; error: string } {
  let value = String(raw || '').trim();
  const found = value.match(/https?:\/\/\S+/i);
  if (found) value = found[0];
  if (!value) return { url: null, error: 'Saisissez le lien de livraison.' };
  if (/\s/.test(value)) {
    return { url: null, error: 'Le lien contient des espaces : copiez-collez le lien complet, sans texte autour.' };
  }
  if (!/^https?:\/\//i.test(value)) {
    if (/^[a-z][a-z0-9+.-]*:(?!\d)/i.test(value)) {
      return { url: null, error: 'Le lien doit commencer par https:// (exemple : https://drive.google.com/…).' };
    }
    value = `https://${value}`;
  }
  try {
    const parsed = new URL(value);
    if (!parsed.hostname.includes('.')) throw new Error('hôte invalide');
  } catch {
    return { url: null, error: 'Ce texte ne ressemble pas à un lien web (exemple : https://drive.google.com/…).' };
  }
  return { url: value, error: '' };
}

function normalizeLink(raw: string): string | null {
  return parseLink(raw).url;
}

// Numéro WhatsApp : 10 chiffres (Côte d'Ivoire) -> ajout de l'indicatif 225
function whatsappPhone(raw: string): string {
  let digits = String(raw || '').replace(/[^0-9]/g, '');
  if (digits.startsWith('00')) digits = digits.slice(2);
  if (digits.length === 10) digits = `225${digits}`;
  return digits;
}

function startOfDay(value: string): Date | null {
  const d = new Date(`${String(value).slice(0, 10)}T00:00:00`);
  return Number.isNaN(d.getTime()) ? null : d;
}

function addMonths(d: Date, months: number): Date {
  const next = new Date(d.getTime());
  next.setMonth(next.getMonth() + months);
  return next;
}

function fmt(d: Date): string {
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

export default function DeliveryTab({
  clients,
  events,
  deliveries,
  quotes,
  payments,
  profile,
  focusEventId,
  setMsg,
}: {
  clients: Row[];
  events: Row[];
  deliveries: Row[];
  quotes?: Row[];
  payments?: Row[];
  profile?: Row | null;
  focusEventId: string | null;
  setMsg: (m: string) => void;
}) {
  const [eventId, setEventId] = useState<string>(focusEventId || events[0]?.id || '');
  const [link, setLink] = useState('');
  const [note, setNote] = useState('');
  const [saving, setSaving] = useState(false);
  const router = useRouter();
  const db = browserDB();

  // Montant d'un événement : devis accepté, sinon dernier devis, sinon montant saisi sur l'événement
  function eventTotal(ev: Row): number {
    const list = (quotes || []).filter((q) => q.event_id === ev.id);
    const chosen = list.find((q) => q.status === 'accepte') || list[0];
    if (chosen) return quoteTotal((chosen.items || []) as QuoteItem[]);
    return Number(ev.amount || 0);
  }

  function eventPaid(id: string): number {
    return (payments || []).filter((p) => p.event_id === id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }

  // Reste à payer (0 si le montant de l'événement n'est pas défini)
  function remainingFor(ev: Row): number {
    const total = eventTotal(ev);
    return total > 0 ? Math.max(total - eventPaid(ev.id), 0) : 0;
  }

  function paymentLabel(ev: Row): string {
    if (eventTotal(ev) === 0) return 'Montant non défini';
    const remaining = remainingFor(ev);
    return remaining > 0 ? `Reste ${money(remaining)}` : 'Soldé';
  }

  async function addDelivery() {
    setMsg('');
    const ev = events.find((e) => e.id === eventId);
    if (!ev) {
      setMsg('Choisissez un événement.');
      return;
    }
    const parsed = parseLink(link);
    if (!parsed.url) {
      setMsg(parsed.error);
      return;
    }
    const url = parsed.url;
    const remaining = remainingFor(ev);
    if (
      remaining > 0 &&
      !window.confirm(
        `Il reste ${money(remaining)} à payer pour cet événement. Le contrat prévoit la livraison contre le règlement du dernier versement.\n\nEnregistrer quand même la livraison ?`,
      )
    ) {
      return;
    }
    setSaving(true);
    const { error } = await db.from('deliveries').insert({ event_id: ev.id, link: url, note: note.trim() });
    setSaving(false);
    if (error) setMsg(error.message);
    else {
      setLink('');
      setNote('');
      router.refresh();
    }
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
    const provider = profile?.business_name || profile?.full_name || '';
    const href = normalizeLink(d.link || '') || d.link;
    const text =
      `Bonjour ${client?.name || ''}, voici le lien de livraison de vos photos/vidéos (${ev?.name || ''}) : ${href}` +
      (provider ? `\n\nCordialement,\n${provider}` : '');
    const phone = whatsappPhone(client?.phone || '');
    return phone
      ? `https://wa.me/${phone}?text=${encodeURIComponent(text)}`
      : `https://wa.me/?text=${encodeURIComponent(text)}`;
  }

  const selected = events.find((e) => e.id === eventId);
  const selTotal = selected ? eventTotal(selected) : 0;
  const selRemaining = selected ? remainingFor(selected) : 0;

  const today = new Date();
  today.setHours(0, 0, 0, 0);

  // Suivi : événements non annulés, par date
  const tracked = events
    .filter((e) => e.status !== 'annule')
    .sort((a, b) => String(a.date || '').localeCompare(String(b.date || '')));

  return (
    <section>
      <h2>Livraison</h2>
      <p className="muted">Délai contractuel : {DELIVERY_DELAY}.</p>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addDelivery();
        }}
      >
        <select value={eventId} onChange={(e) => setEventId(e.target.value)} required>
          <option value="" disabled>
            Événement
          </option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {eventName(e.id)}
            </option>
          ))}
        </select>
        <input
          placeholder="Lien (Google Drive, WeTransfer…)"
          required
          value={link}
          onChange={(e) => setLink(e.target.value)}
        />
        <input placeholder="Note (optionnel)" value={note} onChange={(e) => setNote(e.target.value)} />
        <button disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer la livraison'}</button>
      </form>

      {selected && (
        <p className={selRemaining > 0 ? 'error' : 'muted'}>
          {selTotal === 0
            ? 'Aucun devis ni montant pour cet événement : le paiement ne peut pas être vérifié.'
            : selRemaining > 0
              ? `Attention : il reste ${money(selRemaining)} à payer. Le contrat prévoit la livraison contre le règlement du dernier versement.`
              : 'Prestation soldée : vous pouvez livrer.'}
        </p>
      )}

      <h3>Suivi des livraisons</h3>
      <table>
        <thead>
          <tr>
            <th>Événement</th>
            <th>Date</th>
            <th>À livrer avant le</th>
            <th>Paiement</th>
            <th>Livraison</th>
          </tr>
        </thead>
        <tbody>
          {tracked.map((ev) => {
            const delivered = deliveries.some((d) => d.event_id === ev.id);
            const day = ev.date ? startOfDay(ev.date) : null;
            const limit = day ? addMonths(day, DELIVERY_MAX_MONTHS) : null;
            const status = delivered
              ? 'Livrée'
              : limit && today > limit
                ? 'En retard'
                : day && day > today
                  ? 'À venir'
                  : 'À livrer';
            return (
              <tr key={ev.id}>
                <td>{eventName(ev.id)}</td>
                <td>{frDate(ev.date)}</td>
                <td>{limit ? fmt(limit) : '—'}</td>
                <td>{paymentLabel(ev)}</td>
                <td>
                  {status}{' '}
                  {!delivered && (
                    <button type="button" onClick={() => setEventId(ev.id)}>
                      Choisir
                    </button>
                  )}
                </td>
              </tr>
            );
          })}
          {tracked.length === 0 && (
            <tr>
              <td className="muted">Aucun événement pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Livraisons enregistrées</h3>
      <table>
        <tbody>
          {deliveries.map((d) => {
            const href = normalizeLink(d.link || '');
            return (
              <tr key={d.id}>
                <td>{frDate(d.created_at)}</td>
                <td>{eventName(d.event_id)}</td>
                <td>
                  {href ? (
                    <a href={href} target="_blank" rel="noreferrer">
                      {d.link}
                    </a>
                  ) : (
                    d.link
                  )}
                </td>
                <td>{d.note}</td>
                <td>
                  <a href={whatsappUrl(d)} target="_blank" rel="noreferrer">
                    Partager par WhatsApp
                  </a>
                </td>
              </tr>
            );
          })}
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
