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
import { Transaction, Debt, UserProfile, ParsedTransaction } from './types';
import { parseTransaction, getAkosuaAdvice } from './services/geminiService';
import { cn } from './lib/utils';
import { 
  Mic, Camera, MessageCircle, Plus, Minus, Users, 
  CheckCircle2, AlertCircle, LogOut, User, 
  TrendingUp, TrendingDown, Wallet, X, Send, Loader2, Phone, Key, ArrowRight, RefreshCw
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

// --- Components ---

const Button = ({ 
  children, onClick, className, variant = 'primary', size = 'md', disabled = false, icon: Icon, type = 'button'
}: { 
  children?: React.ReactNode, onClick?: () => void, className?: string, 
  variant?: 'primary' | 'secondary' | 'danger' | 'ghost' | 'accent', 
  size?: 'sm' | 'md' | 'lg' | 'xl', disabled?: boolean, icon?: any, type?: 'button' | 'submit'
}) => {
  const variants = {
    primary: 'bg-orange-500 text-white hover:bg-orange-600',
    secondary: 'bg-blue-500 text-white hover:bg-blue-600',
    danger: 'bg-red-500 text-white hover:bg-red-600',
    ghost: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
    accent: 'bg-green-500 text-white hover:bg-green-600',
  };
  const sizes = {
    sm: 'p-2 text-sm',
    md: 'p-4 text-base',
    lg: 'p-6 text-xl font-bold',
    xl: 'p-8 text-2xl font-bold',
  };

  return (
    <button 
      type={type}
      onClick={onClick} 
      disabled={disabled}
      className={cn(
        'rounded-2xl transition-all active:scale-95 flex items-center justify-center gap-2 disabled:opacity-50',
        variants[variant],
        sizes[size],
        className
      )}
    >
      {Icon && <Icon size={size === 'xl' ? 32 : 24} />}
      {children}
    </button>
  );
};

const Card = ({ children, className }: { children: React.ReactNode, className?: string }) => (
  <div className={cn('bg-white rounded-3xl p-6 shadow-sm border border-gray-100', className)}>
    {children}
  </div>
);

const PinInput = ({ value, onChange, length = 4 }: { value: string, onChange: (val: string) => void, length?: number }) => {
  return (
    <div className="flex justify-center gap-4">
      {Array.from({ length }).map((_, i) => (
        <div 
          key={i}
          className={cn(
            'w-12 h-12 rounded-full border-2 flex items-center justify-center transition-all',
            value.length > i ? 'bg-orange-500 border-orange-500' : 'bg-gray-100 border-gray-200'
          )}
        >
          {value.length > i && <div className="w-3 h-3 bg-white rounded-full" />}
        </div>
      ))}
    </div>
  );
};

// --- Main App ---

export default function App() {
  const [user, setUser] = useState<any>(null);
  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [isPinVerified, setIsPinVerified] = useState(false);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [debts, setDebts] = useState<Debt[]>([]);
  const [isListening, setIsListening] = useState(false);
  const [voiceText, setVoiceText] = useState('');
  const [isParsing, setIsParsing] = useState(false);
  const [showAkosua, setShowAkosua] = useState(false);
  const [akosuaMessage, setAkosuaMessage] = useState('');
  const [isAkosuaLoading, setIsAkosuaLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'home' | 'debts' | 'history'>('home');
  const [showAddModal, setShowAddModal] = useState<'income' | 'expense' | 'debt' | null>(null);
  const [formData, setFormData] = useState({ amount: '', item: '', name: '' });

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
    if (!user || !isPinVerified) return;

    const qTransactions = query(
      collection(db, 'transactions'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc'),
      limit(50)
    );
    const unsubTransactions = onSnapshot(qTransactions, (snapshot) => {
      setTransactions(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Transaction)));
    }, (err) => console.error("Firestore Error (Transactions):", err));

    const qDebts = query(
      collection(db, 'debts'),
      where('uid', '==', user.uid),
      orderBy('createdAt', 'desc')
    );
    const unsubDebts = onSnapshot(qDebts, (snapshot) => {
      setDebts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Debt)));
    }, (err) => console.error("Firestore Error (Debts):", err));

    return () => {
      unsubTransactions();
      unsubDebts();
    };
  }, [user, isPinVerified]);

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
      setAuthState('otp');
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
      setIsPinVerified(true);
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
    setPin('');
    setPhoneNumber('');
    setOtp('');
  };

  // --- App Handlers ---

  const saveTransaction = async (data: Partial<Transaction>) => {
    if (!user) return;
    try {
      const newDoc = doc(collection(db, 'transactions'));
      await setDoc(newDoc, {
        uid: user.uid,
        createdAt: new Date(),
        ...data
      });
      setShowAddModal(null);
      setFormData({ amount: '', item: '', name: '' });
    } catch (err) {
      console.error("Save failed", err);
    }
  };

  const saveDebt = async (data: Partial<Debt>) => {
    if (!user) return;
    try {
      const newDoc = doc(collection(db, 'debts'));
      await setDoc(newDoc, {
        uid: user.uid,
        paidAmount: 0,
        status: 'unpaid',
        createdAt: new Date(),
        updatedAt: new Date(),
        ...data
      });
      setShowAddModal(null);
      setFormData({ amount: '', item: '', name: '' });
    } catch (err) {
      console.error("Save debt failed", err);
    }
  };

  const markDebtAsPaid = async (debt: Debt) => {
    if (!debt.id) return;
    try {
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
    const SpeechRecognition = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SpeechRecognition) {
      alert("Voice not supported on this browser.");
      return;
    }

    const recognition = new SpeechRecognition();
    recognition.lang = 'en-US';
    recognition.onstart = () => setIsListening(true);
    recognition.onresult = (event: any) => {
      const text = event.results[0][0].transcript;
      setVoiceText(text);
      handleVoiceCommand(text);
    };
    recognition.onend = () => setIsListening(false);
    recognition.start();
  };

  const handleVoiceCommand = async (text: string) => {
    setIsParsing(true);
    const parsed = await parseTransaction(text);
    setIsParsing(false);

    if (parsed) {
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
      setVoiceText(`Saved: ${parsed.amount} GHS ${parsed.item || ''}`);
      setTimeout(() => setVoiceText(''), 3000);
    } else {
      setVoiceText("I didn't hear well. Try again.");
    }
  };

  const handleAkosuaAdvice = async () => {
    setShowAkosua(true);
    setIsAkosuaLoading(true);
    const advice = await getAkosuaAdvice(todayTransactions, debts.filter(d => d.status !== 'paid'));
    setAkosuaMessage(advice);
    setIsAkosuaLoading(false);
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !user) return;

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
        
        <div className="w-20 h-20 bg-orange-500 rounded-3xl flex items-center justify-center mb-8 shadow-xl rotate-3">
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
      <header className="bg-orange-500 text-white p-8 rounded-b-[3rem] shadow-xl">
        <div className="flex justify-between items-center mb-8">
          <div className="flex items-center gap-2">
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
                    <p className={cn('text-lg font-black', t.type === 'income' ? 'text-green-600' : 'text-red-600')}>
                      {t.type === 'income' ? '+' : '-'} GHS {t.amount.toFixed(2)}
                    </p>
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
            className="flex-1 bg-blue-500 text-white p-6 rounded-3xl flex items-center justify-center shadow-lg active:scale-95 transition-all"
          >
            <MessageCircle size={32} />
          </button>
        </div>
      </div>

      {/* Voice Feedback Overlay */}
      <AnimatePresence>
        {(isListening || voiceText || isParsing) && (
          <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex flex-col items-center justify-center p-8 text-center"
          >
            <div className="bg-white rounded-[3rem] p-12 w-full max-w-xs shadow-2xl">
              {isParsing ? (
                <Loader2 className="animate-spin text-orange-500 mx-auto mb-6" size={64} />
              ) : (
                <Mic className={cn('mx-auto mb-6', isListening ? 'text-red-500 animate-pulse' : 'text-orange-500')} size={64} />
              )}
              <h3 className="text-2xl font-black mb-4">
                {isParsing ? 'Saving...' : isListening ? 'Listening...' : 'Done!'}
              </h3>
              <p className="text-gray-600 italic text-lg">
                {voiceText || 'Say something like "I sold tomato for 50"'}
              </p>
              {!isListening && !isParsing && (
                <Button onClick={() => setVoiceText('')} className="mt-8 w-full">Close</Button>
              )}
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

      {/* Add Transaction Modal */}
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
