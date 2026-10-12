'use client';
import { useState, Fragment } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { Row } from './types';
import { eventStatuses, statusLabels, money } from './types';

export default function EventsTab({
  clients,
  events,
  quotes,
  contracts,
  deliveries,
  payments,
  setMsg,
  goTo,
}: {
  clients: Row[];
  events: Row[];
  quotes: Row[];
  contracts: Row[];
  deliveries: Row[];
  payments: Row[];
  setMsg: (m: string) => void;
  goTo: (tab: string, eventId: string) => void;
}) {
  const [openId, setOpenId] = useState<string | null>(null);
  const [editId, setEditId] = useState<string | null>(null);
  const router = useRouter();
  const db = browserDB();

  async function addEvent(form: FormData) {
    setMsg('');
    const { error } = await db.from('events').insert({
      client_id: String(form.get('client_id')),
      name: String(form.get('name')),
      date: String(form.get('date')),
      location: String(form.get('location') || ''),
      amount: Number(form.get('amount')),
      status: 'prospect',
    });
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function updateStatus(id: string, status: string) {
    setMsg('');
    const { error } = await db.from('events').update({ status }).eq('id', id);
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function saveEvent(id: string, form: FormData) {
    setMsg('');
    const name = String(form.get('name') || '').trim();
    const amount = Number(form.get('amount'));
    if (!name) {
      setMsg('Le nom de l’événement est obligatoire.');
      return;
    }
    if (!Number.isFinite(amount) || amount < 0) {
      setMsg('Le montant prévu est invalide.');
      return;
    }
    const { error } = await db
      .from('events')
      .update({
        client_id: String(form.get('client_id')),
        name,
        date: String(form.get('date')),
        location: String(form.get('location') || '').trim(),
        amount,
      })
      .eq('id', id);
    if (error) {
      setMsg(error.message);
      return;
    }
    setEditId(null);
    setMsg('Événement modifié.');
    router.refresh();
  }

  async function deleteEvent(e: Row) {
    if (!window.confirm(`Supprimer l’événement « ${e.name} » ? Cette action est définitive.`)) return;
    setMsg('');
    const { error } = await db.from('events').delete().eq('id', e.id);
    if (error) {
      setMsg(
        error.code === '23503'
          ? 'Suppression impossible : cet événement a encore des devis, contrats, paiements ou livraisons.'
          : error.message,
      );
      return;
    }
    setOpenId(null);
    setMsg('Événement supprimé.');
    router.refresh();
  }

  function clientName(id: string) {
    return clients.find((c) => c.id === id)?.name || '—';
  }

  return (
    <section>
      <h2>Événements</h2>
      <form action={addEvent}>
        <input name="name" placeholder="Nom événement (ex : Mariage Kouassi)" required />
        <select name="client_id" required defaultValue="">
          <option value="" disabled>
            Client
          </option>
          {clients.map((c) => (
            <option key={c.id} value={c.id}>
              {c.name}
            </option>
          ))}
        </select>
        <input name="date" type="date" required />
        <input name="location" placeholder="Lieu" />
        <input name="amount" type="number" min="0" placeholder="Montant prévu (FCFA)" required />
        <button>Ajouter un événement</button>
      </form>

      <table>
        <tbody>
          {events.map((e) => {
            const isOpen = openId === e.id;
            const isEditing = editId === e.id;
            const eventQuotes = quotes.filter((q) => q.event_id === e.id);
            const eventContracts = contracts.filter((c) => c.event_id === e.id);
            const eventDeliveries = deliveries.filter((d) => d.event_id === e.id);
            const eventPayments = payments.filter((p) => p.event_id === e.id);
            const received = eventPayments.reduce((s, p) => s + Number(p.amount), 0);
            return (
              <Fragment key={e.id}>
                <tr onClick={() => setOpenId(isOpen ? null : e.id)} style={{ cursor: 'pointer' }}>
                  <td>{e.name}</td>
                  <td>{clientName(e.client_id)}</td>
                  <td>{e.date}</td>
                  <td>{money(Number(e.amount))}</td>
                  <td>{statusLabels[e.status] || e.status}</td>
                </tr>
                {isOpen && (
                  <tr>
                    <td colSpan={5}>
                      {isEditing ? (
                        <form action={(form: FormData) => saveEvent(e.id, form)}>
                          <input name="name" defaultValue={e.name || ''} placeholder="Nom événement" required />
                          <select name="client_id" required defaultValue={e.client_id || ''}>
                            {clients.map((c) => (
                              <option key={c.id} value={c.id}>
                                {c.name}
                              </option>
                            ))}
                          </select>
                          <input name="date" type="date" defaultValue={e.date || ''} required />
                          <input name="location" defaultValue={e.location || ''} placeholder="Lieu" />
                          <input
                            name="amount"
                            type="number"
                            min="0"
                            defaultValue={Number(e.amount) || 0}
                            placeholder="Montant prévu (FCFA)"
                            required
                          />
                          <button>Enregistrer</button>
                          <button type="button" onClick={() => setEditId(null)}>
                            Annuler
                          </button>
                        </form>
                      ) : (
                        <div className="event-detail">
                          <p>
                            <strong>{e.name}</strong> — {clientName(e.client_id)} · {e.location || 'Lieu non renseigné'}
                          </p>
                          <p className="muted">
                            Reste à encaisser : {money(Number(e.amount) - received)} sur {money(Number(e.amount))}
                          </p>
                          <label>
                            Statut
                            <select value={e.status} onChange={(ev) => updateStatus(e.id, ev.target.value)}>
                              {eventStatuses.map((s) => (
                                <option key={s} value={s}>
                                  {statusLabels[s]}
                                </option>
                              ))}
                            </select>
                          </label>
                          <p>
                            Devis : {eventQuotes.length} · Contrats : {eventContracts.length} · Livraisons :{' '}
                            {eventDeliveries.length}
                          </p>
                          <div className="actions">
                            <button onClick={() => setEditId(e.id)}>Modifier</button>
                            <button onClick={() => goTo('quotes', e.id)}>Devis</button>
                            <button onClick={() => goTo('contracts', e.id)}>Contrat</button>
                            <button onClick={() => goTo('payments', e.id)}>Paiement</button>
                            <button onClick={() => goTo('delivery', e.id)}>Livraison</button>
                            <button onClick={() => deleteEvent(e)}>Supprimer</button>
                          </div>
                        </div>
                      )}
                    </td>
                  </tr>
                )}
              </Fragment>
            );
          })}
          {events.length === 0 && (
            <tr>
              <td className="muted">Aucun événement pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
