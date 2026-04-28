import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Proposal, ProposalStatus } from '../types';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  XCircle,
  Car,
  Users,
  ArrowUpRight,
  TrendingDown,
  CalendarDays
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { format } from 'date-fns';
import { ptBR } from 'date-fns/locale';

interface DashboardProps {
  onNewProposal: () => void;
}

export function Dashboard({ onNewProposal }: DashboardProps) {
  const [stats, setStats] = useState({
    total: 0,
    pending: 0,
    approved: 0,
    rejected: 0,
    totalValue: 0
  });
  const [recentProposals, setRecentProposals] = useState<Proposal[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    async function fetchStats() {
      if (!auth.currentUser) return;

      try {
        const q = query(
          collection(db, 'proposals'),
          where('userId', '==', auth.currentUser.uid)
        );
        const snapshot = await getDocs(q);
        const data = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as any));
        
        const summary = data.reduce((acc, curr) => {
          acc.total++;
          if (curr.status === ProposalStatus.PENDING) acc.pending++;
          if (curr.status === ProposalStatus.APPROVED) acc.approved++;
          if (curr.status === ProposalStatus.REJECTED) acc.rejected++;
          acc.totalValue += curr.carPrice;
          return acc;
        }, { total: 0, pending: 0, approved: 0, rejected: 0, totalValue: 0 });

        setStats(summary);

        // Fetch recent
        const recentQ = query(
          collection(db, 'proposals'),
          where('userId', '==', auth.currentUser.uid),
          orderBy('createdAt', 'desc'),
          limit(5)
        );
        const recentSnapshot = await getDocs(recentQ);
        setRecentProposals(recentSnapshot.docs.map(doc => {
          const d = doc.data();
          return {
            id: doc.id,
            ...d,
            createdAt: d.createdAt.toDate(),
            updatedAt: d.updatedAt.toDate()
          } as Proposal;
        }));
      } catch (error) {
        console.error('Error fetching dashboard data:', error);
      } finally {
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const kpis = [
    { 
      label: 'Volume Total', 
      value: `R$ ${(stats.totalValue / 1000).toFixed(1)}k`, 
      icon: TrendingUp, 
      color: 'text-blue-600', 
      bg: 'bg-blue-50',
      desc: 'Valor em propostas criadas'
    },
    { 
      label: 'Em Análise', 
      value: stats.pending, 
      icon: Clock, 
      color: 'text-amber-600', 
      bg: 'bg-amber-50',
      desc: 'Aguardando aprovação'
    },
    { 
      label: 'Aprovadas', 
      value: stats.approved, 
      icon: CheckCircle2, 
      color: 'text-emerald-600', 
      bg: 'bg-emerald-50',
      desc: 'Crédito liberado'
    },
    { 
      label: 'Recusadas', 
      value: stats.rejected, 
      icon: XCircle, 
      color: 'text-rose-600', 
      bg: 'bg-rose-50',
      desc: 'Crédito não aprovado'
    },
  ];

  if (loading) {
    return <div className="space-y-8 animate-pulse">
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-32 bg-slate-200 rounded-xl" />)}
      </div>
      <div className="h-64 bg-slate-200 rounded-xl" />
    </div>;
  }

  return (
    <div className="space-y-8">
      {/* Welcome Header */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Painel de Controle</h1>
          <p className="text-slate-500">Acompanhe suas vendas e propostas em tempo real.</p>
        </div>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="px-3 py-1 border-slate-200 text-slate-600 bg-white">
            <CalendarDays className="w-3.5 h-3.5 mr-2" />
            {format(new Date(), "MMMM yyyy", { locale: ptBR })}
          </Badge>
          <button 
            onClick={onNewProposal}
            className="inline-flex items-center justify-center px-4 py-2 text-sm font-semibold text-white bg-slate-900 rounded-lg hover:bg-slate-800 transition-all shadow-md active:scale-95"
          >
            Nova Proposta
          </button>
        </div>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-6">
        {kpis.map((kpi, idx) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="border-none shadow-sm shadow-slate-100 ring-1 ring-slate-200 overflow-hidden group hover:ring-slate-300 transition-all">
              <CardContent className="p-6">
                <div className="flex justify-between items-start">
                  <div className={cn("p-2.5 rounded-xl transition-transform group-hover:scale-110", kpi.bg)}>
                    <kpi.icon className={cn("w-6 h-6", kpi.color)} />
                  </div>
                  {stats.total > 0 && (
                    <div className="flex items-center text-[10px] font-bold text-green-600 bg-green-50 px-2 py-0.5 rounded-full">
                      <ArrowUpRight className="w-3 h-3 mr-0.5" />
                      12%
                    </div>
                  )}
                </div>
                <div className="mt-4">
                  <h3 className="text-sm font-medium text-slate-500">{kpi.label}</h3>
                  <div className="flex items-baseline gap-2">
                    <p className="text-2xl font-bold text-slate-900">{kpi.value}</p>
                  </div>
                  <p className="text-[10px] text-slate-400 mt-1 font-medium italic">{kpi.desc}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Main Grid Content */}
      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        {/* Recent Proposals */}
        <Card className="lg:col-span-2 border-none shadow-sm shadow-slate-200 ring-1 ring-slate-100">
          <CardHeader className="flex flex-row items-center justify-between border-b border-slate-50">
            <div>
              <CardTitle className="text-lg">Propostas Recentes</CardTitle>
              <CardDescription>Últimas 5 propostas enviadas.</CardDescription>
            </div>
            <Users className="w-5 h-5 text-slate-400" />
          </CardHeader>
          <CardContent className="p-0">
            <div className="overflow-x-auto">
              <table className="w-full text-left">
                <thead>
                  <tr className="bg-slate-50/50 text-slate-400 text-[10px] uppercase tracking-wider font-bold">
                    <th className="px-6 py-3">Cliente</th>
                    <th className="px-6 py-3">Veículo</th>
                    <th className="px-6 py-3">Valor</th>
                    <th className="px-6 py-3">Status</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-50">
                  {recentProposals.length === 0 ? (
                    <tr>
                      <td colSpan={4} className="px-6 py-10 text-center text-slate-400 italic text-sm">
                        Nenhuma proposta encontrada. Comece criando uma!
                      </td>
                    </tr>
                  ) : (
                    recentProposals.map((prop) => (
                      <tr key={prop.id} className="hover:bg-slate-50/50 transition-colors cursor-pointer group">
                        <td className="px-6 py-4">
                          <p className="text-sm font-semibold text-slate-900">{prop.customerName}</p>
                          <p className="text-[10px] text-slate-400 font-medium">#{prop.id.slice(-6).toUpperCase()}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm text-slate-700 font-medium">{prop.carModel}</p>
                          <p className="text-[10px] text-slate-400">{prop.carYear}</p>
                        </td>
                        <td className="px-6 py-4">
                          <p className="text-sm font-mono font-bold text-slate-900 group-hover:text-blue-600 transition-colors">
                            {prop.carPrice.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                          </p>
                        </td>
                        <td className="px-6 py-4">
                          <StatusBadge status={prop.status} />
                        </td>
                      </tr>
                    ))
                  )}
                </tbody>
              </table>
            </div>
          </CardContent>
        </Card>

        {/* Quick Simulator / Insights */}
        <div className="space-y-6">
          <Card className="bg-slate-900 text-white border-none shadow-xl shadow-slate-200">
            <CardHeader>
              <CardTitle className="text-lg">Resumo de Vendas</CardTitle>
              <CardDescription className="text-slate-400">Conversão por canal</CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Financiamento Direto</span>
                  <span>65%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-white w-[65%] h-full" />
                </div>
              </div>
              <div className="space-y-2">
                <div className="flex justify-between text-xs font-medium">
                  <span>Consórcio</span>
                  <span>24%</span>
                </div>
                <div className="w-full bg-slate-800 h-1.5 rounded-full overflow-hidden">
                  <div className="bg-blue-500 w-[24%] h-full" />
                </div>
              </div>
              <div className="pt-4 border-t border-slate-800 flex items-center justify-between">
                <div className="flex flex-col">
                  <span className="text-[10px] text-slate-500 uppercase tracking-widest font-bold">Ticket Médio</span>
                  <span className="text-xl font-bold">R$ 84,5k</span>
                </div>
                <TrendingUp className="w-8 h-8 text-green-500 opacity-50" />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none bg-white shadow-sm ring-1 ring-slate-100 italic p-6">
            <div className="flex gap-4">
              <div className="p-2 h-fit bg-slate-100 rounded-lg">
                <ArrowUpRight className="w-4 h-4 text-slate-600" />
              </div>
              <div>
                <h4 className="text-sm font-bold text-slate-900">Dica de Conversão</h4>
                <p className="text-xs text-slate-500 mt-1 leading-relaxed">
                  "Oferecer uma entrada de 30% aumenta as chances de aprovação instantânea em até 40% para clientes com Score médio."
                </p>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </div>
  );
}

function StatusBadge({ status }: { status: ProposalStatus }) {
  const styles = {
    [ProposalStatus.DRAFT]: "bg-slate-100 text-slate-600",
    [ProposalStatus.PENDING]: "bg-amber-100 text-amber-700",
    [ProposalStatus.APPROVED]: "bg-emerald-100 text-emerald-700",
    [ProposalStatus.REJECTED]: "bg-rose-100 text-rose-700",
    [ProposalStatus.COMPLETED]: "bg-blue-100 text-blue-700",
  };

  const labels = {
    [ProposalStatus.DRAFT]: "Rascunho",
    [ProposalStatus.PENDING]: "Em Análise",
    [ProposalStatus.APPROVED]: "Aprovada",
    [ProposalStatus.REJECTED]: "Recusada",
    [ProposalStatus.COMPLETED]: "Concluída",
  };

  return (
    <Badge variant="secondary" className={cn("px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider", styles[status])}>
      {labels[status]}
    </Badge>
  );
}
