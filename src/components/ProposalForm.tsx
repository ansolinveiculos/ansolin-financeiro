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
import { IMaskInput } from 'react-imask';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';
import { format, addMonths } from 'date-fns';
import { ptBR } from 'date-fns/locale';
import { parsePhoneNumber } from 'libphonenumber-js/max';

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

const maskPhone = (value: string) => {
  return value
    .replace(/\D/g, '')
    .replace(/(\d{2})(\d)/, '($1) $2')
    .replace(/(\d{5})(\d)/, '$1-$2')
    .replace(/(-\d{4})\d+?$/, '$1');
};

const isValidPhone = (phone: string) => {
  try {
    const phoneNumber = parsePhoneNumber(phone, 'BR');
    return phoneNumber.isValid() && phoneNumber.getType() === 'MOBILE';
  } catch (e) {
    return false;
  }
};

const isValidPlate = (plate: string) => {
  const cleanPlate = plate.replace(/[^A-Z0-9]/gi, '').toUpperCase();
  return /^[A-Z]{3}\d[A-Z0-9]\d{2}$/.test(cleanPlate);
};

interface ProposalFormProps {
  onSuccess: () => void;
  onCancel: () => void;
}

export function ProposalForm({ onSuccess, onCancel }: ProposalFormProps) {
  const [loading, setLoading] = useState(false);
  const [isEditingInstallment, setIsEditingInstallment] = useState(false);
  const [formData, setFormData] = useState({
    customerName: '',
    customerCpf: '',
    customerPhone: '',
    carModel: '',
    carPlate: '',
    carColor: '',
    carYear: new Date().getFullYear(),
    carPrice: 0,
    downPayment: 0,
    installmentCount: 12,
    interestRate: 0, // Zero interest by default for "vendas a prazo" direct
    manualInstallment: 0,
    firstDueDate: format(addMonths(new Date(), 1), 'yyyy-MM-dd'),
    notes: ''
  });

  const financingDetails = useMemo(() => {
    const principal = formData.carPrice - formData.downPayment;
    if (principal <= 0) return { principal: 0, installment: 0, total: 0, installmentList: [] };

    // Calculate suggested based on interest rate
    const totalWithInterest = principal * (1 + (formData.interestRate / 100));
    const suggestedInstallment = totalWithInterest / formData.installmentCount;
    
    // Determine actual installment value: manual choice or suggested
    const actualInstallment = formData.manualInstallment > 0 ? formData.manualInstallment : suggestedInstallment;
    const actualTotal = actualInstallment * formData.installmentCount;
    
    // Generate installment list
    const installmentList: Installment[] = [];
    const parsedDate = new Date(formData.firstDueDate);
    // fallback to a valid date if parsedDate is invalid (e.g. empty input)
    const firstDate = isNaN(parsedDate.getTime()) ? addMonths(new Date(), 1) : new Date(parsedDate.getTime() + parsedDate.getTimezoneOffset() * 60000);
    
    for (let i = 1; i <= formData.installmentCount; i++) {
      installmentList.push({
        id: typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : Math.random().toString(36).substring(2, 9),
        number: i,
        dueDate: addMonths(firstDate, i - 1).toISOString(),
        value: actualInstallment,
        status: 'pending'
      });
    }

    return {
      principal,
      installment: actualInstallment,
      total: actualTotal,
      installmentList
    };
  }, [formData.carPrice, formData.downPayment, formData.installmentCount, formData.interestRate, formData.manualInstallment, formData.firstDueDate]);

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

    if (formData.customerPhone && formData.customerPhone.replace(/\D/g, '').length > 0) {
      if (!isValidPhone(formData.customerPhone)) {
        toast.error('O celular informado é inválido. Use o formato (DD) 9XXXX-XXXX.');
        return;
      }
    }

    if (!isValidPlate(formData.carPlate)) {
      toast.error('A placa informada é inválida. Use o formato antigo (AAA-1234) ou Mercosul (ABC1D23).');
      return;
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
        customerPhone: String(formData.customerPhone || '').trim(),
        carModel: String(formData.carModel).trim(),
        carPlate: String(formData.carPlate).trim(),
        carColor: String(formData.carColor).trim(),
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
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      };

      console.log('Payload sanitizado: ', payload);

      const newDocRef = doc(collection(db, path));
      
      await setDoc(newDocRef, payload);
      
      clearTimeout(timeout);
      toast.success('Venda registrada com sucesso!');
      
      // Update local cache completely so offline mode works perfectly
      const cachedProposals = JSON.parse(localStorage.getItem('ansolin_proposals') || '[]');
      const proposalWithId = { 
        ...payload, 
        id: newDocRef.id,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString()
      };
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
      handleFirestoreError(error, OperationType.CREATE, path);
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: any) => {
    if (field === 'customerCpf') {
      value = maskCPF(value as string);
    } else if (field === 'customerPhone') {
      value = maskPhone(value as string);
    } else if (field === 'carPlate') {
      value = (value as string).toUpperCase().replace(/[^A-Z0-9]/g, '').replace(/^([A-Z]{3})([A-Z0-9])/, '$1-$2').slice(0, 8);
    }
    
    // Reset manual override if basic finance fields change to show new suggestion
    if (['carPrice', 'downPayment', 'installmentCount', 'interestRate'].includes(field)) {
      setFormData(prev => ({ ...prev, [field]: value, manualInstallment: 0 }));
    } else {
      setFormData(prev => ({ ...prev, [field]: value }));
    }
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
              <div className="grid grid-cols-2 gap-3">
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
                <div className="space-y-1.5">
                  <Label htmlFor="customerPhone" className="text-[10px] uppercase font-bold text-slate-400">Celular (Opcional)</Label>
                  <Input 
                    id="customerPhone"
                    placeholder="(00) 00000-0000"
                    maxLength={15}
                    className="h-11 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl"
                    value={formData.customerPhone}
                    onChange={e => updateField('customerPhone', e.target.value)}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          {/* Card: Venda */}
          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="pb-2 px-4 pt-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Car className="w-4 h-4 text-slate-500" />
                <CardTitle className="text-xs font-black uppercase tracking-wider">Veículo / Moto</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-2 px-4 pb-4">
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="carPlate" className="text-[10px] uppercase font-bold text-slate-400">Placa</Label>
                  <Input 
                    id="carPlate"
                    required
                    className="h-10 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl uppercase"
                    placeholder="ABC-1234"
                    value={formData.carPlate}
                    onChange={e => updateField('carPlate', e.target.value.toUpperCase())}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="carModel" className="text-[10px] uppercase font-bold text-slate-400">Modelo</Label>
                  <Input 
                    id="carModel"
                    required
                    className="h-10 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl"
                    placeholder="Ex: CG 160"
                    value={formData.carModel}
                    onChange={e => updateField('carModel', e.target.value)}
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-2">
                <div className="space-y-1">
                  <Label htmlFor="carYear" className="text-[10px] uppercase font-bold text-slate-400">Ano</Label>
                  <Input 
                    id="carYear"
                    type="number"
                    required
                    className="h-10 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl"
                    placeholder="Ex: 2020"
                    value={formData.carYear || ''}
                    onChange={e => updateField('carYear', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="carColor" className="text-[10px] uppercase font-bold text-slate-400">Cor</Label>
                  <Input 
                    id="carColor"
                    required
                    className="h-10 bg-slate-50/50 border-slate-200 focus:bg-white text-base rounded-xl"
                    placeholder="Ex: Preta"
                    value={formData.carColor}
                    onChange={e => updateField('carColor', e.target.value)}
                  />
                </div>
              </div>
              
              <div className="grid grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                <div className="space-y-1">
                  <Label htmlFor="carPrice" className="text-[10px] uppercase font-bold text-slate-400">Valor da Venda</Label>
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
                    id="carPrice"
                    required
                    className="flex h-10 w-full bg-slate-50/50 border border-slate-200 focus:bg-white font-bold text-base rounded-xl px-3 py-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="R$ 0,00"
                    value={String(formData.carPrice || '')}
                    onAccept={(value, mask) => updateField('carPrice', parseFloat(mask.unmaskedValue) || 0)}
                  />
                </div>
                <div className="space-y-1">
                  <Label htmlFor="downPayment" className="text-[10px] uppercase font-bold text-slate-400">Entrada</Label>
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
                    id="downPayment"
                    className="flex h-10 w-full bg-slate-50/50 border border-slate-200 focus:bg-white text-base rounded-xl px-3 py-2 ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
                    placeholder="R$ 0,00"
                    value={String(formData.downPayment || '')}
                    onAccept={(value, mask) => updateField('downPayment', parseFloat(mask.unmaskedValue) || 0)}
                  />
                </div>
              </div>
              <div className="flex items-center justify-between bg-slate-50 rounded-xl p-3 border border-slate-100">
                <Label className="text-[10px] uppercase font-bold text-slate-500">Valor Parcelado</Label>
                <div className="text-sm font-black text-slate-900">
                  {new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(financingDetails.principal)}
                </div>
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
                  <IMaskInput
                    mask="00/00/00"
                    value={format(new Date(formData.firstDueDate + 'T12:00:00'), 'dd/MM/yy')}
                    onAccept={(value) => {
                      if (value.length === 8) {
                        const [d, m, y] = value.split('/');
                        const fullYear = parseInt(y) + 2000;
                        const isoDate = `${fullYear}-${m}-${d}`;
                        if (isoDate !== formData.firstDueDate) {
                          updateField('firstDueDate', isoDate);
                        }
                      }
                    }}
                    className="flex h-11 w-full rounded-xl bg-slate-50/50 border border-slate-200 px-3 py-2 text-base ring-offset-background file:border-0 file:bg-transparent file:text-sm file:font-medium placeholder:text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 disabled:cursor-not-allowed disabled:opacity-50"
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
                <div className="group relative">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Parcela Mensal</p>
                  {isEditingInstallment ? (
                    <div className="flex items-center gap-1">
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
                        autoFocus
                        className="h-9 w-36 bg-white/10 border border-white/20 rounded-lg text-white font-black text-xl p-2 focus:bg-white/20 focus:outline-none focus:ring-2 focus:ring-amber-400"
                        value={String(formData.manualInstallment || financingDetails.installment)}
                        onAccept={(value, mask) => updateField('manualInstallment', parseFloat(mask.unmaskedValue) || 0)}
                        onBlur={() => setIsEditingInstallment(false)}
                        onKeyDown={(e) => {
                          if (e.key === 'Enter') setIsEditingInstallment(false);
                        }}
                      />
                    </div>
                  ) : (
                    <div 
                      className="cursor-pointer group flex flex-col" 
                      onClick={() => setIsEditingInstallment(true)}
                    >
                      <p className="text-2xl font-black text-white group-hover:text-amber-400 transition-colors">
                        {financingDetails.installment.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                      </p>
                      <span className="text-[8px] text-slate-500 font-bold uppercase opacity-0 group-hover:opacity-100 transition-opacity">
                        Clique para ajustar
                      </span>
                    </div>
                  )}
                </div>
                <div className="text-right">
                  <p className="text-[10px] text-slate-400 font-black uppercase tracking-widest leading-none mb-1">Saldo Total</p>
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
                  <p className="text-[10px] text-slate-400">
                    Finaliza em {financingDetails.installmentList.length > 0 && 
                      (() => {
                        const d = new Date(financingDetails.installmentList[financingDetails.installmentList.length-1].dueDate);
                        return !isNaN(d.getTime()) ? format(d, 'MMM/yy', { locale: ptBR }) : 'Data Inválida';
                      })()
                    }
                  </p>
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
