import mongoose, { Document, Schema } from 'mongoose';

export interface IAuction extends Document {
  title: string;
  description: string;
  rounds: number;
  round_duration: number;
  winners_per_round: number;
  prizes: string[];
  min_bid: number;
  status: 'pending' | 'active' | 'completed';
  current_round: number;
  round_start_time: Date | null;
  round_end_time: Date | null;
  created_by: mongoose.Types.ObjectId;
  created_at: Date;
  anti_sniping_enabled: boolean;
  anti_sniping_threshold_minutes: number;
  anti_sniping_step_multiplier: number;
}

const auctionSchema = new Schema<IAuction>({
  title: { type: String, required: true },
  description: { type: String, required: true },
  rounds: { type: Number, required: true },
  round_duration: { type: Number, required: true },
  winners_per_round: { type: Number, required: true },
  prizes: { type: [String], required: true },
  min_bid: { type: Number, required: true },
  status: { type: String, enum: ['pending', 'active', 'completed'], default: 'pending' },
  current_round: { type: Number, default: 0 },
  round_start_time: { type: Date, default: null },
  round_end_time: { type: Date, default: null },
  created_by: { type: Schema.Types.ObjectId, ref: 'User', required: true },
  created_at: { type: Date, default: Date.now },
  anti_sniping_enabled: { type: Boolean, default: false },
  anti_sniping_threshold_minutes: { type: Number, default: 5 },
  anti_sniping_step_multiplier: { type: Number, default: 1.5 }
});

auctionSchema.set('toJSON', {
  virtuals: true,
  transform: (doc, ret: any) => {
    ret.id = ret._id;
    ret.roundDuration = ret.round_duration;
    ret.winnersPerRound = ret.winners_per_round;
    ret.minBid = ret.min_bid;
    ret.currentRound = ret.current_round;
    ret.roundStartTime = ret.round_start_time;
    ret.roundEndTime = ret.round_end_time;
    ret.antiSnipingEnabled = ret.anti_sniping_enabled;
    ret.antiSnipingThresholdMinutes = ret.anti_sniping_threshold_minutes;
    ret.antiSnipingStepMultiplier = ret.anti_sniping_step_multiplier;
    delete ret._id;
    delete ret.round_duration;
    delete ret.winners_per_round;
    delete ret.min_bid;
    delete ret.current_round;
    delete ret.round_start_time;
    delete ret.round_end_time;
    delete ret.anti_sniping_enabled;
    delete ret.anti_sniping_threshold_minutes;
    delete ret.anti_sniping_step_multiplier;
    delete ret.__v;
    return ret;
  }
});

export const AuctionModel = mongoose.model<IAuction>('Auction', auctionSchema);
