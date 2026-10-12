'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { Row } from './types';

export default function ClientsTab({ clients, setMsg }: { clients: Row[]; setMsg: (m: string) => void }) {
  const router = useRouter();
  const db = browserDB();
  const [editId, setEditId] = useState<string | null>(null);

  async function addClient(form: FormData) {
    setMsg('');
    const { error } = await db.from('clients').insert({
      name: String(form.get('name')),
      phone: String(form.get('phone') || ''),
      email: String(form.get('email') || ''),
    });
    if (error) setMsg(error.message);
    else router.refresh();
  }

  async function saveClient(id: string, form: FormData) {
    setMsg('');
    const name = String(form.get('name') || '').trim();
    if (!name) {
      setMsg('Le nom du client est obligatoire.');
      return;
    }
    const { error } = await db
      .from('clients')
      .update({
        name,
        phone: String(form.get('phone') || '').trim(),
        email: String(form.get('email') || '').trim(),
      })
      .eq('id', id);
    if (error) {
      setMsg(error.message);
      return;
    }
    setEditId(null);
    setMsg('Client modifié.');
    router.refresh();
  }

  async function deleteClient(c: Row) {
    if (!window.confirm(`Supprimer le client « ${c.name} » ? Cette action est définitive.`)) return;
    setMsg('');
    const { error } = await db.from('clients').delete().eq('id', c.id);
    if (error) {
      setMsg(
        error.code === '23503'
          ? 'Suppression impossible : ce client a encore des événements. Supprimez-les d’abord.'
          : error.message,
      );
      return;
    }
    setMsg('Client supprimé.');
    router.refresh();
  }

  return (
    <section>
      <h2>Clients</h2>
      <form action={addClient}>
        <input name="name" placeholder="Nom complet" required />
        <input name="phone" placeholder="Téléphone" />
        <input name="email" placeholder="E-mail" type="email" />
        <button>Ajouter un client</button>
      </form>
      <table>
        <tbody>
          {clients.map((c) =>
            editId === c.id ? (
              <tr key={c.id}>
                <td colSpan={4}>
                  <form action={(form: FormData) => saveClient(c.id, form)}>
                    <input name="name" defaultValue={c.name || ''} placeholder="Nom complet" required />
                    <input name="phone" defaultValue={c.phone || ''} placeholder="Téléphone" />
                    <input name="email" defaultValue={c.email || ''} placeholder="E-mail" type="email" />
                    <button>Enregistrer</button>
                    <button type="button" onClick={() => setEditId(null)}>
                      Annuler
                    </button>
                  </form>
                </td>
              </tr>
            ) : (
              <tr key={c.id}>
                <td>{c.name}</td>
                <td>{c.phone}</td>
                <td>{c.email}</td>
                <td>
                  <button onClick={() => setEditId(c.id)}>Modifier</button>{' '}
                  <button onClick={() => deleteClient(c)}>Supprimer</button>
                </td>
              </tr>
            ),
          )}
          {clients.length === 0 && (
            <tr>
              <td className="muted">Aucun client pour le moment.</td>
            </tr>
          )}
        </tbody>
      </table>
    </section>
  );
}
