'use client';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { Row } from './types';

export default function ClientsTab({ clients, setMsg }: { clients: Row[]; setMsg: (m: string) => void }) {
  const router = useRouter();
  const db = browserDB();

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
          {clients.map((c) => (
            <tr key={c.id}>
              <td>{c.name}</td>
              <td>{c.phone}</td>
              <td>{c.email}</td>
            </tr>
          ))}
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
