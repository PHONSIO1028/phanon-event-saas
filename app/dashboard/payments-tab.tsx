'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { QuoteItem, Row } from './types';
import { money, quoteTotal } from './types';
import { frDate, paymentSchedule, tidy } from './contract-templates';
import PrintView from './print-view';

const methods = ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Espèces', 'Virement'];

type Installment = {
  percent: number;
  when: string;
  amount: number;
  paid: number;
  status: 'paye' | 'partiel' | 'a_payer';
};

const installmentLabels: Record<Installment['status'], string> = {
  paye: 'Payé',
  partiel: 'Partiel',
  a_payer: 'À payer',
};

// Répartit les sommes déjà reçues sur les versements, dans l'ordre (50 % puis 25 % puis 25 %)
function splitPayments(total: number, paid: number): Installment[] {
  let left = paid;
  return paymentSchedule(total).map((p) => {
    const part = Math.max(0, Math.min(left, p.amount));
    left -= part;
    const status: Installment['status'] =
      p.amount > 0 && part >= p.amount ? 'paye' : part > 0 ? 'partiel' : 'a_payer';
    return { ...p, paid: part, status };
  });
}

// Tri chronologique (le plus ancien d'abord)
function byCreated(a: Row, b: Row): number {
  return (
    String(a.created_at || '').localeCompare(String(b.created_at || '')) || String(a.id).localeCompare(String(b.id))
  );
}

