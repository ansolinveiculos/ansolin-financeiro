import React, { useEffect, useState, useRef } from 'react';
import { collection, query, where, getDocs, orderBy, limit, onSnapshot } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType, isAdmin } from '../lib/firebase';
import { Proposal, ProposalStatus, Installment } from '../types';
import { calculateStats } from '../lib/stats';
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
  Calendar,
  Search,
  X,
  Share2,
  Mail,
  MessageCircle,
  Download,
  Image as ImageIcon,
  FileText
} from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { 
  DropdownMenu, 
  DropdownMenuContent, 
  DropdownMenuItem, 
  DropdownMenuTrigger,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuGroup
} from '@/components/ui/dropdown-menu';
import { motion, AnimatePresence } from 'motion/react';
import { cn } from '@/lib/utils';
import { format, isValid, parseISO } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import * as htmlToImage from 'html-to-image';
import { jsPDF } from 'jspdf';

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
          <p className="text-sm font-black text-slate-900 tracking-tighter">
            {Math.round(pctRecebido * 100)}%
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
  const exportRef = useRef<HTMLDivElement>(null);
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
  const [searchTerm, setSearchTerm] = useState('');
  const [loading, setLoading] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async (type: 'image' | 'pdf' | 'whatsapp' | 'email') => {
    if (!exportRef.current) return;
    setExporting(true);

    try {
      // Pequeno delay maior para garantir renderização completa de ícones e fontes
      await new Promise(resolve => setTimeout(resolve, 500));

      const node = exportRef.current;
      
      // Captura com Pixel Ratio 2 para alta definição (estilo Retina)
      const dataUrl = await htmlToImage.toPng(node, {
        quality: 1,
        pixelRatio: 2,
        backgroundColor: '#F8FAFC',
        cacheBust: true,
        height: node.scrollHeight,
        width: node.scrollWidth,
        style: {
          transform: 'scale(1)',
          transformOrigin: 'top left',
        }
      });

      const dateStr = format(new Date(), 'dd-MM-yyyy-HHmm');
      const filename = `relatorio-financeiro-${dateStr}`;

      if (type === 'image') {
        const link = document.createElement('a');
        link.download = `${filename}.png`;
        link.href = dataUrl;
        link.click();
      } else if (type === 'pdf') {
        const img = new Image();
        img.src = dataUrl;
        await new Promise(resolve => img.onload = resolve);
        
        // No PDF, usamos a proporção original mas ajustamos para uma densidade legível
        const pdf = new jsPDF({
          orientation: img.width > img.height ? 'l' : 'p',
          unit: 'px',
          format: [img.width / 2, img.height / 2] // Ajustamos para o tamanho real do layout
        });

        pdf.addImage(dataUrl, 'PNG', 0, 0, img.width / 2, img.height / 2);
        pdf.save(`${filename}.pdf`);
      } else if (type === 'whatsapp' || type === 'email') {
        const summary = `
🚀 *Relatório Financeiro ANSOLIN*
📅 Data: ${format(new Date(), 'dd/MM/yyyy')}

💰 Recebido: ${stats.recebido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
⚠️ Vencido: ${stats.overdue.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
⏳ A Receber: ${stats.pendingFuture.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
✅ Saúde: ${Math.round((stats.recebido / (stats.recebido + stats.overdue + stats.pendingFuture || 1)) * 100)}%

Total Vendido: ${stats.totalVendido.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
        `.trim();

        if (type === 'whatsapp') {
          window.open(`https://wa.me/?text=${encodeURIComponent(summary)}`, '_blank');
        } else {
          window.location.href = `mailto:?subject=Relatório Financeiro ANSOLIN&body=${encodeURIComponent(summary)}`;
        }
      }
    } catch (error) {
      console.error('Erro ao exportar:', error);
    } finally {
      setExporting(false);
    }
  };

  const filteredSales = searchTerm.length >= 3 
    ? recentSales.filter(sale => {
        const search = searchTerm.toLowerCase();
        return (
          sale.customerName?.toLowerCase().includes(search) ||
          sale.carModel?.toLowerCase().includes(search) ||
          sale.carPlate?.toLowerCase().includes(search) ||
          sale.customerPhone?.toLowerCase().includes(search)
        );
      })
    : recentSales;

  useEffect(() => {
    async function fetchStats() {
      if (!auth.currentUser) return;

      try {
        const isAdminUser = isAdmin(auth.currentUser);
        
        const q = isAdminUser 
          ? query(collection(db, 'proposals'))
          : query(
              collection(db, 'proposals'),
              where('userId', '==', auth.currentUser.uid),
              orderBy('createdAt', 'desc')
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
          
          const summary = calculateStats(data);

          // Sort data for priority: overdue first, fully paid last
          const sortedData = [...data].sort((a, b) => {
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

            // Quitados sempre por último
            if (paidA && !paidB) return 1;
            if (!paidA && paidB) return -1;

            // Ordenar por quantidade de parcelas em atraso (descendente)
            const overdueA = getOverdueCount(a);
            const overdueB = getOverdueCount(b);

            if (overdueA !== overdueB) return overdueB - overdueA;

            // Fallback para data de criação
            return new Date(b.createdAt as string).getTime() - new Date(a.createdAt as string).getTime();
          });

          const recent = sortedData.slice(0, 10); // Aumentado para 10 para mostrar mais no dashboard

          // Only overwrite if we actually got something, or if it's genuinely empty from server
          if (!snapshot.empty || !snapshot.metadata.fromCache) {
            setStats(summary);
            localStorage.setItem('ansolin_stats', JSON.stringify(summary));
            setRecentSales(recent as any);
            localStorage.setItem('ansolin_recent', JSON.stringify(recent));
          }
          setLoading(false);
        }, (error) => {
          handleFirestoreError(error, OperationType.GET, 'proposals');
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

    const getSaleReferenceDate = () => {
      if (!installments || installments.length === 0) return new Date(sale.createdAt || new Date());
      const sorted = [...installments].sort((a,b) => new Date(a.dueDate).getTime() - new Date(b.dueDate).getTime());
      const firstDue = new Date(sorted[0].dueDate);
      const refDate = new Date(firstDue);
      refDate.setDate(refDate.getDate() - 30);
      return refDate;
    };

    return { 
      paidCount,
      paidValue,
      overdueCount,
      overdueValue,
      pendingCount,
      pendingValue,
      totalGeral: totalGeral || 1,
      referenceDate: getSaleReferenceDate()
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
    <div className="space-y-6" ref={exportRef}>
      {/* Welcome Header */}
      <div className="flex items-start justify-between">
        <div className="flex flex-col gap-1">
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Painel Financeiro</h1>
          <p className="text-xs text-slate-500 font-medium">{format(new Date(), "EEEE, dd 'de' MMMM", { locale: ptBR })}</p>
        </div>

        {!exporting && (
          <DropdownMenu>
            <DropdownMenuTrigger
              className={cn(
                "inline-flex shrink-0 items-center justify-center border bg-white h-10 w-10 rounded-xl border-slate-200 text-slate-400 hover:text-slate-900 hover:bg-slate-50 transition-all shadow-sm",
                exporting && "animate-pulse"
              )}
              disabled={exporting}
            >
              <Share2 className="w-5 h-5" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end" className="w-56 rounded-2xl p-2">
              <DropdownMenuGroup>
                <DropdownMenuLabel className="text-[10px] font-black uppercase tracking-wider text-slate-400 px-2 py-1.5">Exportar Relatório</DropdownMenuLabel>
                <DropdownMenuSeparator />
                <DropdownMenuItem 
                  onClick={() => handleExport('whatsapp')}
                  className="flex items-center gap-3 px-2 py-2.5 cursor-pointer rounded-xl focus:bg-slate-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-green-50 text-green-600 flex items-center justify-center">
                    <MessageCircle className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">WhatsApp</span>
                    <span className="text-[10px] text-slate-500">Enviar resumo texto</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExport('email')}
                  className="flex items-center gap-3 px-2 py-2.5 cursor-pointer rounded-xl focus:bg-slate-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center">
                    <Mail className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">E-mail</span>
                    <span className="text-[10px] text-slate-500">Enviar resumo texto</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
              <DropdownMenuSeparator />
              <DropdownMenuGroup>
                <DropdownMenuItem 
                  onClick={() => handleExport('pdf')}
                  className="flex items-center gap-3 px-2 py-2.5 cursor-pointer rounded-xl focus:bg-slate-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-rose-50 text-rose-600 flex items-center justify-center">
                    <FileText className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">Salvar PDF</span>
                    <span className="text-[10px] text-slate-500">Documento pronto</span>
                  </div>
                </DropdownMenuItem>
                <DropdownMenuItem 
                  onClick={() => handleExport('image')}
                  className="flex items-center gap-3 px-2 py-2.5 cursor-pointer rounded-xl focus:bg-slate-50"
                >
                  <div className="w-8 h-8 rounded-lg bg-slate-100 text-slate-600 flex items-center justify-center">
                    <ImageIcon className="w-4 h-4" />
                  </div>
                  <div className="flex flex-col">
                    <span className="text-sm font-bold text-slate-900">Salvar Imagem</span>
                    <span className="text-[10px] text-slate-500">Captura da tela</span>
                  </div>
                </DropdownMenuItem>
              </DropdownMenuGroup>
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>

      <div id="dashboard-export-area" className="space-y-6">
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
          <div className="flex flex-col gap-2.5 px-1">
            <h2 className="text-xs font-black uppercase tracking-wider text-slate-400">Parcelamento Direto</h2>
            {!exporting && (
              <div className="relative group">
                <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400 group-focus-within:text-slate-900 transition-colors" />
                <Input 
                  placeholder="Buscar cliente, modelo ou placa..." 
                  className="pl-9 h-10 bg-white border-slate-100 rounded-xl shadow-sm ring-1 ring-slate-100 focus-visible:ring-slate-200 transition-all text-sm"
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                />
                {searchTerm && (
                  <button 
                    onClick={() => setSearchTerm('')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 p-1 hover:bg-slate-50 rounded-lg text-slate-400"
                  >
                    <X className="w-3 h-3" />
                  </button>
                )}
              </div>
            )}
          </div>
          
          <div className="space-y-4">
            {filteredSales.length === 0 ? (
              <div className="p-8 text-center text-slate-400 italic text-xs bg-white rounded-2xl ring-1 ring-slate-100 shadow-sm">
                {searchTerm.length >= 3 ? 'Nenhum resultado para sua busca.' : 'Nenhuma venda registrada ainda.'}
              </div>
            ) : (
              <AnimatePresence mode="popLayout">
                {filteredSales.map((sale) => {
                  const metrics = getSaleMetrics(sale);

                  return (
                    <motion.div
                      key={sale.id}
                      initial={{ opacity: 0, y: 10 }}
                      animate={{ opacity: 1, y: 0 }}
                      onClick={() => !exporting && onSelectSale(sale.id)}
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
                                <span className="font-bold">{sale.carModel}</span>{sale.carYear ? ` / ${sale.carYear}` : ''}{sale.carColor ? ` / ${sale.carColor}` : ''}{sale.carPlate ? ` / ${sale.carPlate.toUpperCase()}` : ''}
                              </p>
                            </div>
                            {!exporting && <ChevronRight className="w-4 h-4 text-slate-300 mt-0.5 group-hover:text-slate-900 transition-colors" />}
                          </div>

                          <div className="space-y-1.5">
                            <div className={`grid ${metrics.overdueCount > 0 && metrics.pendingCount > 0 ? 'grid-cols-3' : (metrics.overdueCount > 0 || metrics.pendingCount > 0 ? 'grid-cols-2' : 'grid-cols-1')} gap-2`}>
                              <div className="space-y-0 text-left">
                                <p className="text-[9px] font-normal uppercase tracking-wider text-emerald-500">Pagas</p>
                                <p className="text-[11px] font-normal text-slate-900 leading-none">
                                  {metrics.paidCount} = {metrics.paidValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                </p>
                              </div>
                              {metrics.overdueCount > 0 && (
                                <div className={`space-y-0 ${metrics.pendingCount > 0 ? 'text-center' : 'text-right'}`}>
                                  <p className="text-[9px] font-normal uppercase tracking-wider text-rose-500">Em Atraso</p>
                                  <p className="text-[11px] font-normal text-slate-900 leading-none">
                                    {metrics.overdueCount} = {metrics.overdueValue.toLocaleString('pt-BR', { minimumFractionDigits: 2 })}
                                  </p>
                                </div>
                              )}
                              {metrics.pendingCount > 0 && (
                                <div className="space-y-0 text-right">
                                  <p className="text-[9px] font-normal uppercase tracking-wider text-slate-400">A Vencer</p>
                                  <p className="text-[11px] font-normal text-slate-900 leading-none">
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
                            <span className="flex items-center gap-1 uppercase">
                              <Calendar className="w-3 h-3" />
                              {safeFormat(metrics.referenceDate, 'MMMM/yyyy', { locale: ptBR })}
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
