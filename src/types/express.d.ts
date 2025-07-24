import { UserModel } from '../db/users';
import { Document } from 'mongoose';

export type UserDocument = Document & typeof UserModel.prototype;

declare global {
  namespace Express {
    interface Request {
      identity?: UserDocument;
    }
  }
} 