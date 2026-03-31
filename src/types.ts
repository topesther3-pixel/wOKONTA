export type TransactionType = 'income' | 'expense';
export type ExpenseCategory = 'business' | 'personal';
export type DebtStatus = 'unpaid' | 'partial' | 'paid';

export interface Transaction {
  id?: string;
  user_id: string;
  type: TransactionType;
  category?: ExpenseCategory;
  amount: number;
  item?: string;
  quantity?: number;
  unit?: string;
  imageUrl?: string;
  createdAt: any; // Firestore Timestamp
}

export interface Debt {
  id?: string;
  user_id: string;
  name: string;
  amount: number;
  paidAmount: number;
  status: DebtStatus;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}

export interface UserProfile {
  id: string;
  phone: string;
  pin: string;
  role?: 'admin' | 'user';
  is_setup_complete?: boolean;
  created_at?: string;
}

export interface ParsedTransaction {
  type: TransactionType;
  item?: string;
  quantity?: number;
  unit?: string;
  amount: number;
  category?: ExpenseCategory;
  isDebt?: boolean;
  debtorName?: string;
  language?: string; // Detected language
  response?: string; // Translated response in user's language
}
