import mongoose,{Schema} from 'mongoose';
const schema=new Schema({accountId:{type:String,required:true},role:{type:String,required:true},eventId:{type:String,required:true},platform:{type:String,required:true},code:{type:String,required:true},frames:[String],fatal:Boolean,capturedAt:Date,expiresAt:{type:Date,default:()=>new Date(Date.now()+30*86400000),index:{expires:0}}},{timestamps:true});
schema.index({accountId:1,eventId:1},{unique:true});
schema.index({createdAt:-1,fatal:1});
export default mongoose.model('ClientDiagnostic',schema);
