/** Explicit maintenance command, never part of application startup in production. */
import mongoose from 'mongoose';
const uri=process.env.MIGRATION_URI;if(!uri)throw new Error('Set MIGRATION_URI to the restored backup explicitly.');
const apply=process.argv.includes('--apply');if(apply&&process.env.MIGRATION_ALLOW_WRITES!=='backup-verified')throw new Error('Index writes require backup verification.');
async function main(){
  await mongoose.connect(uri!,{autoIndex:false});
  await Promise.all([import('../models/User.ts'),import('../models/Responder.ts'),import('../models/AdminUser.ts'),import('../models/Emergency.ts'),import('../models/LocationSample.ts'),import('../models/ResponderPosition.ts'),import('../models/RefreshToken.ts'),import('../models/AuditLog.ts'),import('../models/BleDevice.ts'),import('../models/UploadedFile.ts'),import('../models/RegistrationSession.ts'),import('../models/NotificationJob.ts'),import('../models/PushDevice.ts'),import('../models/RegistrationNotificationJob.ts'),import('../models/ClientDiagnostic.ts')]);
  for(const model of Object.values(mongoose.models)){
    const existing=await model.collection.indexes().catch(()=>[]);
    const legacy=model.modelName==='Emergency'&&existing.some(index=>index.name==='idempotencyKey_1');
    console.info(JSON.stringify({model:model.modelName,required:model.schema.indexes(),existing:existing.map(index=>index.name),removeLegacyGlobalIdempotencyIndex:legacy}));
    if(apply){if(legacy)await model.collection.dropIndex('idempotencyKey_1');await model.createIndexes();}
  }
}
void main().catch(()=>{console.error('Index review failed. Check connectivity and duplicate records before retrying.');process.exitCode=1;}).finally(()=>mongoose.disconnect());


