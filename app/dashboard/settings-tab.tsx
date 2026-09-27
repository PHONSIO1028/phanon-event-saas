'use client';
import { useRouter } from 'next/navigation';
import { browserDB } from '../../lib/supabase';
import type { Row } from './types';

export default function SettingsTab({ profile, setMsg }: { profile: Row | null; setMsg: (m: string) => void }) {
  const router = useRouter();
  const db = browserDB();

  async function saveProfile(form: FormData) {
    setMsg('');
    const {
      data: { user },
    } = await db.auth.getUser();
    if (!user) return;
    const { error } = await db.from('profiles').upsert({
      user_id: user.id,
      business_name: String(form.get('business_name') || ''),
      full_name: String(form.get('full_name') || ''),
      phone: String(form.get('phone') || ''),
      address: String(form.get('address') || ''),
      updated_at: new Date().toISOString(),
    });
    if (error) setMsg(error.message);
    else router.refresh();
  }

  return (
    <section>
      <h2>Paramètres</h2>
      <p className="muted">
        Ces informations apparaissent sur vos devis et contrats générés en PDF.
      </p>
      <form action={saveProfile}>
        <input name="business_name" placeholder="Nom de l'entreprise / studio" defaultValue={profile?.business_name || ''} />
        <input name="full_name" placeholder="Nom complet" defaultValue={profile?.full_name || ''} />
        <input name="phone" placeholder="Téléphone" defaultValue={profile?.phone || ''} />
        <input name="address" placeholder="Adresse" defaultValue={profile?.address || ''} />
        <button>Enregistrer</button>
      </form>
    </section>
  );
}
