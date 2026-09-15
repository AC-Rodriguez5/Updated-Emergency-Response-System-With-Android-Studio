import http from 'node:http';
import mongoose from 'mongoose';
import app from './app.ts';
import { connectDatabase } from './config/database.ts';
import { env } from './config/environment.ts';
import { seedAdmin } from './config/seedAdmin.ts';
import { initSocket } from './config/socket.ts';
import { startNotificationWorker } from './services/notifications.ts';
async function main(){
  await connectDatabase();await seedAdmin();
  const server=http.createServer(app);const io=initSocket(server);
  const stopWorker=startNotificationWorker();
  server.requestTimeout=15000;server.headersTimeout=10000;
  server.listen(Number(env.PORT),()=>console.info(JSON.stringify({event:'server_started',port:Number(env.PORT),mode:env.NODE_ENV})));
  let stopping=false;
  const stop=()=>{if(stopping)return;stopping=true;stopWorker();const deadline=setTimeout(()=>process.exit(1),10000);deadline.unref();void io.close().then(()=>mongoose.disconnect()).then(()=>{clearTimeout(deadline);process.exit(0);});};
  process.on('SIGTERM',stop);process.on('SIGINT',stop);
}
void main().catch(()=>{console.error(JSON.stringify({level:'error',event:'startup_failed',message:'Check validated configuration and database availability.'}));process.exitCode=1;});
