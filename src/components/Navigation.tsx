import React from 'react';
import {
  CalendarDays,
  Youtube,
  PenTool,
  BookOpen,
  StickyNote,
  Timer,
  Trophy,
  Gamepad2,
  Bot,
  Users,
  Calculator,
  LayoutDashboard,
  CheckCircle2,
  X,
  ChevronLeft,
  ChevronRight,
  Lock,
  ShieldCheck,
} from 'lucide-react';
import { NavModule, StaffUser } from '../types';
import { audioFX } from '../services/audio';

interface NavigationProps {
  activeModule: NavModule;
  onSelectModule: (module: NavModule) => void;
  isCollapsed: boolean;
  onToggleCollapse: () => void;
  isMobileOpen: boolean;
  onCloseMobile: () => void;
  staffUser?: StaffUser | null;
  onOpenStaffPortal?: () => void;
}

interface NavItem {
  id: NavModule;
  label: string;
  badge?: string;
  icon: React.ElementType;
  description: string;
  staffOnly?: boolean;
}

export const NAV_ITEMS: NavItem[] = [
  {
    id: 'dashboard',
    label: 'Command Hub',
    icon: LayoutDashboard,
    description: 'System overview & quick actions',
  },
  {
    id: 'timetable',
    label: 'Timetable',
    badge: 'Live',
    icon: CalendarDays,
    description: 'Period tracking & stream allocation',
  },
  {
    id: 'notes',
    label: 'Digital Board',
    icon: PenTool,
    description: 'Whiteboard, sketch & grid tools',
  },
  {
    id: 'timer',
    label: 'Timer & Clock',
    icon: Timer,
    description: 'Smart countdown & stopwatch laps',
  },
  {
    id: 'quiz',
    label: 'Quiz Arena',
    icon: Trophy,
    description: 'Classroom tests & leaderboard',
  },
  {
    id: 'calculator',
    label: 'Calculator',
    badge: 'Sci',
    icon: Calculator,
    description: 'Class 11 Math, Trig & Statistics',
  },
  {
    id: 'games',
    label: 'Activities',
    icon: Gamepad2,
    description: 'Wheel, student picker & warmups',
  },
  {
    id: 'intro',
    label: 'Class Showcase',
    badge: '21 Students',
    icon: Users,
    description: 'Cinematic student HUD sequence',
  },
  {
    id: 'gemini',
    label: 'Gemini AI',
    badge: 'Copilot',
    icon: Bot,
    description: 'Syllabus assistant & smart Q&A',
  },
  {
    id: 'youtube',
    label: 'YouTube Hub',
    icon: Youtube,
    description: 'Classroom learning channels & video',
  },
  {
    id: 'diagnostics',
    label: 'Verification',
    badge: 'Tests',
    icon: CheckCircle2,
    description: 'System integrity & validation checks',
  },
];

