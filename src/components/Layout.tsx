import React from 'react';
import { User } from 'firebase/auth';
import { Button } from '@/components/ui/button';
import { 
  LayoutDashboard, 
  FileText, 
  PlusCircle, 
  LogOut, 
  Menu,
  ChevronRight,
  User as UserIcon,
  CircleDollarSign
} from 'lucide-react';
import { cn } from '@/lib/utils';

interface LayoutProps {
  children: React.ReactNode;
  currentView: 'dashboard' | 'proposals' | 'new-proposal';
  onViewChange: (view: 'dashboard' | 'proposals' | 'new-proposal') => void;
  user: User;
  onLogout: () => void;
}

export function Layout({ children, currentView, onViewChange, user, onLogout }: LayoutProps) {
  const [sidebarOpen, setSidebarOpen] = React.useState(true);

  const navItems = [
    { id: 'dashboard', label: 'Dashboard', icon: LayoutDashboard },
    { id: 'proposals', label: 'Propostas', icon: FileText },
    { id: 'new-proposal', label: 'Nova Proposta', icon: PlusCircle },
  ] as const;

  return (
    <div className="flex h-screen bg-[#F8FAFC]">
      {/* Sidebar */}
      <aside className={cn(
        "bg-white border-r border-slate-200 transition-all duration-300 flex flex-col",
        sidebarOpen ? "w-64" : "w-20"
      )}>
        <div className="p-6 flex items-center gap-3">
          <div className="bg-slate-900 p-2 rounded-lg">
            <CircleDollarSign className="w-6 h-6 text-white" />
          </div>
          {sidebarOpen && <span className="font-bold text-xl tracking-tight text-slate-900">Vendas Credito</span>}
        </div>

        <nav className="flex-1 px-4 space-y-2 py-4">
          {navItems.map((item) => {
            const Icon = item.icon;
            const isActive = currentView === item.id;
            return (
              <button
                key={item.id}
                onClick={() => onViewChange(item.id)}
                className={cn(
                  "w-full flex items-center gap-3 px-3 py-2.5 rounded-lg text-sm font-medium transition-colors",
                  isActive 
                    ? "bg-slate-900 text-white shadow-md shadow-slate-200" 
                    : "text-slate-600 hover:bg-slate-100"
                )}
              >
                <Icon className={cn("w-5 h-5", isActive ? "text-white" : "text-slate-400")} />
                {sidebarOpen && <span>{item.label}</span>}
                {sidebarOpen && isActive && <ChevronRight className="ml-auto w-4 h-4 opacity-50" />}
              </button>
            );
          })}
        </nav>

        <div className="p-4 border-t border-slate-100">
          <div className={cn("flex items-center gap-3 p-2 rounded-xl bg-slate-50 border border-slate-100", !sidebarOpen && "justify-center")}>
            <div className="w-8 h-8 rounded-full bg-slate-200 flex items-center justify-center overflow-hidden border border-slate-300">
              {user.photoURL ? (
                <img src={user.photoURL} alt={user.displayName || ''} className="w-full h-full object-cover" />
              ) : (
                <UserIcon className="w-5 h-5 text-slate-500" />
              )}
            </div>
            {sidebarOpen && (
              <div className="flex-1 min-w-0">
                <p className="text-xs font-semibold text-slate-900 truncate">{user.displayName}</p>
                <p className="text-[10px] text-slate-500 truncate">{user.email}</p>
              </div>
            )}
          </div>
          <Button 
            variant="ghost" 
            size="sm" 
            onClick={onLogout}
            className={cn("w-full mt-4 text-slate-500 hover:text-red-600 hover:bg-red-50", !sidebarOpen && "p-0")}
          >
            <LogOut className="w-4 h-4 mr-2" />
            {sidebarOpen && <span>Sair</span>}
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 flex flex-col overflow-hidden">
        <header className="h-16 bg-white border-bottom border-slate-200 flex items-center justify-between px-8 z-10 shadow-sm shadow-slate-100/50">
          <div className="flex items-center gap-4">
            <Button variant="ghost" size="icon" onClick={() => setSidebarOpen(!sidebarOpen)} className="text-slate-500">
              <Menu className="w-5 h-5" />
            </Button>
            <h2 className="text-lg font-semibold text-slate-900 capitalize">
              {navItems.find(i => i.id === currentView)?.label || 'Vendas Credito'}
            </h2>
          </div>
          
          <div className="flex items-center gap-4">
            <div className="hidden sm:flex flex-col items-end">
              <span className="text-[10px] uppercase tracking-wider font-bold text-slate-400">Status do Sistema</span>
              <div className="flex items-center gap-1.5">
                <div className="w-2 h-2 rounded-full bg-green-500 shadow-[0_0_8px_rgba(34,197,94,0.5)]" />
                <span className="text-xs font-medium text-slate-600">Online</span>
              </div>
            </div>
          </div>
        </header>

        <div className="flex-1 overflow-y-auto p-8 scroll-smooth">
          <div className="max-w-6xl mx-auto pb-12">
            {children}
          </div>
        </div>
      </main>
    </div>
  );
}
