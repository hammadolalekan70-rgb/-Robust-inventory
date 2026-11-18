import mongoose from 'mongoose';
import { config } from '../config/env.js';
import { logger } from '../lib/logger.js';

mongoose.set('strictQuery', true);

export async function connectDB(uri = config.mongoUri) {
  await mongoose.connect(uri, {
    serverSelectionTimeoutMS: 10000,
    maxPoolSize: 20
  });
  logger.info(`MongoDB connected: ${uri.replace(/\/\/[^@]*@/, '//***@')}`);
  return mongoose.connection;
}

export async function disconnectDB() {
  await mongoose.disconnect();
}
