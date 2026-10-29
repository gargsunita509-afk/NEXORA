import React, { useState, useEffect } from 'react';
import { NavModule, StaffUser } from './types';
import { Header } from './components/Header';
import { Navigation } from './components/Navigation';
import { Footer } from './components/Footer';
import { WelcomeAnimation } from './components/WelcomeAnimation';
import { PresentationMode } from './components/PresentationMode';
import { BackupModal } from './components/BackupModal';
import { DiagnosticsModal } from './components/DiagnosticsModal';
import { OfflineBanner } from './components/OfflineBanner';
import { UpdateNotificationModal } from './components/UpdateNotificationModal';
import { OfflineWarningModal } from './components/OfflineWarningModal';
import { UniversalBackButton } from './components/UniversalBackButton';
import { StaffAuthModal } from './components/StaffAuthModal';
import { syncService } from './services/syncService';
import { staffContentService } from './services/staffContentService';

// Modules
import { DashboardModule } from './components/modules/DashboardModule';
import { TimetableModule } from './components/modules/TimetableModule';
import { YouTubeModule } from './components/modules/YouTubeModule';
import { SketchboardModule } from './components/modules/SketchboardModule';
import { DiaryModule } from './components/modules/DiaryModule';
import { QuickNotesModule } from './components/modules/QuickNotesModule';
import { TimerModule } from './components/modules/TimerModule';
import { QuizArenaModule } from './components/modules/QuizArenaModule';
import { GamesModule } from './components/modules/GamesModule';
import { GeminiModule } from './components/modules/GeminiModule';
import { ClassIntroModule } from './components/modules/ClassIntroModule';
import { CalculatorModule } from './components/modules/CalculatorModule';

