import { Logo } from "@/components/Logo";
import { ConnectionStatus } from "@/components/ConnectionStatus";
import { PageErrorBoundary } from "@/components/PageErrorBoundary";
import { useAppStoreShallow } from "@/hooks/useAppStore";
import { getCurrentUser, signOut } from "@/services/authService";
import { cn } from "@/utils/cn";
import {
  Activity, BarChart3, Bell, Calculator, ChevronLeft, ChevronRight, ClipboardList,
  Command, FileText, HardHat, LayoutDashboard, LogOut, Menu, Moon, Search, Settings,
  Sun, Users, Wallet, Wrench, X, Package, Globe, Plus
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { NavLink, Outlet, useLocation, useNavigate } from "react-router-dom";
import { relativeTime } from "@/utils/format";

const groups = [
  { title: "VISÃO GERAL", items: [{to:"/dashboard",label:"Painel geral",icon:LayoutDashboard}] },
  { title: "OPERAÇÃO", items: [
    {to:"/calculadora",label:"Nova simulação",icon:Calculator,accent:true},
    {to:"/orcamentos",label:"Orçamentos",icon:FileText},
    {to:"/obras",label:"Ordens de serviço",icon:HardHat},
    {to:"/clientes",label:"Clientes",icon:Users},
    {to:"/servicos",label:"Serviços",icon:Wrench},
  ]},
  { title: "GESTÃO", items: [
    {to:"/financeiro",label:"Financeiro",icon:Wallet},
    {to:"/relatorios",label:"Relatórios",icon:BarChart3},
    {to:"/portal",label:"Portal do cliente",icon:Globe},
  ]},
  { title: "SISTEMA", items: [{to:"/configuracoes",label:"Configurações",icon:Settings}] }
];

export function AdminLayout() {
  const [mobileOpen,setMobileOpen]=useState(false);
  const [collapsed,setCollapsed]=useState(false);
  const [search,setSearch]=useState("");
  const [showResults,setShowResults]=useState(false);
  const location=useLocation();
  const navigate=useNavigate();
  const user=getCurrentUser();
  const {settings,setTheme,activities,clients,quotes,workOrders}=useAppStoreShallow(s=>({
    settings:s.settings,setTheme:s.setTheme,activities:s.activities,clients:s.clients,quotes:s.quotes,workOrders:s.workOrders
  }));
  useEffect(()=>setMobileOpen(false),[location.pathname]);
  const results=useMemo(()=>{
    if(search.trim().length<2)return [];
    const q=search.toLocaleLowerCase("pt-BR");
    return [
      ...clients.filter(c=>c.name.toLocaleLowerCase("pt-BR").includes(q)||c.city.toLocaleLowerCase("pt-BR").includes(q)).slice(0,4).map(c=>({label:c.name,meta:"Cliente · "+c.city,to:"/clientes/"+c.id})),
      ...quotes.filter(v=>v.number.includes(search)||v.clientName.toLocaleLowerCase("pt-BR").includes(q)).slice(0,4).map(v=>({label:"Orçamento #"+v.number,meta:v.clientName,to:"/orcamentos/"+v.id})),
      ...workOrders.filter(v=>v.number.includes(search)||v.clientName.toLocaleLowerCase("pt-BR").includes(q)).slice(0,3).map(v=>({label:"OS #"+v.number,meta:v.clientName,to:"/obras/"+v.id}))
    ];
  },[search,clients,quotes,workOrders]);
  const sidebar=<div className="flex h-full flex-col">
    <div className="flex h-[76px] items-center justify-between border-b border-[var(--line)] px-5">
      <Logo size="sm"/>
      <button className="icon-button lg:hidden" onClick={()=>setMobileOpen(false)} aria-label="Fechar menu"><X size={18}/></button>
    </div>
    <div className="px-4 py-4">
      <div className="workspace-chip"><span className="workspace-mark">JN</span><span className="min-w-0 flex-1"><b>J&N Decorações</b><small>Ambiente de gestão</small></span><span className="status-dot"/></div>
    </div>
    <nav className="flex-1 space-y-6 overflow-y-auto px-3 pb-4">
      {groups.map(group=><section key={group.title}>
        <p className="nav-group-label">{group.title}</p>
        <div className="space-y-1">{group.items.map(item=><NavLink key={item.to} to={item.to} title={collapsed?item.label:undefined} className={({isActive})=>cn("nav-item",isActive&&"nav-item-active",item.accent&&"nav-item-accent",collapsed&&"justify-center px-2")}>
          <item.icon size={18} strokeWidth={1.8}/>{!collapsed&&<span>{item.label}</span>}{!collapsed&&item.accent&&<span className="nav-new">NOVO</span>}
        </NavLink>)}</div>
      </section>)}
    </nav>
    <div className="p-3">
      <div className="sync-card"><div className="flex items-center justify-between"><span className="text-xs font-semibold">Sincronização</span><ConnectionStatus/></div><p>Seus dados são sincronizados entre os dispositivos.</p></div>
      <button onClick={()=>setCollapsed(!collapsed)} className="collapse-control hidden lg:flex">{collapsed?<ChevronRight size={16}/>:<><ChevronLeft size={16}/> Recolher menu</>}</button>
    </div>
  </div>;
  const activeTitle=groups.flatMap(g=>g.items).find(i=>i.to===location.pathname)?.label||"Área de trabalho";
  return <div className={cn("app-frame",collapsed&&"sidebar-collapsed")}>
    <aside className="desktop-sidebar">{sidebar}</aside>
    {mobileOpen&&<div className="mobile-overlay lg:hidden" onClick={()=>setMobileOpen(false)}><aside className="mobile-sidebar" onClick={e=>e.stopPropagation()}>{sidebar}</aside></div>}
    <div className="app-main">
      <header className="topbar">
        <div className="flex min-w-0 items-center gap-3">
          <button className="icon-button lg:hidden" onClick={()=>setMobileOpen(true)} aria-label="Abrir menu"><Menu size={19}/></button>
          <div className="hidden lg:block"><p className="topbar-eyebrow">J&N WORKSPACE</p><p className="topbar-title">{activeTitle}</p></div>
          <div className="lg:hidden"><Logo size="sm"/></div>
        </div>
        <div className="topbar-search hidden md:flex">
          <Search size={17}/><input value={search} onFocus={()=>setShowResults(true)} onChange={e=>{setSearch(e.target.value);setShowResults(true)}} onKeyDown={e=>{if(e.key==="Escape")setShowResults(false)}} placeholder="Buscar clientes, orçamentos e obras..."/>
          <kbd>⌘ K</kbd>
          {showResults&&search.length>=2&&<div className="search-results">{results.length?results.map((r,i)=><button key={i} onClick={()=>{navigate(r.to);setSearch("");setShowResults(false)}}><b>{r.label}</b><small>{r.meta}</small></button>):<p>Nenhum resultado encontrado</p>}</div>}
        </div>
        <div className="flex items-center gap-2">
          <button className="icon-button" onClick={()=>setTheme(settings.theme==="dark"?"light":"dark")} title="Alternar tema">{settings.theme==="dark"?<Sun size={18}/>:<Moon size={18}/>}</button>
          <div className="relative group"><button className="icon-button" title="Atividades recentes"><Bell size={18}/>{activities.length>0&&<i className="notification-dot"/>}</button><div className="activity-popover"><b>Atividades recentes</b>{activities.slice(0,5).map(a=><div key={a.id}><span>{a.message}</span><small>{relativeTime(a.date)}</small></div>)}</div></div>
          <button className="profile-chip" onClick={()=>navigate("/configuracoes")}><span className="profile-avatar">{(user||"JN").slice(0,2).toUpperCase()}</span><span className="hidden sm:block"><b>{user||"J&N"}</b><small>Administrador</small></span></button>
          <button className="icon-button" title="Sair" onClick={()=>{signOut();window.location.reload()}}><LogOut size={17}/></button>
        </div>
      </header>
      <main className="page-stage"><div className="page-container"><PageErrorBoundary resetKey={location.pathname}><Outlet/></PageErrorBoundary></div></main>
      <nav className="mobile-dock lg:hidden">{[{to:"/dashboard",icon:LayoutDashboard,label:"Início"},{to:"/calculadora",icon:Calculator,label:"Calcular"},{to:"/orcamentos",icon:FileText,label:"Orçamentos"},{to:"/clientes",icon:Users,label:"Clientes"},{to:"/financeiro",icon:Wallet,label:"Caixa"}].map(x=><NavLink key={x.to} to={x.to} className={({isActive})=>isActive?"dock-link dock-active":"dock-link"}><x.icon size={19}/><span>{x.label}</span></NavLink>)}</nav>
    </div>
  </div>;
}
