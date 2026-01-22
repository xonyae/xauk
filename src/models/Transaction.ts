import mongoose, { Document, Schema } from 'mongoose';

export interface ITransaction extends Document {
  user_id: mongoose.Types.ObjectId;
  type: 'bid_placed' | 'bid_refunded' | 'prize_won' | 'balance_added';
  amount: number;
  auction_id: mongoose.Types.ObjectId | null;
  bid_id: mongoose.Types.ObjectId | null;
  created_at: Date;
}

const transactionSchema = new Schema<ITransaction>({
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  type: { type: String, enum: ['bid_placed', 'bid_refunded', 'prize_won', 'balance_added'], required: true },
  amount: { type: Number, required: true },
  auction_id: { type: Schema.Types.ObjectId, ref: 'Auction', default: null },
  bid_id: { type: Schema.Types.ObjectId, ref: 'Bid', default: null },
  created_at: { type: Date, default: Date.now }
});

export const TransactionModel = mongoose.model<ITransaction>('Transaction', transactionSchema);
