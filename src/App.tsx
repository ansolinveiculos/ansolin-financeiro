/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useState, useEffect } from 'react';
import { onAuthStateChanged, User, signInWithPopup, GoogleAuthProvider, signOut } from 'firebase/auth';
import { auth } from './lib/firebase';
import { Layout } from './components/Layout';
import { Dashboard } from './components/Dashboard';
import { ProposalList } from './components/ProposalList';
import { ProposalForm } from './components/ProposalForm';
import { Button } from '@/components/ui/button';
import { LogIn, CarFront } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type View = 'dashboard' | 'proposals' | 'new-proposal';

import { Toaster } from '@/components/ui/sonner';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');

  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (user) => {
      setUser(user);
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  const handleLogin = async () => {
    const provider = new GoogleAuthProvider();
    try {
      await signInWithPopup(auth, provider);
    } catch (error) {
      console.error('Login error:', error);
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <CarFront className="w-12 h-12 text-slate-400" />
          <p className="text-slate-500 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen grid items-center justify-center p-4 bg-slate-50">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full space-y-8 p-8 bg-white rounded-2xl shadow-sm border border-slate-200 text-center"
        >
          <div className="flex justify-center">
            <div className="p-4 bg-slate-100 rounded-full">
              <CarFront className="w-12 h-12 text-slate-800" />
            </div>
          </div>
          <div>
            <h1 className="text-3xl font-bold tracking-tight text-slate-900">Vendas Credito</h1>
            <p className="mt-2 text-slate-500">Gestão profissional de financiamentos para sua concessionária.</p>
          </div>
          <Button onClick={handleLogin} className="w-full h-12 text-lg font-semibold bg-slate-900 hover:bg-slate-800 text-white rounded-xl shadow-lg transition-all">
            <LogIn className="mr-2 h-5 w-5" /> Entrar com Google
          </Button>
          <p className="text-xs text-slate-400 italic">Acesso restrito para colaboradores autorizados.</p>
        </motion.div>
      </div>
    );
  }

  return (
    <>
      <Layout 
        currentView={currentView} 
        onViewChange={setCurrentView} 
        user={user} 
        onLogout={handleLogout}
      >
        <AnimatePresence mode="wait">
          <motion.div
            key={currentView}
            initial={{ opacity: 0, x: 10 }}
            animate={{ opacity: 1, x: 0 }}
            exit={{ opacity: 0, x: -10 }}
            transition={{ duration: 0.2 }}
          >
            {currentView === 'dashboard' && <Dashboard onNewProposal={() => setCurrentView('new-proposal')} />}
            {currentView === 'proposals' && <ProposalList onNewProposal={() => setCurrentView('new-proposal')} />}
            {currentView === 'new-proposal' && <ProposalForm onSuccess={() => setCurrentView('proposals')} onCancel={() => setCurrentView('dashboard')} />}
          </motion.div>
        </AnimatePresence>
      </Layout>
      <Toaster position="top-right" />
    </>
  );
}
