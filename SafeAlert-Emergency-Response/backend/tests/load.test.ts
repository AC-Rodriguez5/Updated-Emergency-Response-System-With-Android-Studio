import { before,after,test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import request from 'supertest';
import { MongoMemoryReplSet } from 'mongodb-memory-server';
let db:MongoMemoryReplSet;
let app:typeof import('../src/app.ts').default;
let admin:string,user:string,responder:string,incidentId:string;
before(async()=>{
  process.env.NODE_ENV='test';process.env.JWT_SECRET='load-test-only-secret-more-than-32-characters';process.env.FCM_ENABLED='false';
  db=await MongoMemoryReplSet.create({replSet:{count:1}});process.env.MONGODB_URI=db.getUri('load-tests');await mongoose.connect(process.env.MONGODB_URI);
  app=(await import('../src/app.ts')).default;
  const User=(await import('../src/models/User.ts')).default,Responder=(await import('../src/models/Responder.ts')).default,Admin=(await import('../src/models/AdminUser.ts')).default,Emergency=(await import('../src/models/Emergency.ts')).default;
  await Promise.all(Object.values(mongoose.models).map(model=>model.init()));
  const password='Load-test-only-password42!';const passwordHash=await bcrypt.hash(password,12);
  const profile={name:'Load Test',passwordHash,phone:'+639170000000',dateOfBirth:new Date('1990-01-01'),age:36,address:'Test Street',coverageArea:'test town',consentLocation:true,status:'approved'};
  const owner=await User.create({...profile,email:'load-user@tests.invalid'});
  await Responder.create({...profile,email:'load-responder@tests.invalid',agencyType:'medical',departmentName:'EMS',responderRole:'Medic',isOnDuty:true});
  await Admin.create({name:'Load Admin',email:'load-admin@tests.invalid',passwordHash,role:'admin'});
  const location={lat:14.35,lng:120.95,accuracyMeters:5,capturedAt:new Date(Date.now()-1000)};
  const rows=await Emergency.insertMany(Array.from({length:100},()=>({userId:owner._id,type:'medical',source:'mobile_app',status:'pending',coverageArea:'test town',location,currentLocation:{type:'Point',coordinates:[location.lng,location.lat]},idempotencyKey:randomUUID(),requestHash:randomUUID()})));incidentId=String(rows[0]._id);
  async function login(email:string,role:string){return(await request(app).post('/api/auth/login').send({email,password,role}).expect(200)).body.data.accessToken;}
  [admin,user,responder]=await Promise.all([login('load-admin@tests.invalid','admin'),login('load-user@tests.invalid','user'),login('load-responder@tests.invalid','responder')]);
});
after(async()=>{await new Promise(resolve=>setTimeout(resolve,50));await mongoose.disconnect();if(db)await db.stop();});
test('100 active emergencies load below the two-second local API budget',async t=>{
  const timings:number[]=[];
  for(let n=0;n<5;n++){const started=performance.now();const response=await request(app).get('/api/emergencies/active?limit=100').auth(admin,{type:'bearer'}).expect(200);timings.push(performance.now()-started);assert.equal(response.body.data.length,100);assert.equal(response.body.meta.total,100);}
  timings.sort((a,b)=>a-b);const p95=timings.at(-1)!;t.diagnostic(`Local isolated MongoDB: 100 active emergencies, p95 ${Math.round(p95)} ms; production network not measured.`);assert.ok(p95<2000);
});
test('two accounts sharing one IP sustain tracking without exhausting the SOS limit',async()=>{
  async function stream(token:string,role:'user'|'responder'){
    for(let n=0;n<90;n++){const response=await request(app).post('/api/locations/'+role).auth(token,{type:'bearer'}).send({...(role==='user'?{emergencyId:incidentId}:{}),lat:14.35,lng:120.95,accuracyMeters:5,capturedAt:new Date(Date.now()+n+1).toISOString()});assert.ok(response.status===200||response.status===201,`Tracking failed with ${response.status}`);}
  }
  await Promise.all([stream(user,'user'),stream(responder,'responder')]);
  await request(app).post('/api/emergencies').auth(user,{type:'bearer'}).set('Idempotency-Key',randomUUID()).send({type:'medical',source:'mobile_app',location:{lat:14.35,lng:120.95,accuracyMeters:5,capturedAt:new Date().toISOString()}}).expect(201);
});
