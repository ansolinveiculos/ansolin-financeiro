import React, { useState, useMemo } from 'react';
import { collection, addDoc, serverTimestamp } from 'firebase/firestore';
import { db, auth } from '../lib/firebase';
import { ProposalStatus, OperationType } from '../types';
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
  Info
} from 'lucide-react';
import { motion } from 'motion/react';
import { cn } from '@/lib/utils';

import { toast } from 'sonner';

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
    installmentCount: 48,
    interestRate: 1.29, // Default base interest
    notes: ''
  });

  const financingDetails = useMemo(() => {
    const principal = formData.carPrice - formData.downPayment;
    if (principal <= 0) return { principal: 0, installment: 0, total: 0 };

    const i = formData.interestRate / 100;
    const n = formData.installmentCount;
    
    // PMT formula: P * [i(1+i)^n] / [(1+i)^n - 1]
    const installmentValue = principal * (i * Math.pow(1 + i, n)) / (Math.pow(1 + i, n) - 1);
    
    return {
      principal,
      installment: isFinite(installmentValue) ? installmentValue : 0,
      total: installmentValue * n
    };
  }, [formData.carPrice, formData.downPayment, formData.installmentCount, formData.interestRate]);

  const handleSubmit = async (e: React.FormEvent, status: ProposalStatus) => {
    e.preventDefault();
    if (!auth.currentUser) return;

    if (formData.carPrice <= 0) {
      toast.error('O valor do veículo deve ser maior que zero.');
      return;
    }

    setLoading(true);
    try {
      await addDoc(collection(db, 'proposals'), {
        ...formData,
        installmentValue: financingDetails.installment,
        status,
        userId: auth.currentUser.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      
      toast.success(status === ProposalStatus.DRAFT ? 'Rascunho salvo com sucesso!' : 'Proposta enviada para análise!');
      onSuccess();
    } catch (error) {
      console.error('Error saving proposal:', error);
      toast.error('Erro ao salvar proposta. Verifique sua conexão.');
    } finally {
      setLoading(false);
    }
  };

  const updateField = (field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  return (
    <div className="max-w-4xl mx-auto space-y-6">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={onCancel} className="text-slate-500">
            <ChevronLeft className="w-5 h-5" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold text-slate-900 tracking-tight">Nova Proposta</h1>
            <p className="text-slate-500">Preencha os dados básicos para simulação e cadastro.</p>
          </div>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(e, ProposalStatus.PENDING)} className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Left Column: Input Forms */}
        <div className="space-y-6">
          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-slate-900">
                <User className="w-4 h-4" />
                <CardTitle className="text-sm">Dados do Cliente</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="customerName" className="text-xs text-slate-500">Nome Completo</Label>
                <Input 
                  id="customerName"
                  required
                  placeholder="Ex: João Silva"
                  className="bg-slate-50/50 border-slate-200 focus:bg-white"
                  value={formData.customerName}
                  onChange={e => updateField('customerName', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label htmlFor="customerCpf" className="text-xs text-slate-500">CPF</Label>
                <Input 
                  id="customerCpf"
                  required
                  placeholder="000.000.000-00"
                  className="bg-slate-50/50 border-slate-200 focus:bg-white"
                  value={formData.customerCpf}
                  onChange={e => updateField('customerCpf', e.target.value)}
                />
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Car className="w-4 h-4" />
                <CardTitle className="text-sm">Dados do Veículo</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="space-y-2">
                <Label htmlFor="carModel" className="text-xs text-slate-500">Modelo</Label>
                <Input 
                  id="carModel"
                  required
                  placeholder="Ex: Toyota Corolla Cross"
                  className="bg-slate-50/50 border-slate-200 focus:bg-white"
                  value={formData.carModel}
                  onChange={e => updateField('carModel', e.target.value)}
                />
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="carYear" className="text-xs text-slate-500">Ano</Label>
                  <Input 
                    id="carYear"
                    type="number"
                    required
                    className="bg-slate-50/50 border-slate-200 focus:bg-white font-mono"
                    value={formData.carYear}
                    onChange={e => updateField('carYear', parseInt(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="carPrice" className="text-xs text-slate-500">Valor (R$)</Label>
                  <Input 
                    id="carPrice"
                    type="number"
                    required
                    className="bg-slate-50/50 border-slate-200 focus:bg-white font-mono font-bold"
                    value={formData.carPrice || ''}
                    onChange={e => updateField('carPrice', parseFloat(e.target.value))}
                  />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="pb-4">
              <div className="flex items-center gap-2 text-slate-900">
                <Calculator className="w-4 h-4" />
                <CardTitle className="text-sm">Condições de Financiamento</CardTitle>
              </div>
            </CardHeader>
            <CardContent className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label htmlFor="downPayment" className="text-xs text-slate-500">Entrada (R$)</Label>
                  <Input 
                    id="downPayment"
                    type="number"
                    className="bg-slate-50/50 border-slate-200 focus:bg-white font-mono"
                    value={formData.downPayment || ''}
                    onChange={e => updateField('downPayment', parseFloat(e.target.value))}
                  />
                </div>
                <div className="space-y-2">
                  <Label htmlFor="installmentCount" className="text-xs text-slate-500">Parcelas</Label>
                  <select 
                    id="installmentCount"
                    className="w-full h-10 px-3 py-2 bg-slate-50/50 border-slate-200 border rounded-md text-sm font-mono focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-950/10"
                    value={formData.installmentCount}
                    onChange={e => updateField('installmentCount', parseInt(e.target.value))}
                  >
                    {[12, 24, 36, 48, 60, 72].map(n => (
                      <option key={n} value={n}>{n}x</option>
                    ))}
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="interestRate" className="text-xs text-slate-500 flex justify-between">
                  Taxa de Juros Mensal
                  <span className="font-mono text-slate-900 font-bold">{formData.interestRate}%</span>
                </Label>
                <input 
                  type="range" 
                  min="0.5" 
                  max="4.0" 
                  step="0.01"
                  className="w-full accent-slate-900 h-1.5 bg-slate-100 rounded-lg appearance-none cursor-pointer"
                  value={formData.interestRate}
                  onChange={e => updateField('interestRate', parseFloat(e.target.value))}
                />
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Right Column: Simulation Result & Actions */}
        <div className="space-y-6">
          <Card className="border-none bg-slate-900 text-white shadow-xl shadow-slate-200 sticky top-8">
            <CardHeader>
              <CardTitle className="flex items-center gap-2 text-lg">
                <DollarSign className="w-5 h-5 text-green-400" />
                Resumo da Simulação
              </CardTitle>
              <CardDescription className="text-slate-400">Projeção estimada de crédito</CardDescription>
            </CardHeader>
            <CardContent className="space-y-6">
              <div className="p-4 bg-white/5 rounded-xl border border-white/10">
                <div className="flex justify-between items-center mb-6">
                  <div>
                    <p className="text-[10px] text-slate-400 uppercase font-bold tracking-widest leading-none">Parcela Mensal</p>
                    <p className="text-3xl font-bold mt-1 text-white">
                      {financingDetails.installment.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}
                    </p>
                  </div>
                  <Badge className="bg-emerald-500 text-white border-none h-fit">Simulado</Badge>
                </div>

                <div className="grid grid-cols-2 gap-4 text-xs">
                  <div className="space-y-1">
                    <p className="text-slate-500">Valor Principal</p>
                    <p className="font-mono font-medium">{financingDetails.principal.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-slate-500">Taxa Aplicada</p>
                    <p className="font-mono font-medium">{formData.interestRate}% am</p>
                  </div>
                  <div className="space-y-1">
                    <p className="text-slate-500">Total a Pagar</p>
                    <p className="font-mono font-medium text-amber-400">{financingDetails.total.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                  <div className="space-y-1 text-right">
                    <p className="text-slate-500">Total de Juros</p>
                    <p className="font-mono font-medium text-rose-400">{(financingDetails.total - financingDetails.principal).toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}</p>
                  </div>
                </div>
              </div>

              {/* Alert Box */}
              <div className="flex gap-3 p-3 rounded-lg bg-blue-500/10 border border-blue-500/20">
                <Info className="w-4 h-4 text-blue-400 shrink-0 mt-0.5" />
                <p className="text-[11px] text-blue-100 leading-tight">
                  Esta simulação é preliminar e não exclui a necessidade de análise formal de crédito junto à instituição financeira parceira.
                </p>
              </div>

              <div className="space-y-3 pt-4">
                <Button 
                  type="submit" 
                  disabled={loading || formData.carPrice <= 0}
                  className="w-full h-12 bg-white text-slate-900 hover:bg-slate-100 font-bold text-base transition-all active:scale-95"
                >
                  {loading ? 'Salvando...' : 'Enviar para Análise'}
                </Button>
                <div className="grid grid-cols-2 gap-3">
                  <Button 
                    type="button" 
                    onClick={(e) => handleSubmit(e, ProposalStatus.DRAFT)}
                    variant="outline" 
                    className="border-white/20 text-white hover:bg-white/10 bg-transparent"
                  >
                    Salvar Rascunho
                  </Button>
                  <Button 
                    type="button" 
                    variant="ghost" 
                    onClick={onCancel}
                    className="text-slate-400 hover:text-white"
                  >
                    Cancelar
                  </Button>
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-none shadow-sm ring-1 ring-slate-200">
            <CardHeader className="pb-2">
              <CardTitle className="text-sm">Notas Internas</CardTitle>
            </CardHeader>
            <CardContent>
              <textarea 
                className="w-full h-24 p-3 bg-slate-50 rounded-lg border border-slate-200 text-sm focus:bg-white focus:outline-none focus:ring-2 focus:ring-slate-900/10 transition-all resize-none"
                placeholder="Observações sobre o perfil do cliente ou veículo..."
                value={formData.notes}
                onChange={e => updateField('notes', e.target.value)}
              />
            </CardContent>
          </Card>
        </div>
      </form>
    </div>
  );
}
