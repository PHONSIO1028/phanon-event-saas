'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { QuoteItem, Row } from './types';
import { quoteTotal, quoteStatusLabels, money } from './types';
import PrintView from './print-view';

export default function QuotesTab({
  clients,
  events,
  quotes,
  profile,
  focusEventId,
  setMsg,
}: {
  clients: Row[];
  events: Row[];
  quotes: Row[];
  profile: Row | null;
  focusEventId: string | null;
  setMsg: (m: string) => void;
}) {
  const [eventId, setEventId] = useState(focusEventId || events[0]?.id || '');
  const [items, setItems] = useState<QuoteItem[]>([{ label: '', amount: 0 }]);
  const [previewId, setPreviewId] = useState<string | null>(null);
  const router = useRouter();
  const db = browserDB();

  function updateItem(i: number, patch: Partial<QuoteItem>) {
    setItems((prev) => prev.map((it, idx) => (idx === i ? { ...it, ...patch } : it)));
  }

  async function saveQuote() {
    setMsg('');
    if (!eventId) {
      setMsg('Choisissez un événement.');
      return;
    }
    const cleanItems = items.filter((it) => it.label.trim() !== '');
    const { error } = await db.from('quotes').insert({ event_id: eventId, items: cleanItems, status: 'brouillon' });
    if (error) setMsg(error.message);
    else {
      setItems([{ label: '', amount: 0 }]);
      router.refresh();
    }
  }

  async function setStatus(id: string, status: string) {
    setMsg('');
    const { error } = await db.from('quotes').update({ status }).eq('id', id);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  function eventName(id: string) {
    const ev = events.find((e) => e.id === id);
    if (!ev) return '—';
    const client = clients.find((c) => c.id === ev.client_id);
    return `${ev.name} — ${client?.name || ''}`;
  }

  const previewQuote = quotes.find((q) => q.id === previewId);
  const previewEvent = previewQuote ? events.find((e) => e.id === previewQuote.event_id) : null;
  const previewClient = previewEvent ? clients.find((c) => c.id === previewEvent.client_id) : null;

  return (
    <section>
      <h2>Devis</h2>

      <div className="quote-form">
        <label>
          Événement
          <select value={eventId} onChange={(e) => setEventId(e.target.value)}>
            <option value="" disabled>
              Choisir un événement
            </option>
            {events.map((e) => (
              <option key={e.id} value={e.id}>
                {eventName(e.id)}
              </option>
            ))}
          </select>
        </label>

        <h3>Prestations</h3>
        {items.map((it, i) => (
          <div className="quote-item-row" key={i}>
            <input
              placeholder="Prestation (ex : Photo 8h)"
              value={it.label}
              onChange={(e) => updateItem(i, { label: e.target.value })}
            />
            <input
              type="number"
              min="0"
              placeholder="Montant FCFA"
              value={it.amount || ''}
              onChange={(e) => updateItem(i, { amount: Number(e.target.value) })}
            />
            <button type="button" onClick={() => setItems((prev) => prev.filter((_, idx) => idx !== i))}>
              Retirer
            </button>
          </div>
        ))}
        <button type="button" onClick={() => setItems((prev) => [...prev, { label: '', amount: 0 }])}>
          + Ajouter une prestation
        </button>

        <p>
          <strong>Total : {money(quoteTotal(items))}</strong>
        </p>
        <button onClick={saveQuote}>Générer le devis</button>
      </div>

      <table>
        <tbody>
          {quotes.map((q) => (
            <tr key={q.id}>
              <td>{eventName(q.event_id)}</td>
              <td>{money(quoteTotal(q.items || []))}</td>
              <td>{quoteStatusLabels[q.status] || q.status}</td>
              <td>
                <button onClick={() => setPreviewId(q.id)}>Aperçu PDF</button>
                {q.status === 'brouillon' && <button onClick={() => setStatus(q.id, 'envoye')}>Marquer envoyé</button>}
                {q.status === 'envoye' && <button onClick={() => setStatus(q.id, 'accepte')}>Marquer accepté</button>}
              </td>
            </tr>
          ))}
          {quotes.length === 0 && (
            <tr>
              <td className="muted">Aucun devis pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

      {previewQuote && previewEvent && (
        <PrintView title={`Devis — ${previewEvent.name}`} onClose={() => setPreviewId(null)}>
          <h1>{profile?.business_name || profile?.full_name || 'PH@NON EVENT'}</h1>
          <p className="muted">{profile?.phone} {profile?.address}</p>
          <h2>Devis</h2>
          <p>
            Client : {previewClient?.name || '—'}
            <br />
            Événement : {previewEvent.name}
            <br />
            Date : {previewEvent.date}
            <br />
            Lieu : {previewEvent.location || '—'}
          </p>
          <table>
            <thead>
              <tr>
                <th>Prestation</th>
                <th>Montant</th>
              </tr>
            </thead>
            <tbody>
              {(previewQuote.items || []).map((it: QuoteItem, i: number) => (
                <tr key={i}>
                  <td>{it.label}</td>
                  <td>{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <strong>Total : {money(quoteTotal(previewQuote.items || []))}</strong>
          </p>
          <p className="muted">Devis généré via PH@NON EVENT.</p>
        </PrintView>
      )}
    </section>
  );
}
