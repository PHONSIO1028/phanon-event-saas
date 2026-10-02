import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {userDB,adminDB} from '../../../lib/server';

const PRICES:Record<string,number>={starter:5000,pro:10000,studio:20000};

interface LoginResp{access_token?:string;data?:{access_token?:string}}
interface PayResp{code?:number|string;payment_url?:string;data?:{payment_url?:string}}

export async function POST(req:Request){
  try{
    const db=await userDB();
    const {data:{user}}=await db.auth.getUser();
    if(!user)return NextResponse.json({error:'Connexion requise'},{status:401});

    const {plan}=await req.json();
    if(typeof plan!=='string'||!Object.hasOwn(PRICES,plan))return NextResponse.json({error:'Formule invalide'},{status:400});

    const base=process.env.NEXT_PUBLIC_SITE_URL;
    if(!base||!base.startsWith('https://'))throw new Error('Domaine HTTPS manquant');
    const api=process.env.CINETPAY_BASE_URL;
    if(!api||!process.env.CINETPAY_API_KEY||!process.env.CINETPAY_API_PASSWORD)throw new Error('Variables CinetPay manquantes');

    const amount=PRICES[plan];
    // 30 caracteres maximum : "pe" + 28 hexa
    const tx='pe'+randomUUID().replace(/-/g,'').slice(0,28);

    const admin=adminDB();
    const {error}=await admin.from('subscription_payments').insert({user_id:user.id,transaction_id:tx,plan,amount,status:'pending'});
    if(error)throw error;

    const lr=await fetch(api+'/v1/oauth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({api_key:process.env.CINETPAY_API_KEY,api_password:process.env.CINETPAY_API_PASSWORD})});
    const lj=(await lr.json()) as LoginResp;
    const token=lj.access_token||lj.data?.access_token;
    if(!lr.ok||!token)throw new Error('Authentification CinetPay refusee');

    const meta=(user.user_metadata||{}) as Record<string,unknown>;
    const full=String(meta.full_name||meta.name||'').trim();
    const parts=full.split(/\s+/).filter(Boolean);
    const local=(user.email||'client').split('@')[0].replace(/[^a-zA-Z]/g,'');
    const first=(parts[0]||local||'Client').padEnd(2,'x');
    const last=(parts.slice(1).join(' ')||'Client').padEnd(2,'x');

    const res=await fetch(api+'/v1/payment',{method:'POST',headers:{'content-type':'application/json',authorization:'Bearer '+token},body:JSON.stringify({
      currency:'XOF',
      merchant_transaction_id:tx,
      amount,
      lang:'fr',
      designation:'Abonnement PHANON EVENT '+plan,
      client_email:user.email,
      client_first_name:first,
      client_last_name:last,
      success_url:base+'/payment-return',
      failed_url:base+'/payment-return',
      notify_url:base+'/api/webhook'
    })});
    const result=(await res.json()) as PayResp;
    const payUrl=result.payment_url||result.data?.payment_url;
    if(!res.ok||!payUrl){console.error('cinetpay init',res.status,JSON.stringify(result));return NextResponse.json({error:'Échec de création du paiement'},{status:502})}

    const url=new URL(payUrl);
    if(url.protocol!=='https:'||!url.hostname.endsWith('cinetpay.net'))throw new Error('URL de paiement inattendue');
    return NextResponse.json({url:url.href});
  }catch(e){
    console.error('checkout failed',e);
    return NextResponse.json({error:'Configuration ou service de paiement indisponible'},{status:500});
  }
}
