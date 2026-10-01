'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { QuoteItem, Row } from './types';
import { quoteTotal, quoteStatusLabels, money } from './types';
import PrintView from './print-view';
import { paymentSchedule, DELIVERY_DELAY } from './contract-templates';

// --- Réglages du devis ---
const VALIDITY_DAYS = 30; // durée de validité du devis
// L'échéancier de paiement se modifie dans contract-templates.ts (PAYMENT_PLAN)

// Date lisible : 2026-12-12 -> 12 décembre 2026
function frDate(value?: string | null) {
  if (!value) return '—';
  const d = new Date(String(value).length <= 10 ? `${value}T00:00:00` : value);
  if (Number.isNaN(d.getTime())) return String(value);
  return d.toLocaleDateString('fr-FR', { day: 'numeric', month: 'long', year: 'numeric' });
}

// Texte tout en majuscules -> Première Lettre Majuscule (sinon inchangé)
function tidy(value?: string | null) {
  if (!value) return '—';
  const hasLetters = /[a-zA-ZÀ-ÿ]/.test(value);
  if (hasLetters && value === value.toUpperCase()) {
    return value
      .toLowerCase()
      .replace(/(^|[\s\-'’])([a-zà-ÿ])/g, (_m, sep, ch) => sep + ch.toUpperCase());
  }
  return value;
}

export default function QuotesTab({
  clients,
  events,
  quotes,
  profile,
  accountEmail,
  focusEventId,
  setMsg,
}: {
  clients: Row[];
  events: Row[];
  quotes: Row[];
  profile: Row | null;
  accountEmail?: string;
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

  // Numéro automatique : DEV-2026-001, DEV-2026-002... (par année, selon la date de création)
  function quoteNumber(q: Row) {
    const year = new Date(q.created_at).getFullYear();
    const sameYear = quotes
      .filter((x) => new Date(x.created_at).getFullYear() === year)
      .sort((a, b) => String(a.created_at).localeCompare(String(b.created_at)));
    const rank = sameYear.findIndex((x) => x.id === q.id) + 1;
    return `DEV-${year}-${String(rank).padStart(3, '0')}`;
  }

  function validUntil(q: Row) {
    const d = new Date(q.created_at);
    d.setDate(d.getDate() + VALIDITY_DAYS);
    return d.toISOString().slice(0, 10);
  }

  const previewQuote = quotes.find((q) => q.id === previewId);
  const previewEvent = previewQuote ? events.find((e) => e.id === previewQuote.event_id) : null;
  const previewClient = previewEvent ? clients.find((c) => c.id === previewEvent.client_id) : null;
  const previewTotal = previewQuote ? quoteTotal(previewQuote.items || []) : 0;
  const schedule = paymentSchedule(previewTotal);

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
              <td>{quoteNumber(q)}</td>
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
          <p className="muted">
            {profile?.phone && <>Tél : {profile.phone}<br /></>}
            {(profile?.email || accountEmail) && <>E-mail : {profile?.email || accountEmail}<br /></>}
            {profile?.address && <>{profile.address}</>}
          </p>

          <h2>
            Devis n° {quoteNumber(previewQuote)}
          </h2>
          <p className="muted">
            Émis le {frDate(previewQuote.created_at)} · Valable jusqu’au {frDate(validUntil(previewQuote))}
          </p>

          <p>
            <strong>Client :</strong> {previewClient?.name || '—'}
            <br />
            <strong>Événement :</strong> {previewEvent.name}
            <br />
            <strong>Date :</strong> {frDate(previewEvent.date)}
            <br />
            <strong>Lieu :</strong> {tidy(previewEvent.location)}
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
                  <td>{tidy(it.label)}</td>
                  <td>{money(it.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p>
            <strong>Total : {money(previewTotal)}</strong>
          </p>

          <h3>Conditions de paiement</h3>
          <p>
            {schedule.map((p, i) => (
              <span key={i}>
                {p.percent} % ({money(p.amount)}) {p.when}
                <br />
              </span>
            ))}
          </p>

          <p>
            <strong>Délai de livraison :</strong> {DELIVERY_DELAY}.
          </p>

          <h3>Bon pour accord</h3>
          <div style={{ display: 'flex', gap: '48px', marginTop: '16px' }}>
            <div style={{ flex: 1 }}>
              <p>Le client (nom, date et signature)</p>
              <div style={{ borderBottom: '1px solid #000', height: '70px' }} />
            </div>
            <div style={{ flex: 1 }}>
              <p>Le prestataire (date et signature)</p>
              <div style={{ borderBottom: '1px solid #000', height: '70px' }} />
            </div>
          </div>

          <p className="muted" style={{ marginTop: '24px' }}>
            Devis généré via PH@NON EVENT — Organisez. Produisez. Encaissez. Livrez.
          </p>
        </PrintView>
      )}
    </section>
  );
}
