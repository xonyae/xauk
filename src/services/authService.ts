import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';
import { UserModel, IUser } from '../models/User';

const JWT_SECRET = process.env.JWT_SECRET || 'your-secret-key';
const JWT_EXPIRES_IN = process.env.JWT_EXPIRES_IN || '7d';

export class AuthService {
  async register(username: string, password: string, role: 'user' | 'judge' | 'admin' = 'user'): Promise<{ user: IUser; token: string }> {
    const existingUser = await UserModel.findOne({ username });

    if (existingUser) {
      throw new Error('Username already exists');
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const user = await UserModel.create({
      username,
      password: hashedPassword,
      role,
      balance: 10000
    });

    const token = this.generateToken(user);
    return { user, token };
  }

  async login(username: string, password: string): Promise<{ user: IUser; token: string }> {
    const user = await UserModel.findOne({ username });

    if (!user) {
      throw new Error('Invalid credentials');
    }

    const isValidPassword = await bcrypt.compare(password, user.password);
    if (!isValidPassword) {
      throw new Error('Invalid credentials');
    }

    const token = this.generateToken(user);
    return { user, token };
  }

  generateToken(user: IUser): string {
    const payload = {
      id: user._id.toString(),
      username: user.username,
      role: user.role
    };
    return jwt.sign(payload, JWT_SECRET, { expiresIn: JWT_EXPIRES_IN } as any);
  }

  verifyToken(token: string): any {
    try {
      return jwt.verify(token, JWT_SECRET);
    } catch (error) {
      throw new Error('Invalid token');
    }
  }
}

export const authService = new AuthService();
