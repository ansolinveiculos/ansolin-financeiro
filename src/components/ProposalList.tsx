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
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';
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
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);
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
        
        const sortedData = data.sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime());

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

  const updateInstallmentField = async (saleId: string, installmentId: string, field: keyof Installment, value: any) => {
    const sale = proposals.find(p => p.id === saleId);
    if (!sale || !sale.installments) return;

    const updatedInstallments = sale.installments.map(inst => {
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

    // Update locally
    const updatedProposal = { ...sale, installments: updatedInstallments };
    const newProposals = proposals.map(p => p.id === saleId ? updatedProposal : p);
    setProposals(newProposals);
    localStorage.setItem('ansolin_proposals', JSON.stringify(newProposals));
    
    if (selectedSale?.id === saleId) setSelectedSale(updatedProposal);

    try {
      const docRef = doc(db, 'proposals', saleId);
      await updateDoc(docRef, {
        installments: updatedInstallments,
        updatedAt: serverTimestamp()
      });
    } catch (error) {
      console.error('Error updating installment field:', error);
      toast.error('Erro ao salvar alteração.');
      fetchProposals(true); 
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
    
    const size = 138;
    const strokeWidth = 14; // Increased proportionally
    const radius = (size - strokeWidth) / 2;
    
    // Calculate segments
    const segmentAngle = 360 / total;
    const gap = 0; // No gap in calculation, separators will be lines
    
    return (
      <div className="relative flex items-center justify-center w-[138px] h-[138px] bg-white/5 rounded-full p-1 border border-white/5 shadow-inner">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {installments.map((inst, index) => {
            const startAngle = index * segmentAngle;
            const endAngle = (index + 1) * segmentAngle;
            
            const isPaid = inst.status === 'paid';
            const dueDate = new Date(inst.dueDate);
            dueDate.setHours(0,0,0,0);
            const today = new Date();
            today.setHours(0,0,0,0);
            const isOverdue = !isPaid && dueDate < today;

            let strokeColor = "#334155"; 
            if (isPaid) strokeColor = "#84cc16"; 
            else if (isOverdue) strokeColor = "#f43f5e"; 

            const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
              const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
              return {
                x: centerX + radius * Math.cos(angleInRadians),
                y: centerY + radius * Math.sin(angleInRadians)
              };
            };

            const start = polarToCartesian(size/2, size/2, radius, startAngle);
            const end = polarToCartesian(size/2, size/2, radius, endAngle);
            const largeArcFlag = endAngle - startAngle <= 180 ? "0" : "1";

            const d = [
              "M", start.x, start.y, 
              "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
            ].join(" ");

            return (
              <g key={`segment-group-${inst.id}`}>
                {/* Segmento Colorido com pontas retas */}
                <path
                  d={d}
                  fill="none"
                  stroke={strokeColor}
                  strokeWidth={strokeWidth}
                  strokeLinecap="butt"
                  className="transition-all duration-500 ease-out"
                />
              </g>
            );
          })}

          {/* Divisores brancos finos e retos entre as parcelas */}
          {total > 1 && installments.map((_, index) => {
            const angle = index * segmentAngle;
            const innerRadius = radius - strokeWidth / 2;
            const outerRadius = radius + strokeWidth / 2;
            
            const polarToCartesian = (centerX: number, centerY: number, rad: number, angleInDegrees: number) => {
              const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
              return {
                x: centerX + rad * Math.cos(angleInRadians),
                y: centerY + rad * Math.sin(angleInRadians)
              };
            };
            
            const p1 = polarToCartesian(size/2, size/2, innerRadius, angle);
            const p2 = polarToCartesian(size/2, size/2, outerRadius, angle);
            
            return (
              <line
                key={`divider-${index}`}
                x1={p1.x}
                y1={p1.y}
                x2={p2.x}
                y2={p2.y}
                stroke="white"
                strokeWidth="1.5"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-[32px] font-black text-white/90 font-mono tracking-tighter">{paid}/{total}</span>
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
                  <Button 
                    variant="ghost" 
                    size="icon" 
                    className="h-8 w-8 text-white/50 hover:text-white hover:bg-white/10"
                    onClick={() => {
                      setSelectedSale(null);
                      onBack();
                    }}
                  >
                    <XCircle className="w-5 h-5" />
                  </Button>
                </div>
                <div className="flex justify-between items-end">
                  <div className="space-y-3 flex-1 pb-1">
                    <div>
                      <p className="text-[14px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Cliente</p>
                      <h2 className="text-xl font-black truncate">{selectedSale.customerName}</h2>
                      <p className="text-[14px] font-bold uppercase text-slate-500 tracking-wider">
                        {selectedSale.carModel}, {selectedSale.carYear}, {selectedSale.carColor || 'SEM COR'}
                      </p>
                    </div>
                    
                    <div className="space-y-4 pt-1">
                      <div>
                        <p className="text-[14px] text-slate-400 font-black uppercase tracking-widest leading-tight">Valor Parcelado</p>
                        <div className="flex items-center gap-2">
                          {isEditingValorParcelado ? (
                              <input 
                                type="number" 
                                step="0.01"
                                autoFocus
                                value={selectedSale.installmentValue * selectedSale.installmentCount}
                                className="text-2xl font-black tracking-tighter leading-none pt-0.5 bg-transparent border-b border-white/20 w-32"
                                onBlur={() => setIsEditingValorParcelado(false)}
                                onChange={(e) => {
                                    // TODO: Implement actual update logic: 
                                    // Maybe update installmentValue = newTotal / installmentCount
                                    // and then update all installments!
                                }}
                              />
                          ) : (
                              <p 
                                className="text-2xl font-black tracking-tighter leading-none pt-0.5 cursor-pointer hover:text-slate-300"
                                onClick={() => setIsEditingValorParcelado(true)}
                              >
                                {(selectedSale.installmentValue * selectedSale.installmentCount).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                          )}
                          <span className="text-slate-400 font-black text-xl">{selectedSale.installments?.length || 0}X</span>
                        </div>
                      </div>

                      <div>
                        <div className="flex items-center gap-2">
                          <button onClick={() => setShowSaldoFinal(!showSaldoFinal)} className="text-slate-500 hover:text-white">
                              {showSaldoFinal ? <Eye className="w-4 h-4" /> : <div className="relative"><Eye className="w-4 h-4"/> <div className="absolute top-1/2 left-0 w-full h-[1px] bg-slate-500 transform -rotate-45" /></div>}
                          </button>
                          {showSaldoFinal && (
                            <>
                              <p className="text-[12px] text-slate-400 font-normal uppercase tracking-widest leading-none m-0">SALDO FINAL</p>
                              <p className="text-[12px] font-normal tracking-tighter leading-none text-slate-300">
                                 {(selectedSale.installments?.reduce((acc, i) => acc + (i.value || 0), 0) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                              </p>
                            </>
                          )}
                        </div>
                      </div>

                      <div className="grid grid-cols-1 gap-3 border-t border-white/5 pt-3">
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

                          const sum = (arr: Installment[]) => arr.reduce((acc, curr) => acc + (curr.value || 0), 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });

                          return (
                            <>
                              <div>
                                <p className="text-[14px] text-white font-normal uppercase tracking-widest leading-tight">Pagas</p>
                                <p className="text-[14px] font-normal text-emerald-400 leading-none pt-1">
                                  {paid.length} = {sum(paid)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[14px] text-white font-normal uppercase tracking-widest leading-tight">Em Atraso</p>
                                <p className="text-[14px] font-normal text-rose-400 leading-none pt-1">
                                  {overdue.length} = {sum(overdue)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[14px] text-white font-normal uppercase tracking-widest leading-tight">A Vencer</p>
                                <p className="text-[14px] font-normal text-slate-300 leading-none pt-1">
                                  {pending.length} = {sum(pending)}
                                </p>
                              </div>
                            </>
                          );
                        })()}
                      </div>
                    </div>
                  </div>
                  
                  <div className="flex flex-col items-center gap-3 ml-2 pb-0">
                    <PaymentProgressChart installments={selectedSale.installments || []} />
                  </div>
                </div>
              </div>

              <div className="px-3 pb-6 pt-5">
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
                                    <span className="block hover:underline decoration-dotted cursor-pointer">
                                      {safeFormat(inst.dueDate, 'dd/MM/yy')}
                                    </span>
                                    <input 
                                      type="date" 
                                      value={inst.dueDate ? new Date(inst.dueDate).toISOString().split('T')[0] : ''} 
                                      className="absolute inset-0 opacity-0 cursor-pointer w-full text-[16px]"
                                      onChange={(e) => updateInstallmentField(selectedSale.id, inst.id, 'dueDate', new Date(e.target.value + 'T12:00:00').toISOString())}
                                    />
                                  </div>
                                </div>
                              </td>
                              <td className="py-2.5">
                                <div className="flex items-center justify-end pr-4">
                                  <span className="opacity-40 font-medium scale-90 mr-1">R$</span>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={inst.value} 
                                    className="bg-transparent border-none p-0 focus:ring-0 w-16 text-right text-[16px] text-inherit font-medium"
                                    onChange={(e) => updateInstallmentField(selectedSale.id, inst.id, 'value', Number(e.target.value))}
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
              </div>
              
              <div className="px-6 pb-6 pt-2 flex flex-col gap-2">
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
                  <div className="flex gap-2">
                    <Button variant="outline" className="flex-1 h-11 rounded-2xl border-slate-200 text-slate-900 text-[14px] font-bold" onClick={() => setSelectedSale(null)}>
                      Fechar Detalhes
                    </Button>
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
              <Input 
                type="date" 
                value={paymentDialog.paymentDate}
                onChange={e => setPaymentDialog(prev => ({ ...prev, paymentDate: e.target.value }))}
                className="h-11 rounded-xl bg-slate-50 border-slate-100"
              />
            </div>
            <div className="space-y-1.5">
              <p className="text-[14px] font-black uppercase text-slate-400 tracking-widest leading-none">Valor Pago</p>
              <div className="relative">
                <span className="absolute left-3 top-1/2 -translate-y-1/2 text-xs font-bold text-slate-400">R$</span>
                <Input 
                  type="number" 
                  step="0.01"
                  value={paymentDialog.paidAmount}
                  onChange={e => setPaymentDialog(prev => ({ ...prev, paidAmount: Number(e.target.value) }))}
                  className="h-11 pl-9 rounded-xl bg-slate-50 border-slate-100 font-bold"
                />
              </div>
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
