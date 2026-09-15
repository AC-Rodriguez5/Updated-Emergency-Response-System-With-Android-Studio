import mongoose, { Schema } from 'mongoose';
import { geoLocationSchema } from './Emergency.ts';
const schema = new Schema({ responderId: { type: String, required: true, unique: true }, location: { type: geoLocationSchema, required: true }, lastSeenAt: { type: Date, required: true } }, { timestamps: true });
export default mongoose.model('ResponderPosition', schema);