export default function PaymentsTab({
  clients,
  events,
  quotes,
  payments,
  profile,
  accountEmail,
  focusEventId,
  setMsg,
}: {
  clients?: Row[];
  events: Row[];
  quotes?: Row[];
  payments: Row[];
  profile?: Row | null;
  accountEmail?: string;
  focusEventId: string | null;
  setMsg: (m: string) => void;
}) {
  const router = useRouter();
  const db = browserDB();
  const [eventId, setEventId] = useState<string>(focusEventId || events[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>(methods[0] ?? 'Espèces');
  const [saving, setSaving] = useState(false);
  const [receiptId, setReceiptId] = useState<string | null>(null);

  // Montant d'un événement : devis accepté, sinon dernier devis, sinon montant saisi sur l'événement
  function eventTotal(ev: Row): number {
    const list = (quotes || []).filter((q) => q.event_id === ev.id);
    const chosen = list.find((q) => q.status === 'accepte') || list[0];
    if (chosen) return quoteTotal((chosen.items || []) as QuoteItem[]);
    return Number(ev.amount || 0);
  }

  function eventPaid(id: string): number {
    return payments.filter((p) => p.event_id === id).reduce((sum, p) => sum + Number(p.amount || 0), 0);
  }

  function eventLabel(ev: Row): string {
    const client = (clients || []).find((c) => c.id === ev.client_id);
    return client ? `${ev.name} — ${client.name}` : ev.name;
  }

  function nextDue(ev: Row) {
    const parts = splitPayments(eventTotal(ev), eventPaid(ev.id));
    const next = parts.find((p) => p.status !== 'paye');
    if (!next) return null;
    const due = next.amount - next.paid;
    return due > 0 ? { when: next.when, amount: due } : null;
  }

  function chooseEvent(id: string) {
    setEventId(id);
    const ev = events.find((e) => e.id === id);
    const due = ev ? nextDue(ev) : null;
    setAmount(due ? String(due.amount) : '');
  }

  async function addPayment() {
    setMsg('');
    const ev = events.find((e) => e.id === eventId);
    if (!ev) {
      setMsg('Choisissez un événement.');
      return;
    }
    const value = Number(amount);
    if (!Number.isFinite(value) || value <= 0) {
      setMsg('Saisissez un montant valide.');
      return;
    }
    const total = eventTotal(ev);
    const remaining = total - eventPaid(ev.id);
    if (total > 0 && value > remaining) {
      setMsg(`Le montant dépasse le reste à payer (${money(Math.max(remaining, 0))}).`);
      return;
    }
    setSaving(true);
    const { error } = await db.from('event_payments').insert({ event_id: ev.id, amount: value, method });
    setSaving(false);
    if (error) setMsg(error.message);
    else {
      setAmount('');
      router.refresh();
    }
  }

  // Numéro de reçu automatique : REC-2026-001, REC-2026-002... (par année, selon la date d'enregistrement)
  function receiptNumber(p: Row): string {
    const year = new Date(p.created_at || Date.now()).getFullYear();
    const sameYear = [...payments]
      .filter((x) => new Date(x.created_at || Date.now()).getFullYear() === year)
      .sort(byCreated);
    const rank = sameYear.findIndex((x) => x.id === p.id) + 1;
    return `REC-${year}-${String(rank).padStart(3, '0')}`;
  }

  // Situation de l'événement au moment de ce paiement : versement(s) concerné(s), total versé, reste
  function receiptDetails(p: Row, ev: Row) {
    const list = payments.filter((x) => x.event_id === ev.id).sort(byCreated);
    const index = list.findIndex((x) => x.id === p.id);
    const before = list.slice(0, Math.max(index, 0)).reduce((sum, x) => sum + Number(x.amount || 0), 0);
    const paidNow = Number(p.amount || 0);
    const after = before + paidNow;
    const total = eventTotal(ev);
    const covered: string[] = [];
    let start = 0;
    paymentSchedule(total).forEach((inst, i) => {
      const end = start + inst.amount;
      if (paidNow > 0 && before < end && after > start) {
        covered.push(`Versement ${i + 1} — ${inst.percent} % ${inst.when}`);
      }
      start = end;
    });
    return { total, after, remaining: Math.max(total - after, 0), covered };
  }

  const selected = events.find((e) => e.id === eventId);
  const selTotal = selected ? eventTotal(selected) : 0;
  const selPaid = selected ? eventPaid(selected.id) : 0;
  const selParts = splitPayments(selTotal, selPaid);
  const selNext = selected ? nextDue(selected) : null;

  const sortedPayments = [...payments].sort((a, b) => byCreated(b, a));

  const receiptPayment = payments.find((p) => p.id === receiptId);
  const receiptEvent = receiptPayment ? events.find((e) => e.id === receiptPayment.event_id) : undefined;
  const receiptClient = receiptEvent ? (clients || []).find((c) => c.id === receiptEvent.client_id) : undefined;
  const receipt = receiptPayment && receiptEvent ? receiptDetails(receiptPayment, receiptEvent) : null;

  return (
    <section>
      <h2>Paiements des événements</h2>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          addPayment();
        }}
      >
        <select value={eventId} onChange={(e) => chooseEvent(e.target.value)} required>
          <option value="" disabled>
            Événement
          </option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {eventLabel(e)}
            </option>
          ))}
        </select>
        <input
          type="number"
          min="1"
          required
          placeholder="Montant FCFA"
          value={amount}
          onChange={(e) => setAmount(e.target.value)}
        />
        <select value={method} onChange={(e) => setMethod(e.target.value)}>
          {methods.map((m) => (
            <option key={m} value={m}>
              {m}
            </option>
          ))}
        </select>
        <button disabled={saving}>{saving ? 'Enregistrement…' : 'Enregistrer'}</button>
      </form>
      <p className="muted">Ces paiements sont des enregistrements manuels, distincts des abonnements CinetPay.</p>

      {selected && (
        <div>
          <h3>Échéancier — {eventLabel(selected)}</h3>
          <p>
            Total : <strong>{money(selTotal)}</strong> · Reçu : <strong>{money(selPaid)}</strong> · Reste :{' '}
            <strong>{money(Math.max(selTotal - selPaid, 0))}</strong>
          </p>
          <table>
            <thead>
              <tr>
                <th>Versement</th>
                <th>Montant</th>
                <th>Reçu</th>
                <th>Statut</th>
              </tr>
            </thead>
            <tbody>
              {selParts.map((p, i) => (
                <tr key={i}>
                  <td>
                    {p.percent} % {p.when}
                  </td>
                  <td>{money(p.amount)}</td>
                  <td>{money(p.paid)}</td>
                  <td>{installmentLabels[p.status]}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {selNext && (
            <p>
              Prochain versement : <strong>{money(selNext.amount)}</strong> ({selNext.when}){' '}
              <button type="button" onClick={() => setAmount(String(selNext.amount))}>
                Utiliser ce montant
              </button>
            </p>
          )}
          {selTotal > 0 && selPaid > selTotal && (
            <p className="error">Attention : les sommes reçues dépassent le montant total de l’événement.</p>
          )}
          {selTotal === 0 && (
            <p className="muted">Aucun devis ni montant pour cet événement : créez d’abord un devis.</p>
          )}
        </div>
      )}

      <h3>Suivi par événement</h3>
      <table>
        <thead>
          <tr>
            <th>Événement</th>
            <th>Total</th>
            <th>Reçu</th>
            <th>Reste</th>
            <th>Situation</th>
          </tr>
        </thead>
        <tbody>
          {events.map((ev) => {
            const total = eventTotal(ev);
            const paid = eventPaid(ev.id);
            const situation = total > 0 && paid >= total ? 'Soldé' : paid > 0 ? 'En cours' : 'Aucun versement';
            return (
              <tr key={ev.id}>
                <td>{eventLabel(ev)}</td>
                <td>{money(total)}</td>
                <td>{money(paid)}</td>
                <td>{money(Math.max(total - paid, 0))}</td>
                <td>
                  {situation} <button type="button" onClick={() => chooseEvent(ev.id)}>Voir</button>
                </td>
              </tr>
            );
          })}
          {events.length === 0 && (
            <tr>
              <td className="muted">Aucun événement pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>

      <h3>Historique des paiements</h3>
      <table>
        <tbody>
          {sortedPayments.map((p) => (
            <tr key={p.id}>
              <td>{receiptNumber(p)}</td>
              <td>{frDate(p.created_at)}</td>
              <td>{events.find((e) => e.id === p.event_id)?.name}</td>
              <td>{money(Number(p.amount))}</td>
              <td>{p.method}</td>
              <td>
                <button type="button" onClick={() => setReceiptId(p.id)}>
                  Reçu PDF
                </button>
              </td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr>
              <td className="muted">Aucun paiement enregistré.</td>
            </tr>
          )}
        </tbody>
      </table>

      {receiptPayment && receiptEvent && receipt && (
        <PrintView title={`Reçu — ${receiptEvent.name}`} onClose={() => setReceiptId(null)}>
          <h1>{profile?.business_name || profile?.full_name || 'PH@NON EVENT'}</h1>
          <p className="muted">
            {profile?.phone && <>Tél : {profile.phone}<br /></>}
            {(profile?.email || accountEmail) && <>E-mail : {profile?.email || accountEmail}<br /></>}
            {profile?.address && <>{tidy(profile.address)}</>}
          </p>

          <h2>Reçu de paiement</h2>
          <p className="muted">
            Reçu n° {receiptNumber(receiptPayment)} · Date : {frDate(receiptPayment.created_at)}
          </p>

          <p>
            <strong>Reçu de :</strong> {receiptClient?.name || '—'}
            <br />
            <strong>Événement :</strong> {receiptEvent.name}
            <br />
            <strong>Date de l’événement :</strong> {frDate(receiptEvent.date)}
          </p>

          <table>
            <tbody>
              <tr>
                <td>Montant reçu</td>
                <td>
                  <strong>{money(Number(receiptPayment.amount))}</strong>
                </td>
              </tr>
              <tr>
                <td>Mode de paiement</td>
                <td>{receiptPayment.method}</td>
              </tr>
              {receipt.covered.length > 0 && (
                <tr>
                  <td>Versement concerné</td>
                  <td>
                    {receipt.covered.map((line, i) => (
                      <span key={i}>
                        {line}
                        <br />
                      </span>
                    ))}
                  </td>
                </tr>
              )}
              <tr>
                <td>Total de la prestation</td>
                <td>{money(receipt.total)}</td>
              </tr>
              <tr>
                <td>Total déjà versé (ce paiement inclus)</td>
                <td>{money(receipt.after)}</td>
              </tr>
              <tr>
                <td>Reste à payer</td>
                <td>
                  <strong>{money(receipt.remaining)}</strong>
                </td>
              </tr>
            </tbody>
          </table>

          <h3>Le prestataire (cachet et signature)</h3>
          <div style={{ borderBottom: '1px solid #000', height: '70px', maxWidth: '320px' }} />

          <p className="muted" style={{ marginTop: '24px' }}>
            Reçu généré via PH@NON EVENT — Organisez. Produisez. Encaissez. Livrez.
          </p>
        </PrintView>
      )}
    </section>
  );
}
