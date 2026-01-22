import mongoose, { Document, Schema } from 'mongoose';

export interface IBank extends Document {
  total_collected: number;
  last_updated: Date;
}

export interface IBankTransaction extends Document {
  auction_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  round: number;
  amount: number;
  type: 'collected' | 'withdrawn';
  created_at: Date;
}

const bankSchema = new Schema<IBank>({
  total_collected: { type: Number, default: 0 },
  last_updated: { type: Date, default: Date.now }
});

const bankTransactionSchema = new Schema<IBankTransaction>({
  auction_id: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  round: { type: Number, required: true },
  amount: { type: Number, required: true },
  type: { type: String, enum: ['collected', 'withdrawn'], required: true },
  created_at: { type: Date, default: Date.now }
});

export const BankModel = mongoose.model<IBank>('Bank', bankSchema);
export const BankTransactionModel = mongoose.model<IBankTransaction>('BankTransaction', bankTransactionSchema);