export const Navigation: React.FC<NavigationProps> = ({
  activeModule,
  onSelectModule,
  isCollapsed,
  onToggleCollapse,
  isMobileOpen,
  onCloseMobile,
  staffUser,
  onOpenStaffPortal,
}) => {
  const isStaffAuthorized = Boolean(
    staffUser &&
      (staffUser.role === 'teacher_in_charge' || staffUser.role === 'developer')
  );

  const visibleNavItems = NAV_ITEMS;

  const handleNavClick = (mod: NavModule) => {
    audioFX.playClick();
    onSelectModule(mod);
    onCloseMobile();
  };

  const mobileNavButtons: { id: NavModule; label: string; icon: React.ElementType }[] = [
    { id: 'dashboard', label: 'Hub', icon: LayoutDashboard },
    { id: 'timetable', label: 'Schedule', icon: CalendarDays },
    { id: 'notes', label: 'Board', icon: PenTool },
    { id: 'quiz', label: 'Quiz', icon: Trophy },
    { id: 'calculator', label: 'Calc', icon: Calculator },
  ];

  return (
    <>
      {/* Mobile Drawer Overlay */}
      {isMobileOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/70 backdrop-blur-sm md:hidden transition-opacity"
          onClick={onCloseMobile}
        />
      )}

      {/* Main Navigation Sidebar (Desktop & Tablet) */}
      <aside
        className={`fixed md:sticky top-0 md:top-[61px] left-0 z-40 h-full md:h-[calc(100vh-61px)] flex flex-col border-r border-cyan-500/20 bg-[#040814]/95 backdrop-blur-xl transition-all duration-300 ease-in-out ${
          isCollapsed ? 'md:w-[76px]' : 'md:w-64'
        } ${
          isMobileOpen
            ? 'translate-x-0 w-72'
            : '-translate-x-full md:translate-x-0 w-0 md:w-auto'
        }`}
      >
        {/* Navigation Items List */}
        <div className="flex-1 overflow-y-auto py-3 px-2 sm:px-3 space-y-1">
          {visibleNavItems.map((item) => {
            const Icon = item.icon;
            const isActive = activeModule === item.id;

            return (
              <button
                key={item.id}
                onClick={() => handleNavClick(item.id)}
                title={isCollapsed ? item.label : undefined}
                className={`w-full flex items-center gap-3 px-3 py-2.5 rounded-xl text-left transition-all group relative ${
                  isActive
                    ? 'bg-gradient-to-r from-cyan-950/70 to-blue-950/70 border border-cyan-400/50 text-cyan-200 shadow-[0_0_15px_rgba(0,240,255,0.2)]'
                    : 'text-slate-300 hover:text-cyan-300 hover:bg-cyan-950/30 border border-transparent hover:border-cyan-500/20'
                }`}
              >
                {/* Active indicator bar */}
                {isActive && (
                  <div className="absolute left-0 top-1.5 bottom-1.5 w-1 rounded-r bg-cyan-400 shadow-[0_0_8px_#00f0ff]" />
                )}

                <div
                  className={`flex items-center justify-center w-8 h-8 rounded-lg shrink-0 transition ${
                    isActive
                      ? 'bg-cyan-500/20 text-cyan-300'
                      : 'bg-slate-900/60 text-slate-400 group-hover:text-cyan-400 group-hover:bg-cyan-950/40'
                  }`}
                >
                  <Icon className="w-4 h-4" />
                </div>

                {/* Text Labels - hidden when collapsed on desktop */}
                {(!isCollapsed || isMobileOpen) && (
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center justify-between gap-1">
                      <span className="font-hud text-sm font-semibold truncate tracking-wide">
                        {item.label}
                      </span>
                      {item.badge && (
                        <span
                          className={`text-[10px] font-mono-code px-1.5 py-0.5 rounded-full border ${
                            item.staffOnly
                              ? 'bg-violet-500/20 text-violet-300 border-violet-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border-cyan-500/30'
                          }`}
                        >
                          {item.badge}
                        </span>
                      )}
                    </div>
                    <p className="text-[11px] text-slate-400 truncate font-sans">
                      {item.description}
                    </p>
                  </div>
                )}
              </button>
            );
          })}
        </div>

        {/* Footer Collapse Button (Desktop Only) */}
        <div className="hidden md:flex items-center justify-between p-3 border-t border-cyan-500/20 bg-slate-950/40">
          {!isCollapsed && (
            <div className="text-[11px] font-mono-code text-slate-400">
              {isStaffAuthorized ? 'STAFF VAULT ACTIVE' : 'HUD v1.3 • ONLINE'}
            </div>
          )}
          <button
            onClick={() => {
              audioFX.playClick();
              onToggleCollapse();
            }}
            className={`p-2 rounded-lg text-slate-400 hover:text-cyan-300 hover:bg-cyan-950/40 transition ${
              isCollapsed ? 'mx-auto' : ''
            }`}
            title={isCollapsed ? 'Expand Sidebar' : 'Collapse Sidebar'}
            aria-label={isCollapsed ? 'Expand sidebar' : 'Collapse sidebar'}
          >
            {isCollapsed ? (
              <ChevronRight className="w-4 h-4" />
            ) : (
              <ChevronLeft className="w-4 h-4" />
            )}
          </button>
        </div>
      </aside>

      {/* Mobile Sticky Bottom Navigation */}
      <nav className="md:hidden fixed bottom-0 left-0 right-0 z-30 bg-[#040814]/95 border-t border-cyan-500/30 backdrop-blur-lg px-2 py-1.5 flex items-center justify-around">
        {mobileNavButtons.map((btn) => {
          const Icon = btn.icon;
          const isActive = activeModule === btn.id;
          return (
            <button
              key={btn.id}
              onClick={() => handleNavClick(btn.id)}
              className={`flex flex-col items-center py-1 px-3 rounded-lg transition min-w-[56px] ${
                isActive
                  ? 'text-cyan-300 font-bold bg-cyan-950/50 border border-cyan-500/30'
                  : 'text-slate-400 hover:text-slate-200'
              }`}
            >
              <div className="relative">
                <Icon className="w-5 h-5" />
              </div>
              <span className="text-[10px] mt-0.5 font-hud">{btn.label}</span>
            </button>
          );
        })}
      </nav>
    </>
  );
};
