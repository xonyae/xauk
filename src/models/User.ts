import mongoose, { Document, Schema } from 'mongoose';

export interface IUser extends Document {
  username: string;
  password: string;
  role: 'user' | 'judge' | 'admin';
  balance: number;
  created_at: Date;
}

const userSchema = new Schema<IUser>({
  username: { type: String, required: true, unique: true },
  password: { type: String, required: true },
  role: { type: String, enum: ['user', 'judge', 'admin'], default: 'user' },
  balance: { type: Number, default: 10000 },
  created_at: { type: Date, default: Date.now }
});

export const UserModel = mongoose.model<IUser>('User', userSchema);
