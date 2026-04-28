import React, { useState, useMemo } from 'react';
import { collection, doc, setDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth, handleFirestoreError, OperationType } from '../lib/firebase';
import { ProposalStatus, Installment } from '../types';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Calculator, 
  User, 
  Car, 
  DollarSign, 
  Calendar,
  AlertCircle,
  Save,
  ChevronLeft,
  Info,
  CheckCircle2
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';

import { toast } from 'sonner';

const isValidCPF = (cpf: string) => {
  cpf = cpf.replace(/[^\d]+/g, '');
  if (cpf === '') return false;
  if (cpf.length !== 11 || /^(\d)\1{10}$/.test(cpf)) return false;
  
  let add = 0;
  for (let i = 0; i < 9; i++) add += parseInt(cpf.charAt(i)) * (10 - i);
  let rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(9))) return false;
  
  add = 0;
  for (let i = 0; i < 10; i++) add += parseInt(cpf.charAt(i)) * (11 - i);
  rev = 11 - (add % 11);
  if (rev === 10 || rev === 11) rev = 0;
  if (rev !== parseInt(cpf.charAt(10))) return false;
  
  return true;
};

const maskCPF = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d)/, '$1.$2')
    .replace(/(\d{3})(\d{1,2})/, '$1-$2')
    .replace(/(-\d{2})\d+?$/, '$1');
};

