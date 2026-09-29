import postgres from 'postgres';
import { databaseTLS } from '../lib/postgres/tls.mjs';
const required=['APP_URL','SUPABASE_URL','SUPABASE_PUBLISHABLE_KEY','DATABASE_URL','GOLD_GYM_OWNER_ID'];
const databaseUrl=process.env.DATABASE_URL || process.env.DATABASEURL;
const missing=required.filter(name=>name==='DATABASE_URL' ? !databaseUrl : !process.env[name]);
if(missing.length){console.error('Faltan variables: '+missing.join(', '));process.exit(1);}
const sql=postgres(databaseUrl,{prepare:false,max:1,ssl:databaseTLS(databaseUrl),connect_timeout:10});
try{
 await sql.begin(async tx=>{
  await tx.unsafe('SET LOCAL ROLE gold_gym_app');
  await tx.unsafe("SELECT set_config('app.club_owner', $1, true)",[process.env.GOLD_GYM_OWNER_ID]);
  const tables=await tx.unsafe("SELECT count(*)::integer AS total FROM pg_tables WHERE schemaname='club' AND rowsecurity");
  if(tables[0].total!==14)throw new Error('schema');
  await tx.unsafe('SELECT id FROM club.plans LIMIT 1');
  const roles=await tx.unsafe("SELECT rolbypassrls,rolsuper FROM pg_roles WHERE rolname=current_user");
  if(roles[0].rolbypassrls||roles[0].rolsuper)throw new Error('role');
 });
 const response=await fetch(new URL('/auth/v1/settings',process.env.SUPABASE_URL),{headers:{apikey:process.env.SUPABASE_PUBLISHABLE_KEY},signal:AbortSignal.timeout(10000)});
 if(!response.ok)throw new Error('auth');
 const settings=await response.json();
 if(settings.mailer_autoconfirm)throw new Error('confirmation');
 console.log('Base accesible; 14 tablas con RLS; rol restringido; servicio de identidad accesible y confirmación de correo requerida.');
 console.log('Pendiente validar con personas: login, correo, recuperación, roles y restauración en este proyecto remoto.');
}catch(error){
 console.error('No pasó la verificación del backend. Revisá migración, rol, TLS, variables y confirmación de correo. No se imprimen credenciales ni cadenas de conexión.');
 process.exitCode=1;
}finally{await sql.end({timeout:5});}
