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

function GlobalFinanceChart({ recebido, overdue, pendingFuture, paidCount, totalCount }: { recebido: number, overdue: number, pendingFuture: number, paidCount: number, totalCount: number }) {
  const totalValue = recebido + overdue + pendingFuture || 1;
  const size = 120;
  const strokeWidth = 12;
  const radius = (size - strokeWidth) / 2;
  
  // Usaremos 20 segmentos para representar a saúde financeira global
  const segments = 20;
  const segmentAngle = 360 / segments;
  
  const pctRecebido = recebido / totalValue;
  const pctOverdue = overdue / totalValue;
  
  const numRecebido = Math.round(pctRecebido * segments);
  const numOverdue = Math.round(pctOverdue * segments);
  
  const getStrokeColor = (index: number) => {
    if (index < numRecebido) return "#84cc16"; // verde (recebido)
    if (index < numRecebido + numOverdue) return "#f43f5e"; // vermelho (vencido)
    return "#e2e8f0"; // cinza (a receber)
  };

  const polarToCartesian = (centerX: number, centerY: number, radius: number, angleInDegrees: number) => {
    const angleInRadians = (angleInDegrees * Math.PI) / 180.0;
    return {
      x: centerX + radius * Math.cos(angleInRadians),
      y: centerY + radius * Math.sin(angleInRadians)
    };
  };

  return (
    <div className="flex items-center gap-6 bg-white p-5 rounded-3xl ring-1 ring-slate-100 shadow-sm">
      <div className="relative w-[120px] h-[120px] shrink-0">
        <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} className="transform -rotate-90">
             {Array.from({ length: segments }).map((_, index) => {
                const startAngle = index * segmentAngle;
                const endAngle = (index + 1) * segmentAngle;
                
                const start = polarToCartesian(size/2, size/2, radius, startAngle);
                const end = polarToCartesian(size/2, size/2, radius, endAngle);
                const largeArcFlag = "0";

                const d = [
                  "M", start.x, start.y, 
                  "A", radius, radius, 0, largeArcFlag, 1, end.x, end.y
                ].join(" ");

                return (
                  <path
                    key={`segment-${index}`}
                    d={d}
                    fill="none"
                    stroke={getStrokeColor(index)}
                    strokeWidth={strokeWidth}
                    strokeLinecap="butt"
                    className="transition-all duration-500"
                  />
                );
             })}

             {/* Divisores entre os segmentos */}
             {segments > 1 && Array.from({ length: segments }).map((_, index) => {
                const angle = index * segmentAngle;
                const innerRadius = radius - strokeWidth / 2;
                const outerRadius = radius + strokeWidth / 2;
                
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
        <div className="absolute inset-0 flex flex-col items-center justify-center leading-none">
          <p className="text-[10px] font-black text-slate-400 uppercase tracking-tighter">Geral</p>
          <p className="text-sm font-black text-slate-900 tracking-tighter">
            {paidCount}/{totalCount}
          </p>
        </div>
      </div>
      
      <div className="flex-1 space-y-2.5">
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-lime-500" />
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Recebido</p>
            <p className="text-[11px] font-bold text-slate-900 truncate">
              {recebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-rose-500" />
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">Vencido</p>
            <p className="text-[11px] font-bold text-rose-600 truncate">
              {overdue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <div className="w-2 h-2 rounded-full bg-slate-200" />
          <div className="min-w-0">
            <p className="text-[9px] font-black text-slate-400 uppercase tracking-wider leading-none mb-1">A Receber</p>
            <p className="text-[11px] font-bold text-slate-600 truncate">
              {pendingFuture.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}

export function Dashboard({ onNewProposal, onViewProposals, onSelectSale }: DashboardProps) {
  const [stats, setStats] = useState(() => {
    const saved = localStorage.getItem('ansolin_stats');
    return saved ? JSON.parse(saved) : {
      recebido: 0,
      aReceber: 0,
      overdue: 0,
      pendingFuture: 0,
      totalVendido: 0,
      count: 0,
      totalInstallments: 0,
      paidInstallments: 0
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
            acc.count++;
            
            const today = new Date();
            today.setHours(0, 0, 0, 0);

            if (curr.installments) {
              curr.installments.forEach((inst: Installment) => {
                acc.totalInstallments++;
                const dueDate = new Date(inst.dueDate);
                dueDate.setHours(0, 0, 0, 0);

                if (inst.status === 'paid') {
                  acc.recebido += (inst.value || 0);
                  acc.paidInstallments++;
                } else {
                  if (dueDate < today) {
                    acc.overdue += (inst.value || 0);
                  } else {
                    acc.pendingFuture += (inst.value || 0);
                  }
                  acc.aReceber += (inst.value || 0);
                }
              });
            }
            return acc;
          }, { recebido: 0, aReceber: 0, overdue: 0, pendingFuture: 0, totalVendido: 0, count: 0, totalInstallments: 0, paidInstallments: 0 });

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
        {[1, 2].map(i => <div key={i} className="h-28 bg-slate-200 rounded-2xl" />)}
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

      {/* Global Financial Chart */}
      <motion.div
        initial={{ opacity: 0, y: 20 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ duration: 0.5 }}
      >
        <GlobalFinanceChart 
          recebido={stats.recebido || 0} 
          overdue={stats.overdue || 0} 
          pendingFuture={stats.pendingFuture || 0} 
          paidCount={stats.paidInstallments || 0}
          totalCount={stats.totalInstallments || 0}
        />
      </motion.div>

      {/* Recent Sales List (Mobile Style) */}
      <div className="space-y-3">
        <div className="flex items-center justify-between px-1">
          <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Parcelamento Direto</h2>
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
                      <CardContent className="pt-2 pb-1.5 px-3.5 space-y-2">
                        <div className="flex justify-between items-start">
                          <div className="flex-1 min-w-0">
                            <div className="flex items-baseline gap-2 overflow-hidden">
                              <p className="text-[14px] font-black text-slate-900 truncate flex-shrink-0 max-w-[55%]">{sale.customerName}</p>
                                {sale.customerPhone && (
                                  <div className="flex items-center gap-1.5 truncate min-w-0">
                                    <p className="text-[14px] font-normal text-slate-400 truncate tracking-tight">{sale.customerPhone}</p>
                                    {metrics.overdueCount === 0 && metrics.pendingCount === 0 && sale.installments && sale.installments.length > 0 && (
                                      <Badge className="bg-emerald-500 text-white border-none text-[14px] h-auto px-2 py-0 font-normal uppercase tracking-tighter ml-auto">Quitado</Badge>
                                    )}
                                  </div>
                                )}
                            </div>
                            <p className="text-[12px] text-slate-500 font-normal uppercase tracking-tight truncate leading-tight mt-0.5">
                              {sale.carModel}{sale.carYear ? ` / ${sale.carYear}` : ''}{sale.carColor ? ` / ${sale.carColor}` : ''}
                            </p>
                          </div>
                          <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5 group-hover:text-slate-900 transition-colors" />
                        </div>

                        <div className="space-y-1.5">
                          <div className={`grid ${metrics.overdueCount > 0 && metrics.pendingCount > 0 ? 'grid-cols-3' : (metrics.overdueCount > 0 || metrics.pendingCount > 0 ? 'grid-cols-2' : 'grid-cols-1')} gap-2`}>
                            <div className="space-y-0 text-left">
                              <p className="text-[9px] font-black uppercase tracking-wider text-emerald-500">Pagas</p>
                              <p className="text-[11px] font-black text-slate-900 leading-none">
                                {metrics.paidCount} = {metrics.paidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                              </p>
                            </div>
                            {metrics.overdueCount > 0 && (
                              <div className={`space-y-0 ${metrics.pendingCount > 0 ? 'text-center' : 'text-right'}`}>
                                <p className="text-[9px] font-black uppercase tracking-wider text-rose-500">Em Atraso</p>
                                <p className="text-[11px] font-black text-slate-900 leading-none">
                                  {metrics.overdueCount} = {metrics.overdueValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                            )}
                            {metrics.pendingCount > 0 && (
                              <div className="space-y-0 text-right">
                                <p className="text-[9px] font-black uppercase tracking-wider text-slate-400">A Vencer</p>
                                <p className="text-[11px] font-black text-slate-900 leading-none">
                                  {metrics.pendingCount} = {metrics.pendingValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                            )}
                          </div>

                          <div className="h-1.5 bg-slate-100 w-full rounded-full overflow-hidden flex gap-[1px]">
                            {sale.installments?.sort((a,b) => a.number - b.number).map((inst, idx) => {
                              const today = new Date();
                              today.setHours(0,0,0,0);
                              const dueDate = new Date(inst.dueDate);
                              dueDate.setHours(0,0,0,0);
                              
                              let bgColor = "bg-slate-200";
                              if (inst.status === 'paid') bgColor = "bg-lime-500";
                              else if (dueDate < today) bgColor = "bg-rose-500";

                              return (
                                <motion.div 
                                  key={inst.id}
                                  initial={{ width: 0 }}
                                  animate={{ width: `${(inst.value / metrics.totalGeral) * 100}%` }}
                                  className={cn("h-full", bgColor, idx < (sale.installments?.length || 0) - 1 && "border-r border-white/30")} 
                                />
                              );
                            })}
                          </div>
                        </div>

                        <div className="flex justify-between items-center text-[10px] text-slate-400 font-bold border-t border-slate-50 pt-1.5">
                          <span className="flex items-center gap-1">
                            <Calendar className="w-3 h-3" />
                            {safeFormat(sale.createdAt, 'dd/MM/yy')}
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
