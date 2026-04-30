import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  updateDoc,
  deleteDoc,
  doc, 
  serverTimestamp,
  onSnapshot
} from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Proposal, ProposalStatus, Installment } from '../types';
import { 
  Search, 
  Filter, 
  MoreHorizontal,
  ChevronRight,
  Eye,
  CheckCircle2,
  XCircle,
  RefreshCw,
  Plus,
  ArrowRight,
  Calendar,
  DollarSign,
  User as UserIcon,
  Car,
  Trash2,
  Minus
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format, isValid, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { IMaskInput } from 'react-imask';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

const safeFormat = (date: Date | string | number | null | undefined, fmt: string, options?: any) => {
  if (!date) return 'Data Inválida';
  const d = new Date(date);
  if (!isValid(d)) return 'Data Inválida';
  return format(d, fmt, options);
};

import { toast } from 'sonner';

interface ProposalListProps {
  onNewProposal: () => void;
  onBack: () => void;
  initialProposalId?: string | null;
}

export function ProposalList({ onNewProposal, onBack, initialProposalId }: ProposalListProps) {
  const [proposals, setProposals] = useState<Proposal[]>(() => {
    const cached = localStorage.getItem('ansolin_proposals');
    return cached ? JSON.parse(cached).map((p: any) => ({
      ...p,
      createdAt: new Date(p.createdAt),
      updatedAt: new Date(p.updatedAt)
    })) : [];
  });
  const [loading, setLoading] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');
  const [isEditingValorParcelado, setIsEditingValorParcelado] = useState(false);
  const [showSaldoFinal, setShowSaldoFinal] = useState(false);
  const [selectedSale, setSelectedSale] = useState<Proposal | null>(null);
  const [editingField, setEditingField] = useState<string | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
  const [hasChanges, setHasChanges] = useState(false);
  const [paymentDialog, setPaymentDialog] = useState<{
    isOpen: boolean;
    saleId: string | null;
    installmentId: string | null;
    originalValue: number;
    paidAmount: number;
    paymentDate: string;
  }>({
    isOpen: false,
    saleId: null,
    installmentId: null,
    originalValue: 0,
    paidAmount: 0,
    paymentDate: new Date().toISOString().split('T')[0]
  });

  const fetchProposals = async (force = false) => {
    if (!auth.currentUser) return;
    
    if (force || proposals.length === 0) {
      setLoading(true);
    }

    try {
      let q = query(
        collection(db, 'proposals'),
        where('userId', '==', auth.currentUser.uid)
      );
      
      const unsubscribe = onSnapshot(q, (snapshot) => {
        if (snapshot.empty && proposals.length > 0 && snapshot.metadata.fromCache) {
          return;
        }

        const data = snapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            ...d,
            createdAt: d.createdAt?.toDate ? d.createdAt.toDate().toISOString() : new Date().toISOString(),
            updatedAt: d.updatedAt?.toDate ? d.updatedAt.toDate().toISOString() : new Date().toISOString()
          };
        });
        
        const sortedData = data.sort((a, b) => {
          const today = new Date();
          today.setHours(0,0,0,0);

          const getOverdueCount = (sale: any) => {
            if (!sale.installments) return 0;
            return sale.installments.filter((i: any) => {
              const d = new Date(i.dueDate);
              d.setHours(0,0,0,0);
              return i.status !== 'paid' && d < today;
            }).length;
          };

          const isFullyPaid = (sale: any) => {
            if (!sale.installments || sale.installments.length === 0) return false;
            return sale.installments.every((i: any) => i.status === 'paid');
          };

          const paidA = isFullyPaid(a);
          const paidB = isFullyPaid(b);

          if (paidA && !paidB) return 1;
          if (!paidA && paidB) return -1;

          const overdueA = getOverdueCount(a);
          const overdueB = getOverdueCount(b);

          if (overdueA !== overdueB) return overdueB - overdueA;

          return new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime();
        });

        if (!snapshot.empty || !snapshot.metadata.fromCache) {
          localStorage.setItem('ansolin_proposals', JSON.stringify(sortedData));
          setProposals(sortedData.map((p: any) => ({
            ...p,
            createdAt: new Date(p.createdAt),
            updatedAt: new Date(p.updatedAt)
          })) as any);
        }
        setLoading(false);
      }, (error) => {
        console.error('Error fetching proposals:', error);
        setLoading(false);
      });

      return unsubscribe;
    } catch (error) {
      console.error('Error setting up snapshot:', error);
      setLoading(false);
    }
  };

  useEffect(() => {
    let unsubscribe: any;
    fetchProposals().then(unsub => {
      unsubscribe = unsub;
    });
    return () => {
      if (unsubscribe) unsubscribe();
    }
  }, []);

  useEffect(() => {
    if (initialProposalId && proposals.length > 0) {
      const found = proposals.find(p => p.id === initialProposalId);
      if (found) {
        setSelectedSale(found);
      }
    }
  }, [initialProposalId, proposals]);

  const toggleInstallmentStatus = async (saleId: string, installmentId: string) => {
    const sale = proposals.find(p => p.id === saleId);
    if (!sale || !sale.installments) return;

    const inst = sale.installments.find(i => i.id === installmentId);
    if (!inst) return;

    if (inst.status === 'pending') {
      // Open modal for payment details
      setPaymentDialog({
        isOpen: true,
        saleId,
        installmentId,
        originalValue: inst.value,
        paidAmount: inst.value,
        paymentDate: inst.dueDate ? new Date(inst.dueDate).toISOString().split('T')[0] : new Date().toISOString().split('T')[0]
      });
      return;
    }

    // Toggle back to pending
    const updatedInstallments = sale.installments.map(i => {
      if (i.id === installmentId) {
        const { paidAmount: _pa, interest: _in, ...rest } = i;
        return { 
          ...rest, 
          status: 'pending',
          paidAt: null
        } as Installment;
      }
      return i;
    });

    await persistInstallmentUpdate(saleId, updatedInstallments);
  };

  const handleConfirmPayment = async () => {
    if (!paymentDialog.saleId || !paymentDialog.installmentId) return;

    const sale = proposals.find(p => p.id === paymentDialog.saleId);
    if (!sale || !sale.installments) return;

    const paidAt = new Date(paymentDialog.paymentDate + 'T12:00:00').toISOString();
    const paidAmount = paymentDialog.paidAmount;
    const originalValue = paymentDialog.originalValue;

    let updatedInstallments = [...sale.installments];
    const currentIndex = updatedInstallments.findIndex(i => i.id === paymentDialog.installmentId);
    
    if (currentIndex === -1) return;

    const currentInst = updatedInstallments[currentIndex];
    const diff = paidAmount - originalValue;
    
    updatedInstallments[currentIndex] = {
      ...currentInst,
      status: 'paid',
      paidAt,
      paidAmount,
      value: paidAmount, // Atualiza o valor da parcela para o valor pago
      interest: diff > 0 ? diff : 0
    };

    if (diff < 0) {
      if (currentIndex < updatedInstallments.length - 1) {
        // Underpaid, add difference to next installment
        const nextIndex = currentIndex + 1;
        updatedInstallments[nextIndex] = {
          ...updatedInstallments[nextIndex],
          value: updatedInstallments[nextIndex].value + Math.abs(diff)
        };
      } else {
        // Last installment underpaid, create a new installment for the remainder
        const newInstallment: Installment = {
          id: crypto.randomUUID(),
          number: updatedInstallments.length + 1,
          dueDate: new Date(new Date(currentInst.dueDate).getTime() + 30 * 24 * 60 * 60 * 1000).toISOString(),
          value: Math.abs(diff),
          status: 'pending',
          paidAmount: 0,
          paidAt: null,
          interest: 0
        };
        updatedInstallments.push(newInstallment);
      }
    }

    setPaymentDialog(prev => ({ ...prev, isOpen: false }));
    await persistInstallmentUpdate(paymentDialog.saleId, updatedInstallments);
  };

  const persistInstallmentUpdate = async (saleId: string, updatedInstallments: Installment[]) => {
    const sale = proposals.find(p => p.id === saleId);
    if (!sale) return;

    const updatedProposal = { ...sale, installments: updatedInstallments };
    const newProposals = proposals.map(p => p.id === saleId ? updatedProposal : p);
    setProposals(newProposals);
    localStorage.setItem('ansolin_proposals', JSON.stringify(newProposals));

    // Remove undefined values for Firestore
    const sanitizedInstallments = updatedInstallments.map(inst => 
      Object.fromEntries(Object.entries(inst).filter(([_, v]) => v !== undefined))
    );
    
    const summary = newProposals.reduce((acc: any, curr: any) => {
      acc.totalVendido += (curr.carPrice || 0);
      acc.recebido += (curr.downPayment || 0);
      acc.count++;
      if (curr.installments) {
        curr.installments.forEach((inst: Installment) => {
          if (inst.status === 'paid') acc.recebido += (inst.paidAmount || inst.value || 0);
          else acc.aReceber += (inst.value || 0);
        });
      }
      return acc;
    }, { recebido: 0, aReceber: 0, totalVendido: 0, count: 0 });
    localStorage.setItem('ansolin_stats', JSON.stringify(summary));

    if (selectedSale?.id === saleId) setSelectedSale(updatedProposal);

    try {
      const docRef = doc(db, 'proposals', saleId);
      await updateDoc(docRef, {
        installments: sanitizedInstallments,
        updatedAt: serverTimestamp()
      });
      toast.success('Status da parcela atualizado!');
    } catch (error) {
      console.error('Error updating installment:', error);
      toast.error('Erro ao salvar alteração.');
      fetchProposals(true);
    }
  };

  const updateInstallmentField = (saleId: string, installmentId: string, field: keyof Installment, value: any) => {
    const sale = proposals.find(p => p.id === saleId);
    if (!sale || !sale.installments) return;

    let updatedInstallments = sale.installments.map(inst => {
      if (inst.id === installmentId) {
        const updated = { ...inst, [field]: value };
        // If paidAt is set, ensure status is paid
        if (field === 'paidAt' && value) {
          updated.status = 'paid';
        }
        return updated;
      }
      return inst;
    });

    // Cascading due date adjustment
    if (field === 'dueDate') {
      const changedIndex = updatedInstallments.findIndex(inst => inst.id === installmentId);
      if (changedIndex !== -1) {
        const baseDate = new Date(value);
        if (!isNaN(baseDate.getTime())) {
          for (let i = changedIndex + 1; i < updatedInstallments.length; i++) {
            // Only update upcoming installments that are not already paid
            if (updatedInstallments[i].status !== 'paid') {
              const nextDate = addMonths(baseDate, i - changedIndex);
              updatedInstallments[i] = { 
                ...updatedInstallments[i], 
                dueDate: nextDate.toISOString() 
              };
            }
          }
        }
      }
    }

    // Update locally ONLY
    const updatedProposal = { ...sale, installments: updatedInstallments };
    if (selectedSale?.id === saleId) {
      setSelectedSale(updatedProposal);
      setHasChanges(true);
    }
  };

  useEffect(() => {
    setHasChanges(false);
  }, [selectedSale?.id]);

  const saveProposalChanges = async () => {
    if (!selectedSale) return;
    
    try {
      setLoading(true);
      const saleId = selectedSale.id;
      const updatedInstallments = selectedSale.installments || [];
      
      const newProposals = proposals.map(p => p.id === saleId ? selectedSale : p);
      setProposals(newProposals);
      localStorage.setItem('ansolin_proposals', JSON.stringify(newProposals));

      // Remove undefined values for Firestore
      const sanitizedInstallments = updatedInstallments.map(inst => 
        Object.fromEntries(Object.entries(inst).filter(([_, v]) => v !== undefined))
      );
      
      const summary = newProposals.reduce((acc: any, curr: any) => {
        acc.totalVendido += (curr.carPrice || 0);
        acc.recebido += (curr.downPayment || 0);
        acc.count++;
        if (curr.installments) {
          curr.installments.forEach((inst: Installment) => {
            if (inst.status === 'paid') acc.recebido += (inst.paidAmount || inst.value || 0);
            else acc.aReceber += (inst.value || 0);
          });
        }
        return acc;
      }, { recebido: 0, aReceber: 0, totalVendido: 0, count: 0 });
      localStorage.setItem('ansolin_stats', JSON.stringify(summary));

      const docRef = doc(db, 'proposals', saleId);
      await updateDoc(docRef, {
        customerName: selectedSale.customerName,
        customerPhone: selectedSale.customerPhone || '',
        carModel: selectedSale.carModel,
        carYear: Number(selectedSale.carYear),
        carColor: selectedSale.carColor || '',
        carPlate: selectedSale.carPlate || '',
        installments: sanitizedInstallments,
        updatedAt: serverTimestamp()
      });
      
      setHasChanges(false);
      toast.success('Alterações salvas com sucesso!');
    } catch (error) {
      console.error('Error saving proposal changes:', error);
      toast.error('Erro ao salvar alterações.');
    } finally {
      setLoading(false);
    }
  };

  const handleDeleteProposal = async (saleId: string) => {
    try {
      const docRef = doc(db, 'proposals', saleId);
      await deleteDoc(docRef);
      
      const newProposals = proposals.filter(p => p.id !== saleId);
      setProposals(newProposals);
      localStorage.setItem('ansolin_proposals', JSON.stringify(newProposals));
      
      // Update dashboard stats too
      const summary = newProposals.reduce((acc: any, curr: any) => {
        acc.totalVendido += (curr.carPrice || 0);
        acc.recebido += (curr.downPayment || 0);
        acc.count++;
        if (curr.installments) {
          curr.installments.forEach((inst: Installment) => {
            if (inst.status === 'paid') acc.recebido += (inst.value || 0);
            else acc.aReceber += (inst.value || 0);
          });
        }
        return acc;
      }, { recebido: 0, aReceber: 0, totalVendido: 0, count: 0 });
      localStorage.setItem('ansolin_stats', JSON.stringify(summary));
      
      setSelectedSale(null);
      setIsConfirmingDelete(false);
      toast.success('Venda excluída com sucesso.');
    } catch (error) {
      console.error('Error deleting proposal:', error);
      toast.error('Erro ao excluir venda.');
    }
  };

  const deleteInstallment = async (installmentId: string) => {
    if (!selectedSale || !selectedSale.installments) return;
    
    // Filter out the deleted installment
    const updatedInstallments = selectedSale.installments.filter(i => i.id !== installmentId);
    
    // Re-number installments
    const renumberedInstallments = updatedInstallments.map((i, idx) => ({
      ...i,
      number: idx + 1
    }));
    
    await persistInstallmentUpdate(selectedSale.id, renumberedInstallments);
  };
  
  const addInstallment = async () => {
    if (!selectedSale || !selectedSale.installments) return;
    
    const lastInstallment = selectedSale.installments[selectedSale.installments.length - 1];
    
    const newDueDate = new Date(lastInstallment.dueDate);
    newDueDate.setMonth(newDueDate.getMonth() + 1);
    
    const newInstallment: Installment = {
        id: crypto.randomUUID(),
        number: selectedSale.installments.length + 1,
        dueDate: newDueDate.toISOString(),
        value: lastInstallment.value,
        status: 'pending',
        paidAmount: 0,
        paidAt: null,
        interest: 0
    };
    
    const updatedInstallments = [...selectedSale.installments, newInstallment];
    await persistInstallmentUpdate(selectedSale.id, updatedInstallments);
  };

  const PaymentProgressChart = ({ installments }: { installments: Installment[] }) => {
    if (!installments || installments.length === 0) return null;
    
    const total = installments.length;
    const paid = installments.filter(i => i.status === 'paid').length;
    const today = new Date();
    today.setHours(0,0,0,0);
    
    return (
      <div className="w-full space-y-1.5">
        <div className="flex w-full h-3 rounded-full overflow-hidden bg-slate-100 ring-1 ring-white shadow-inner">
          {installments.map((inst, index) => {
            const isPaid = inst.status === 'paid';
            const dueDate = new Date(inst.dueDate);
            dueDate.setHours(0,0,0,0);
            const isOverdue = !isPaid && dueDate < today;

            let bgColor = "bg-slate-200"; 
            if (isPaid) bgColor = "bg-emerald-500"; 
            else if (isOverdue) bgColor = "bg-rose-500"; 

            return (
              <div 
                key={inst.id}
                className={cn("h-full border-r last:border-r-0 border-white transition-all duration-500", bgColor)}
                style={{ width: `${100 / total}%` }}
              />
            );
          })}
        </div>
        <div className="flex justify-between items-center px-1">
          <span className="text-[10px] font-normal text-slate-500 uppercase tracking-widest">
            {Math.round((paid / total) * 100)}%
          </span>
          <span className="text-[10px] font-normal text-slate-500 uppercase tracking-widest">{paid} / {total} PAGAS</span>
        </div>
      </div>
    );
  };

  const filteredProposals = proposals.filter(p => {
    const matchesSearch = (p.customerName || '').toLowerCase().includes(searchTerm.toLowerCase()) || 
                         (p.carModel || '').toLowerCase().includes(searchTerm.toLowerCase());
    return matchesSearch;
  });

  const getSaleMetrics = (sale: Proposal) => {
    const paidInstallmentsValue = sale.installments?.filter(i => i.status === 'paid').reduce((acc, i) => acc + (i.value || 0), 0) || 0;
    const paidTotal = (sale.downPayment || 0) + paidInstallmentsValue;
    const totalWithInterest = (sale.carPrice || 0) * (1 + ((sale.interestRate || 0) / 100));
    const remaining = totalWithInterest - paidTotal;
    return { paidTotal, remaining };
  };

  return (
    <div className="min-h-screen">
      {loading && !selectedSale && (
        <div className="flex items-center justify-center p-20">
          <RefreshCw className="w-8 h-8 animate-spin text-slate-200" />
        </div>
      )}

      {/* Sale Details Modal */}
      <Dialog open={!!selectedSale} onOpenChange={(open) => {
        if (!open) {
          setSelectedSale(null);
          setIsConfirmingDelete(false);
          onBack();
        }
      }}>
        <DialogContent className="max-w-md w-[95%] rounded-3xl p-0 overflow-hidden border-none shadow-2xl max-h-[96vh] flex flex-col">
          {selectedSale && (
            <div className="flex-1 overflow-y-auto bg-[#F8FAFC] custom-scrollbar">
              <div className="bg-slate-900 p-5 text-white">
                <div className="flex justify-between items-start mb-4">
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10 -ml-2"
                    onClick={onBack}
                  >
                    <ChevronRight className="w-5 h-5 rotate-180" />
                  </Button>
                </div>
                <div className="flex flex-col space-y-4">
                  <div className="space-y-3 flex-1 pb-1">
                    <div className="space-y-1">
                      <div className="flex flex-col gap-0.5">
                        <div className="flex items-center gap-2">
                          {editingField === 'customerName' ? (
                            <Input
                              autoFocus
                              className="h-8 py-0 bg-white/10 border-white/20 text-white font-black text-xl w-full"
                              value={selectedSale.customerName}
                              onChange={(e) => setSelectedSale(prev => prev ? ({ ...prev, customerName: e.target.value }) : null)}
                              onBlur={() => setEditingField(null)}
                              onFocus={() => setHasChanges(true)}
                              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            />
                          ) : (
                            <h2 
                              className="text-xl font-black truncate cursor-pointer hover:bg-white/5 px-1 rounded"
                              onClick={() => setEditingField('customerName')}
                            >
                              {selectedSale.customerName}
                            </h2>
                          )}
                          {(() => {
                            const insts = selectedSale.installments || [];
                            const today = new Date();
                            today.setHours(0, 0, 0, 0);
                            const overdue = insts.filter(i => {
                              const date = new Date(i.dueDate);
                              date.setHours(0, 0, 0, 0);
                              return i.status !== 'paid' && date < today;
                            });
                            const pending = insts.filter(i => {
                              const date = new Date(i.dueDate);
                              date.setHours(0, 0, 0, 0);
                              return i.status !== 'paid' && date >= today;
                            });
                            if (overdue.length === 0 && pending.length === 0 && insts.length > 0) {
                              return <Badge className="bg-emerald-500 text-white border-none text-[12px] h-auto px-1.5 py-0 font-normal uppercase tracking-tighter">Quitado</Badge>;
                            }
                            return null;
                          })()}
                        </div>
                        {selectedSale.customerPhone && (
                          <div className="mt-1">
                            {editingField === 'customerPhone' ? (
                              <Input
                                autoFocus
                                className="h-6 py-0 bg-white/10 border-white/20 text-white font-bold text-sm w-40"
                                value={selectedSale.customerPhone}
                                onChange={(e) => setSelectedSale(prev => prev ? ({ ...prev, customerPhone: e.target.value }) : null)}
                                onBlur={() => setEditingField(null)}
                                onFocus={() => setHasChanges(true)}
                                onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                              />
                            ) : (
                              <span 
                                className="text-sm font-bold text-slate-500 cursor-pointer hover:bg-white/5 px-1 rounded"
                                onClick={() => setEditingField('customerPhone')}
                              >
                                {selectedSale.customerPhone}
                              </span>
                            )}
                          </div>
                        )}
                      </div>
                      <div className="text-[14px] font-bold uppercase text-slate-500 tracking-wider flex flex-wrap items-center gap-x-1">
                        {editingField === 'carModel' ? (
                          <Input
                            autoFocus
                            className="h-6 py-0 bg-white/10 border-white/20 text-white text-[13px] w-32"
                            value={selectedSale.carModel}
                            onChange={(e) => setSelectedSale(prev => prev ? ({ ...prev, carModel: e.target.value }) : null)}
                            onBlur={() => setEditingField(null)}
                            onFocus={() => setHasChanges(true)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          />
                        ) : (
                          <span className="cursor-pointer hover:bg-white/5 px-1 rounded" onClick={() => setEditingField('carModel')}>
                            {selectedSale.carModel}
                          </span>
                        )}
                        <span>,</span>
                        {editingField === 'carYear' ? (
                          <Input
                            autoFocus
                            type="number"
                            className="h-6 py-0 bg-white/10 border-white/20 text-white text-[13px] w-16"
                            value={selectedSale.carYear}
                            onChange={(e) => setSelectedSale(prev => prev ? ({ ...prev, carYear: parseInt(e.target.value) || 0 }) : null)}
                            onBlur={() => setEditingField(null)}
                            onFocus={() => setHasChanges(true)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                          />
                        ) : (
                          <span className="cursor-pointer hover:bg-white/5 px-1 rounded" onClick={() => setEditingField('carYear')}>
                            {selectedSale.carYear}
                          </span>
                        )}
                        <span>,</span>
                        {editingField === 'carColor' ? (
                          <Input
                            autoFocus
                            className="h-6 py-0 bg-white/10 border-white/20 text-white text-[13px] w-24"
                            value={selectedSale.carColor || ''}
                            onChange={(e) => setSelectedSale(prev => prev ? ({ ...prev, carColor: e.target.value }) : null)}
                            onBlur={() => setEditingField(null)}
                            onFocus={() => setHasChanges(true)}
                            onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                            placeholder="COR"
                          />
                        ) : (
                          <span className="cursor-pointer hover:bg-white/5 px-1 rounded" onClick={() => setEditingField('carColor')}>
                            {selectedSale.carColor || 'SEM COR'}
                          </span>
                        )}
                        {editingField === 'carPlate' ? (
                          <div className="flex items-center gap-1">
                            <span>-</span>
                            <Input
                              autoFocus
                              className="h-6 py-0 bg-white/10 border-white/20 text-white text-[13px] w-24"
                              value={selectedSale.carPlate || ''}
                              onChange={(e) => setSelectedSale(prev => prev ? ({ ...prev, carPlate: e.target.value }) : null)}
                              onBlur={() => setEditingField(null)}
                              onFocus={() => setHasChanges(true)}
                              onKeyDown={(e) => e.key === 'Enter' && e.currentTarget.blur()}
                              placeholder="PLACA"
                            />
                          </div>
                        ) : (
                          <span className="cursor-pointer hover:bg-white/5 px-1 rounded" onClick={() => setEditingField('carPlate')}>
                            {selectedSale.carPlate ? `- ${selectedSale.carPlate.toUpperCase()}` : '- PLACA'}
                          </span>
                        )}
                      </div>
                    </div>
                    
                      {/* Top section now only has basic car/client info */}
                    </div>
                  </div>
                </div>

                <div className="px-3 pb-4 pt-5">
                <h3 className="text-[14px] font-black uppercase tracking-widest text-slate-400 mb-4 px-3">Cronograma de Pagamentos</h3>
                
                <div className="bg-white rounded-3xl ring-1 ring-slate-100 overflow-hidden mx-1">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse table-fixed min-w-[310px]">
                      <thead>
                        <tr className="text-[14px] font-bold uppercase text-slate-400 border-b border-slate-50 bg-slate-50/50">
                          <th className="py-2 text-left pl-3 w-[155px]">Nº. - Vcto</th>
                          <th className="py-2 text-right pr-4 w-[95px]">Valor</th>
                          <th className="py-2 text-center w-[50px]">Status</th>
                          <th className="py-2 w-[30px]"></th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedSale.installments?.map((inst, index) => {
                          const dueDate = new Date(inst.dueDate);
                          dueDate.setHours(0,0,0,0);
                          const today = new Date();
                          today.setHours(0,0,0,0);
                          
                          const isPaid = inst.status === 'paid';
                          const isOverdue = !isPaid && dueDate < today;
                          
                          const rowColor = isPaid ? 'text-slate-900' : (isOverdue ? 'text-rose-600' : 'text-slate-400');

                          return (
                            <tr key={inst.id} className={cn("text-[14px] font-normal transition-colors group", rowColor)}>
                              <td className="py-2.5 pl-3 font-bold text-left overflow-hidden">
                                <div className="flex items-center justify-start gap-2 whitespace-nowrap">
                                  {String(inst.number).padStart(2, '0')} <span>-</span>
                                  <div className="relative group/date">
                                    <IMaskInput 
                                      mask="00/00/00"
                                      value={safeFormat(inst.dueDate, 'dd/MM/yy')}
                                      onAccept={(value) => {
                                        if (value.length === 8) {
                                          const [d, m, y] = value.split('/');
                                          const fullYear = parseInt(y) + 2000;
                                          const isoDate = `${fullYear}-${m}-${d}T12:00:00.000Z`;
                                          
                                          // Only update if it's a valid completion
                                          const currentFormatted = safeFormat(inst.dueDate, 'dd/MM/yy');
                                          if (value !== currentFormatted) {
                                            updateInstallmentField(selectedSale.id, inst.id, 'dueDate', isoDate);
                                          }
                                        }
                                      }}
                                      onKeyDown={(e: React.KeyboardEvent) => {
                                        if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                      }}
                                      className="bg-transparent border-none p-0 focus:ring-0 w-20 text-left text-[14px] text-inherit font-medium hover:underline decoration-dotted cursor-pointer"
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5">
                                <div className="flex items-center justify-end pr-4">
                                  <IMaskInput 
                                    mask="R$ num"
                                    blocks={{
                                      num: {
                                        mask: Number,
                                        thousandsSeparator: '.',
                                        padFractionalZeros: true,
                                        normalizeZeros: true,
                                        radix: ',',
                                        mapToRadix: ['.']
                                      }
                                    }}
                                    unmask={true}
                                    value={String(inst.value)} 
                                    className="bg-transparent border-none p-0 focus:ring-0 w-28 text-right text-[16px] text-inherit font-medium"
                                    onAccept={(value, mask) => {
                                      const numValue = parseFloat(mask.unmaskedValue);
                                      if (!isNaN(numValue) && numValue !== inst.value) {
                                        updateInstallmentField(selectedSale.id, inst.id, 'value', numValue);
                                      }
                                    }}
                                    onKeyDown={(e: React.KeyboardEvent) => {
                                      if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                                    }}
                                  />
                                </div>
                              </td>
                              <td className="py-2.5 text-center">
                                <button 
                                  onClick={() => toggleInstallmentStatus(selectedSale.id, inst.id)}
                                  className={cn(
                                    "w-7 h-7 rounded-full flex items-center justify-center transition-all mx-auto",
                                    isPaid ? "bg-emerald-500 text-white shadow-sm shadow-emerald-200" : "bg-slate-100 text-slate-400 hover:bg-slate-200"
                                  )}
                                >
                                  {isPaid ? <CheckCircle2 className="w-4 h-4" /> : <RefreshCw className="w-3.5 h-3.5" />}
                                </button>
                              </td>
                              <td className="py-2.5 text-center flex items-center justify-center gap-1">
                                {index !== selectedSale.installments.length - 1 && (
                                  <button 
                                     onClick={() => deleteInstallment(inst.id)}
                                     className="text-rose-400 hover:text-rose-600 w-7 h-7 flex items-center justify-center"
                                  >
                                    <Minus className="w-4 h-4" />
                                  </button>
                                )}
                                {index === selectedSale.installments.length - 1 && (
                                  <button 
                                     onClick={addInstallment}
                                     className="text-emerald-500 hover:text-emerald-700 w-7 h-7 flex items-center justify-center"
                                  >
                                     <Plus className="w-4 h-4" />
                                  </button>
                                )}
                              </td>
                            </tr>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>

                {/* Resumo financeiro compactado em uma linha abaixo da lista */}
                <div className="mt-6 px-1 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 text-[12px]">
                    {(() => {
                      const insts = selectedSale.installments || [];
                      const today = new Date();
                      today.setHours(0,0,0,0);

                      const paid = insts.filter(i => i.status === 'paid');
                      const overdue = insts.filter(i => {
                        const date = new Date(i.dueDate);
                        date.setHours(0,0,0,0);
                        return i.status !== 'paid' && date < today;
                      });
                      const pending = insts.filter(i => {
                        const date = new Date(i.dueDate);
                        date.setHours(0,0,0,0);
                        return i.status !== 'paid' && date >= today;
                      });

                      const sum = (list: Installment[]) => 
                        list.reduce((acc, i) => acc + (i.status === 'paid' ? (i.paidAmount || i.value || 0) : (i.value || 0)), 0)
                          .toLocaleString('pt-BR', { minimumFractionDigits: 2 });

                      return (
                        <>
                          {paid.length > 0 && (
                            <div className="flex flex-col gap-0.5 whitespace-nowrap">
                              <span className="text-slate-400 font-normal uppercase tracking-wider text-[16px]">Pagas</span>
                              <span className="font-normal text-emerald-600 text-[14px]">{paid.length} - {sum(paid)}</span>
                            </div>
                          )}
                          {overdue.length > 0 && (
                            <div className="flex flex-col gap-0.5 whitespace-nowrap">
                              <span className="text-slate-400 font-normal uppercase tracking-wider text-[16px]">Em Atraso</span>
                              <span className="font-normal text-rose-600 text-[14px]">{overdue.length} - {sum(overdue)}</span>
                            </div>
                          )}
                          {pending.length > 0 && (
                            <div className="flex flex-col gap-0.5 whitespace-nowrap">
                              <span className="text-slate-400 font-normal uppercase tracking-wider text-[16px]">A Vencer</span>
                              <span className="font-normal text-slate-500 text-[14px]">{pending.length} - {sum(pending)}</span>
                            </div>
                          )}
                        </>
                      );
                    })()}
                  </div>
                  
                  <div className="bg-white rounded-2xl p-3 ring-1 ring-slate-100">
                    <PaymentProgressChart installments={selectedSale.installments || []} />
                  </div>
                </div>
              </div>
              
                {/* Financial Summary Overlay (Manteve-se na parte inferior) */}
                <div className="px-4 pb-4 pt-2">
                   <div className="bg-slate-900 rounded-3xl p-5 text-white shadow-xl ring-1 ring-white/10 space-y-4">
                      <div className="flex justify-between items-start gap-4">
                        <div className="flex-1">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">VALOR PARCELADO</p>
                          <div className="flex flex-col gap-1">
                            <IMaskInput 
                              mask="R$ num"
                              blocks={{
                                num: {
                                  mask: Number,
                                  thousandsSeparator: '.',
                                  padFractionalZeros: true,
                                  normalizeZeros: true,
                                  radix: ',',
                                  mapToRadix: ['.']
                                }
                              }}
                              unmask={true}
                              value={String((selectedSale.installmentValue || 0) * (selectedSale.installmentCount || 0))}
                              className="text-xl font-black bg-white/5 border border-white/10 rounded-lg px-2 py-1 focus:bg-white/10 focus:border-amber-400/50 focus:outline-none transition-all w-full text-white"
                              onAccept={(value, mask) => {
                                const numValue = parseFloat(mask.unmaskedValue);
                                if (!isNaN(numValue) && numValue !== (selectedSale.installmentValue * selectedSale.installmentCount)) {
                                  const newVal = numValue / selectedSale.installmentCount;
                                  setSelectedSale(prev => prev ? ({ ...prev, installmentValue: newVal }) : null);
                                  setHasChanges(true);
                                }
                              }}
                              onKeyDown={(e: React.KeyboardEvent) => {
                                if (e.key === 'Enter') (e.target as HTMLInputElement).blur();
                              }}
                            />
                            <span className="text-slate-500 font-black text-xs px-1 uppercase tracking-widest">{selectedSale.installments?.length || 0} parcelas</span>
                          </div>
                        </div>
                        <div className="text-right">
                          <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Saldo Final</p>
                          <div className="flex items-center gap-2 justify-end">
                            <button onClick={() => setShowSaldoFinal(!showSaldoFinal)} className="text-slate-500 hover:text-white shrink-0">
                                {showSaldoFinal ? <Eye className="w-3.5 h-3.5" /> : <div className="relative"><Eye className="w-3.5 h-3.5"/> <div className="absolute top-1/2 left-0 w-full h-[0.5px] bg-slate-500 transform -rotate-45" /></div>}
                            </button>
                            <p className={cn("text-lg font-black text-amber-400 transition-all duration-300", !showSaldoFinal && "blur-sm select-none")}>
                               {(selectedSale.installments?.reduce((acc, i) => acc + (i.value || 0), 0) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                            </p>
                          </div>
                        </div>
                      </div>
                   </div>
                </div>

                <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
                <AnimatePresence>
                  {hasChanges && (
                    <motion.div
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: 10 }}
                      className="mb-2"
                    >
                      <Button 
                        className="w-full h-12 rounded-2xl font-bold bg-amber-500 hover:bg-amber-600 text-white shadow-lg shadow-amber-200 flex items-center justify-center gap-2 group"
                        onClick={saveProposalChanges}
                        disabled={loading}
                      >
                        {loading ? <RefreshCw className="w-5 h-5 animate-spin" /> : <CheckCircle2 className="w-5 h-5 group-hover:scale-110 transition-transform" />}
                        Salvar Alterações
                      </Button>
                    </motion.div>
                  )}
                </AnimatePresence>

                {isConfirmingDelete ? (
                  <div className="flex gap-2 animate-in fade-in zoom-in duration-200">
                    <Button 
                      variant="destructive" 
                      className="flex-1 h-11 rounded-2xl font-bold bg-rose-500 hover:bg-rose-600" 
                      onClick={() => selectedSale && handleDeleteProposal(selectedSale.id)}
                    >
                      Confirmar Exclusão
                    </Button>
                    <Button 
                      variant="outline" 
                      className="flex-1 h-11 rounded-2xl border-slate-200 font-bold" 
                      onClick={() => setIsConfirmingDelete(false)}
                    >
                      Cancelar
                    </Button>
                  </div>
                ) : (
                  <div className="flex justify-end pr-1">
                    <Button 
                      variant="outline" 
                      className="w-11 h-11 rounded-2xl border-rose-200 text-rose-500 bg-rose-50/50 hover:bg-rose-100 p-0" 
                      onClick={() => setIsConfirmingDelete(true)}
                    >
                      <Trash2 className="w-4 h-4" />
                    </Button>
                  </div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      <Dialog open={paymentDialog.isOpen} onOpenChange={(open) => setPaymentDialog(prev => ({ ...prev, isOpen: open }))}>
        <DialogContent className="max-w-sm rounded-3xl p-6 border-none shadow-2xl">
          <DialogHeader>
            <DialogTitle className="text-xl font-black tracking-tight mb-4">Informar Pagamento</DialogTitle>
          </DialogHeader>
          <div className="space-y-4">
            <div className="space-y-1.5">
              <p className="text-[14px] font-black uppercase text-slate-400 tracking-widest leading-none">Data do Pagamento</p>
              <IMaskInput
                mask="00/00/00"
                value={format(new Date(paymentDialog.paymentDate + 'T12:00:00'), 'dd/MM/yy')}
                onAccept={(value) => {
                  if (value.length === 8) {
                    const [d, m, y] = value.split('/');
                    const fullYear = parseInt(y) + 2000;
                    const isoDate = `${fullYear}-${m}-${d}`;
                    setPaymentDialog(prev => ({ ...prev, paymentDate: isoDate }));
                  }
                }}
                className="flex h-11 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-[14px] font-black uppercase text-slate-400 tracking-widest leading-none">Valor Pago</p>
              <IMaskInput 
                mask="R$ num"
                blocks={{
                  num: {
                    mask: Number,
                    thousandsSeparator: '.',
                    padFractionalZeros: true,
                    radix: ',',
                    mapToRadix: ['.']
                  }
                }}
                unmask={true}
                value={String(paymentDialog.paidAmount)}
                onAccept={(value, mask) => {
                  const numValue = parseFloat(mask.unmaskedValue);
                  if (!isNaN(numValue)) {
                    setPaymentDialog(prev => ({ ...prev, paidAmount: numValue }));
                  }
                }}
                className="flex h-11 w-full rounded-xl bg-slate-50 border border-slate-100 px-3 py-2 text-sm font-bold focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
              />
              <p className="text-[9px] text-slate-400 font-medium">
                Valor da parcela: {paymentDialog.originalValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
              </p>
            </div>
            
            <div className="pt-2 flex flex-col gap-2">
              <Button 
                onClick={handleConfirmPayment}
                className="h-11 rounded-2xl font-bold bg-slate-900 hover:bg-slate-800 text-white"
              >
                Confirmar Recebimento
              </Button>
              <Button 
                variant="outline" 
                onClick={() => setPaymentDialog(prev => ({ ...prev, isOpen: false }))}
                className="h-11 rounded-2xl font-bold border-slate-200"
              >
                Cancelar
              </Button>
            </div>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const styles = {
    [ProposalStatus.DRAFT]: "bg-slate-100 text-slate-600 border-slate-200",
    [ProposalStatus.PENDING]: "bg-amber-50 text-amber-600 border-amber-100",
    [ProposalStatus.APPROVED]: "bg-emerald-50 text-emerald-600 border-emerald-100",
    [ProposalStatus.REJECTED]: "bg-rose-50 text-rose-600 border-rose-100",
    [ProposalStatus.COMPLETED]: "bg-blue-50 text-blue-600 border-blue-100",
  };

  const labels = {
    [ProposalStatus.DRAFT]: "Rascunho",
    [ProposalStatus.PENDING]: "Em Análise",
    [ProposalStatus.APPROVED]: "Aprovado",
    [ProposalStatus.REJECTED]: "Recusado",
    [ProposalStatus.COMPLETED]: "Concluído",
  };

  return (
    <Badge variant="outline" className={cn("px-2 py-0 h-4 text-[9px] font-bold uppercase tracking-wider border", styles[status])}>
      {labels[status]}
    </Badge>
  );
}
