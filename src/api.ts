import { supabase } from './supabase';
import { Transaction, Debt } from './types';

/**
 * SAVE TRANSACTION
 * Saves a new transaction to Supabase instantly.
 */
export async function saveTransaction(type: 'income' | 'expense', amount: number, item: string = '', user_id?: string) {
  console.log(`Saving ${type}: GHS ${amount} - ${item}`);
  
  const { data, error } = await supabase
    .from('transactions')
    .insert([{ 
      type, 
      amount, 
      item,
      user_id: user_id || null,
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
 * Retrieves all transactions from Supabase.
 */
export async function getTransactions() {
  const { data, error } = await supabase
    .from('transactions')
    .select('*')
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
export async function saveDebt(name: string, amount: number, user_id?: string) {
  console.log(`Saving Debt: ${name} - GHS ${amount}`);
  
  const { data, error } = await supabase
    .from('debts')
    .insert([{ 
      name, 
      amount, 
      user_id: user_id || null,
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
 * Retrieves all debts from Supabase.
 */
export async function getDebts() {
  const { data, error } = await supabase
    .from('debts')
    .select('*')
    .order('created_at', { ascending: false });

  return data || [];
}

/**
 * SAVE USER
 * Upserts user profile to Supabase.
 */
export async function saveUser(id: string, phoneNumber: string) {
  const { error } = await supabase
    .from('users')
    .upsert([
      { 
        id, 
        phone_number: phoneNumber, 
        is_setup_complete: true,
        created_at: new Date().toISOString()
      }
    ]);

  return { success: true };
}

/**
 * FETCH USERS
 * Retrieves all users from Supabase.
 */
export async function getUsers() {
  const { data, error } = await supabase
    .from('users')
    .select('*');

  if (error) {
    console.error("Fetch Users Error:", error);
    return [];
  }
  
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
