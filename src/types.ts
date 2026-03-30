export type TransactionType = 'income' | 'expense';
export type ExpenseCategory = 'business' | 'personal';
export type DebtStatus = 'unpaid' | 'partial' | 'paid';

export interface Transaction {
  id?: string;
  uid: string;
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
  uid: string;
  name: string;
  amount: number;
  paidAmount: number;
  status: DebtStatus;
  createdAt: any; // Firestore Timestamp
  updatedAt: any; // Firestore Timestamp
}

export interface UserProfile {
  uid: string;
  displayName?: string;
  phoneNumber?: string;
  language?: string;
  pinHash?: string;
  isSetupComplete?: boolean;
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
}
