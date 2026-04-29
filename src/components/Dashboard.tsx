import React, { useEffect, useState } from 'react';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { Proposal, ProposalStatus, Installment } from '../types';
import { 
  TrendingUp, 
  Clock, 
  CheckCircle2, 
  CircleDollarSign,
  Users,
  Wallet,
  ArrowUpRight,
  TrendingDown,
  CalendarDays,
  Activity,
  ChevronRight,
  Calendar
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { format, isValid } from 'date-fns';
import { ptBR } from 'date-fns/locale';

const safeFormat = (date: Date | string | number | null | undefined, fmt: string, options?: any) => {
  if (!date) return 'Data Inválida';
  const d = new Date(date);
  if (!isValid(d)) return 'Data Inválida';
  return format(d, fmt, options);
};

interface DashboardProps {
  onNewProposal: () => void;
  onViewProposals: () => void;
  onSelectSale: (id: string) => void;
}

export function Dashboard({ onNewProposal, onViewProposals, onSelectSale }: DashboardProps) {
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('ansolin_stats');
    return saved ? JSON.parse(saved) : {
      recebido: 0,
      aReceber: 0,
      totalVendido: 0,
      count: 0
    };
  });
  const [recentSales, setRecentSales] = useState<Proposal[]>(() => {
    const saved = localStorage.getItem('ansolin_recent');
    return saved ? JSON.parse(saved) : [];
  });
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    async function fetchStats() {
      if (!auth.currentUser) return;

      try {
        const q = query(
          collection(db, 'proposals'),
          where('userId', '==', auth.currentUser.uid)
        );
        
        const unsubscribeStats = onSnapshot(q, (snapshot) => {
          if (snapshot.empty && stats.count > 0 && snapshot.metadata.fromCache) {
            // Ignore empty cache if we have local stats to prevent wipe before error
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
          
          const summary = data.reduce((acc, curr: any) => {
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

          // Sort data for recent sales descending
          const sortedData = [...data].sort((a, b) => new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime());
          const recent = sortedData.slice(0, 5);

          // Only overwrite if we actually got something, or if it's genuinely empty from server
          if (!snapshot.empty || !snapshot.metadata.fromCache) {
            setStats(summary);
            localStorage.setItem('ansolin_stats', JSON.stringify(summary));
            setRecentSales(recent as any);
            localStorage.setItem('ansolin_recent', JSON.stringify(recent));
          }
          setLoading(false);
        }, (error) => {
          console.error('Error in stats snapshot:', error);
          setLoading(false);
        });

        return () => {
          unsubscribeStats();
        };
      } catch (error) {
        console.error('Error setting up dashboard listeners:', error);
        setLoading(false);
      }
    }

    fetchStats();
  }, []);

  const kpis = [
    { 
      label: 'Recebido', 
      value: (stats.recebido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
      icon: CheckCircle2, 
      color: 'text-emerald-500', 
      bg: 'bg-emerald-50',
      desc: 'Soma de entradas e parcelas pagas'
    },
    { 
      label: 'A Receber', 
      value: (stats.aReceber || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
      icon: Clock, 
      color: 'text-amber-500', 
      bg: 'bg-amber-50',
      desc: 'Total de parcelas em aberto'
    },
    { 
      label: 'Total em Vendas', 
      value: (stats.totalVendido || 0).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' }), 
      icon: TrendingUp, 
      color: 'text-blue-500', 
      bg: 'bg-blue-50',
      desc: 'Valor total negociado'
    },
    { 
      label: 'Volume de Vendas', 
      value: stats.count, 
      icon: Activity, 
      color: 'text-purple-500', 
      bg: 'bg-purple-50',
      desc: 'Total de contratos ativos'
    },
  ];

  const getSaleMetrics = (sale: Proposal) => {
    const today = new Date();
    today.setHours(0,0,0,0);
    
    const downPayment = sale.downPayment || 0;
    const installments = sale.installments || [];
    
    const paidInstallments = installments.filter(i => i.status === 'paid');
    const paidCount = paidInstallments.length;
    const paidValue = paidInstallments.reduce((acc, i) => acc + (i.value || 0), 0);

    const overdueInstallments = installments.filter(i => {
      const date = new Date(i.dueDate);
      date.setHours(0,0,0,0);
      return i.status !== 'paid' && date < today;
    });
    const overdueCount = overdueInstallments.length;
    const overdueValue = overdueInstallments.reduce((acc, i) => acc + (i.value || 0), 0);
    
    const pendingInstallments = installments.filter(i => {
      const date = new Date(i.dueDate);
      date.setHours(0,0,0,0);
      return i.status !== 'paid' && date >= today;
    });
    const pendingCount = pendingInstallments.length;
    const pendingValue = pendingInstallments.reduce((acc, i) => acc + (i.value || 0), 0);
    
    const totalGeral = paidValue + overdueValue + pendingValue;

    return { 
      paidCount,
      paidValue,
      overdueCount,
      overdueValue,
      pendingCount,
      pendingValue,
      totalGeral: totalGeral || 1
    };
  };

  if (loading && stats.count === 0 && recentSales.length === 0) {
    return <div className="space-y-6 animate-pulse">
      <div className="grid grid-cols-2 gap-4">
        {[1, 2, 3, 4].map(i => <div key={i} className="h-28 bg-slate-200 rounded-2xl" />)}
      </div>
      <div className="h-64 bg-slate-200 rounded-2xl" />
    </div>;
  }

  return (
    <div className="space-y-6">
      {/* Welcome Header */}
      <div className="flex flex-col gap-1">
        <h1 className="text-xl font-black text-slate-900 tracking-tight">Painel Financeiro</h1>
        <p className="text-xs text-slate-500 font-medium">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
      </div>

      {/* KPI Grid */}
      <div className="grid grid-cols-2 gap-4">
        {kpis.map((kpi, idx) => (
          <motion.div
            key={kpi.label}
            initial={{ opacity: 0, scale: 0.95 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ delay: idx * 0.1 }}
          >
            <Card className="border-none shadow-sm ring-1 ring-slate-100 overflow-hidden bg-white">
              <CardContent className="p-4 flex flex-col gap-3">
                <div className={cn("w-8 h-8 rounded-lg flex items-center justify-center shrink-0", kpi.bg)}>
                  <kpi.icon className={cn("w-4 h-4", kpi.color)} />
                </div>
                <div>
                  <h3 className="text-[10px] font-black uppercase tracking-widest text-slate-400">{kpi.label}</h3>
                  <p className="text-sm font-black text-slate-900 truncate">{kpi.value}</p>
                </div>
              </CardContent>
            </Card>
          </motion.div>
        ))}
      </div>

      {/* Recent Sales List (Mobile Style) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Últimos Lançamentos</h2>
        </div>
        
        <div className="space-y-4">
          {recentSales.length === 0 ? (
            <div className="p-8 text-center text-slate-400 italic text-xs bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm">
              Nenhuma venda registrada ainda.
            </div>
          ) : (
            <AnimatePresence mode="popLayout">
              {recentSales.map((sale) => {
                const metrics = getSaleMetrics(sale);

                return (
                  <motion.div
                    key={sale.id}
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    onClick={() => onSelectSale(sale.id)}
                  >
                    <Card className="border-none shadow-sm ring-1 ring-slate-100 overflow-hidden bg-white active:scale-[0.98] transition-all cursor-pointer group">
                      <CardContent className="p-3.5 space-y-3">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <p className="text-[14px] font-black text-slate-900 truncate leading-tight">{sale.customerName}</p>
                            <p className="text-[12px] text-slate-500 font-bold uppercase tracking-tight truncate">{sale.carModel}</p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5 group-hover:text-slate-900 transition-colors" />
                        </div>

                        <div className="space-y-2">
                          <div className="grid grid-cols-3 gap-2">
                            <div className="space-y-0 text-left">
                              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-500">Pagas</p>
                              <p className="text-[11px] font-black text-slate-900 leading-none">
                                {metrics.paidCount} = {metrics.paidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="space-y-0 text-center">
                              <p className="text-[9px] font-black uppercase tracking-wider text-rose-500">Em Atraso</p>
                              <p className="text-[11px] font-black text-slate-900 leading-none">
                                {metrics.overdueCount} = {metrics.overdueValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            <div className="space-y-0 text-right">
                              <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">A Vencer</p>
                              <p className="text-[11px] font-black text-slate-900 leading-none">
                                {metrics.pendingCount} = {metrics.pendingValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                          </div>

                          <div className="h-1.5 bg-slate-100 w-full rounded-full overflow-hidden flex">
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(metrics.paidValue / metrics.totalGeral) * 100}%` }}
                              className="h-full bg-lime-500" 
                            />
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(metrics.overdueValue / metrics.totalGeral) * 100}%` }}
                              className="h-full bg-rose-500" 
                            />
                            <motion.div 
                              initial={{ width: 0 }}
                              animate={{ width: `${(metrics.pendingValue / metrics.totalGeral) * 100}%` }}
                              className="h-full bg-slate-700" 
                            />
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[11px] text-slate-400 font-bold">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {safeFormat(sale.createdAt, 'dd/MM/yyyy')}
                          </span>
                          <Badge variant="outline" className="text-[10px] px-1.5 py-0 border-slate-200">
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
      </div>

      {/* Final Total (Big Card) */}
      <Card className="bg-slate-900 text-white border-none shadow-xl rounded-2xl overflow-hidden p-6 relative">
        <div className="absolute top-0 right-0 p-4 opacity-10">
          <Wallet className="w-24 h-24 rotate-12" />
        </div>
        <div className="relative z-10 space-y-4">
          <div>
            <p className="text-[10px] text-slate-400 font-black uppercase tracking-[0.2em] mb-1">Patrimônio Líquido</p>
            <h2 className="text-3xl font-black text-white">
              {((stats.recebido || 0) + (stats.aReceber || 0)).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </h2>
          </div>
          <div className="flex items-center gap-4 text-xs font-bold">
            <span className="flex items-center gap-1.5 text-emerald-400">
               <div className="w-1.5 h-1.5 bg-emerald-400 rounded-full" />
               Liquidado
            </span>
            <span className="flex items-center gap-1.5 text-amber-400">
               <div className="w-1.5 h-1.5 bg-amber-400 rounded-full" />
               Futuro
            </span>
          </div>
        </div>
      </Card>
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