export default function App() {
  // Show welcome animation only once per session / page load
  const [showWelcome, setShowWelcome] = useState<boolean>(() => {
    try {
      const shown = sessionStorage.getItem('class_os_welcome_shown');
      return !shown;
    } catch {
      return true;
    }
  });

  const [activeModule, setActiveModule] = useState<NavModule>('dashboard');
  const [isSidebarCollapsed, setIsSidebarCollapsed] = useState(false);
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  // Staff Authentication state (Teacher/In-Charge & Developer)
  const [staffUser, setStaffUser] = useState<StaffUser | null>(
    staffContentService.getCurrentStaffUser()
  );
  const [isStaffPortalOpen, setIsStaffPortalOpen] = useState(false);
  const [staffPortalTab, setStaffPortalTab] = useState<
    'login' | 'manage_accounts' | 'manage_teachers' | 'manage_characters'
  >('login');
  const [pendingProtectedModule, setPendingProtectedModule] =
    useState<NavModule | null>(null);

  // Modals state
  const [isPresentationMode, setIsPresentationMode] = useState(false);
  const [isBackupModalOpen, setIsBackupModalOpen] = useState(false);
  const [isDiagnosticsOpen, setIsDiagnosticsOpen] = useState(false);
  const [offlineBlockedFeature, setOfflineBlockedFeature] = useState<string | null>(null);

  // Attempt sync & verify staff session when application mounts
  useEffect(() => {
    syncService.syncPendingAttempts();
    staffContentService.checkAuthStatus();

    const unsub = staffContentService.subscribe(() => {
      const current = staffContentService.getCurrentStaffUser();
      setStaffUser(current);
      // If staff user logs out or session expires while on a protected module, immediately lock & redirect
      if (!current) {
        setActiveModule((prev) =>
          prev === 'diary' || prev === 'quick_notes' ? 'dashboard' : prev
        );
      }
    });
    return unsub;
  }, []);

  // Guard against direct URL hash attempts (#diary, #quick_notes)
  useEffect(() => {
    const handleHashCheck = () => {
      const hash = window.location.hash.replace(/^#\/?/, '').toLowerCase();
      if (hash === 'diary' || hash === 'quick_notes') {
        if (typeof window !== 'undefined' && window.location.hash) {
          window.history.replaceState(null, '', window.location.pathname);
        }
        setActiveModule('dashboard');
      }
    };
    handleHashCheck();
    window.addEventListener('hashchange', handleHashCheck);
    return () => window.removeEventListener('hashchange', handleHashCheck);
  }, []);

  const handleWelcomeComplete = () => {
    setShowWelcome(false);
    try {
      sessionStorage.setItem('class_os_welcome_shown', 'true');
    } catch {}
  };

  const handleSelectModule = (mod: NavModule) => {
    if (mod === 'diagnostics') {
      setIsDiagnosticsOpen(true);
      return;
    }

    // Strict route-level permission guard for Diary and Quick Notes: never switch module for unauthorized users
    if (mod === 'diary' || mod === 'quick_notes') {
      if (!staffContentService.isStaffAuthenticated()) {
        setActiveModule('dashboard');
        return;
      }
    }

    // Strict offline blocking for internet-dependent features: Gemini AI & YouTube streaming
    if (
      (mod === 'youtube' || mod === 'gemini') &&
      typeof navigator !== 'undefined' &&
      !navigator.onLine
    ) {
      setOfflineBlockedFeature(mod === 'youtube' ? 'YouTube Streaming' : 'Gemini AI');
      return;
    }

    setActiveModule(mod);
  };

  const renderModuleContent = () => {
    const isStaffAuthorized = Boolean(
      staffUser &&
        (staffUser.role === 'teacher_in_charge' || staffUser.role === 'developer')
    );

    switch (activeModule) {
      case 'dashboard':
        return (
          <DashboardModule
            onNavigate={handleSelectModule}
            staffUser={staffUser}
            onOpenStaffPortal={() => setIsStaffPortalOpen(true)}
          />
        );
      case 'timetable':
        return <TimetableModule />;
      case 'youtube':
        return <YouTubeModule />;
      case 'notes':
        return <SketchboardModule />;
      case 'diary':
      case 'quick_notes':
        return (
          <DashboardModule
            onNavigate={handleSelectModule}
            staffUser={staffUser}
          />
        );
      case 'timer':
        return <TimerModule />;
      case 'quiz':
        return <QuizArenaModule />;
      case 'games':
        return <GamesModule />;
      case 'gemini':
        return <GeminiModule />;
      case 'intro':
        return (
          <ClassIntroModule
            staffUser={staffUser}
            onOpenManageCharacters={() => {
              setStaffPortalTab('manage_characters');
              setIsStaffPortalOpen(true);
            }}
          />
        );
      case 'calculator':
        return <CalculatorModule />;
      default:
        return (
          <DashboardModule
            onNavigate={handleSelectModule}
            staffUser={staffUser}
            onOpenStaffPortal={() => setIsStaffPortalOpen(true)}
          />
        );
    }
  };

  return (
    <div className="min-h-screen bg-[#040814] print:bg-white print:min-h-0 print:h-auto text-slate-100 print:text-slate-900 flex flex-col font-sans relative selection:bg-cyan-500 selection:text-black">
      {/* Cinematic Welcome Animation (Runs once on first load) */}
      {showWelcome && <WelcomeAnimation onComplete={handleWelcomeComplete} />}

      {/* Main Persistent Header */}
      <div className="no-print print:hidden">
        <Header
          currentModule={activeModule}
          isPresentationMode={isPresentationMode}
          onTogglePresentation={() => setIsPresentationMode(!isPresentationMode)}
          onOpenBackup={() => setIsBackupModalOpen(true)}
          onOpenDiagnostics={() => setIsDiagnosticsOpen(true)}
          isMobileMenuOpen={isMobileMenuOpen}
          onToggleMobileMenu={() => setIsMobileMenuOpen(!isMobileMenuOpen)}
          staffUser={staffUser}
          onOpenStaffPortal={() => setIsStaffPortalOpen(true)}
        />
      </div>

      {/* Main Application Body */}
      <div className="flex-1 flex w-full relative print:block print:w-full">
        {/* Navigation Sidebar */}
        <div className="no-print print:hidden">
          <Navigation
            activeModule={activeModule}
            onSelectModule={handleSelectModule}
            isCollapsed={isSidebarCollapsed}
            onToggleCollapse={() => setIsSidebarCollapsed(!isSidebarCollapsed)}
            isMobileOpen={isMobileMenuOpen}
            onCloseMobile={() => setIsMobileMenuOpen(false)}
            staffUser={staffUser}
            onOpenStaffPortal={() => setIsStaffPortalOpen(true)}
          />
        </div>

        {/* Dynamic Content Workspace */}
        <main className="flex-1 p-3 sm:p-6 md:p-8 max-w-7xl mx-auto w-full pb-20 md:pb-12 min-w-0 print:p-0 print:m-0 print:max-w-none print:w-full print:pb-0 print:border-none print:shadow-none">
          {activeModule !== 'dashboard' && (
            <div className="no-print print:hidden mb-4 sm:mb-6">
              <UniversalBackButton
                label="BACK TO COMMAND CENTER"
                sublabel={`Current Workspace: ${activeModule.toUpperCase()}`}
                onClick={() => handleSelectModule('dashboard')}
              />
            </div>
          )}
          {renderModuleContent()}
        </main>
      </div>

      {/* Footer with 'By Vansh' branding */}
      <div className="no-print print:hidden">
        <Footer />
      </div>

      {/* Floating & Protected Modals (Screen Only) */}
      <div className="no-print print:hidden">
        {/* 16:9 Smart Board Presentation Mode */}
        <PresentationMode
          isOpen={isPresentationMode}
          onClose={() => setIsPresentationMode(false)}
          title={activeModule.toUpperCase()}
        >
          {renderModuleContent()}
        </PresentationMode>

        {/* Database Persistence & Backup Modal */}
        <BackupModal
          isOpen={isBackupModalOpen}
          onClose={() => setIsBackupModalOpen(false)}
          onDataRestored={() => {
            setActiveModule((prev) => prev);
          }}
        />

        {/* In-App System Verification Checks Modal */}
        <DiagnosticsModal
          isOpen={isDiagnosticsOpen}
          onClose={() => setIsDiagnosticsOpen(false)}
        />

        {/* Automated In-App Update Detection Notification */}
        <UpdateNotificationModal />

        {/* Internet Required Warning Modal */}
        <OfflineWarningModal
          isOpen={Boolean(offlineBlockedFeature)}
          onClose={() => setOfflineBlockedFeature(null)}
          featureName={offlineBlockedFeature || undefined}
        />

        {/* Honest Offline Connectivity Alert */}
        <OfflineBanner />
      </div>
    </div>
  );
}
