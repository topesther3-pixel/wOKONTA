import { supabase } from './supabase';
import { Transaction, Debt, UserProfile } from './types';

/**
 * LOGIN FUNCTION
 * Simple admin and user login for demo purposes.
 */
export async function login(phone: string, pin: string): Promise<{ success: boolean; user?: UserProfile; message?: string }> {
  console.log(`Attempting login for: ${phone}`);
  
  // ADMIN LOGIN
  if (phone === "0240000000" && pin === "1234") {
    const adminUser: UserProfile = {
      id: 'admin-id',
      phone: phone,
      pin: pin,
      role: "admin"
    };

    localStorage.setItem("user", JSON.stringify(adminUser));
    return { success: true, user: adminUser };
  }

  // NORMAL USER (Instant login for demo)
  // We can still try to find them in Supabase, but for "Instant Login" as requested:
  const normalUser: UserProfile = {
    id: `user-${phone}`,
    phone: phone,
    pin: pin,
    role: "user"
  };

  localStorage.setItem("user", JSON.stringify(normalUser));
  return { success: true, user: normalUser };
}

/**
 * CHECK ADMIN
 * Helper to check if current user is admin.
 */
export function isAdmin() {
  const user = getCurrentUser();
  return user?.role === "admin";
}

/**
 * GET CURRENT USER
 * Retrieves user from localStorage.
 */
export function getCurrentUser(): UserProfile | null {
  const userStr = localStorage.getItem('user');
  if (!userStr) return null;
  try {
    return JSON.parse(userStr);
  } catch (e) {
    return null;
  }
}

/**
 * LOGOUT
 * Clears user from localStorage.
 */
export function logout() {
  localStorage.removeItem('user');
}

/**
 * SAVE TRANSACTION
 * Saves a new transaction to Supabase instantly.
 */
export async function saveTransaction(type: 'income' | 'expense', amount: number, item: string = '') {
  const user = getCurrentUser();
  if (!user) return { success: false, error: "User not logged in" };

  console.log(`Saving ${type}: GHS ${amount} - ${item}`);
  
  const { data, error } = await supabase
    .from('transactions')
    .insert([{ 
      type, 
      amount, 
      item,
      user_id: user.id,
      created_at: new Date().toISOString()
    }])
    .select();

  if (error) {
    console.error("Save Transaction Error:", error);
    return { success: false, error };
  }
  
  console.log("Transaction saved successfully:", data);
  return { success: true, data };
}

/**
 * FETCH TRANSACTIONS
 * Retrieves all transactions for the current user from Supabase.
 */
export async function getTransactions() {
  const user = getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('transactions')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  if (error) {
    console.error("Fetch Transactions Error:", error);
    return [];
  }
  
  return data || [];
}

/**
 * CALCULATE PROFIT
 * Fetches transactions and calculates the net profit.
 */
export async function getProfit() {
  const data = await getTransactions();

  let income = 0;
  let expense = 0;

  data?.forEach((t: any) => {
    if (t.type === 'income') income += Number(t.amount);
    if (t.type === 'expense') expense += Number(t.amount);
  });

  return income - expense;
}

/**
 * SAVE DEBT
 * Saves a new debt to Supabase.
 */
export async function saveDebt(name: string, amount: number) {
  const user = getCurrentUser();
  if (!user) return { success: false, error: "User not logged in" };

  console.log(`Saving Debt: ${name} - GHS ${amount}`);
  
  const { data, error } = await supabase
    .from('debts')
    .insert([{ 
      name, 
      amount, 
      user_id: user.id,
      status: 'unpaid',
      paid_amount: 0,
      created_at: new Date().toISOString()
    }])
    .select();

  if (error) {
    console.error("Save Debt Error:", error);
    return { success: false, error };
  }
  
  console.log("Debt saved successfully:", data);
  return { success: true, data };
}

/**
 * FETCH DEBTS
 * Retrieves all debts for the current user from Supabase.
 */
export async function getDebts() {
  const user = getCurrentUser();
  if (!user) return [];

  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false });

  return data || [];
}

/**
 * DELETE TRANSACTION
 * Removes a transaction from Supabase.
 */
export async function deleteTransaction(id: string) {
  const { error } = await supabase
    .from('transactions')
    .delete()
    .eq('id', id);

  if (error) {
    console.error("Delete Transaction Error:", error);
    return { success: false, error };
  }
  
  return { success: true };
}

/**
 * UPDATE DEBT
 * Updates a debt record in Supabase.
 */
export async function updateDebt(id: string, updates: any) {
  const { error } = await supabase
    .from('debts')
    .update({
      ...updates,
      updated_at: new Date().toISOString()
    })
    .eq('id', id);

  if (error) {
    console.error("Update Debt Error:", error);
    return { success: false, error };
  }
  
  return { success: true };
}
