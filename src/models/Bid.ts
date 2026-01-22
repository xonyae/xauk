import mongoose, { Document, Schema } from 'mongoose';

export interface IBid extends Document {
  auction_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  amount: number;
  round: number;
  is_bot: boolean;
  timestamp: Date;
  timestamp_microseconds: number;
  status: 'pending' | 'won' | 'refunded' | 'replaced' | 'collected';
  idempotency_key?: string;
}

const bidSchema = new Schema<IBid>({
  auction_id: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  amount: { type: Number, required: true },
  round: { type: Number, required: true },
  is_bot: { type: Boolean, default: false },
  timestamp: { type: Date, default: Date.now },
  timestamp_microseconds: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'won', 'refunded', 'replaced', 'collected'], default: 'pending' },
  idempotency_key: { type: String, sparse: true, unique: true }
});

export const BidModel = mongoose.model<IBid>('Bid', bidSchema);
