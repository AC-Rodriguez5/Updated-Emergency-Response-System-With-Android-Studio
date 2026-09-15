/** Deliberately does not load .env. Run against a restored backup first. */
import { mongo } from 'mongoose';
type Document = mongo.Document;
import { createHash } from 'node:crypto';
const uri=process.env.MIGRATION_URI;
if(!uri)throw new Error('Set MIGRATION_URI explicitly to a restored backup. Operational .env is not loaded.');
const apply=process.argv.includes('--apply');
if(apply&&process.env.MIGRATION_ALLOW_WRITES!=='backup-verified')throw new Error('Apply requires MIGRATION_ALLOW_WRITES=backup-verified after reviewing a backup and dry-run report.');
const client=new mongo.MongoClient(uri);
const statusMap:Record<string,string>={sent:'pending',awaitingResponder:'pending',pending:'pending',responding:'responder_on_the_way',responderAssigned:'assigned',assigned:'assigned',responderOnTheWay:'responder_on_the_way',responderNearby:'responder_nearby',responseSubmitted:'responder_report_submitted',resolved:'resolved',cancelled:'cancelled',false_alarm:'false_alarm',responder_on_the_way:'responder_on_the_way',responder_nearby:'responder_nearby',responder_report_submitted:'responder_report_submitted'};
type Change={collection:string;id:unknown;values:Document};
async function main(){
  await client.connect();const db=client.db();const changes:Change[]=[];const issues:{collection:string;id:string;reason:string}[]=[];
  for(const collection of ['users','responders'])for await(const record of db.collection(collection).find({})){
    const values:Document={};
    if(!record.coverageArea)issues.push({collection,id:String(record._id),reason:'Explicit municipality/coverageArea must be supplied before migration.'});
    if(!record.passwordHash){if(typeof record.password==='string'&&/^\$2[aby]\$\d\d\$/.test(record.password))values.passwordHash=record.password;else issues.push({collection,id:String(record._id),reason:'No recognized password hash. Require account recovery.'});}
    if(!record.status)values.status='pending';
    if(Object.keys(values).length)changes.push({collection,id:record._id,values});
  }
  for(const collection of ['alerts','emergencies'])for await(const record of db.collection(collection).find({})){
    if(collection==='emergencies'&&record.requestHash&&record.location&&statusMap[record.status]===record.status)continue;
    if(collection==='alerts'&&await db.collection('emergencies').findOne({_id:record._id}))continue;
    const owner=await db.collection('users').findOne({_id:record.userId});
    const lat=record.location?.lat??record.location?.latitude??record.currentLocation?.coordinates?.[1];
    const lng=record.location?.lng??record.location?.longitude??record.currentLocation?.coordinates?.[0];
    if(!owner?.coverageArea||!record.userId||!Number.isFinite(lat)||!Number.isFinite(lng)||Math.abs(lat)>90||Math.abs(lng)>180||!statusMap[record.status]){issues.push({collection,id:String(record._id),reason:'Cannot map owner, coverage, coordinates, or status without manual review.'});continue;}
    const status=statusMap[record.status],createdAt=record.createdAt||new Date();
    const values={...record,type:['medical','crime','fire','general_sos'].includes(record.type)?record.type:'general_sos',status,userId:record.userId,assignedResponderId:record.assignedResponderId||record.responderId,coverageArea:owner.coverageArea,source:record.source==='iot_ble'?'iot_ble':'mobile_app',location:{lat,lng,accuracyMeters:record.location?.accuracyMeters??record.location?.accuracy??5000,capturedAt:record.location?.capturedAt||record.updatedAt||createdAt},currentLocation:{type:'Point',coordinates:[lng,lat]},idempotencyKey:record.idempotencyKey||`migration-${record._id}`,requestHash:createHash('sha256').update(`migration-${record._id}`).digest('hex'),timeline:record.timeline?.length?record.timeline:[{id:`migration-${record._id}`,name:'migration.imported',actorRole:'system',actorId:'migration',at:new Date(),to:status}],outbox:[],createdAt,updatedAt:record.updatedAt||createdAt,migrationMetadata:{collection,legacyType:record.type,legacyStatus:record.status,migratedAt:new Date()}};
    delete (values as Document)._id;changes.push({collection:'emergencies',id:record._id,values});
  }
  console.info(JSON.stringify({mode:apply?'apply':'dry-run',plannedUpdates:changes.length,issues},null,2));
  if(issues.length){process.exitCode=1;return;}
  if(apply)for(const change of changes)await db.collection(change.collection).updateOne({_id:change.id} as Document,{$set:change.values},{upsert:change.collection==='emergencies'});
  if(apply)console.info('Migration applied without deleting source collections. Verify counts, associations and authentication before cutover.');
}
void main().catch(()=>{console.error('Migration failed. Inspect the backup and database access; configuration values are intentionally omitted.');process.exitCode=1;}).finally(()=>client.close());
