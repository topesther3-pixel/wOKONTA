/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, useRef } from 'react';
import { 
  auth, db, storage, googleProvider, signInWithPopup, signOut, onAuthStateChanged,
  collection, doc, getDoc, setDoc, updateDoc, deleteDoc, onSnapshot, query, where, orderBy, limit,
  ref, uploadBytes, getDownloadURL, RecaptchaVerifier, signInWithPhoneNumber
} from './firebase';
import { supabase, testSupabaseConnection } from './supabase';
import { 
  saveTransaction as apiSaveTransaction, 
  saveDebt as apiSaveDebt, 
  getTransactions, 
  getDebts as apiGetDebts, 
  getProfit,
  saveUser as apiSaveUser,
  deleteTransaction as apiDeleteTransaction,
  updateDebt as apiUpdateDebt,
  getUsers
} from './api';
import { Transaction, Debt, UserProfile, ParsedTransaction } from './types';
import { parseTransaction, getAkosuaAdvice, cleanSpeechInput, speakText } from './services/geminiService';
import { cn } from './lib/utils';
import { Button } from './components/Button';
import { Card } from './components/Card';
import { PinInput } from './components/PinInput';
import { setupSpeechRecognition } from './voice';
import { 
  Mic, Camera, MessageCircle, Plus, Minus, Users, 
  CheckCircle2, AlertCircle, LogOut, User, 
  TrendingUp, TrendingDown, Wallet, X, Send, Loader2, Phone, Key, ArrowRight, RefreshCw,
  Play, Edit2, RotateCcw, Check
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import Markdown from 'react-markdown';

// --- Utils ---

async function hashPin(pin: string): Promise<string> {
  const msgUint8 = new TextEncoder().encode(pin);
  const hashBuffer = await crypto.subtle.digest('SHA-256', msgUint8);
  const hashArray = Array.from(new Uint8Array(hashBuffer));
  return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
}

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [isDemoMode, setIsDemoMode] = useState(false);
  const [language, setLanguage] = useState<string>('English');
  const [showWhatsApp, setShowWhatsApp] = useState(false);
  const [whatsAppMessages, setWhatsAppMessages] = useState<{sender: 'user' | 'system', text: string}[]>([]);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [pendingVoiceText, setPendingVoiceText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [isCleaning, setIsCleaning] = useState(false);
  const [isEditing, setIsEditing] = useState(false);
  const [showAkosua, setShowAkosua] = useState(false);
  const [akosuaMessage, setAkosuaMessage] = useState('');
  const [isAkosuaLoading, setIsAkosuaLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'debts' | 'history'>('home');
  const [showAddModal, setShowAddModal] = useState<'income' | 'expense' | 'debt' | null>(null);
  const [formData, setFormData] = useState({ amount: '', item: '', name: '' });

  // Admin State
  const [isAdminMode, setIsAdminMode] = useState(false);
  const [showAdminDashboard, setShowAdminDashboard] = useState(false);
  const [adminTab, setAdminTab] = useState<'analytics' | 'users' | 'transactions' | 'debts' | 'supabase'>('analytics');
  const [supabaseStatus, setSupabaseStatus] = useState<{ success: boolean; error?: string } | null>(null);
  const [adminSearch, setAdminSearch] = useState('');
  const [adminFilter, setAdminFilter] = useState<'all' | 'income' | 'expense'>('all');
  const [adminDateFilter, setAdminDateFilter] = useState('');
  const [allUsers, setAllUsers] = useState<any[]>([]);
  const [allTransactions, setAllTransactions] = useState<any[]>([]);
  const [allDebts, setAllDebts] = useState<any[]>([]);
  const [akosuaTapCount, setAkosuaTapCount] = useState(0);
  const [isAdminLogin, setIsAdminLogin] = useState(false);
  const [adminPin, setAdminPin] = useState('');

  // Auth State
  const [authState, setAuthState] = useState<'phone' | 'otp' | 'pin-setup' | 'pin-confirm' | 'pin-login'>('phone');
  const [phoneNumber, setPhoneNumber] = useState('');
  const [otp, setOtp] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [confirmationResult, setConfirmationResult] = useState<any>(null);
  const [authError, setAuthError] = useState('');
  const [isAuthLoading, setIsAuthLoading] = useState(false);
  const [isResettingPin, setIsResettingPin] = useState(false);

  // Auth Listener
  useEffect(() => {
    const checkConnection = async () => {
      const status = await testSupabaseConnection();
      setSupabaseStatus(status);
    };
    checkConnection();
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      if (u) {
        const docRef = doc(db, 'users', u.uid);
        const docSnap = await getDoc(docRef);
        if (docSnap.exists()) {
          const p = docSnap.data() as UserProfile;
          setProfile(p);
          if (p.isSetupComplete && !isResettingPin) {
            setAuthState('pin-login');
          } else {
            setAuthState('pin-setup');
          }
        } else {
          setAuthState('pin-setup');
        }
        setUser(u);
      } else {
        setUser(null);
        setProfile(null);
        setAuthState('phone');
        setIsPinVerified(false);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Data Listeners
  useEffect(() => {
    if (isDemoMode) {
      // Preload Demo Data
      const mockTransactions: Transaction[] = [
        { id: 'demo1', uid: 'demo', type: 'income', amount: 120, item: 'Tomato Sale', createdAt: { toDate: () => new Date() } as any },
        { id: 'demo2', uid: 'demo', type: 'expense', amount: 75, item: 'Transport', createdAt: { toDate: () => new Date() } as any },
      ];
      const mockDebts: Debt[] = [
        { id: 'debt1', uid: 'demo', name: 'Adjoa', amount: 20, paidAmount: 0, status: 'unpaid', createdAt: new Date(), updatedAt: new Date() },
        { id: 'debt2', uid: 'demo', name: 'Ama', amount: 15, paidAmount: 0, status: 'unpaid', createdAt: new Date(), updatedAt: new Date() },
      ];
      setTransactions(mockTransactions);
      setDebts(mockDebts);
      return;
    }

    if (!user || !isPinVerified) return;

    // Fetch from Supabase
    const fetchSupabaseData = async () => {
      try {
        const txData = await getTransactions();
        if (txData) {
          setTransactions(txData.map((t: any) => ({
            ...t,
            createdAt: { toDate: () => new Date(t.created_at) }
          } as Transaction)));
        }

        const debtData = await apiGetDebts();
        if (debtData) {
          setDebts(debtData.map((d: any) => ({
            ...d,
            createdAt: new Date(d.created_at),
            updatedAt: new Date(d.updated_at || d.created_at)
          } as Debt)));
        }
      } catch (err) {
        console.error("Supabase Fetch Error (General):", err);
      }
    };

    fetchSupabaseData();

    // Set up real-time subscriptions
    const txSubscription = supabase
      .channel('transactions-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'transactions' }, () => {
        fetchSupabaseData();
      })
      .subscribe();

    const debtSubscription = supabase
      .channel('debts-changes')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'debts' }, () => {
        fetchSupabaseData();
      })
      .subscribe();

    return () => {
      supabase.removeChannel(txSubscription);
      supabase.removeChannel(debtSubscription);
    };
  }, [user, isPinVerified, isDemoMode]);

  // Calculations
  const today = new Date().setHours(0, 0, 0, 0);
  const todayTransactions = transactions.filter(t => {
    const date = t.createdAt?.toDate ? t.createdAt.toDate() : new Date(t.createdAt);
    return date.getTime() >= today;
  });

  const todayIncome = todayTransactions.filter(t => t.type === 'income').reduce((acc, t) => acc + t.amount, 0);
  const todayExpense = todayTransactions.filter(t => t.type === 'expense').reduce((acc, t) => acc + t.amount, 0);
  const todayProfit = todayIncome - todayExpense;

  // --- Auth Handlers ---

  const handleSendOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);

    // Demo Mode
    if (phoneNumber === '0240000000') {
      setAuthState('pin-login');
      setIsAuthLoading(false);
      return;
    }

    try {
      const verifier = new RecaptchaVerifier(auth, 'recaptcha-container', {
        size: 'invisible'
      });
      // Format to international (Ghana +233)
      const formattedPhone = phoneNumber.startsWith('+') ? phoneNumber : `+233${phoneNumber.startsWith('0') ? phoneNumber.slice(1) : phoneNumber}`;
      const result = await signInWithPhoneNumber(auth, formattedPhone, verifier);
      setConfirmationResult(result);
      setAuthState('otp');
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handleVerifyOtp = async (e: React.FormEvent) => {
    e.preventDefault();
    setAuthError('');
    setIsAuthLoading(true);

    // Demo Mode
    if (phoneNumber === '0240000000' && otp === '123456') {
      // In a real app, we'd need to sign in. For demo, we'll just mock it if possible
      // But since we need a real UID, let's just use Google login as a fallback or alert
      alert("Demo mode requires real Firebase Auth. Please use your real number for OTP.");
      setIsAuthLoading(false);
      return;
    }

    try {
      await confirmationResult.confirm(otp);
      // Auth listener will handle the rest
    } catch (err: any) {
      setAuthError("Wrong code. Try again.");
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePinSetup = async () => {
    if (pin.length !== 4) return;
    setAuthState('pin-confirm');
  };

  const handlePinConfirm = async () => {
    if (pin !== confirmPin) {
      setAuthError("PINs do not match.");
      setConfirmPin('');
      return;
    }

    setIsAuthLoading(true);
    try {
      const hashed = await hashPin(pin);
      
      // Save to Supabase
      await apiSaveUser(user.uid, user.phoneNumber || '');
      
      // Save to Firestore
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        phoneNumber: user.phoneNumber,
        pinHash: hashed,
        isSetupComplete: true
      });
      setIsPinVerified(true);
      setIsResettingPin(false);
    } catch (err: any) {
      setAuthError(err.message);
    } finally {
      setIsAuthLoading(false);
    }
  };

  const handlePinLogin = async () => {
    if (pin.length !== 4) return;
    
    // Demo Mode check
    if (phoneNumber === '0240000000' && pin === '1234') {
      setIsDemoMode(true);
      setUser({ uid: 'demo', phoneNumber: '0240000000', displayName: 'Demo User' });
      setIsPinVerified(true);
      resetDemo();
      return;
    }

    const hashed = await hashPin(pin);
    if (profile?.pinHash === hashed) {
      setIsPinVerified(true);
    } else {
      setAuthError("Wrong PIN. Try again.");
      setPin('');
    }
  };

  const handleLogout = () => {
    signOut(auth);
    setIsPinVerified(false);
    setIsDemoMode(false);
    setIsAdminMode(false);
    setShowAdminDashboard(false);
    setPin('');
    setPhoneNumber('');
    setOtp('');
  };

  const handleEnterDemoMode = () => {
    setIsDemoMode(true);
    setUser({ uid: 'demo', phoneNumber: '0240000000', displayName: 'Demo User' });
    setIsPinVerified(true);
    resetDemo();
  };

  const resetDemo = () => {
    const mockTransactions: Transaction[] = [
      { id: 'demo1', uid: 'demo', type: 'income', amount: 120, item: 'Tomato Sale', createdAt: { toDate: () => new Date() } as any },
      { id: 'demo2', uid: 'demo', type: 'expense', amount: 75, item: 'Transport', createdAt: { toDate: () => new Date() } as any },
    ];
    const mockDebts: Debt[] = [
      { id: 'debt1', uid: 'demo', name: 'Adjoa', amount: 20, paidAmount: 0, status: 'unpaid', createdAt: new Date(), updatedAt: new Date() },
      { id: 'debt2', uid: 'demo', name: 'Ama', amount: 15, paidAmount: 0, status: 'unpaid', createdAt: new Date(), updatedAt: new Date() },
    ];
    setTransactions(mockTransactions);
    setDebts(mockDebts);
    setWhatsAppMessages([]);
    setAkosuaMessage("Demo Reset! How can I help you today?");
  };

  useEffect(() => {
    if (!isAdminMode || !showAdminDashboard) return;

    // Real-time listeners for Admin
    const unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
      setAllUsers(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() })));
    });

    const unsubTxs = onSnapshot(query(collection(db, 'transactions'), orderBy('createdAt', 'desc')), (snapshot) => {
      setAllTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), created_at: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString() })));
    });

    const unsubDebts = onSnapshot(query(collection(db, 'debts'), orderBy('createdAt', 'desc')), (snapshot) => {
      setAllDebts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data(), created_at: doc.data().createdAt?.toDate?.()?.toISOString() || new Date().toISOString() })));
    });

    return () => {
      unsubUsers();
      unsubTxs();
      unsubDebts();
    };
  }, [isAdminMode, showAdminDashboard]);

  const fetchAdminData = async () => {
    // This is now handled by onSnapshot, but keeping it for manual refresh if needed
    try {
      const users = await getUsers();
      const txs = await getTransactions();
      const debts = await apiGetDebts();
      
      setAllUsers(users || []);
      setAllTransactions(txs || []);
      setAllDebts(debts || []);
    } catch (err) {
      console.error("Admin Fetch Error (General):", err);
    }
  };

  const handleAdminLogin = () => {
    if (phoneNumber === '0240000000' && adminPin === '1234') {
      setIsAdminMode(true);
      setShowAdminDashboard(true);
      setIsAdminLogin(false);
      fetchAdminData();
    } else {
      setAuthError("Invalid Admin Credentials");
    }
  };

  const deleteTransaction = async (id: string) => {
    if (!isAdminMode) return;
    try {
      // Delete from Supabase
      const { success } = await apiDeleteTransaction(id);
      if (!success) throw new Error("Failed to delete from Supabase");
      
      // Delete from Firestore
      await deleteDoc(doc(db, 'transactions', id));
      // No need to call fetchAdminData because onSnapshot will handle it
    } catch (err) {
      console.error("Delete failed", err);
    }
  };

  // --- App Handlers ---

  const saveTransaction = async (data: Partial<Transaction>) => {
    const uid = isDemoMode ? 'demo' : user?.uid;
    if (!uid) return;

    try {
      // Save to Supabase using API layer
      const result = await apiSaveTransaction(
        data.type as 'income' | 'expense', 
        data.amount || 0, 
        data.item || '', 
        uid
      );

      if (!result.success) throw result.error;

      // If in demo mode, we still update local state for immediate feedback if needed, 
      // but the real-time listener should handle it anyway.
      
      // Also save to Firestore for backup/sync (optional)
      if (!isDemoMode) {
        const newDoc = doc(collection(db, 'transactions'));
        await setDoc(newDoc, {
          uid,
          createdAt: new Date(),
          ...data
        });
      }

      setShowAddModal(null);
      setFormData({ amount: '', item: '', name: '' });

      // Trigger Akosua Guard
      if (data.type === 'expense' && (todayExpense + (data.amount || 0)) > todayIncome) {
        setAkosuaMessage("⚠️ Careful! You are spending more than you earned today.");
        setShowAkosua(true);
      }
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const saveDebt = async (data: Partial<Debt>) => {
    const uid = isDemoMode ? 'demo' : user?.uid;
    if (!uid) return;

    try {
      // Save to Supabase using API layer
      const result = await apiSaveDebt(
        data.name || '', 
        data.amount || 0, 
        uid
      );

      if (!result.success) throw result.error;

      // Also save to Firestore
      if (!isDemoMode) {
        const newDoc = doc(collection(db, 'debts'));
        await setDoc(newDoc, {
          uid,
          paidAmount: 0,
          status: 'unpaid',
          createdAt: new Date(),
          updatedAt: new Date(),
          ...data
        });
      }

      setShowAddModal(null);
      setFormData({ amount: '', item: '', name: '' });
    } catch (err) {
      console.error("Save debt failed", err);
    }
  };

  const markDebtAsPaid = async (debt: Debt) => {
    if (!debt.id) return;
    try {
      // Update Supabase
      const { success } = await apiUpdateDebt(debt.id, { 
        status: 'paid', 
        paid_amount: debt.amount 
      });

      if (!success) throw new Error("Failed to update debt in Supabase");

      // Update Firestore
      await updateDoc(doc(db, 'debts', debt.id), {
        status: 'paid',
        paidAmount: debt.amount,
        updatedAt: new Date()
      });

      await saveTransaction({
        type: 'income',
        amount: debt.amount,
        item: `Debt paid by ${debt.name}`
      });
    } catch (err) {
      console.error("Update debt failed", err);
    }
  };

  const startListening = () => {
    setIsListening(true);
    setVoiceText("Listening...");
    setPendingVoiceText('');
    
    const recognition = setupSpeechRecognition(
      async (text, confidence) => {
        if (confidence < 0.5) {
          setVoiceText("I didn't hear well. Please speak closer.");
          await speakText("I didn't hear well. Please speak closer.");
          return;
        }

        setIsCleaning(true);
        const cleaned = await cleanSpeechInput(text);
        setIsCleaning(false);

        if (cleaned === "noise") {
          setVoiceText("I can't hear clearly. Please speak closer.");
          await speakText("I can't hear clearly. Please speak closer.");
        } else {
          setPendingVoiceText(cleaned);
          // AUTOMATIC FLOW: Skip confirmation and save immediately
          await autoProcessVoice(cleaned);
        }
      },
      async (error) => {
        console.error("STT Error:", error);
        setIsListening(false);
        setVoiceText("Something went wrong. Try again.");
      },
      () => setIsListening(false)
    );

    if (recognition) {
      recognition.start();
    }
  };

  const autoProcessVoice = async (text: string) => {
    setIsParsing(true);
    const parsed = await parseTransaction(text);
    setIsParsing(false);

    if (parsed) {
      const lang = parsed.language || 'English';
      setLanguage(lang);
      
      if (parsed.isDebt && parsed.debtorName) {
        await saveDebt({ name: parsed.debtorName, amount: parsed.amount });
      } else {
        await saveTransaction({
          type: parsed.type,
          amount: parsed.amount,
          item: parsed.item,
          quantity: parsed.quantity,
          unit: parsed.unit,
          category: parsed.category || 'business'
        });
      }
      
      const msg = parsed.response || (lang === 'Twi' ? `Woatɔn GHS ${parsed.amount}.` : `Recorded. ${parsed.type === 'income' ? 'Sale' : 'Expense'} of GHS ${parsed.amount}.`);
      setVoiceText(msg);
      await speakText(msg);
      
      setTimeout(() => setVoiceText(''), 5000);
    } else {
      const fallbackMsg = language === 'Twi' ? "Mante aseɛ yie. San ka bio." : "I couldn't understand that. Try again.";
      setVoiceText(fallbackMsg);
      await speakText(fallbackMsg);
    }
  };

  const handleAkosuaAdvice = async () => {
    // Hidden Admin Entry: 5 taps
    setAkosuaTapCount(prev => {
      const newCount = prev + 1;
      if (newCount >= 5) {
        setIsAdminLogin(true);
        return 0;
      }
      return newCount;
    });

    setShowAkosua(true);
    setIsAkosuaLoading(true);
    if (isDemoMode) {
      setTimeout(() => {
        setAkosuaMessage("You are doing well! Your profit is GHS " + todayProfit + ". Remember to collect GHS " + debts.reduce((a,b) => a + (b.status !== 'paid' ? b.amount : 0), 0) + " from your customers.");
        setIsAkosuaLoading(false);
      }, 500);
      return;
    }
    const advice = await getAkosuaAdvice(todayTransactions, debts.filter(d => d.status !== 'paid'), language);
    setAkosuaMessage(advice);
    setIsAkosuaLoading(false);
    // Speak advice
    await speakText(advice.replace(/[#*]/g, '')); // Clean markdown for TTS
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

    if (isDemoMode) {
      saveTransaction({ 
        type: 'expense', 
        amount: 0, 
        item: 'Photo Upload (Demo)', 
        imageUrl: 'https://picsum.photos/seed/receipt/400/600' 
      });
      alert("Photo saved (Demo Mode)!");
      return;
    }

    try {
      const storageRef = ref(storage, `transactions/${user.uid}/${Date.now()}_${file.name}`);
      await uploadBytes(storageRef, file);
      const url = await getDownloadURL(storageRef);
      await saveTransaction({ 
        type: 'expense', 
        amount: 0, 
        item: 'Photo Upload', 
        imageUrl: url 
      });
      alert("Photo saved!");
    } catch (err) {
      console.error("Upload failed", err);
    }
  };

  if (loading) {
    return (
      <div className="h-screen flex items-center justify-center bg-orange-50">
        <Loader2 className="animate-spin text-orange-500" size={48} />
      </div>
    );
  }

  // --- Auth Screens ---

  if (!user || !isPinVerified) {
    return (
      <div className="min-h-screen bg-orange-50 flex flex-col items-center justify-center p-6 text-center">
        <div id="recaptcha-container"></div>
        
        <div className="w-20 h-20 bg-orange-500 rounded-3xl flex items-center justify-center mb-8 shadow-xl rotate-3 cursor-pointer" onContextMenu={(e) => { e.preventDefault(); setIsAdminLogin(true); }}>
          <Wallet className="text-white" size={40} />
        </div>

        <h1 className="text-4xl font-black text-gray-900 mb-2">WO Akontaa</h1>
        <p className="text-gray-600 mb-12">Simple money tracking for market women.</p>

        <Card className="w-full max-w-sm p-8 space-y-8">
          <AnimatePresence mode="wait">
            {authState === 'phone' && (
              <motion.form 
                key="phone"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleSendOtp}
                className="space-y-6"
              >
                <div className="text-left">
                  <label className="text-sm font-bold text-gray-500 mb-2 block">Phone Number</label>
                  <div className="relative">
                    <Phone className="absolute left-4 top-1/2 -translate-y-1/2 text-gray-400" size={20} />
                    <input 
                      type="tel" 
                      required
                      value={phoneNumber}
                      onChange={(e) => setPhoneNumber(e.target.value)}
                      placeholder="024 000 0000"
                      className="w-full bg-gray-100 rounded-2xl pl-12 pr-6 py-4 text-xl font-bold focus:outline-none focus:ring-2 focus:ring-orange-500"
                    />
                  </div>
                </div>
                {authError && <p className="text-red-500 text-sm font-bold">{authError}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={isAuthLoading}>
                  {isAuthLoading ? <Loader2 className="animate-spin" /> : 'Next'}
                </Button>
                
                <div className="pt-4 border-t border-gray-100">
                  <button 
                    type="button"
                    onClick={handleEnterDemoMode}
                    className="w-full py-4 text-orange-500 font-black text-lg hover:bg-orange-50 rounded-2xl transition-colors"
                  >
                    🚀 Enter Demo Mode
                  </button>
                </div>
              </motion.form>
            )}

            {authState === 'otp' && (
              <motion.form 
                key="otp"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                onSubmit={handleVerifyOtp}
                className="space-y-6"
              >
                <div className="text-left">
                  <label className="text-sm font-bold text-gray-500 mb-2 block">Enter Code sent to {phoneNumber}</label>
                  <input 
                    type="text" 
                    required
                    maxLength={6}
                    value={otp}
                    onChange={(e) => setOtp(e.target.value)}
                    placeholder="123456"
                    className="w-full bg-gray-100 rounded-2xl px-6 py-4 text-3xl font-black tracking-[0.5em] text-center focus:outline-none focus:ring-2 focus:ring-orange-500"
                  />
                </div>
                {authError && <p className="text-red-500 text-sm font-bold">{authError}</p>}
                <Button type="submit" size="lg" className="w-full" disabled={isAuthLoading}>
                  {isAuthLoading ? <Loader2 className="animate-spin" /> : 'Verify'}
                </Button>
                <button type="button" onClick={() => setAuthState('phone')} className="text-orange-500 font-bold text-sm">Change Number</button>
              </motion.form>
            )}

            {authState === 'pin-setup' && (
              <motion.div 
                key="pin-setup"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center">
                  <h3 className="text-xl font-black mb-2">Create your 4-digit PIN</h3>
                  <p className="text-gray-500 text-sm">To keep your money records safe.</p>
                </div>
                <PinInput value={pin} onChange={setPin} />
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        if (n === 'C') setPin('');
                        else if (n === 'OK') handlePinSetup();
                        else if (pin.length < 4) setPin(pin + n);
                      }}
                      className="h-16 bg-gray-100 rounded-2xl text-2xl font-black hover:bg-gray-200 transition-colors"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {authState === 'pin-confirm' && (
              <motion.div 
                key="pin-confirm"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center">
                  <h3 className="text-xl font-black mb-2">Confirm your PIN</h3>
                  <p className="text-gray-500 text-sm">Enter it one more time.</p>
                </div>
                <PinInput value={confirmPin} onChange={setConfirmPin} />
                {authError && <p className="text-red-500 text-sm font-bold">{authError}</p>}
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        if (n === 'C') setConfirmPin('');
                        else if (n === 'OK') handlePinConfirm();
                        else if (confirmPin.length < 4) setConfirmPin(confirmPin + n);
                      }}
                      className="h-16 bg-gray-100 rounded-2xl text-2xl font-black hover:bg-gray-200 transition-colors"
                    >
                      {n}
                    </button>
                  ))}
                </div>
              </motion.div>
            )}

            {authState === 'pin-login' && (
              <motion.div 
                key="pin-login"
                initial={{ opacity: 0, x: 20 }}
                animate={{ opacity: 1, x: 0 }}
                exit={{ opacity: 0, x: -20 }}
                className="space-y-8"
              >
                <div className="text-center">
                  <h3 className="text-xl font-black mb-2">Welcome Back</h3>
                  <p className="text-gray-500 text-sm">Enter your 4-digit PIN to login.</p>
                </div>
                <PinInput value={pin} onChange={setPin} />
                {authError && <p className="text-red-500 text-sm font-bold">{authError}</p>}
                <div className="grid grid-cols-3 gap-4">
                  {[1, 2, 3, 4, 5, 6, 7, 8, 9, 'C', 0, 'OK'].map((n) => (
                    <button
                      key={n}
                      onClick={() => {
                        if (n === 'C') setPin('');
                        else if (n === 'OK') handlePinLogin();
                        else if (pin.length < 4) setPin(pin + n);
                      }}
                      className="h-16 bg-gray-100 rounded-2xl text-2xl font-black hover:bg-gray-200 transition-colors"
                    >
                      {n}
                    </button>
                  ))}
                </div>
                <div className="flex flex-col gap-4">
                  <button onClick={handleLogout} className="text-gray-400 font-bold text-sm">Logout</button>
                  <button 
                    onClick={() => {
                      setIsResettingPin(true);
                      setAuthState('phone');
                      setAuthError('Please verify your phone to reset PIN.');
                    }} 
                    className="text-orange-500 font-bold text-sm"
                  >
                    Forgot PIN?
                  </button>
                </div>
              </motion.div>
            )}
          </AnimatePresence>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50 pb-32">
      {/* Header / Profit Display */}
      <header className="bg-orange-500 text-white p-8 rounded-b-[3rem] shadow-xl relative">
        {isDemoMode && (
          <div className="absolute top-0 left-0 right-0 bg-yellow-400 text-black text-[10px] font-black py-1 px-4 flex justify-between items-center">
            <span>DEMO MODE ACTIVE</span>
            <div className="flex gap-2">
              <button onClick={resetDemo} className="underline">Reset Demo</button>
              <select 
                value={language} 
                onChange={(e) => setLanguage(e.target.value as any)}
                className="bg-transparent border-none font-bold outline-none"
              >
                <option value="en">English</option>
                <option value="twi">Twi</option>
                <option value="ga">Ga</option>
                <option value="ewe">Ewe</option>
                <option value="hausa">Hausa</option>
              </select>
            </div>
          </div>
        )}
        <div className="flex justify-between items-center mb-8 mt-4">
          <div 
            className="flex items-center gap-2 cursor-pointer"
            onContextMenu={(e) => {
              e.preventDefault();
              setIsAdminLogin(true);
            }}
          >
            <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
              <User size={20} />
            </div>
            <span className="font-bold">{user.phoneNumber || 'User'}</span>
          </div>
          <button onClick={handleLogout} className="p-2 bg-white/20 rounded-full">
            <LogOut size={20} />
          </button>
        </div>

        <div className="text-center py-4">
          <p className="text-orange-100 text-lg mb-1">Today's Profit</p>
          <h2 className="text-6xl font-black mb-2">GHS {todayProfit.toFixed(2)}</h2>
          <div className="flex justify-center gap-4 text-sm font-bold">
            <span className="bg-green-400/30 px-3 py-1 rounded-full flex items-center gap-1">
              <Plus size={14} /> {todayIncome}
            </span>
            <span className="bg-red-400/30 px-3 py-1 rounded-full flex items-center gap-1">
              <Minus size={14} /> {todayExpense}
            </span>
          </div>
        </div>
      </header>

      <main className="p-6 max-w-md mx-auto space-y-6">
        {/* Quick Actions */}
        <div className="grid grid-cols-2 gap-4">
          <Button 
            onClick={() => setShowAddModal('income')} 
            variant="accent" size="lg" icon={TrendingUp} className="flex-col h-32"
          >
            Money In
          </Button>
          <Button 
            onClick={() => setShowAddModal('expense')} 
            variant="danger" size="lg" icon={TrendingDown} className="flex-col h-32"
          >
            Money Out
          </Button>
          <Button 
            onClick={() => setShowAddModal('debt')} 
            variant="secondary" size="lg" icon={Users} className="flex-col h-32 col-span-2"
          >
            Pay Small Small (Debt)
          </Button>
        </div>

        {/* Tabs */}
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-gray-100">
          {(['home', 'debts', 'history'] as const).map((tab) => (
            <button
              key={tab}
              onClick={() => setActiveTab(tab)}
              className={cn(
                'flex-1 py-3 rounded-xl text-sm font-bold capitalize transition-all',
                activeTab === tab ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500'
              )}
            >
              {tab}
            </button>
          ))}
        </div>

        {/* Content Area */}
        <AnimatePresence mode="wait">
          {activeTab === 'home' && (
            <motion.div 
              key="home"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <h3 className="text-xl font-black text-gray-900">Recent Activity</h3>
              {todayTransactions.length === 0 ? (
                <Card className="text-center py-12 text-gray-400 italic">
                  No sales yet today.
                </Card>
              ) : (
                todayTransactions.map((t) => (
                  <Card key={t.id} className="flex items-center justify-between">
                    <div className="flex items-center gap-4">
                      <div className={cn(
                        'w-12 h-12 rounded-2xl flex items-center justify-center',
                        t.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                      )}>
                        {t.type === 'income' ? <Plus /> : <Minus />}
                      </div>
                      <div>
                        <p className="font-bold text-gray-900">{t.item || (t.type === 'income' ? 'Sale' : 'Expense')}</p>
                        <p className="text-xs text-gray-500">
                          {t.createdAt?.toDate ? t.createdAt.toDate().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Just now'}
                        </p>
                      </div>
                    </div>
                    <div className="flex flex-col items-end gap-1">
                      <p className={cn('text-lg font-black', t.type === 'income' ? 'text-green-600' : 'text-red-600')}>
                        {t.type === 'income' ? '+' : '-'} GHS {t.amount.toFixed(2)}
                      </p>
                      {isDemoMode && (
                        <button 
                          onClick={() => alert("Receipt generated! (Mock PDF View)")}
                          className="text-[10px] bg-gray-100 px-2 py-1 rounded-md font-bold text-gray-500"
                        >
                          View Receipt
                        </button>
                      )}
                    </div>
                  </Card>
                ))
              )}
            </motion.div>
          )}

          {activeTab === 'debts' && (
            <motion.div 
              key="debts"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="space-y-4"
            >
              <h3 className="text-xl font-black text-gray-900">Credit List</h3>
              {debts.filter(d => d.status !== 'paid').length === 0 ? (
                <Card className="text-center py-12 text-gray-400 italic">
                  No one owes you money!
                </Card>
              ) : (
                debts.filter(d => d.status !== 'paid').map((d) => (
                  <Card key={d.id} className="flex items-center justify-between">
                    <div>
                      <p className="font-black text-gray-900 text-lg">{d.name}</p>
                      <p className="text-sm text-gray-500">Owes GHS {d.amount.toFixed(2)}</p>
                    </div>
                    <Button onClick={() => markDebtAsPaid(d)} variant="accent" size="sm">
                      Mark Paid
                    </Button>
                  </Card>
                ))
              )}
            </motion.div>
          )}
        </AnimatePresence>
      </main>

      {/* Bottom Floating Bar */}
      <div className="fixed bottom-0 left-0 right-0 p-6 bg-gradient-to-t from-white via-white to-transparent pointer-events-none">
        <div className="max-w-md mx-auto flex justify-between items-center gap-4 pointer-events-auto">
          <label className="flex-1">
            <input type="file" accept="image/*" capture="environment" className="hidden" onChange={handleFileUpload} />
            <div className="bg-gray-100 text-gray-700 p-6 rounded-3xl flex items-center justify-center cursor-pointer shadow-lg active:scale-95 transition-all">
              <Camera size={32} />
            </div>
          </label>
          
          <button 
            onClick={startListening}
            className={cn(
              'flex-[2] p-6 rounded-3xl flex items-center justify-center gap-3 shadow-2xl transition-all active:scale-95',
              isListening ? 'bg-red-500 text-white animate-pulse' : 'bg-orange-500 text-white'
            )}
          >
            {isListening ? <Loader2 className="animate-spin" size={32} /> : <Mic size={32} />}
            <span className="font-black text-xl">{isListening ? 'Listening...' : 'Speak'}</span>
          </button>

          <button 
            onClick={handleAkosuaAdvice}
            className="flex-1 bg-blue-500 text-white p-4 rounded-3xl flex flex-col items-center justify-center shadow-lg active:scale-95 transition-all"
          >
            <MessageCircle size={24} />
            <span className="text-[10px] font-black mt-1">AKOSUA</span>
          </button>
        </div>
      </div>

      {/* Voice Feedback Overlay */}
      <AnimatePresence>
        {(isListening || voiceText || isCleaning || isParsing) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="bg-white rounded-[3rem] p-12 w-full max-w-xs shadow-2xl">
              {(isCleaning || isParsing) ? (
                <Loader2 className="animate-spin text-orange-500 mx-auto mb-6" size={64} />
              ) : (
                <Mic className={cn('mx-auto mb-6', isListening ? 'text-red-500 animate-pulse' : 'text-orange-500')} size={64} />
              )}
              <h3 className="text-2xl font-black mb-4">
                {isParsing ? 'Saving...' : isCleaning ? 'Cleaning...' : isListening ? 'Listening...' : 'Done!'}
              </h3>
              <p className="text-gray-600 italic text-lg">
                {voiceText || 'Speak clearly...'}
              </p>
              {isDemoMode && isListening && (
                <div className="mt-6 grid grid-cols-1 gap-2">
                  <button 
                    onClick={() => {
                      setPendingVoiceText("I sold tomato for 50");
                      autoProcessVoice("I sold tomato for 50");
                      setIsListening(false);
                    }}
                    className="bg-orange-50 p-3 rounded-xl text-orange-600 font-bold text-sm border border-orange-200"
                  >
                    "I sold tomato for 50"
                  </button>
                </div>
              )}
              {!isListening && !isCleaning && !isParsing && (
                <Button onClick={() => setVoiceText('')} className="mt-8 w-full">Close</Button>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Dashboard Modal */}
      <AnimatePresence>
        {showAdminDashboard && (
          <motion.div 
            initial={{ opacity: 0, x: '100%' }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: '100%' }}
            className="fixed inset-0 bg-white z-[100] flex flex-col"
          >
            <div className="bg-gray-900 text-white p-6 flex justify-between items-center">
              <div>
                <h3 className="font-black text-2xl">ADMIN PANEL</h3>
                <p className="text-xs text-gray-400">System Monitoring & Control</p>
              </div>
              <button onClick={() => setShowAdminDashboard(false)} className="p-2 bg-white/10 rounded-full">
                <X size={24} />
              </button>
            </div>

            <div className="flex bg-gray-100 p-2 gap-2 overflow-x-auto">
              {(['analytics', 'users', 'transactions', 'debts', 'supabase'] as const).map((tab) => (
                <button
                  key={tab}
                  onClick={() => setAdminTab(tab)}
                  className={cn(
                    'px-6 py-3 rounded-xl text-sm font-bold capitalize whitespace-nowrap transition-all',
                    adminTab === tab ? 'bg-orange-500 text-white shadow-md' : 'text-gray-500'
                  )}
                >
                  {tab === 'supabase' ? (supabaseStatus?.success ? 'Supabase ✅' : 'Supabase ❌') : tab}
                </button>
              ))}
            </div>

            <div className="flex-1 overflow-y-auto p-6 space-y-8">
              {adminTab === 'supabase' && (
                <div className="p-6 space-y-6 overflow-y-auto flex-1">
                  <div className={cn(
                    "p-4 rounded-xl border",
                    supabaseStatus?.success ? "bg-green-50 border-green-200 text-green-700" : "bg-red-50 border-red-200 text-red-700"
                  )}>
                    <h4 className="font-bold">Connection Status</h4>
                    <p className="text-sm">{supabaseStatus?.success ? "Connected successfully!" : `Error: ${supabaseStatus?.error}`}</p>
                  </div>

                  {!supabaseStatus?.success && (
                    <div className="space-y-4">
                      <h4 className="font-black text-xl">Required SQL Schema</h4>
                      <p className="text-sm text-gray-600">Run this SQL in your Supabase SQL Editor to create the missing tables:</p>
                      <pre className="bg-gray-900 text-gray-100 p-4 rounded-xl text-xs overflow-x-auto font-mono">
{`CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS public.users (
    uid TEXT PRIMARY KEY,
    phone_number TEXT,
    is_setup_complete BOOLEAN DEFAULT FALSE,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.transactions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT REFERENCES public.users(uid) ON DELETE CASCADE,
    type TEXT CHECK (type IN ('income', 'expense')),
    amount NUMERIC NOT NULL DEFAULT 0,
    item TEXT,
    category TEXT DEFAULT 'business',
    quantity NUMERIC,
    unit TEXT,
    image_url TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE TABLE IF NOT EXISTS public.debts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    uid TEXT REFERENCES public.users(uid) ON DELETE CASCADE,
    name TEXT NOT NULL,
    amount NUMERIC NOT NULL DEFAULT 0,
    paid_amount NUMERIC DEFAULT 0,
    status TEXT CHECK (status IN ('unpaid', 'paid')) DEFAULT 'unpaid',
    created_at TIMESTAMPTZ DEFAULT NOW(),
    updated_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.users ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.transactions ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.debts ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Allow all on users" ON public.users FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on transactions" ON public.transactions FOR ALL USING (true) WITH CHECK (true);
CREATE POLICY "Allow all on debts" ON public.debts FOR ALL USING (true) WITH CHECK (true);`}
                      </pre>
                      <Button 
                        onClick={async () => {
                          const status = await testSupabaseConnection();
                          setSupabaseStatus(status);
                        }} 
                        variant="accent" 
                        className="w-full"
                      >
                        Re-test Connection
                      </Button>
                    </div>
                  )}
                </div>
              )}

              {adminTab === 'analytics' && (
                <div className="space-y-6">
                  <div className="grid grid-cols-2 gap-4">
                    <Card className="bg-blue-50 border-blue-100">
                      <p className="text-xs font-bold text-blue-500 uppercase mb-1">Total Users</p>
                      <h4 className="text-3xl font-black">{allUsers.length}</h4>
                    </Card>
                    <Card className="bg-green-50 border-green-100">
                      <p className="text-xs font-bold text-green-500 uppercase mb-1">Total Income</p>
                      <h4 className="text-3xl font-black">GHS {allTransactions.filter(t => t.type === 'income').reduce((s, t) => s + t.amount, 0).toFixed(0)}</h4>
                    </Card>
                    <Card className="bg-red-50 border-red-100">
                      <p className="text-xs font-bold text-red-500 uppercase mb-1">Total Expenses</p>
                      <h4 className="text-3xl font-black">GHS {allTransactions.filter(t => t.type === 'expense').reduce((s, t) => s + t.amount, 0).toFixed(0)}</h4>
                    </Card>
                    <Card className="bg-orange-50 border-orange-100">
                      <p className="text-xs font-bold text-orange-500 uppercase mb-1">Total Debts</p>
                      <h4 className="text-3xl font-black">GHS {allDebts.reduce((s, d) => s + d.amount, 0).toFixed(0)}</h4>
                    </Card>
                    <Card className="bg-purple-50 border-purple-100">
                      <p className="text-xs font-bold text-purple-500 uppercase mb-1">Avg Transaction</p>
                      <h4 className="text-3xl font-black">GHS {(allTransactions.reduce((s, t) => s + t.amount, 0) / (allTransactions.length || 1)).toFixed(0)}</h4>
                    </Card>
                    <Card className="bg-yellow-50 border-yellow-100">
                      <p className="text-xs font-bold text-yellow-500 uppercase mb-1">Active Today</p>
                      <h4 className="text-3xl font-black">{new Set(allTransactions.filter(t => new Date(t.created_at).toDateString() === new Date().toDateString()).map(t => t.uid)).size}</h4>
                    </Card>
                  </div>
                  
                  <div className="space-y-4">
                    <h4 className="font-black text-xl">System Actions</h4>
                    <Button onClick={resetDemo} variant="danger" className="w-full">Reset Demo Data</Button>
                    <Button onClick={fetchAdminData} variant="ghost" className="w-full" icon={RefreshCw}>Refresh Data</Button>
                  </div>
                </div>
              )}

              {adminTab === 'users' && (
                <div className="space-y-4">
                  <input 
                    type="text" 
                    placeholder="Search by phone..." 
                    className="w-full bg-gray-100 rounded-2xl px-6 py-4 font-bold outline-none"
                    value={adminSearch}
                    onChange={(e) => setAdminSearch(e.target.value)}
                  />
                  {allUsers.filter(u => (u.phone_number || u.phoneNumber)?.includes(adminSearch)).map((u, i) => (
                    <Card key={i} className="flex justify-between items-center">
                      <div>
                        <p className="font-black text-lg">{u.phone_number || u.phoneNumber || 'Unknown'}</p>
                        <p className="text-xs text-gray-500">Joined: {new Date(u.created_at || Date.now()).toLocaleDateString()}</p>
                      </div>
                      <div className="w-10 h-10 bg-gray-100 rounded-full flex items-center justify-center">
                        <User size={20} className="text-gray-400" />
                      </div>
                    </Card>
                  ))}
                </div>
              )}

              {adminTab === 'transactions' && (
                <div className="space-y-4">
                  <div className="flex flex-col gap-4">
                    <div className="flex gap-2 overflow-x-auto pb-2">
                      {(['all', 'income', 'expense'] as const).map(f => (
                        <button 
                          key={f}
                          onClick={() => setAdminFilter(f)}
                          className={cn(
                            'px-4 py-2 rounded-full text-xs font-bold capitalize whitespace-nowrap',
                            adminFilter === f ? 'bg-gray-900 text-white' : 'bg-gray-100 text-gray-500'
                          )}
                        >
                          {f}
                        </button>
                      ))}
                    </div>
                    <input 
                      type="date" 
                      className="w-full bg-gray-100 rounded-2xl px-6 py-4 font-bold outline-none"
                      value={adminDateFilter}
                      onChange={(e) => setAdminDateFilter(e.target.value)}
                    />
                  </div>
                  {allTransactions
                    .filter(t => adminFilter === 'all' || t.type === adminFilter)
                    .filter(t => !adminDateFilter || new Date(t.created_at).toISOString().split('T')[0] === adminDateFilter)
                    .map((t, i) => (
                      <Card key={i} className="flex justify-between items-center">
                        <div className="flex items-center gap-4">
                          <div className={cn(
                            'w-10 h-10 rounded-xl flex items-center justify-center',
                            t.type === 'income' ? 'bg-green-100 text-green-600' : 'bg-red-100 text-red-600'
                          )}>
                            {t.type === 'income' ? <Plus size={18} /> : <Minus size={18} />}
                          </div>
                          <div>
                            <p className="font-bold">{t.item || t.type}</p>
                            <p className="text-[10px] text-gray-500">{new Date(t.created_at).toLocaleString()}</p>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className={cn('font-black', t.type === 'income' ? 'text-green-600' : 'text-red-600')}>
                            GHS {t.amount}
                          </p>
                          <button onClick={() => deleteTransaction(t.id)} className="text-[10px] text-red-500 font-bold">Delete</button>
                        </div>
                      </Card>
                    ))}
                </div>
              )}

              {adminTab === 'debts' && (
                <div className="space-y-4">
                  {allDebts.map((d, i) => (
                    <Card key={i} className="flex justify-between items-center">
                      <div>
                        <p className="font-black text-lg">{d.name}</p>
                        <p className="text-xs text-gray-500">GHS {d.amount} • {d.status}</p>
                      </div>
                      {d.status !== 'paid' && (
                        <Button onClick={() => markDebtAsPaid(d)} variant="accent" size="sm">Mark Paid</Button>
                      )}
                    </Card>
                  ))}
                </div>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Admin Login Modal */}
      <AnimatePresence>
        {isAdminLogin && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 backdrop-blur-md z-[110] flex items-center justify-center p-6"
          >
            <div className="bg-white w-full max-w-sm rounded-[3rem] p-8 space-y-8 shadow-2xl">
              <div className="text-center">
                <div className="w-16 h-16 bg-gray-900 rounded-2xl flex items-center justify-center mx-auto mb-4">
                  <Key className="text-white" size={32} />
                </div>
                <h3 className="text-2xl font-black">Admin Access</h3>
                <p className="text-gray-500 text-sm">Enter admin credentials to continue.</p>
              </div>

              <div className="space-y-4">
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase ml-2">Admin Phone</label>
                  <input 
                    type="tel" 
                    value={phoneNumber}
                    onChange={(e) => setPhoneNumber(e.target.value)}
                    className="w-full bg-gray-100 rounded-2xl px-6 py-4 font-bold outline-none"
                    placeholder="0240000000"
                  />
                </div>
                <div>
                  <label className="text-xs font-bold text-gray-400 uppercase ml-2">Admin PIN</label>
                  <input 
                    type="password" 
                    maxLength={4}
                    value={adminPin}
                    onChange={(e) => setAdminPin(e.target.value)}
                    className="w-full bg-gray-100 rounded-2xl px-6 py-4 font-bold outline-none text-center tracking-[1em]"
                    placeholder="****"
                  />
                </div>
              </div>

              {authError && <p className="text-red-500 text-sm font-bold text-center">{authError}</p>}

              <div className="grid grid-cols-2 gap-4">
                <Button onClick={() => setIsAdminLogin(false)} variant="ghost">Cancel</Button>
                <Button onClick={handleAdminLogin} variant="primary">Login</Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* Akosua Chat Modal */}
      <AnimatePresence>
        {showAkosua && (
          <motion.div 
            initial={{ opacity: 0, y: 100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 100 }}
            className="fixed inset-0 bg-white z-[60] flex flex-col"
          >
            <div className="p-6 border-bottom flex justify-between items-center bg-blue-500 text-white">
              <div className="flex items-center gap-3">
                <div className="w-12 h-12 bg-white/20 rounded-full flex items-center justify-center">
                  <MessageCircle size={24} />
                </div>
                <div>
                  <h3 className="font-black text-xl">AKOSUA</h3>
                  <p className="text-xs text-blue-100">Your Financial Companion</p>
                </div>
              </div>
              <button onClick={() => setShowAkosua(false)} className="p-2 bg-white/20 rounded-full">
                <X size={24} />
              </button>
            </div>
            
            <div className="flex-1 p-6 overflow-y-auto space-y-6">
              <div className="bg-blue-50 p-6 rounded-3xl rounded-tl-none border border-blue-100">
                {isAkosuaLoading ? (
                  <div className="flex gap-2">
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce" />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.2s]" />
                    <div className="w-2 h-2 bg-blue-400 rounded-full animate-bounce [animation-delay:0.4s]" />
                  </div>
                ) : (
                  <div className="prose prose-blue">
                    <Markdown>{akosuaMessage || "Hello! I am Akosua. How can I help you today?"}</Markdown>
                  </div>
                )}
              </div>
            </div>

            <div className="p-6 border-t flex gap-4">
              <input 
                type="text" 
                placeholder="Ask Akosua anything..." 
                className="flex-1 bg-gray-100 rounded-2xl px-6 py-4 focus:outline-none focus:ring-2 focus:ring-blue-500"
                onKeyPress={(e) => e.key === 'Enter' && handleAkosuaAdvice()}
              />
              <Button onClick={handleAkosuaAdvice} variant="secondary" className="rounded-2xl p-4">
                <Send size={24} />
              </Button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* WhatsApp Simulation Modal */}
      <AnimatePresence>
        {showWhatsApp && (
          <motion.div 
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[80] flex items-center justify-center p-6"
          >
            <div className="bg-[#E5DDD5] w-full max-w-sm h-[80vh] rounded-[2rem] flex flex-col overflow-hidden shadow-2xl">
              <div className="bg-[#075E54] text-white p-4 flex items-center gap-3">
                <div className="w-10 h-10 bg-white/20 rounded-full flex items-center justify-center">
                  <User size={24} />
                </div>
                <div className="flex-1">
                  <h3 className="font-bold">Customer (WhatsApp)</h3>
                  <p className="text-[10px] opacity-70">Online</p>
                </div>
                <button onClick={() => setShowWhatsApp(false)}><X size={24} /></button>
              </div>
              
              <div className="flex-1 p-4 overflow-y-auto space-y-3">
                {whatsAppMessages.length === 0 && (
                  <p className="text-center text-gray-500 text-sm italic mt-10">No messages yet.</p>
                )}
                {whatsAppMessages.map((m, i) => (
                  <div key={i} className={cn(
                    'max-w-[80%] p-3 rounded-xl text-sm shadow-sm',
                    m.sender === 'user' ? 'bg-[#DCF8C6] ml-auto rounded-tr-none' : 'bg-white mr-auto rounded-tl-none'
                  )}>
                    {m.text}
                  </div>
                ))}
              </div>

              <div className="p-3 bg-[#F0F0F0] flex gap-2">
                <input 
                  type="text" 
                  placeholder="Type a message..." 
                  className="flex-1 bg-white rounded-full px-4 py-2 text-sm outline-none"
                  onKeyPress={async (e) => {
                    if (e.key === 'Enter') {
                      const text = (e.target as HTMLInputElement).value;
                      if (!text) return;
                      setWhatsAppMessages(prev => [...prev, { sender: 'user', text }]);
                      (e.target as HTMLInputElement).value = '';
                      
                      // Process WhatsApp message with language support
                      const parsed = await parseTransaction(text);
                      if (parsed) {
                        setLanguage(parsed.language || 'English');
                        if (parsed.isDebt && parsed.debtorName) {
                          await saveDebt({ name: parsed.debtorName, amount: parsed.amount });
                        } else {
                          await saveTransaction({
                            type: parsed.type,
                            amount: parsed.amount,
                            item: parsed.item,
                            quantity: parsed.quantity,
                            unit: parsed.unit
                          });
                        }
                        setWhatsAppMessages(prev => [...prev, { sender: 'system', text: parsed.response || "Recorded!" }]);
                      } else {
                        setWhatsAppMessages(prev => [...prev, { sender: 'system', text: "I didn't understand that. Please try again." }]);
                      }
                    }
                  }}
                />
                <button className="bg-[#128C7E] text-white p-2 rounded-full"><Send size={20} /></button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
      <AnimatePresence>
        {showAddModal && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-[70] flex items-end sm:items-center justify-center p-4"
          >
            <motion.div 
              initial={{ y: 100 }}
              animate={{ y: 0 }}
              className="bg-white w-full max-w-md rounded-[3rem] p-8 space-y-6"
            >
              <div className="flex justify-between items-center">
                <h3 className="text-2xl font-black capitalize">Add {showAddModal}</h3>
                <button onClick={() => setShowAddModal(null)} className="p-2 bg-gray-100 rounded-full">
                  <X size={20} />
                </button>
              </div>

              <div className="space-y-4">
                {showAddModal === 'debt' && (
                  <div>
                    <label className="text-sm font-bold text-gray-500 mb-1 block">Customer Name</label>
                    <input 
                      type="text" 
                      value={formData.name}
                      onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                      className="w-full bg-gray-100 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none"
                      placeholder="e.g. Adjoa"
                    />
                  </div>
                )}
                <div>
                  <label className="text-sm font-bold text-gray-500 mb-1 block">Amount (GHS)</label>
                  <input 
                    type="number" 
                    value={formData.amount}
                    onChange={(e) => setFormData({ ...formData, amount: e.target.value })}
                    className="w-full bg-gray-100 rounded-2xl px-6 py-4 text-3xl font-black focus:outline-none"
                    placeholder="0.00"
                    autoFocus
                  />
                </div>
                {showAddModal !== 'debt' && (
                  <div>
                    <label className="text-sm font-bold text-gray-500 mb-1 block">Item (Optional)</label>
                    <input 
                      type="text" 
                      value={formData.item}
                      onChange={(e) => setFormData({ ...formData, item: e.target.value })}
                      className="w-full bg-gray-100 rounded-2xl px-6 py-4 text-xl font-bold focus:outline-none"
                      placeholder="e.g. Tomato"
                    />
                  </div>
                )}
              </div>

              <Button 
                onClick={() => {
                  const amt = parseFloat(formData.amount);
                  if (isNaN(amt)) return;
                  if (showAddModal === 'debt') {
                    saveDebt({ name: formData.name, amount: amt });
                  } else {
                    saveTransaction({ type: showAddModal, amount: amt, item: formData.item });
                  }
                }}
                variant={showAddModal === 'income' ? 'accent' : showAddModal === 'expense' ? 'danger' : 'secondary'}
                className="w-full py-6 text-xl"
              >
                Save {showAddModal}
              </Button>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}
