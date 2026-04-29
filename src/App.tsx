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
import { LogIn, CircleDollarSign } from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';

type View = 'dashboard' | 'proposals' | 'new-proposal';

import { Toaster } from '@/components/ui/sonner';

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [currentView, setCurrentView] = useState<View>('dashboard');
  const [selectedProposalId, setSelectedProposalId] = useState<string | null>(null);

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
    } catch (error: any) {
      if (error.code === 'auth/cancelled-popup-request') {
        console.log('Login popup cancelled by user.');
      } else {
        console.error('Login error:', error);
      }
    }
  };

  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="flex items-center justify-center min-h-screen bg-slate-50">
        <div className="animate-pulse flex flex-col items-center gap-4">
          <CircleDollarSign className="w-12 h-12 text-slate-400 animate-bounce" />
          <p className="text-slate-500 font-medium">Carregando...</p>
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen flex items-center justify-center p-6 bg-slate-50">
        <motion.div 
          initial={{ opacity: 0, scale: 0.95 }}
          animate={{ opacity: 1, scale: 1 }}
          className="max-w-sm w-full space-y-8 p-10 bg-white rounded-3xl shadow-xl shadow-slate-200/50 border border-slate-100 text-center"
        >
          <div className="flex justify-center">
            <div className="p-5 bg-slate-900 rounded-2xl rotate-3 shadow-lg">
              <CircleDollarSign className="w-10 h-10 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-3xl font-black tracking-tight text-slate-900">ANSOLIN</h1>
            <div className="h-1 w-12 bg-slate-200 mx-auto rounded-full" />
            <p className="text-sm text-slate-500 font-medium px-4">Gestão inteligente de financiamentos automotivos.</p>
          </div>
          <div className="pt-4">
            <Button 
              onClick={handleLogin} 
              className="w-full h-14 text-base font-bold bg-slate-900 hover:bg-slate-800 text-white rounded-2xl shadow-xl hover:shadow-2xl transition-all active:scale-95 group"
            >
              <LogIn className="mr-3 h-5 w-5 group-hover:translate-x-1 transition-transform" /> 
              Entrar com Google
            </Button>
            <p className="mt-6 text-[10px] text-slate-400 uppercase tracking-widest font-bold">Acesso Restrito</p>
          </div>
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
            {currentView === 'dashboard' && (
              <Dashboard 
                onNewProposal={() => setCurrentView('new-proposal')} 
                onViewProposals={() => {
                  setSelectedProposalId(null);
                  setCurrentView('proposals');
                }}
                onSelectSale={(id) => {
                  setSelectedProposalId(id);
                  setCurrentView('proposals');
                }}
              />
            )}
            {currentView === 'proposals' && (
              <ProposalList 
                onNewProposal={() => setCurrentView('new-proposal')} 
                onBack={() => setCurrentView('dashboard')}
                initialProposalId={selectedProposalId}
              />
            )}
            {currentView === 'new-proposal' && <ProposalForm onSuccess={() => setCurrentView('proposals')} onCancel={() => setCurrentView('dashboard')} />}
          </motion.div>
        </AnimatePresence>
      </Layout>
      <Toaster position="top-right" />
    </>
  );
}
