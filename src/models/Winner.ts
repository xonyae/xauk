import mongoose, { Document, Schema } from 'mongoose';

export interface IWinner extends Document {
  auction_id: mongoose.Types.ObjectId;
  user_id: mongoose.Types.ObjectId;
  round: number;
  rank: number;
  prize: string;
  winning_bid: number;
  total_bid: number;
  created_at: Date;
}

const winnerSchema = new Schema<IWinner>({
  auction_id: { type: Schema.Types.ObjectId, ref: 'Auction', required: true },
  user_id: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  round: { type: Number, required: true },
  rank: { type: Number, required: true },
  prize: { type: String, required: true },
  winning_bid: { type: Number, required: true },
  total_bid: { type: Number, required: true },
  created_at: { type: Date, default: Date.now }
});

export const WinnerModel = mongoose.model<IWinner>('Winner', winnerSchema);
