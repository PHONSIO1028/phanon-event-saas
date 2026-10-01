'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { QuoteItem, Row } from './types';
import { money, quoteTotal } from './types';
import { frDate, paymentSchedule } from './contract-templates';

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

export default function PaymentsTab({
  clients,
  events,
  quotes,
  payments,
  focusEventId,
  setMsg,
}: {
  clients?: Row[];
  events: Row[];
  quotes?: Row[];
  payments: Row[];
  focusEventId: string | null;
  setMsg: (m: string) => void;
}) {
  const router = useRouter();
  const db = browserDB();
  const [eventId, setEventId] = useState<string>(focusEventId || events[0]?.id || '');
  const [amount, setAmount] = useState('');
  const [method, setMethod] = useState<string>(methods[0] ?? 'Espèces');
  const [saving, setSaving] = useState(false);

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

  const selected = events.find((e) => e.id === eventId);
  const selTotal = selected ? eventTotal(selected) : 0;
  const selPaid = selected ? eventPaid(selected.id) : 0;
  const selParts = splitPayments(selTotal, selPaid);
  const selNext = selected ? nextDue(selected) : null;

  const sortedPayments = [...payments].sort((a, b) =>
    String(b.created_at || '').localeCompare(String(a.created_at || '')),
  );

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
              <td>{frDate(p.created_at)}</td>
              <td>{events.find((e) => e.id === p.event_id)?.name}</td>
              <td>{money(Number(p.amount))}</td>
              <td>{p.method}</td>
            </tr>
          ))}
          {payments.length === 0 && (
            <tr>
              <td className="muted">Aucun paiement enregistré.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
