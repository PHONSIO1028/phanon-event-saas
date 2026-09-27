'use client';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { Row } from './types';
import { money } from './types';

const methods = ['Wave', 'Orange Money', 'MTN MoMo', 'Moov Money', 'Espèces', 'Virement'];

export default function PaymentsTab({
  events,
  payments,
  focusEventId,
  setMsg,
}: {
  events: Row[];
  payments: Row[];
  focusEventId: string | null;
  setMsg: (m: string) => void;
}) {
  const router = useRouter();
  const db = browserDB();

  async function addPayment(form: FormData) {
    setMsg('');
    const { error } = await db.from('event_payments').insert({
      event_id: String(form.get('event_id')),
      amount: Number(form.get('amount')),
      method: String(form.get('method')),
    });
    if (error) setMsg(error.message);
    else router.refresh();
  }

  return (
    <section>
      <h2>Paiements des événements</h2>
      <form action={addPayment}>
        <select name="event_id" required defaultValue={focusEventId || ''}>
          <option value="" disabled>
            Événement
          </option>
          {events.map((e) => (
            <option key={e.id} value={e.id}>
              {e.name}
            </option>
          ))}
        </select>
        <input name="amount" type="number" min="1" required placeholder="Montant FCFA" />
        <select name="method">
          {methods.map((m) => (
            <option key={m}>{m}</option>
          ))}
        </select>
        <button>Enregistrer</button>
      </form>
      <p className="muted">Ces paiements sont des enregistrements manuels, distincts des abonnements CinetPay.</p>
      <table>
        <tbody>
          {payments.map((p) => (
            <tr key={p.id}>
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
