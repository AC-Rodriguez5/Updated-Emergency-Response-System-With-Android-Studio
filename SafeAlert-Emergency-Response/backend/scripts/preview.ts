/** Synthetic local review fixture. Never loads or connects to the operational database. */
import { MongoMemoryReplSet } from 'mongodb-memory-server';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import http from 'node:http';
import { randomUUID } from 'node:crypto';
import sharp from 'sharp';
async function main(){
process.env.NODE_ENV='test';process.env.JWT_SECRET=randomUUID()+randomUUID();process.env.FCM_ENABLED='false';
process.env.ALLOWED_ORIGINS='http://localhost:5173,http://127.0.0.1:5173,http://localhost:4173,http://127.0.0.1:4173,http://127.0.0.1:3002';
console.info('Starting isolated replica set');const db=await MongoMemoryReplSet.create({replSet:{count:1}});process.env.MONGODB_URI=db.getUri('safealert-review');
await mongoose.connect(process.env.MONGODB_URI);console.info('Isolated database connected');
const [{default:app},{default:User},{default:Responder},{default:Admin},{default:Emergency},{initSocket},{startNotificationWorker}]=await Promise.all([import('../src/app.ts'),import('../src/models/User.ts'),import('../src/models/Responder.ts'),import('../src/models/AdminUser.ts'),import('../src/models/Emergency.ts'),import('../src/config/socket.ts'),import('../src/services/notifications.ts')]);
console.info('Preview modules loaded');await Promise.all(Object.values(mongoose.models).map(model=>model.init()));
console.info('Preview indexes initialized');const password='Local-review-only-42!';const passwordHash=await bcrypt.hash(password,12);
const profile={name:'Review Resident',email:'resident@safealert.test',passwordHash,phone:'+639170000000',dateOfBirth:new Date('1990-01-01'),age:36,address:'Test street',coverageArea:'test municipality',consentLocation:true,status:'approved'};
const user=await User.create(profile);
const pending=await User.create({...profile,email:'pending@safealert.test',name:'Pending Resident',status:'pending'});
const UploadedFile=(await import('../src/models/UploadedFile.ts')).default;
const image=await sharp({create:{width:64,height:64,channels:3,background:'#78a9ba'}}).png().toBuffer();
const docs=await UploadedFile.create(['proof_of_residency','face_capture'].map(purpose=>({ownerId:String(pending._id),ownerRole:'user',purpose,source:'camera',mimeType:'image/png',size:image.length,data:image,sha256:'synthetic-test-image'})));
await User.updateOne({_id:pending._id},{$set:{proofOfResidencyId:docs[0]._id,faceCaptureId:docs[1]._id}});
await Responder.create({...profile,name:'Review Responder',email:'responder@safealert.test',agencyType:'medical',departmentName:'Municipal EMS',responderRole:'Paramedic',isOnDuty:true});
await Admin.create({name:'Review Administrator',email:'admin@safealert.test',passwordHash,role:'admin'});
const location={lat:14.325,lng:120.944,accuracyMeters:10,capturedAt:new Date()};
await Emergency.create({userId:user._id,type:'medical',source:'mobile_app',coverageArea:profile.coverageArea,location,currentLocation:{type:'Point',coordinates:[location.lng,location.lat]},idempotencyKey:randomUUID(),requestHash:randomUUID(),notes:'Synthetic review incident. No assistance is requested.',timeline:[],outbox:[]});
const server=http.createServer(app);const io=initSocket(server);const stopWorker=startNotificationWorker();server.listen(5055,'127.0.0.1',()=>console.info('Synthetic review API: http://127.0.0.1:5055 | admin@safealert.test | Local-review-only-42!'));
let stopping=false;async function stop(){if(stopping)return;stopping=true;stopWorker();await io.close();await mongoose.disconnect();await db.stop();process.exit(0);}process.on('SIGINT',()=>void stop());process.on('SIGTERM',()=>void stop());
}
void main().catch(()=>{console.error('Local review fixture could not start.');process.exitCode=1;});

