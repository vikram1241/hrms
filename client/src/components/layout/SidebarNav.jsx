import { NavLink } from 'react-router-dom';
import { LogOut } from 'lucide-react';
import { cn } from '../../lib/cn.js';
import { navFor } from '../../config/nav.js';

// The shared sidebar body, used both in the permanent desktop rail and inside
// the mobile MUI Drawer. Deep-teal surface with an active "pill".
export default function SidebarNav({ role, onNavigate, onLogout }) {
  const items = navFor(role);

  return (
    <div className="flex h-full flex-col bg-sidebar text-slate-200">
      {/* Brand */}
      <div className="flex items-center gap-2.5 px-5 py-5">
        <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-primary-600 font-extrabold text-white">X</div>
        <div className="leading-tight">
          <p className="text-sm font-bold text-white">XYZ HRMS</p>
          <p className="text-[11px] uppercase tracking-wide text-primary-300">{role} Portal</p>
        </div>
      </div>

      {/* Nav items */}
      <nav className="flex-1 space-y-1 overflow-y-auto px-3 py-2">
        {items.map(({ to, label, icon: Icon }) => (
          <NavLink
            key={to}
            to={to}
            onClick={onNavigate}
            className={({ isActive }) =>
              cn(
                'group flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors',
                isActive
                  ? 'bg-primary-600 text-white shadow-sm'
                  : 'text-slate-300 hover:bg-sidebar-hover hover:text-white'
              )
            }
          >
            <Icon size={18} className="shrink-0" />
            <span className="truncate">{label}</span>
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="border-t border-white/10 p-3">
        <button
          onClick={onLogout}
          className="flex w-full items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium text-slate-300 transition-colors hover:bg-danger/90 hover:text-white"
        >
          <LogOut size={18} />
          Logout
        </button>
      </div>
    </div>
  );
}
