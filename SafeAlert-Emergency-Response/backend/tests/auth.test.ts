import { before, after, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import express from 'express';
import request from 'supertest';
import mongoose from 'mongoose';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import sharp from 'sharp';
import { MongoMemoryReplSet } from 'mongodb-memory-server';

let database: MongoMemoryReplSet;
let app: express.Express;
let models: any;
let adminAccess: string;
let passwordHash: string;
let png: Buffer;
const password = 'A-test-password-27!';
const profile = (email: string) => ({ name:'Test Resident',email,password,phone:'+639171234567',dateOfBirth:'1995-06-15',address:'12 Main Street, Test Town',coverageArea:'test town',consentLocation:true });

before(async () => {
  process.env.NODE_ENV='test';
  process.env.FCM_ENABLED='false';
  process.env.JWT_SECRET='auth-tests-only-secret-with-at-least-32-bytes';
  database=await MongoMemoryReplSet.create({replSet:{count:1},instanceOpts:[{ip:'127.0.0.1'}]});
  process.env.MONGODB_URI=database.getUri('identity-tests');
  await mongoose.connect(process.env.MONGODB_URI);
  const [{default:authRoutes},{default:adminRoutes},{default:uploadRoutes},{requestIdMiddleware},{errorHandler}] = await Promise.all([
    import('../src/routes/authRoutes.ts'),import('../src/routes/adminRoutes.ts'),import('../src/routes/uploadRoutes.ts'),
    import('../src/middleware/requestIdMiddleware.ts'),import('../src/middleware/errorHandler.ts'),
  ]);
  models={
    User:(await import('../src/models/User.ts')).default,Responder:(await import('../src/models/Responder.ts')).default,
    Admin:(await import('../src/models/AdminUser.ts')).default,Refresh:(await import('../src/models/RefreshToken.ts')).default,
    Audit:(await import('../src/models/AuditLog.ts')).default,File:(await import('../src/models/UploadedFile.ts')).default,
    RegistrationJob:(await import('../src/models/RegistrationNotificationJob.ts')).default,
  };
  await Promise.all(Object.values(mongoose.models).map(model=>model.init()));
  app=express();
  app.use(requestIdMiddleware,express.json());
  app.use('/api/auth',authRoutes);app.use('/api/admin',adminRoutes);app.use('/api/upload',uploadRoutes);
  app.use(errorHandler);
  passwordHash=await bcrypt.hash(password,12);
  png=await sharp({create:{width:64,height:64,channels:3,background:'#5599aa'}}).png().toBuffer();
  await models.Admin.create({name:'Test Administrator',email:'admin@tests.invalid',passwordHash,role:'admin',status:'approved'});
  const login=await request(app).post('/api/auth/login').send({email:'admin@tests.invalid',password,role:'admin'}).expect(200);
  adminAccess=login.body.data.accessToken;
});
after(async () => { await mongoose.disconnect();if(database)await database.stop(); });

async function fixture(role:'user'|'responder'='user',status='approved') {
  const email=randomUUID()+'@tests.invalid';
  const record=await (role==='user'?models.User:models.Responder).create({
    ...profile(email),passwordHash,age:31,status,role,
    ...(role==='responder'?{agencyType:'medical',departmentName:'Test EMS',responderRole:'Paramedic'}:{}),
  });
  return {record,email};
}
async function signIn(email:string,role:'user'|'responder'='user',rememberMe=false) {
  const response=await request(app).post('/api/auth/login').send({email,password,role,rememberMe}).expect(200);
  assert.equal(response.body.data.account.passwordHash,undefined);
  assert.ok(response.body.requestId);
  return response.body.data;
}
test('registration detail requires an administrator and missing evidence blocks approval',async()=>{
  const pending=await fixture('user','pending');
  const detail=await request(app).get('/api/admin/registrations/'+pending.record.id+'?type=user').auth(adminAccess,{type:'bearer'}).expect(200);
  assert.equal(detail.body.data.id,pending.record.id);
  assert.equal(detail.body.data.passwordHash,undefined);
  await request(app).post('/api/admin/registrations/'+pending.record.id+'/approve').auth(adminAccess,{type:'bearer'}).send({type:'user'}).expect(409);
  const approved=await fixture();const session=await signIn(approved.email);
  await request(app).get('/api/admin/registrations/'+pending.record.id+'?type=user').auth(session.accessToken,{type:'bearer'}).expect(403);
  assert.equal((await models.User.findById(pending.record.id)).status,'pending');
});
async function registration(role:'user'|'responder'='user') {
  const response=await request(app).post('/api/auth/registration-session').send({role}).expect(201);
  const token=response.body.data.sessionToken;
  const upload=async(purpose:string,source='file') => {
    const result=await request(app).post('/api/upload').auth(token,{type:'bearer'}).field('purpose',purpose).field('source',source).attach('file',png,{filename:'identity.png',contentType:'image/png'}).expect(201);
    return result.body.data.id;
  };
  return {token,upload};
}

test('registration, private documents, admin approval, and approved login form one workflow',async()=>{
  const {token,upload}=await registration();
  const proofOfResidencyId=await upload('proof_of_residency');
  const faceCaptureId=await upload('face_capture','camera');
  const email='onboarding@tests.invalid';
  const response=await request(app).post('/api/auth/register/user').send({...profile(email),registrationToken:token,proofOfResidencyId,faceCaptureId,pushToken:'onboarding-fcm-test-token',deviceId:randomUUID(),platform:'android'}).expect(201);
  const id=response.body.data.id;
  assert.equal(response.body.data.status,'pending');
  await request(app).post('/api/auth/login').send({email,password,role:'user'}).expect(403);
  await request(app).get('/api/upload/'+proofOfResidencyId).expect(401);
  const other=await fixture();const otherSession=await signIn(other.email);
  await request(app).get('/api/upload/'+proofOfResidencyId).auth(otherSession.accessToken,{type:'bearer'}).expect(404);
  const adminDoc=await request(app).get('/api/upload/'+proofOfResidencyId).auth(adminAccess,{type:'bearer'}).expect(200);
  assert.match(adminDoc.headers['cache-control'],/no-store/);
  assert.equal(await models.Audit.countDocuments({action:'document.viewed',targetId:proofOfResidencyId}),1);
  const pending=await request(app).get('/api/admin/registrations?type=user&status=pending').auth(adminAccess,{type:'bearer'}).expect(200);
  assert.ok(pending.body.data.some((row:any)=>row.id===id&&row.type==='user'));
  await request(app).post('/api/admin/registrations/'+id+'/approve').auth(adminAccess,{type:'bearer'}).send({type:'responder'}).expect(404);
  await request(app).post('/api/admin/registrations/'+id+'/approve').auth(adminAccess,{type:'bearer'}).send({type:'user'}).expect(200);
  await request(app).post('/api/admin/registrations/'+id+'/approve').auth(adminAccess,{type:'bearer'}).send({type:'user'}).expect(409);
  assert.equal(await models.Audit.countDocuments({action:'registration.approved',targetId:id}),1);
  assert.equal(await models.RegistrationJob.countDocuments({accountId:id,decision:'approved',status:'pending'}),1);
  assert.equal(response.body.data.pushToken,undefined);
  const {deliverRegistrationPush}=await import('../src/services/registrationNotifications.ts');
  let delivered:any;
  process.env.FCM_ENABLED='true';
  try { await deliverRegistrationPush(async(message)=>{delivered=message;return 'test-only-message-id';}); }
  finally {process.env.FCM_ENABLED='false';}
  assert.equal(delivered.data.event,'registration.reviewed');assert.equal(delivered.data.route,'login');
  assert.equal(delivered.notification.body.includes(email),false);assert.equal(delivered.data.eventId.includes(id),false);
  assert.equal(delivered.data.eventId.includes('approved'),false);
  const job=await models.RegistrationJob.findOne({accountId:id}).select('+token');
  assert.equal(job.status,'sent');assert.equal(job.token,undefined);
  const session=await signIn(email);
  await request(app).get('/api/upload/'+proofOfResidencyId).auth(session.accessToken,{type:'bearer'}).expect(200);
  const stored=await models.File.findById(proofOfResidencyId);
  assert.equal(stored.ownerId,id);assert.equal(stored.expiresAt,undefined);
  const me=await request(app).get('/api/auth/me').auth(session.accessToken,{type:'bearer'}).expect(200);
  assert.equal(me.body.data.id,id);assert.equal(me.body.data.passwordHash,undefined);
});

test('responder rejection retains its reason and prevents login',async()=>{
  const {record,email}=await fixture('responder','pending');
  const response=await request(app).post('/api/admin/registrations/'+record.id+'/reject').auth(adminAccess,{type:'bearer'}).send({type:'responder',reason:'Credential could not be verified.'}).expect(200);
  assert.equal(response.body.data.rejectionReason,'Credential could not be verified.');
  const denied=await request(app).post('/api/auth/login').send({email,password,role:'responder'}).expect(403);
  assert.equal(denied.body.error.code,'ACCOUNT_REJECTED');
  assert.equal(await models.Audit.countDocuments({action:'registration.rejected',targetId:record.id}),1);
});

test('refresh tokens are hashed, rotate, and reuse revokes the whole session',async()=>{
  const {email}=await fixture();const session=await signIn(email);
  const stored=await models.Refresh.findOne({accountId:session.account.id}).select('+tokenHash');
  assert.notEqual(stored.tokenHash,session.refreshToken);assert.equal(stored.tokenHash.length,64);
  assert.ok(stored.expiresAt.getTime()-Date.now()>23*60*60*1000);
  assert.ok(stored.expiresAt.getTime()-Date.now()<=24*60*60*1000);
  const refreshed=await request(app).post('/api/auth/refresh').send({refreshToken:session.refreshToken}).expect(200);
  assert.notEqual(refreshed.body.data.refreshToken,session.refreshToken);
  await request(app).post('/api/auth/refresh').send({refreshToken:session.refreshToken}).expect(401);
  await request(app).get('/api/auth/me').auth(refreshed.body.data.accessToken,{type:'bearer'}).expect(401);
  await request(app).post('/api/auth/refresh').send({refreshToken:refreshed.body.data.refreshToken}).expect(401);
});

test('simultaneous refresh reuse cannot leave a usable session',async()=>{
  const {email}=await fixture();const session=await signIn(email);
  const responses=await Promise.all([0,1].map(()=>request(app).post('/api/auth/refresh').send({refreshToken:session.refreshToken})));
  assert.deepEqual(responses.map(response=>response.status).sort(),[200,401]);
  const winner=responses.find(response=>response.status===200)!;
  await request(app).get('/api/auth/me').auth(winner.body.data.accessToken,{type:'bearer'}).expect(401);
});

test('remember-me lifetime is 30 days and logout revokes access and refresh',async()=>{
  const {email}=await fixture();const session=await signIn(email,'user',true);
  const stored=await models.Refresh.findOne({accountId:session.account.id});
  assert.ok(stored.expiresAt.getTime()-Date.now()>29*24*60*60*1000);
  await request(app).post('/api/auth/logout').send({refreshToken:session.refreshToken}).expect(200);
  await request(app).get('/api/auth/me').auth(session.accessToken,{type:'bearer'}).expect(401);
  await request(app).post('/api/auth/refresh').send({refreshToken:session.refreshToken}).expect(401);
});

test('current database status and role are enforced for already-issued access tokens',async()=>{
  const {email,record}=await fixture();const session=await signIn(email);
  await request(app).get('/api/admin/registrations').auth(session.accessToken,{type:'bearer'}).expect(403);
  const claims=jwt.decode(session.accessToken) as jwt.JwtPayload;
  const forged=jwt.sign({...claims,role:'admin'},process.env.JWT_SECRET!,{algorithm:'HS256'});
  await request(app).get('/api/auth/me').auth(forged,{type:'bearer'}).expect(401);
  await models.User.updateOne({_id:record.id},{$set:{status:'suspended'}});
  await request(app).get('/api/auth/me').auth(session.accessToken,{type:'bearer'}).expect(403);
  await request(app).post('/api/auth/refresh').send({refreshToken:session.refreshToken}).expect(403);
});

test('untrusted uploads and camera-source violations are rejected',async()=>{
  const {token}=await registration();
  await request(app).post('/api/upload').auth(token,{type:'bearer'}).field('purpose','face_capture').field('source','file').attach('file',png,{filename:'face.png',contentType:'image/png'}).expect(400);
  await request(app).post('/api/upload').auth(token,{type:'bearer'}).field('purpose','proof_of_residency').field('source','file').attach('file',Buffer.from('<script>alert(1)</script>'),{filename:'fake.png',contentType:'image/png'}).expect(400);
  await request(app).post('/api/upload').auth(token,{type:'bearer'}).field('purpose','proof_of_residency').field('source','file').attach('file',Buffer.from('%PDF-1.4\n/JavaScript (evil)\n%%EOF'),{filename:'active.pdf',contentType:'application/pdf'}).expect(400);
  await request(app).post('/api/upload').auth(token,{type:'bearer'}).field('purpose','credential').field('source','file').attach('file',png,{filename:'credential.png',contentType:'image/png'}).expect(403);
});

test('documents from another registration session cannot be attached to an account',async()=>{
  const first=await registration();const second=await registration();
  const proofOfResidencyId=await first.upload('proof_of_residency');
  const faceCaptureId=await first.upload('face_capture','camera');
  const email='wrong-owner@tests.invalid';
  await request(app).post('/api/auth/register/user').send({...profile(email),registrationToken:second.token,proofOfResidencyId,faceCaptureId}).expect(400);
  assert.equal(await models.User.countDocuments({email}),0);
  // The failed transaction must also release the registration session.
  await second.upload('proof_of_residency');
});

test('response photos require the assigned responder and remain private',async()=>{
  const owner=await fixture();const assigned=await fixture('responder');const unrelated=await fixture('responder');
  const assignedSession=await signIn(assigned.email,'responder');const unrelatedSession=await signIn(unrelated.email,'responder');
  const {default:Emergency}=await import('../src/models/Emergency.ts');
  const emergency=await Emergency.create({userId:owner.record.id,assignedResponderId:assigned.record.id,type:'medical',source:'mobile_app',status:'assigned',coverageArea:'test town',location:{lat:14,lng:121,accuracyMeters:5,capturedAt:new Date()},currentLocation:{type:'Point',coordinates:[121,14]},idempotencyKey:randomUUID(),requestHash:'test-response-photo'});
  const upload=(token:string)=>request(app).post('/api/upload/response-photo').auth(token,{type:'bearer'}).field('emergencyId',emergency.id).attach('file',png,{filename:'response.png',contentType:'image/png'});
  await upload(unrelatedSession.accessToken).expect(404);
  const response=await upload(assignedSession.accessToken).expect(201);
  const id=response.body.data.id;
  const file=await models.File.findById(id);
  assert.equal(String(file.emergencyId),emergency.id);assert.equal(file.ownerId,assigned.record.id);assert.equal(file.purpose,'response_photo');
  await request(app).get('/api/upload/'+id).auth(unrelatedSession.accessToken,{type:'bearer'}).expect(404);
  await request(app).get('/api/upload/'+id).auth(assignedSession.accessToken,{type:'bearer'}).expect(200);
  await Emergency.updateOne({_id:emergency.id},{$set:{status:'resolved'}});
  await upload(assignedSession.accessToken).expect(404);
});

test('responder registration requires credential evidence and supports independent admin review',async()=>{
  const {token,upload}=await registration('responder');
  const proofOfResidencyId=await upload('proof_of_residency');const faceCaptureId=await upload('face_capture','camera');const credentialId=await upload('credential');
  const email='responder-onboarding@tests.invalid';
  const response=await request(app).post('/api/auth/register/responder').send({...profile(email),registrationToken:token,proofOfResidencyId,faceCaptureId,credentialId,agencyType:'medical',departmentName:'Test EMS',responderRole:'Paramedic'}).expect(201);
  assert.equal(response.body.data.role,'responder');assert.equal(response.body.data.status,'pending');
  const id=response.body.data.id;
  await request(app).post('/api/admin/registrations/'+id+'/approve').auth(adminAccess,{type:'bearer'}).send({type:'responder'}).expect(200);
  await signIn(email,'responder');
});

test('NoSQL operators, forged role registration, impossible dates, and account lockout are rejected',async()=>{
  await request(app).post('/api/auth/login').send({email:{$ne:null},password,role:'admin'}).expect(400);
  await request(app).post('/api/auth/registration-session').send({role:'admin'}).expect(400);
  await request(app).post('/api/auth/register/user').send({...profile('invalid-date@tests.invalid'),dateOfBirth:'1995-02-31',registrationToken:'x'.repeat(64),proofOfResidencyId:'a'.repeat(24),faceCaptureId:'b'.repeat(24)}).expect(400);
  for(let index=0;index<5;index++) await request(app).post('/api/auth/login').send({email:'lockout@tests.invalid',password:'incorrect',role:'user'}).expect(401);
  const limited=await request(app).post('/api/auth/login').set('x-request-id','rate-limit-request').send({email:'lockout@tests.invalid',password:'incorrect',role:'user'}).expect(429);
  assert.equal(limited.body.error.code,'RATE_LIMITED');assert.equal(limited.body.requestId,'rate-limit-request');
  const {calculateAge}=await import('../src/services/identity.ts');
  assert.equal(calculateAge(new Date('2000-09-11'),new Date('2026-09-10')),25);
  assert.equal(calculateAge(new Date('2000-09-10'),new Date('2026-09-10')),26);
});

test('refresh budget follows the account across rotations and does not prevent logout',async()=>{
  const {email}=await fixture();let session=await signIn(email);
  for(let count=0;count<30;count++){
    const rotated=await request(app).post('/api/auth/refresh').send({refreshToken:session.refreshToken}).expect(200);
    session=rotated.body.data;
  }
  const limited=await request(app).post('/api/auth/refresh').set('x-request-id','rotated-account-limit').send({refreshToken:session.refreshToken}).expect(429);
  assert.equal(limited.body.requestId,'rotated-account-limit');
  const other=await fixture();const unrelated=await signIn(other.email);
  await request(app).post('/api/auth/refresh').send({refreshToken:unrelated.refreshToken}).expect(200);
  await request(app).post('/api/auth/logout').send({refreshToken:session.refreshToken}).expect(200);
  await request(app).get('/api/auth/me').auth(session.accessToken,{type:'bearer'}).expect(401);
});

test('review push retries transient failures, delivers rejection, and discards invalid tokens',async()=>{
  const {record}=await fixture('responder','pending');
  await models.Responder.updateOne({_id:record.id},{$set:{pushToken:'retry-registration-test-token',registrationPushDeviceId:randomUUID(),registrationPushPlatform:'android'}});
  await request(app).post('/api/admin/registrations/'+record.id+'/reject').auth(adminAccess,{type:'bearer'}).send({type:'responder',reason:'Credential needs verification.'}).expect(200);
  const {deliverRegistrationPush}=await import('../src/services/registrationNotifications.ts');
  process.env.FCM_ENABLED='true';
  try{
    await deliverRegistrationPush(async()=>{throw Object.assign(new Error('A simulated provider failure'),{code:'messaging/internal-error'});});
    let job=await models.RegistrationJob.findOne({accountId:record.id});
    assert.equal(job.status,'pending');assert.equal(job.attempts,1);assert.ok(job.nextAttemptAt>new Date());
    await models.RegistrationJob.updateOne({_id:job._id},{$set:{nextAttemptAt:new Date(0)}});
    let message:any;
    await deliverRegistrationPush(async(payload)=>{message=payload;return 'rejection-test-message';});
    job=await models.RegistrationJob.findById(job._id);
    assert.equal(job.status,'sent');assert.equal(job.attempts,2);assert.equal(message.data.role,'responder');
    const invalid=await fixture('user','pending');
    const evidence=await models.File.create(['proof_of_residency','face_capture'].map(purpose=>({ownerId:invalid.record.id,ownerRole:'user',purpose,source:'camera',mimeType:'image/png',size:png.length,data:png,sha256:'fixture'})));
    await models.User.updateOne({_id:invalid.record.id},{$set:{proofOfResidencyId:evidence[0]._id,faceCaptureId:evidence[1]._id}});
    await models.User.updateOne({_id:invalid.record.id},{$set:{pushToken:'invalid-registration-test-token'}});
    await request(app).post('/api/admin/registrations/'+invalid.record.id+'/approve').auth(adminAccess,{type:'bearer'}).send({type:'user'}).expect(200);
    await deliverRegistrationPush(async()=>{throw Object.assign(new Error('Invalid token'),{code:'messaging/registration-token-not-registered'});});
    const failed=await models.RegistrationJob.findOne({accountId:invalid.record.id}).select('+token');
    assert.equal(failed.status,'failed');assert.equal(failed.token,undefined);
    assert.equal((await models.User.findById(invalid.record.id).select('+pushToken')).pushToken,undefined);
  } finally {process.env.FCM_ENABLED='false';}
});
