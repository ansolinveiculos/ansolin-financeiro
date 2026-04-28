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
  Trash2
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
}

export function ProposalList({ onNewProposal }: ProposalListProps) {
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
  const [selectedSale, setSelectedSale] = useState<Proposal | null>(null);
  const [isConfirmingDelete, setIsConfirmingDelete] = useState(false);

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

  const toggleInstallmentStatus = async (saleId: string, installmentId: string) => {
    const sale = proposals.find(p => p.id === saleId);
    if (!sale || !sale.installments) return;

    const updatedInstallments = sale.installments.map(inst => {
      if (inst.id === installmentId) {
        const newStatus = inst.status === 'paid' ? 'pending' : 'paid';
        return { 
          ...inst, 
          status: newStatus,
          paidAt: newStatus === 'paid' ? (inst.paidAt || new Date().toISOString()) : null
        } as Installment;
      }
      return inst;
    });

    // Update locally
    const updatedProposal = { ...sale, installments: updatedInstallments };
    const newProposals = proposals.map(p => p.id === saleId ? updatedProposal : p);
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

    if (selectedSale?.id === saleId) setSelectedSale(updatedProposal);

    try {
      const docRef = doc(db, 'proposals', saleId);
      await updateDoc(docRef, {
        installments: updatedInstallments,
        updatedAt: serverTimestamp()
      });
      toast.success('Status da parcela atualizado!');
    } catch (error) {
      console.error('Error updating installment:', error);
      toast.error('Erro ao salvar alteração.');
      fetchProposals(true); // Revert
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

  const PaymentProgressChart = ({ installments }: { installments: Installment[] }) => {
    if (!installments || installments.length === 0) return null;
    
    const total = installments.length;
    const paid = installments.filter(i => i.status === 'paid').length;
    
    const size = 115;
    const strokeWidth = 12; // Increased by 20% (from 10)
    const radius = (size - strokeWidth) / 2;
    
    // Calculate segments
    const segmentAngle = 360 / total;
    const gap = total > 1 ? (total > 12 ? 1 : 2) : 0; 
    
    return (
      <div className="relative flex items-center justify-center w-[115px] h-[115px] bg-white/5 rounded-full p-1 border border-white/5 shadow-inner">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
          {installments.map((inst, index) => {
            const startAngle = index * segmentAngle;
            const endAngle = (index + 1) * segmentAngle - gap;
            
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
              <path
                key={inst.id}
                d={d}
                fill="none"
                stroke={strokeColor}
                strokeWidth={strokeWidth}
                strokeLinecap="round"
                className="transition-all duration-500 ease-out"
              />
            );
          })}
        </svg>
        <div className="absolute inset-0 flex items-center justify-center">
          <span className="text-xl font-black text-white/90 font-mono tracking-tighter">{paid}/{total}</span>
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
    <div className="space-y-6">
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-black text-slate-900 tracking-tight">Histórico de Vendas</h1>
        <p className="text-xs text-slate-500">Gestão de prazos e recebimentos.</p>
      </div>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
        <Input 
          placeholder="Buscar cliente ou veículo..." 
          className="pl-9 h-11 bg-white border-slate-200 focus:bg-white rounded-xl shadow-sm"
          value={searchTerm}
          onChange={(e) => setSearchTerm(e.target.value)}
        />
      </div>

      <div className="space-y-4 pb-20">
        {loading && proposals.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-24 bg-slate-100 rounded-2xl animate-pulse" />)}
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-12 bg-white rounded-2xl ring-1 ring-slate-100 text-slate-400">
            <Search className="w-10 h-10 mb-2 opacity-10" />
            <p className="text-xs font-bold uppercase tracking-wider">Nenhuma venda encontrada</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredProposals.map((sale) => {
              const { paidTotal, remaining } = getSaleMetrics(sale);
              const progress = (paidTotal / (paidTotal + remaining)) * 100;

              return (
                <motion.div
                  key={sale.id}
                  layout
                  initial={{ opacity: 0, y: 10 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, scale: 0.95 }}
                  onClick={() => setSelectedSale(sale)}
                >
                  <Card className="border-none shadow-sm ring-1 ring-slate-100 overflow-hidden bg-white active:scale-[0.98] transition-all cursor-pointer group">
                    <CardContent className="p-4 space-y-4">
                      <div className="flex justify-between items-start">
                        <div className="flex-1 min-w-0">
                          <p className="text-sm font-black text-slate-900 truncate">{sale.customerName}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase tracking-tight truncate">{sale.carModel}</p>
                        </div>
                        <ChevronRight className="w-4 h-4 text-slate-300 group-hover:text-slate-900 transition-colors" />
                      </div>

                      <div className="space-y-1.5">
                        <div className="flex justify-between text-[9px] font-black uppercase tracking-widest leading-none">
                          <span className="text-emerald-500">Liquidado: {(paidTotal || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                          <span className="text-slate-400">Restante: {(remaining || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</span>
                        </div>
                        <div className="h-1.5 bg-slate-100 w-full rounded-full overflow-hidden">
                          <motion.div 
                            initial={{ width: 0 }}
                            animate={{ width: `${progress}%` }}
                            className="h-full bg-slate-900" 
                          />
                        </div>
                      </div>

                      <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold">
                        <span className="flex items-center gap-1">
                          <Calendar className="w-3 h-3" />
                          {safeFormat(sale.createdAt, 'dd/MM/yy')}
                        </span>
                        <Badge variant="outline" className="text-[8px] px-1.5 py-0 border-slate-200">
                          {sale.installmentCount}X PARCELAS
                        </Badge>
                      </div>
                    </CardContent>
                  </Card>
                </motion.div>
              );
            })}
          </AnimatePresence>
        )}
      </div>

      {/* Sale Details Modal */}
      <Dialog open={!!selectedSale} onOpenChange={() => {
        setSelectedSale(null);
        setIsConfirmingDelete(false);
      }}>
        <DialogContent className="max-w-md w-[95%] rounded-3xl p-0 overflow-hidden border-none shadow-2xl max-h-[96vh] flex flex-col">
          {selectedSale && (
            <div className="flex-1 overflow-y-auto bg-[#F8FAFC] custom-scrollbar">
              <div className="bg-slate-900 p-5 text-white">
                <div className="flex justify-between items-end">
                  <div className="space-y-3 flex-1 pb-1">
                    <div>
                      <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-0.5">Cliente</p>
                      <h2 className="text-xl font-black truncate">{selectedSale.customerName}</h2>
                      <p className="text-[10px] font-bold uppercase text-slate-500 tracking-wider">
                        {selectedSale.carModel}, {selectedSale.carYear}, {selectedSale.carColor || 'SEM COR'}
                      </p>
                    </div>
                    
                    <div className="space-y-4 pt-1">
                      <div>
                        <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-tight">Valor Parcelado</p>
                        <p className="text-2xl font-black tracking-tighter leading-none pt-0.5">
                          {((selectedSale.installmentCount * selectedSale.installmentValue) || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          <span className="ml-2 text-slate-400">{selectedSale.installmentCount}X</span>
                        </p>
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
                                <p className="text-[16px] text-slate-500 font-black uppercase tracking-widest leading-tight">Pagas</p>
                                <p className="text-[16px] font-black text-emerald-400 leading-none pt-1">
                                  {paid.length} = {sum(paid)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[16px] text-slate-500 font-black uppercase tracking-widest leading-tight">Em Atraso</p>
                                <p className="text-[16px] font-black text-rose-400 leading-none pt-1">
                                  {overdue.length} = {sum(overdue)}
                                </p>
                              </div>
                              <div>
                                <p className="text-[16px] text-slate-500 font-black uppercase tracking-widest leading-tight">A Vencer</p>
                                <p className="text-[16px] font-black text-slate-300 leading-none pt-1">
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
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4 px-3">Cronograma de Pagamentos</h3>
                
                <div className="bg-white rounded-3xl ring-1 ring-slate-100 overflow-hidden mx-1">
                  <div className="overflow-x-auto custom-scrollbar">
                    <table className="w-full text-left border-collapse table-fixed min-w-[340px]">
                      <thead>
                        <tr className="text-[8px] font-black uppercase text-slate-400 border-b border-slate-50 bg-slate-50/50">
                          <th className="py-2 pl-3 w-[35px]">Parc</th>
                          <th className="py-2 w-[85px]">Vencimento</th>
                          <th className="py-2 w-[85px]">Pagamento</th>
                          <th className="py-2 w-[85px]">Valor</th>
                          <th className="py-2 pr-3 text-center w-[50px]">Status</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-slate-50">
                        {selectedSale.installments?.map((inst) => {
                          const dueDate = new Date(inst.dueDate);
                          dueDate.setHours(0,0,0,0);
                          const today = new Date();
                          today.setHours(0,0,0,0);
                          
                          const isPaid = inst.status === 'paid';
                          const isOverdue = !isPaid && dueDate < today;
                          
                          const rowColor = isPaid ? 'text-slate-900' : (isOverdue ? 'text-rose-600' : 'text-slate-400');

                          return (
                            <tr key={inst.id} className={cn("text-[10px] font-normal transition-colors group", rowColor)}>
                              <td className="py-2.5 pl-3 font-bold">{String(inst.number).padStart(2, '0')}</td>
                              <td className="py-2.5">
                                <input 
                                  type="date" 
                                  value={inst.dueDate ? new Date(inst.dueDate).toISOString().split('T')[0] : ''} 
                                  className="bg-transparent border-none p-0 focus:ring-0 w-full text-inherit font-inherit cursor-pointer hover:underline decoration-dotted"
                                  onChange={(e) => updateInstallmentField(selectedSale.id, inst.id, 'dueDate', new Date(e.target.value + 'T12:00:00').toISOString())}
                                />
                              </td>
                              <td className="py-2.5">
                                <input 
                                  type="date" 
                                  value={inst.paidAt ? new Date(inst.paidAt).toISOString().split('T')[0] : ''} 
                                  className={cn(
                                    "bg-transparent border-none p-0 focus:ring-0 w-full text-inherit font-inherit cursor-pointer hover:underline decoration-dotted",
                                    !inst.paidAt && "text-slate-200"
                                  )}
                                  onChange={(e) => {
                                    const val = e.target.value ? new Date(e.target.value + 'T12:00:00').toISOString() : null;
                                    updateInstallmentField(selectedSale.id, inst.id, 'paidAt', val);
                                  }}
                                />
                              </td>
                              <td className="py-2.5">
                                <div className="flex items-center gap-0.5">
                                  <span className="opacity-40 font-medium scale-90">R$</span>
                                  <input 
                                    type="number" 
                                    step="0.01"
                                    value={inst.value} 
                                    className="bg-transparent border-none p-0 focus:ring-0 w-full text-inherit font-medium"
                                    onChange={(e) => updateInstallmentField(selectedSale.id, inst.id, 'value', Number(e.target.value))}
                                  />
                                </div>
                              </td>
                              <td className="py-2.5 pr-3 text-center">
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
                    <Button variant="outline" className="flex-1 h-11 rounded-2xl border-slate-200 text-slate-900 text-xs font-bold" onClick={() => setSelectedSale(null)}>
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