interface ProposalFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProposalForm({ onSuccess, onCancel }: ProposalFormProps) {
  const [loading, setLoading] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '',
    customerCpf: '',
    carModel: '',
    carYear: new Date().getFullYear(),
    carPrice: 0,
    downPayment: 0,
    installmentCount: 12,
    interestRate: 0, // Zero interest by default for "vendas a prazo" direct
    firstDueDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
    notes: ''
  });

  const financingDetails = useMemo(() => {
    const principal = formData.carPrice - formData.downPayment;
    if (principal <= 0) return { principal: 0, installment: 0, total: 0, installmentList: [] };

    // Simple interest or no interest as requested (simple division for direct sales)
    const totalWithInterest = principal * (1 + (formData.interestRate / 100));
    const installmentValue = totalWithInterest / formData.installmentCount;
    
    // Generate installment list
    const installmentList: Installment[] = [];
    const firstDate = new Date(formData.firstDueDate);
    
    for (let i = 1; i <= formData.installmentCount; i++) {
      installmentList.push({
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        number: i,
        dueDate: addMonths(firstDate, i - 1).toISOString(),
        value: installmentValue,
        status: 'pending'
      });
    }

    return {
      principal,
      installment: installmentValue,
      total: totalWithInterest,
      installmentList
    };
  }, [formData.carPrice, formData.downPayment, formData.installmentCount, formData.interestRate, formData.firstDueDate]);

  const handleSubmit = async (e: React.FormEvent, status: ProposalStatus) => {
    e.preventDefault();
    
    if (!auth.currentUser) {
      toast.error('Sessão expirada. Por favor, recarregue a página.');
      return;
    }

    if (formData.carPrice <= 0) {
      toast.error('O valor da venda deve ser maior que zero.');
      return;
    }

    if (formData.customerCpf && formData.customerCpf.replace(/\D/g, '').length > 0) {
      if (!isValidCPF(formData.customerCpf)) {
        toast.error('O CPF informado é inválido. Por favor, corrija.');
        return;
      }
    }

    setLoading(true);
    const path = 'proposals';
    console.log('Iniciando persistência no Firestore: ', path);
    console.log('Status da rede (navigator.onLine): ', navigator.onLine);

    // Removendo renovação de token forçada pois pode travar no iframe
    
    // Safety timeout to prevent infinite "Saving..." state
    const timeout = setTimeout(() => {
      setLoading(false);
      toast.error('O salvamento está demorando mais que o esperado. O banco de dados pode estar indisponível.');
    }, 15000);

    try {
      // Explicitly sanitize data to ensure types match Firestore rules
      const payload = {
        customerName: String(formData.customerName).trim(),
        customerCpf: String(formData.customerCpf || '').trim(),
        carModel: String(formData.carModel).trim(),
        carYear: Number(formData.carYear) || new Date().getFullYear(),
        carPrice: Number(formData.carPrice) || 0,
        downPayment: Number(formData.downPayment) || 0,
        installmentCount: Number(formData.installmentCount) || 12,
        interestRate: Number(formData.interestRate) || 0,
        firstDueDate: String(formData.firstDueDate),
        notes: String(formData.notes || '').trim(),
        installmentValue: Number(financingDetails.installment) || 0,
        installments: financingDetails.installmentList.map(inst => ({
          ...inst,
          value: Number(inst.value) || 0
        })),
        status,
        userId: auth.currentUser.uid,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };

      console.log('Payload sanitizado: ', payload);

      const newDocRef = doc(collection(db, path));
      
      // Tentamos aguardar até 4 segundos para ver se o salvamento é imediato
      const timeoutPromise = new Promise((resolve, reject) => {
        setTimeout(() => resolve('TIMEOUT'), 4000);
      });

      const writePromise = setDoc(newDocRef, payload).catch(err => {
        console.error('Erro de background Firestore:', err);
        throw err;
      });

      const result = await Promise.race([
        writePromise.then(() => 'DONE'),
        timeoutPromise
      ]);
      
      clearTimeout(timeout);

      if (result === 'TIMEOUT') {
        toast.success('Venda salva localmente! Sincronizando em segundo plano...');
      } else {
        console.log('Documento salvo com sucesso! ID: ', newDocRef.id);
        toast.success('Venda registrada com sucesso!');
      }
      
      // Update local cache completely so offline mode works perfectly
      const cachedProposals = JSON.parse(localStorage.getItem('ansolin_proposals') || '[]');
      const proposalWithId = { id: newDocRef.id, ...payload };
      const newProposalsCache = [proposalWithId, ...cachedProposals];
      localStorage.setItem('ansolin_proposals', JSON.stringify(newProposalsCache));
      
      const newRecent = newProposalsCache.slice(0, 5);
      localStorage.setItem('ansolin_recent', JSON.stringify(newRecent));

      const summary = newProposalsCache.reduce((acc: any, curr: any) => {
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

      setTimeout(() => {
        onSuccess();
      }, 800);
    } catch (error: any) {
      clearTimeout(timeout);
      console.error('CRITICAL: Error saving proposal:', error);
      
      if (error.message === 'TIMEOUT_FIRESTORE') {
        const isOnline = navigator.onLine;
        toast.error(`Falha ao conectar com o servidor${!isOnline ? ' (sem internet)' : ''}. O seu navegador ou rede bloqueou a conexão com o banco de dados. Tente usar uma Aba Anônima ou outra rede.`);
      } else {
        toast.error('Erro ao salvar venda: ' + (error.message || 'Verifique sua conexão.'));
      }
      setLoading(false);
    }
  };

  const updateField = (field: string, value: any) => {
    if (field === 'customerCpf') {
      value = maskCPF(value as string);
    }
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={onCancel} className="text-slate-500 rounded-full h-10 w-10">
          <ChevronLeft className="w-5 h-5" />
        </Button>
        <div>
          <h1 className="text-xl font-black text-slate-900 tracking-tight">Lançar Venda</h1>
          <p className="text-xs text-slate-500">Registre os dados da venda parcelada.</p>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(e, ProposalStatus.APPROVED)} className="grid grid-cols-1 gap-6">
        <div className="space-y-4">
          {/* Card: Cliente */}
          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="pb-3 px-4 pt-4">
              <div className="flex items-center gap-2 text-slate-900">
                <User className="w-4 h-4 text-blue-500" />
                <CardTitle className="text-xs font-black uppercase tracking-wider">Cliente</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="space-y-1.5">
                <Label htmlFor="customerName" className="text-[10px] uppercase font-bold text-slate-400">Nome</Label>
                <Input 
                  id="customerName"
                  required
                  placeholder="Nome do cliente"
                  className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl"
                  value={formData.customerName}
                  onChange={e => updateField('customerName', e.target.value)}
                />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="customerCpf" className="text-[10px] uppercase font-bold text-slate-400">CPF (Opcional)</Label>
                <Input 
                  id="customerCpf"
                  placeholder="000.000.000-00"
                  maxLength={14}
                  className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl"
                  value={formData.customerCpf}
                  onChange={e => updateField('customerCpf', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          {/* Card: Venda */}
          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="pb-3 px-4 pt-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Car className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-xs font-black uppercase tracking-wider">Veículo / Venda</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <Input 
                id="carModel"
                required
                className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl"
                placeholder="Descrição (ex: Gol 1.0 2020)"
                value={formData.carModel}
                onChange={e => updateField('carModel', e.target.value)}
              />
              <div className="grid grid-cols-2 gap-3">
                <Input 
                  id="carPrice"
                  type="number"
                  required
                  placeholder="Valor Total"
                  className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white font-bold text-base rounded-xl"
                  value={formData.carPrice || ''}
                  onChange={e => updateField('carPrice', parseFloat(e.target.value))}
                />
                <Input 
                  id="downPayment"
                  type="number"
                  placeholder="Entrada"
                  className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl"
                  value={formData.downPayment || ''}
                  onChange={e => updateField('downPayment', parseFloat(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>

          {/* Card: Parcelas */}
          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="pb-3 px-4 pt-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Calendar className="w-4 h-4 text-purple-500" />
                <CardTitle className="text-xs font-black uppercase tracking-wider">Prazos</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-3 px-4 pb-4">
              <div className="grid grid-cols-2 gap-3">
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">Nº Parcelas</Label>
                  <select 
                    className="w-full h-11 px-3 bg-slate-50/50 border border-slate-200 rounded-xl text-base focus:bg-white"
                    value={formData.installmentCount}
                    onChange={e => updateField('installmentCount', parseInt(e.target.value))}
                  >
                    {Array.from({ length: 24 }, (_, i) => i + 1).map(n => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
                <div className="space-y-1">
                  <Label className="text-[10px] uppercase font-bold text-slate-400">1º Vencimento</Label>
                  <Input 
                    type="date"
                    className="h-11 bg-slate-50/50 border-slate-200 rounded-xl text-sm"
                    value={formData.firstDueDate}
                    onChange={e => updateField('firstDueDate', e.target.value)}
                  />
                </div>
              </div>
              <div className="space-y-1 pt-2">
                <Label className="text-[10px] uppercase font-bold text-slate-400 flex justify-between">
                  Juros Total (%)
                  <span className="text-slate-900 font-black">{formData.interestRate}%</span>
                </Label>
                <input 
                  type="range" min="0" max="20" step="0.1"
                  className="w-full accent-slate-900"
                  value={formData.interestRate}
                  onChange={e => updateField('interestRate', parseFloat(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Resumo e Ação */}
        <div className="space-y-4">
          <Card className="bg-slate-900 text-white border-none shadow-xl rounded-2xl overflow-hidden">
            <CardContent className="p-5 space-y-4">
              <div className="flex justify-between items-end">
                <div>
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Parcela Mensal</p>
                  <p className="text-2xl font-black text-white">
                    {financingDetails.installment.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest">Total</p>
                  <p className="text-sm font-bold text-amber-400">
                    {financingDetails.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                  </p>
                </div>
              </div>

              <div className="h-px bg-white/10 w-full" />

              <div className="flex items-center gap-3 py-1">
                <div className="p-2 bg-white/10 rounded-lg">
                  <CheckCircle2 className="w-4 h-4 text-green-400" />
                </div>
                <div>
                  <p className="text-xs font-bold leading-none">Plano de {formData.installmentCount} meses</p>
                  <p className="text-[10px] text-slate-400">Finaliza em {financingDetails.installmentList.length > 0 && format(new Date(financingDetails.installmentList[financingDetails.installmentList.length-1].dueDate), 'MMM/yyyy', { locale: ptBR })}</p>
                </div>
              </div>

              <Button 
                type="submit" 
                disabled={loading || formData.carPrice <= 0}
                className="w-full h-12 bg-white text-slate-900 hover:bg-slate-50 font-black text-base rounded-xl shadow-lg transition-all active:scale-95"
              >
                {loading ? 'Salvando...' : 'Confirmar Venda'}
              </Button>
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
