import React, { useEffect, useState } from 'react';
import { 
  collection, 
  query, 
  where, 
  getDocs, 
  orderBy, 
  updateDoc, 
  doc, 
  serverTimestamp 
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
  Car
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

import { toast } from 'sonner';

interface ProposalListProps {
  onNewProposal: () => void;
}

export function ProposalList({ onNewProposal }: ProposalListProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedSale, setSelectedSale] = useState<Proposal | null>(null);

  const fetchProposals = async (force = false) => {
    if (!auth.currentUser) return;
    
    const cached = localStorage.getItem('ansolin_proposals');
    if (cached && !force) {
      setProposals(JSON.parse(cached).map((p: any) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt)
      })));
      setLoading(false);
    } else {
      setLoading(true);
    }

    try {
      let q = query(
        collection(db, 'proposals'),
        where('userId', '==', auth.currentUser.uid),
        orderBy('createdAt', 'desc')
      );
      
      const snapshot = await getDocs(q);
      const data = snapshot.docs.map(doc => {
        const d = doc.data();
        return {
          id: doc.id,
          ...d,
          createdAt: d.createdAt.toDate().toISOString(),
          updatedAt: d.updatedAt.toDate().toISOString()
        };
      });
      
      localStorage.setItem('ansolin_proposals', JSON.stringify(data));
      setProposals(data.map((p: any) => ({
        ...p,
        createdAt: new Date(p.createdAt),
        updatedAt: new Date(p.updatedAt)
      })) as any);
    } catch (error) {
      console.error('Error fetching proposals:', error);
      toast.error('Erro ao carregar vendas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  const toggleInstallmentStatus = async (saleId: string, installmentId: string) => {
    const sale = proposals.find(p => p.id === saleId);
    if (!sale || !sale.installments) return;

    const updatedInstallments = sale.installments.map(inst => 
      inst.id === installmentId 
        ? { ...inst, status: inst.status === 'paid' ? 'pending' : 'paid' } as Installment
        : inst
    );

    // Update locally
    const updatedProposal = { ...sale, installments: updatedInstallments };
    setProposals(prev => prev.map(p => p.id === saleId ? updatedProposal : p));
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
                          {format(sale.createdAt, 'dd/MM/yy')}
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
      <Dialog open={!!selectedSale} onOpenChange={() => setSelectedSale(null)}>
        <DialogContent className="max-w-md w-[95%] rounded-3xl p-0 overflow-hidden border-none shadow-2xl">
          {selectedSale && (
            <div className="bg-[#F8FAFC]">
              <div className="bg-slate-900 p-6 text-white space-y-4">
                <div className="flex justify-between items-start">
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest mb-1">Cliente</p>
                    <h2 className="text-xl font-black">{selectedSale.customerName}</h2>
                  </div>
                  <div className="w-10 h-10 bg-white/10 rounded-xl flex items-center justify-center">
                    <UserIcon className="w-5 h-5" />
                  </div>
                </div>
                
                <div className="grid grid-cols-2 gap-4 pt-2">
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Valor Venda</p>
                    <p className="text-sm font-bold">{(selectedSale.carPrice || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div>
                    <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Parcelas</p>
                    <p className="text-sm font-bold">{selectedSale.installmentCount}x {(selectedSale.installmentValue || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                </div>
              </div>

              <div className="p-6">
                <h3 className="text-xs font-black uppercase tracking-widest text-slate-400 mb-4">Cronograma de Pagamentos</h3>
                <div className="space-y-3 max-h-[40vh] overflow-y-auto pr-2 custom-scrollbar">
                  {selectedSale.installments?.map((inst) => (
                    <div 
                      key={inst.id}
                      className={cn(
                        "flex items-center justify-between p-3 rounded-2xl border transition-all cursor-pointer",
                        inst.status === 'paid' ? "bg-emerald-50 border-emerald-100" : "bg-white border-slate-100"
                      )}
                      onClick={() => toggleInstallmentStatus(selectedSale.id, inst.id)}
                    >
                      <div className="flex items-center gap-3">
                        <div className={cn(
                          "w-8 h-8 rounded-full flex items-center justify-center text-[10px] font-black",
                          inst.status === 'paid' ? "bg-emerald-500 text-white" : "bg-slate-100 text-slate-500"
                        )}>
                          {inst.number}
                        </div>
                        <div>
                          <p className="text-xs font-black text-slate-900">{(inst.value || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                          <p className="text-[10px] text-slate-500 font-bold uppercase">{format(new Date(inst.dueDate), 'dd MMMM yyyy', { locale: ptBR })}</p>
                        </div>
                      </div>
                      <div className={cn(
                        "p-1.5 rounded-full",
                        inst.status === 'paid' ? "text-emerald-500" : "text-slate-300"
                      )}>
                        {inst.status === 'paid' ? <CheckCircle2 className="w-5 h-5 fill-emerald-50" /> : <RefreshCw className="w-5 h-5" />}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
              
              <div className="px-6 pb-6 pt-2">
                <Button variant="outline" className="w-full h-11 rounded-2xl border-slate-200 text-slate-900 text-xs font-bold" onClick={() => setSelectedSale(null)}>
                  Fechar Detalhes
                </Button>
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
