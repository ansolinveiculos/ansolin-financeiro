import React from 'react';
import { User as FirebaseUser } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
  LogOut, 
  CircleDollarSign,
  User as UserIcon,
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  currentView: 'dashboard' | 'proposals' | 'new-proposal';
  onViewChange: (view: 'dashboard' | 'proposals' | 'new-proposal') => void;
  user: FirebaseUser;
  onLogout: () => void;
}

export function Layout({ children, currentView, onViewChange, user, onLogout }: LayoutProps) {
  const navItems = [
    { id: 'dashboard', label: 'Painel', icon: LayoutDashboard },
    { id: 'proposals', label: 'Vendas', icon: FileText },
    { id: 'new-proposal', label: 'Nova', icon: PlusCircle },
  ] as const;

  return (
    <div className="flex flex-col h-screen bg-[#F8FAFC] font-sans text-slate-900 overflow-hidden">
      {/* Header Compacto */}
      <header className="h-14 bg-white border-b border-slate-100 px-4 flex items-center justify-between sticky top-0 z-50 shrink-0">
        <div className="flex items-center gap-2">
          <div className="p-1.5 bg-slate-900 rounded-lg">
            <CircleDollarSign className="w-5 h-5 text-white" />
          </div>
          <span className="font-black text-sm tracking-tight text-slate-900 leading-none">ANSOLIN</span>
        </div>
        
        <div className="flex items-center gap-3">
          <div className="flex flex-col items-end">
            <span className="text-[10px] font-bold text-slate-900 leading-none">{user?.displayName?.split(' ')[0] || 'Usuário'}</span>
            <span className="text-[9px] text-green-500 font-bold flex items-center gap-1">
              <span className="w-1 h-1 bg-green-500 rounded-full animate-pulse" /> ONLINE
            </span>
          </div>
          <Button 
            variant="ghost" 
            size="icon" 
            onClick={onLogout}
            className="h-8 w-8 text-slate-400 hover:text-rose-500 transition-colors"
          >
            <LogOut className="w-4 h-4" />
          </Button>
        </div>
      </header>

      {/* Conteúdo Principal */}
      <main className="flex-1 overflow-y-auto pb-24 touch-pan-y scroll-smooth">
        <div className="p-4 w-full max-w-lg mx-auto">
          {children}
        </div>
      </main>

      {/* Navegação Inferior (Mobile Focus) */}
      <nav className="fixed bottom-0 left-0 right-0 bg-white/80 backdrop-blur-lg border-t border-slate-100 flex justify-around items-center px-4 py-2 pb-6 z-50 shadow-[0_-4px_20px_-4px_rgba(0,0,0,0.05)]">
        {navItems.map((item) => {
          const isActive = currentView === item.id;
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              onClick={() => onViewChange(item.id)}
              className={cn(
                "flex flex-col items-center gap-1 p-2 transition-all active:scale-90 relative",
                isActive ? "text-slate-900" : "text-slate-400"
              )}
            >
              <div className={cn(
                "p-2 rounded-xl transition-all",
                isActive ? "bg-slate-900 text-white shadow-lg shadow-slate-200" : "bg-transparent"
              )}>
                <Icon className="w-5 h-5" />
              </div>
              <span className={cn(
                "text-[10px] font-bold uppercase tracking-widest transition-all",
                isActive ? "opacity-100 translate-y-0" : "opacity-0 translate-y-1 h-0 overflow-hidden"
              )}>
                {item.label}
              </span>
              {isActive && (
                <div className="absolute -top-1 left-1/2 -translate-x-1/2 w-1 h-1 bg-slate-900 rounded-full" />
              )}
            </button>
          );
        })}
      </nav>
    </div>
  );
}
