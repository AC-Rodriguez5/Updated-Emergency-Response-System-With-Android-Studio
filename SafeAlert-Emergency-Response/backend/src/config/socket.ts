import { Server } from 'socket.io';
import type { Server as HttpServer } from 'node:http';
import { env } from './environment.ts';
import { authenticateAccessToken } from '../middleware/authMiddleware.ts';
import Responder from '../models/Responder.ts';

let io: Server | undefined;
export function initSocket(server: HttpServer) {
  io = new Server(server,{cors:{origin:env.ALLOWED_ORIGINS.split(',').map(v=>v.trim()),credentials:true},maxHttpBufferSize:16*1024});
  io.use((socket,next)=>{ void (async()=>{
    const token: unknown = socket.handshake.auth.token;
    if (typeof token !== 'string') throw new Error('Authentication required');
    socket.data.user = await authenticateAccessToken(token);
    socket.data.accessToken = token;
  })().then(()=>next(),()=>next(new Error('Session expired or account unavailable'))); });
  io.on('connection',socket=>{
    const join = async()=>{
      const actor = await authenticateAccessToken(socket.data.accessToken as string);
      socket.data.user = actor;
      for (const room of socket.rooms) if (room !== socket.id) await socket.leave(room);
      await socket.join(`${actor.role}:${actor.userId}`);
      if (actor.role === 'admin') await socket.join('admin:live');
      if (actor.role === 'responder') {
        const account = await Responder.findById(actor.userId);
        if (account?.isOnDuty) await socket.join(`agency:${account.agencyType}:${account.coverageArea}`);
      }
    };
    void join().catch(()=>socket.disconnect(true));
    // Verify expiry, logout, rejection and duty/coverage changes throughout a connection.
    const timer = setInterval(()=>{ void join().catch(()=>socket.disconnect(true)); },15000);
    timer.unref();
    socket.on('disconnect',()=>clearInterval(timer));
    socket.on('refresh-subscriptions',()=>{ void join().catch(()=>socket.disconnect(true)); });
  });
  return io;
}
export function getIO() { return io; }
export async function emitToRooms(rooms:string[],name:string,data:unknown) {
  if (!io) return;
  // Validate current server-side session before each delivery, including logout/revocation.
  await Promise.all([...io.sockets.sockets.values()].map(async socket=>{
    if (!rooms.some(room=>socket.rooms.has(room))) return;
    try {
      const actor=await authenticateAccessToken(socket.data.accessToken as string);
      const authorized=[`${actor.role}:${actor.userId}`,...(actor.role==='admin'?['admin:live']:[])];
      if(actor.role==='responder'){
        const responder=await Responder.findById(actor.userId);
        if(responder?.isOnDuty)authorized.push(`agency:${responder.agencyType}:${responder.coverageArea}`);
      }
      if(rooms.some(room=>authorized.includes(room)))socket.emit(name,data);
    }
    catch { socket.disconnect(true); }
  }));
}
export function emitRegistration(name:'registration.created'|'registration.reviewed',data:{id:string;type:string;status:string}) {
  void emitToRooms(['admin:live',`${data.type}:${data.id}`],name,data).catch(()=>undefined);
}
