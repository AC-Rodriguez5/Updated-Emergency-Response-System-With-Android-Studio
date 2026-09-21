import dotenv from 'dotenv';
import mongoose from 'mongoose';

dotenv.config();

const uri = process.env.MONGODB_URI;
if (!uri) throw new Error('MONGODB_URI is required');

await mongoose.connect(uri, { autoIndex: false });
try {
  const devices = mongoose.connection.collection('bledevices');
  const duplicates = await devices
    .aggregate<{ _id: string; owners: string[]; count: number }>([
      {
        $group: {
          _id: '$deviceId',
          owners: { $addToSet: { $toString: '$userId' } },
          count: { $sum: 1 },
        },
      },
      { $match: { count: { $gt: 1 } } },
    ])
    .toArray();
  const total = await devices.countDocuments();
  const legacy = await devices.countDocuments({ hardwareProfile: { $exists: false } });

  console.log(
    JSON.stringify(
      { totalDevices: total, legacyDevices: legacy, duplicateDeviceIds: duplicates },
      null,
      2,
    ),
  );
  if (duplicates.length) {
    throw new Error(
      'Duplicate device IDs must be resolved on a restored backup before creating the global unique index.',
    );
  }
} finally {
  await mongoose.disconnect();
}
