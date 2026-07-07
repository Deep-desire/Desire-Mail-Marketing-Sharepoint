import logo from '../Images/logo.png';
import { NavLink, useNavigate } from 'react-router-dom';
import {
  LayoutDashboard,
  Upload,
  FileText,
  LogOut,
  Mail,
  Send,
  Settings,
  MailX,
} from 'lucide-react';

const navItems = [
  { to: '/dashboard',             icon: LayoutDashboard, label: 'Dashboard' },
  { to: '/contacts',              icon: Upload,          label: 'Uploads' },
  { to: '/templates',             icon: FileText,        label: 'Templates' },
  { to: '/emails',                icon: Send,            label: 'Delivery Log' },
  { to: '/settings/sharepoint',   icon: Settings,        label: 'SP Lists' },
  { to: '/settings/unsubscribed', icon: MailX,           label: 'Unsubscribed' },
];

export default function Sidebar() {
  const navigate = useNavigate();

  const handleLogout = () => {
    localStorage.removeItem('desire_token');
    localStorage.removeItem('desire_admin');
    navigate('/login');
  };

  return (
    <aside className="fixed left-0 top-0 h-screen w-64 bg-white border-r border-gray-200 flex flex-col z-50 shadow-sm">
      {/* Logo */}
      <div className="p-6 border-b border-gray-100">
        <div className="flex items-center gap-3">
          <img src={logo} alt="Desire Mail Logo" className="w-10 h-10 object-contain rounded-xl shadow-sm" />
          <div>
            <h1 className="text-lg font-bold text-gray-900">Desire Mail</h1>
            <p className="text-xs text-gray-500">Marketing System</p>
          </div>
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-1">
        {navItems.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            className={({ isActive }) =>
              `flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium transition-all duration-200 group ${
                isActive
                  ? 'bg-brand-50 text-brand-600 border border-brand-100'
                  : 'text-gray-500 hover:text-gray-900 hover:bg-gray-50 border border-transparent'
              }`
            }
          >
            <item.icon className="w-5 h-5 transition-transform group-hover:scale-105" />
            {item.label}
          </NavLink>
        ))}
      </nav>

      {/* Logout */}
      <div className="p-4 border-t border-gray-100">
        <button
          onClick={handleLogout}
          className="flex items-center gap-3 px-4 py-3 rounded-xl text-sm font-medium text-gray-500 hover:text-red-600 hover:bg-red-50 transition-all duration-200 w-full"
        >
          <LogOut className="w-5 h-5" />
          Logout
        </button>
      </div>
    </aside>
  );
}
