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
import { Proposal, ProposalStatus } from '../types';
import { 
  Search, 
  Filter, 
  MoreHorizontal,
  ChevronRight,
  Eye,
  CheckCircle,
  XCircle,
  RefreshCw,
  Plus
} from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { 
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';

// We need to implement Dropdown components as shadcn might not have them by default or I didn't add them. 
// I'll check my previous npx command. I added: card table badge tabs dialog input label form separator scroll-area.
// I missed dropdown-menu. Let me add it.

import { toast } from 'sonner';

interface ProposalListProps {
  onNewProposal: () => void;
}

export function ProposalList({ onNewProposal }: ProposalListProps) {
  const [proposals, setProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchTerm, setSearchTerm] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');

  const fetchProposals = async () => {
    if (!auth.currentUser) return;
    setLoading(true);
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
          createdAt: d.createdAt.toDate(),
          updatedAt: d.updatedAt.toDate()
        } as Proposal;
      });
      setProposals(data);
    } catch (error) {
      console.error('Error fetching proposals:', error);
      toast.error('Erro ao carregar propostas.');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchProposals();
  }, []);

  const handleUpdateStatus = async (id: string, newStatus: ProposalStatus) => {
    try {
      const docRef = doc(db, 'proposals', id);
      await updateDoc(docRef, {
        status: newStatus,
        updatedAt: serverTimestamp()
      });
      
      const statusLabels: Record<string, string> = {
        [ProposalStatus.APPROVED]: 'aprovada',
        [ProposalStatus.REJECTED]: 'recusada',
        [ProposalStatus.PENDING]: 'enviada para análise',
      };
      
      toast.success(`Proposta ${statusLabels[newStatus] || 'atualizada'} com sucesso!`);
      fetchProposals();
    } catch (error) {
      console.error('Error updating status:', error);
      toast.error('Erro ao atualizar status da proposta.');
    }
  };

  const filteredProposals = proposals.filter(p => {
    const matchesSearch = p.customerName.toLowerCase().includes(searchTerm.toLowerCase()) || 
                         p.carModel.toLowerCase().includes(searchTerm.toLowerCase());
    const matchesStatus = statusFilter === 'all' || p.status === statusFilter;
    return matchesSearch && matchesStatus;
  });

  return (
    <div className="space-y-6">
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Propostas de Financiamento</h1>
          <p className="text-slate-500">Gerencie e acompanhe todas as solicitações de crédito.</p>
        </div>
        <Button onClick={onNewProposal} className="bg-slate-900 shadow-md">
          <Plus className="w-4 h-4 mr-2" /> Nova Proposta
        </Button>
      </div>

      {/* Filters */}
      <Card className="border-none shadow-sm ring-1 ring-slate-200">
        <CardContent className="p-4 flex flex-col md:flex-row items-center gap-4">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
            <Input 
              placeholder="Buscar por cliente ou veículo..." 
              className="pl-9 bg-slate-50 border-slate-200 focus:bg-white"
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
            />
          </div>
          <div className="flex items-center gap-2 w-full md:w-auto">
            <Filter className="w-4 h-4 text-slate-400 mr-1" />
            <div className="flex bg-slate-100 p-1 rounded-lg gap-1 grow md:grow-0">
              {['all', 'pending', 'approved', 'rejected'].map((s) => (
                <button
                  key={s}
                  onClick={() => setStatusFilter(s)}
                  className={cn(
                    "px-3 py-1 text-[10px] uppercase font-bold rounded-md transition-all tracking-wider grow md:grow-0",
                    statusFilter === s ? "bg-white text-slate-900 shadow-sm" : "text-slate-500 hover:text-slate-700"
                  )}
                >
                  {s === 'all' ? 'Tudo' : s === 'pending' ? 'Análise' : s === 'approved' ? 'Aprovado' : 'Recusado'}
                </button>
              ))}
            </div>
          </div>
          <Button variant="ghost" size="icon" onClick={fetchProposals} className={cn("text-slate-400", loading && "animate-spin")}>
            <RefreshCw className="w-4 h-4" />
          </Button>
        </CardContent>
      </Card>

      {/* List */}
      <div className="space-y-4">
        {loading && proposals.length === 0 ? (
          <div className="space-y-4">
            {[1, 2, 3].map(i => <div key={i} className="h-32 bg-slate-100 rounded-xl animate-pulse" />)}
          </div>
        ) : filteredProposals.length === 0 ? (
          <div className="flex flex-col items-center justify-center p-20 bg-white rounded-2xl border border-dashed border-slate-200 text-slate-400">
            <Search className="w-12 h-12 mb-4 opacity-20" />
            <p className="font-medium">Nenhuma proposta encontrada</p>
            <p className="text-xs">Tente ajustar seus filtros de busca.</p>
          </div>
        ) : (
          <AnimatePresence mode="popLayout">
            {filteredProposals.map((proposal) => (
              <motion.div
                key={proposal.id}
                layout
                initial={{ opacity: 0, scale: 0.98 }}
                animate={{ opacity: 1, scale: 1 }}
                exit={{ opacity: 0, scale: 0.98 }}
                transition={{ duration: 0.2 }}
              >
                <Card className="group border-none shadow-sm shadow-slate-200 ring-1 ring-slate-100 hover:ring-slate-300 transition-all cursor-default">
                  <CardContent className="p-0">
                    <div className="flex flex-col md:flex-row md:items-center">
                      <div className="flex-1 p-6 flex flex-col md:flex-row md:items-center gap-6">
                        {/* Status Icon Indicator */}
                        <div className={cn(
                          "w-12 h-12 rounded-full flex items-center justify-center shrink-0",
                          proposal.status === ProposalStatus.APPROVED ? "bg-emerald-50 text-emerald-500" :
                          proposal.status === ProposalStatus.REJECTED ? "bg-rose-50 text-rose-500" :
                          proposal.status === ProposalStatus.PENDING ? "bg-amber-50 text-amber-500" :
                          "bg-slate-50 text-slate-400"
                        )}>
                          {proposal.status === ProposalStatus.APPROVED ? <CheckCircle className="w-6 h-6" /> :
                           proposal.status === ProposalStatus.REJECTED ? <XCircle className="w-6 h-6" /> :
                           proposal.status === ProposalStatus.PENDING ? <RefreshCw className="w-6 h-6 animate-[spin_4s_linear_infinite]" /> :
                           <Eye className="w-6 h-6" />}
                        </div>

                        {/* Customer Info */}
                        <div className="flex-1 min-w-0">
                          <div className="flex items-center gap-2 mb-1">
                            <h3 className="text-base font-bold text-slate-900 truncate">{proposal.customerName}</h3>
                            <StatusBadge status={proposal.status} />
                          </div>
                          <div className="flex items-center gap-4 text-xs text-slate-500 font-medium">
                            <span className="flex items-center gap-1">
                              <Search className="w-3 h-3" /> {proposal.id.slice(-8).toUpperCase()}
                            </span>
                            <span>•</span>
                            <span>Criado em {format(proposal.createdAt, "dd/MM/yyyy 'às' HH:mm", { locale: ptBR })}</span>
                          </div>
                        </div>

                        {/* Financial Details */}
                        <div className="md:w-48 text-left md:text-right">
                          <p className="text-xs text-slate-400 font-bold uppercase tracking-tight mb-1">Valor do Veículo</p>
                          <p className="text-lg font-mono font-bold text-slate-900">
                            {proposal.carPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                          <p className="text-[10px] text-slate-400">
                            {proposal.installmentCount}x de {proposal.installmentValue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="p-4 md:p-6 bg-slate-50 md:bg-transparent border-t md:border-t-0 md:border-l border-slate-100 flex items-center justify-end gap-2 shrink-0">
                        <div className="flex items-center gap-2">
                          {proposal.status === ProposalStatus.PENDING && (
                            <>
                              <Button 
                                size="sm" 
                                onClick={() => handleUpdateStatus(proposal.id, ProposalStatus.APPROVED)}
                                className="h-8 bg-emerald-600 hover:bg-emerald-700 text-white shadow-sm"
                              >
                                Aprovar
                              </Button>
                              <Button 
                                size="sm" 
                                variant="outline"
                                onClick={() => handleUpdateStatus(proposal.id, ProposalStatus.REJECTED)}
                                className="h-8 border-rose-200 text-rose-600 hover:bg-rose-50"
                              >
                                Recusar
                              </Button>
                            </>
                          )}
                          {proposal.status === ProposalStatus.DRAFT && (
                             <Button 
                               size="sm" 
                               onClick={() => handleUpdateStatus(proposal.id, ProposalStatus.PENDING)}
                               className="h-8 bg-slate-900"
                             >
                               Enviar
                             </Button>
                          )}
                          <Button variant="ghost" size="icon" className="h-8 w-8 text-slate-400">
                            <MoreHorizontal className="w-4 h-4" />
                          </Button>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              </motion.div>
            ))}
          </AnimatePresence>
        )}
      </div>
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
