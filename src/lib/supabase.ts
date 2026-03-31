import { createClient } from '@supabase/supabase-js';

const SUPABASE_URL = "https://jpdizrhwosgjawvsbixi.supabase.co";
const SUPABASE_ANON_KEY = "sb_publishable_5G2me6cxYDMg6WXPZMKw6Q_0qGa7uIK";

export const supabase = createClient(SUPABASE_URL, SUPABASE_ANON_KEY);

export const testSupabaseConnection = async () => {
  console.log("Testing Supabase connection...");
  try {
    // Check transactions table
    const { error: txError } = await supabase.from('transactions').select('id').limit(1);
    if (txError) {
      console.error("Supabase Connection Test Failed (transactions):", txError.message);
      return { success: false, error: `Table 'transactions' missing or inaccessible: ${txError.message}` };
    }

    // Check debts table
    const { error: debtError } = await supabase.from('debts').select('id').limit(1);
    if (debtError) {
      console.error("Supabase Connection Test Failed (debts):", debtError.message);
      return { success: false, error: `Table 'debts' missing or inaccessible: ${debtError.message}` };
    }

    // Check users table
    const { error: userError } = await supabase.from('users').select('uid').limit(1);
    if (userError) {
      console.error("Supabase Connection Test Failed (users):", userError.message);
      return { success: false, error: `Table 'users' missing or inaccessible: ${userError.message}` };
    }

    console.log("Supabase Connection Test Succeeded!");
    return { success: true };
  } catch (err: any) {
    console.error("Supabase Connection Test Exception:", err.message);
    return { success: false, error: err.message };
  }
};
