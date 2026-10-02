import {NextResponse} from 'next/server';
import {adminDB} from '../../../lib/server';

interface LoginResp{access_token?:string;data?:{access_token?:string}}
interface StatusResp{status?:string;amount?:number|string;currency?:string;data?:{status?:string;amount?:number|string;currency?:string}}

export async function GET(){return new NextResponse('OK',{status:200})}

export async function POST(req:Request){
  try{
    const raw=await req.text();
    let tx:string|undefined;
    try{const j=JSON.parse(raw) as {merchant_transaction_id?:string};tx=j.merchant_transaction_id}catch{}
    if(!tx)tx=new URLSearchParams(raw).get('merchant_transaction_id')||undefined;
    if(!tx||!/^pe[a-f0-9]{28}$/.test(tx))return NextResponse.json({error:'Identifiant invalide'},{status:400});

    const admin=adminDB();
    const {data:pending,error}=await admin.from('subscription_payments').select('*').eq('transaction_id',tx).maybeSingle();
    if(error)throw error;
    if(!pending)return NextResponse.json({error:'Transaction inconnue'},{status:404});
    if(pending.status==='accepted')return new NextResponse('OK');

    const api=process.env.CINETPAY_BASE_URL;
    if(!api)throw new Error('CINETPAY_BASE_URL manquant');
    const lr=await fetch(api+'/v1/oauth/login',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({api_key:process.env.CINETPAY_API_KEY,api_password:process.env.CINETPAY_API_PASSWORD})});
    const lj=(await lr.json()) as LoginResp;
    const token=lj.access_token||lj.data?.access_token;
    if(!lr.ok||!token)throw new Error('Authentification CinetPay refusee');

    // Ne jamais faire confiance au contenu recu : on re-verifie aupres de CinetPay
    const r=await fetch(api+'/v1/payment/'+tx,{headers:{authorization:'Bearer '+token}});
    if(!r.ok)throw new Error('Verification CinetPay indisponible');
    const result=(await r.json()) as StatusResp;
    const d=result.data||result;
    if(String(d.status).toUpperCase()!=='SUCCESS')return new NextResponse('OK');
    if(d.amount!==undefined&&Number(d.amount)!==Number(pending.amount))throw new Error('Montant incorrect');
    if(d.currency!==undefined&&d.currency!=='XOF')throw new Error('Devise incorrecte');

    const {error:rpcError}=await admin.rpc('activate_subscription_payment',{p_transaction_id:tx});
    if(rpcError)throw rpcError;
    return new NextResponse('OK');
  }catch(e){
    console.error('webhook verification failed',e);
    return NextResponse.json({error:'Échec de vérification, nouvel essai requis'},{status:500});
  }
}
