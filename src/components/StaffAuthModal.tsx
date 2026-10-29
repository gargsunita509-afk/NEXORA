import React, { useState, useEffect } from 'react';
import {
  ShieldCheck,
  ShieldAlert,
  Lock,
  UserCheck,
  KeyRound,
  AlertCircle,
  CheckCircle2,
  X,
  Users,
  Plus,
  Trash2,
  RefreshCw,
  LogOut,
  Server,
  Eye,
  EyeOff,
  UserPlus,
  Key,
  GraduationCap,
  Sparkles,
  RotateCcw,
} from 'lucide-react';
import {
  staffContentService,
  StaffAccountSummary,
} from '../services/staffContentService';
import { StaffRole, StaffUser, StreamType, Student } from '../types';
import {
  getConfiguredBackendUrl,
  setConfiguredBackendUrl,
  isNativeAndroidApp,
} from '../services/updateService';
import { storage } from '../services/storage';

interface StaffAuthModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialTab?: 'login' | 'manage_accounts' | 'manage_teachers' | 'manage_characters';
  onAuthSuccess?: (user: StaffUser) => void;
}

export const StaffAuthModal: React.FC<StaffAuthModalProps> = ({
  isOpen,
  onClose,
  initialTab = 'login',
  onAuthSuccess,
}) => {
  const [currentUser, setCurrentUser] = useState<StaffUser | null>(
    staffContentService.getCurrentStaffUser()
  );
  const [bootstrapRequired, setBootstrapRequired] = useState<boolean>(
    staffContentService.isBootstrapRequired()
  );
  const [activeTab, setActiveTab] = useState<
    'login' | 'manage_accounts' | 'manage_teachers' | 'manage_characters'
  >(initialTab);
  const [loading, setLoading] = useState(false);
  const [checkingStatus, setCheckingStatus] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [successMsg, setSuccessMsg] = useState<string | null>(null);

  // Login form state
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);

  // Initial one-time bootstrap state
  const [devUsername, setDevUsername] = useState('vansh.dev');
  const [devDisplayName, setDevDisplayName] = useState('Vansh (Developer)');
  const [devPassword, setDevPassword] = useState('');
  const [devPasswordConfirm, setDevPasswordConfirm] = useState('');
  const [includeInitialTeacher, setIncludeInitialTeacher] = useState(false);
  const [teacherUsername, setTeacherUsername] = useState('alka.mam');
  const [teacherPassword, setTeacherPassword] = useState('');
  const [teacherDisplayName, setTeacherDisplayName] = useState('Alka Mam (In-Charge)');
  const [adminSetupKey, setAdminSetupKey] = useState('');
  const [showAdminSetupForm, setShowAdminSetupForm] = useState(false);

  // Developer Account Management state
  const [accounts, setAccounts] = useState<StaffAccountSummary[]>([]);
  const [loadingAccounts, setLoadingAccounts] = useState(false);
  const [newAccUsername, setNewAccUsername] = useState('');
  const [newAccPassword, setNewAccPassword] = useState('');
  const [newAccDisplayName, setNewAccDisplayName] = useState('');
  const [newAccTitle, setNewAccTitle] = useState('');
  const [newAccRole, setNewAccRole] = useState<StaffRole>('teacher_in_charge');
  const [editingAccountId, setEditingAccountId] = useState<string | null>(null);

  // Teacher Management state (for Teacher & Developer)
  const [teachers, setTeachers] = useState<StaffAccountSummary[]>([]);
  const [loadingTeachers, setLoadingTeachers] = useState(false);
  const [newTeacherName, setNewTeacherName] = useState('');
  const [newTeacherUser, setNewTeacherUser] = useState('');
  const [newTeacherTitle, setNewTeacherTitle] = useState('');
  const [newTeacherPass, setNewTeacherPass] = useState('');
  const [resettingTeacherId, setResettingTeacherId] = useState<string | null>(null);
  const [resetTeacherPassInput, setResetTeacherPassInput] = useState('');

  // Student / Character Management state (Developer-Only)
  const [studentsList, setStudentsList] = useState<Student[]>([]);
  const [loadingStudents, setLoadingStudents] = useState(false);
  const [newStudentName, setNewStudentName] = useState('');
  const [newStudentStream, setNewStudentStream] = useState<StreamType>('PCM');
  const [newStudentGender, setNewStudentGender] = useState<'boy' | 'girl'>('boy');
  const [editingStudentId, setEditingStudentId] = useState<string | null>(null);

  // Optional Backend Server URL configuration
  const [showServerConfig, setShowServerConfig] = useState(false);
  const [backendUrlInput, setBackendUrlInput] = useState(getConfiguredBackendUrl());

  useEffect(() => {
    const unsub = staffContentService.subscribe(() => {
      setCurrentUser(staffContentService.getCurrentStaffUser());
      setBootstrapRequired(staffContentService.isBootstrapRequired());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (!isOpen) return;
    setError(null);
    setSuccessMsg(null);
    setActiveTab(initialTab);
    setBackendUrlInput(getConfiguredBackendUrl());

    setCheckingStatus(true);
    staffContentService
      .checkAuthStatus()
      .then((status) => {
        setBootstrapRequired(status.bootstrapRequired);
        setCurrentUser(status.user);
        if (status.user) {
          if (status.user.role === 'developer' && initialTab === 'manage_accounts') {
            loadAccounts();
          } else if (initialTab === 'manage_teachers') {
            loadTeachers();
          } else if (status.user.role === 'developer' && initialTab === 'manage_characters') {
            loadStudents();
          }
        }
      })
      .finally(() => {
        setCheckingStatus(false);
      });
  }, [isOpen, initialTab]);

  const loadAccounts = async () => {
    setLoadingAccounts(true);
    const res = await staffContentService.listStaffAccounts();
    if (res.error) {
      setError(res.error);
    } else {
      setAccounts(res.accounts);
    }
    setLoadingAccounts(false);
  };

  const loadTeachers = async () => {
    setLoadingTeachers(true);
    const res = await staffContentService.listTeachers();
    if (res.error) {
      setError(res.error);
    } else {
      setTeachers(res.teachers);
    }
    setLoadingTeachers(false);
  };

  const loadStudents = async () => {
    setLoadingStudents(true);
    const serverList = await staffContentService.fetchServerStudents();
    if (serverList.length > 0) {
      setStudentsList(serverList);
      storage.saveStudents(serverList);
    } else {
      setStudentsList(storage.getStudents());
    }
    setLoadingStudents(false);
  };

  if (!isOpen) return null;

  const handleLoginSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!username.trim() || !password) {
      setError('Please enter both your staff username and password.');
      return;
    }

    setLoading(true);
    const res = await staffContentService.login(username.trim(), password);
    setLoading(false);

    if (!res.success || !res.session) {
      setError(res.error || 'Invalid credentials or unauthorized role.');
      return;
    }

    setPassword('');
    setSuccessMsg(`Authenticated as ${res.session.user.displayName} (${res.session.user.roleLabel}).`);
    if (onAuthSuccess) {
      onAuthSuccess(res.session.user);
    }
    setTimeout(() => {
      onClose();
    }, 500);
  };

  const handleBootstrapSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!adminSetupKey.trim()) {
      setError('Server Administrator Setup Key is required to authorize account provisioning.');
      return;
    }
    if (devUsername.trim().length < 3) {
      setError('Developer username must be at least 3 characters.');
      return;
    }
    if (devPassword.length < 6) {
      setError('Developer password must be at least 6 characters.');
      return;
    }
    if (devPassword !== devPasswordConfirm) {
      setError('Developer password and confirmation do not match.');
      return;
    }
    if (includeInitialTeacher) {
      if (teacherUsername.trim().length < 3) {
        setError('Teacher username must be at least 3 characters.');
        return;
      }
      if (teacherPassword.length < 6) {
        setError('Teacher password must be at least 6 characters.');
        return;
      }
      if (teacherUsername.trim().toLowerCase() === devUsername.trim().toLowerCase()) {
        setError('Developer and Teacher usernames must be distinct.');
        return;
      }
    }

    setLoading(true);
    const res = await staffContentService.bootstrapInitialStaff({
      setupKey: adminSetupKey.trim(),
      developerUsername: devUsername.trim(),
      developerPassword: devPassword,
      developerDisplayName: devDisplayName.trim() || 'Vansh (Developer)',
      teacherUsername: includeInitialTeacher ? teacherUsername.trim() : undefined,
      teacherPassword: includeInitialTeacher ? teacherPassword : undefined,
      teacherDisplayName: includeInitialTeacher ? (teacherDisplayName.trim() || 'Alka Mam (In-Charge)') : undefined,
    });
    setLoading(false);

    if (!res.success || !res.session) {
      setError(res.error || 'Initial staff provisioning failed.');
      return;
    }

    setDevPassword('');
    setDevPasswordConfirm('');
    setTeacherPassword('');
    setSuccessMsg('Initial Developer account successfully provisioned. Signed in as Developer.');
    if (onAuthSuccess) {
      onAuthSuccess(res.session.user);
    }
    setTimeout(() => {
      onClose();
    }, 600);
  };

  // Teacher Management Actions
  const handleCreateTeacher = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!newTeacherName.trim() || !newTeacherUser.trim() || newTeacherPass.length < 6) {
      setError('Teacher Name, Username, and Password (min 6 characters) are required.');
      return;
    }

    setLoading(true);
    const res = await staffContentService.createTeacherAccount({
      displayName: newTeacherName.trim(),
      username: newTeacherUser.trim(),
      title: newTeacherTitle.trim() || 'Class 11 Subject Teacher',
      password: newTeacherPass.trim(),
    });
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to add teacher account.');
      return;
    }

    setSuccessMsg(`Teacher account "${newTeacherName}" created successfully.`);
    setNewTeacherName('');
    setNewTeacherUser('');
    setNewTeacherTitle('');
    setNewTeacherPass('');
    await loadTeachers();
  };

  const handleResetTeacherPassword = async (teacherId: string) => {
    if (!resetTeacherPassInput || resetTeacherPassInput.length < 6) {
      setError('New password must be at least 6 characters.');
      return;
    }
    setError(null);
    setLoading(true);
    const res = await staffContentService.resetTeacherPassword(teacherId, resetTeacherPassInput);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to reset password.');
      return;
    }

    setSuccessMsg('Teacher password updated successfully.');
    setResettingTeacherId(null);
    setResetTeacherPassInput('');
  };

  const handleDeleteTeacher = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove teacher account "${name}"?`)) return;
    setError(null);
    setLoading(true);
    const res = await staffContentService.deleteTeacherAccount(id);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to remove teacher account.');
      return;
    }

    setSuccessMsg(`Removed teacher "${name}".`);
    await loadTeachers();
  };

  // Student / Character Management Actions (Developer-Only)
  const handleAddOrEditStudent = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSuccessMsg(null);

    if (!newStudentName.trim()) {
      setError('Student / Character name is required.');
      return;
    }

    setLoading(true);
    if (editingStudentId) {
      const res = await staffContentService.updateStudent(editingStudentId, {
        name: newStudentName.trim(),
        stream: newStudentStream,
        gender: newStudentGender,
      });
      setLoading(false);
      if (!res.success) {
        setError(res.error || 'Failed to update student character.');
        return;
      }
      setSuccessMsg(`Updated student character "${newStudentName}".`);
    } else {
      const res = await staffContentService.addStudent({
        name: newStudentName.trim(),
        stream: newStudentStream,
        gender: newStudentGender,
      });
      setLoading(false);
      if (!res.success) {
        setError(res.error || 'Failed to add student character.');
        return;
      }
      setSuccessMsg(`Added new student character "${newStudentName}" (${newStudentStream}).`);
    }

    setEditingStudentId(null);
    setNewStudentName('');
    setNewStudentStream('PCM');
    setNewStudentGender('boy');
    await loadStudents();
  };

  const handleDeleteStudent = async (id: string, name: string) => {
    if (!confirm(`Are you sure you want to remove student character "${name}"?`)) return;
    setError(null);
    setLoading(true);
    const res = await staffContentService.deleteStudent(id);
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to delete student.');
      return;
    }

    setSuccessMsg(`Removed student character "${name}".`);
    await loadStudents();
  };

  const handleResetStudentsRoster = async () => {
    if (!confirm('Reset all students to the official verified 21 Class 11 CBSE roster?')) return;
    setError(null);
    setLoading(true);
    const res = await staffContentService.resetStudents();
    setLoading(false);

    if (!res.success) {
      setError(res.error || 'Failed to reset roster.');
      return;
    }

    setSuccessMsg('Reset to standard 21 Class 11 CBSE students.');
    await loadStudents();
  };

  const handleSaveServerUrl = () => {
    setConfiguredBackendUrl(backendUrlInput);
    setSuccessMsg('Backend server URL updated. Re-checking authentication status...');
    staffContentService.checkAuthStatus().then((st) => {
      setBootstrapRequired(st.bootstrapRequired);
      setCurrentUser(st.user);
    });
  };

  const isDeveloper = currentUser?.role === 'developer';
  const isTeacher = currentUser?.role === 'teacher_in_charge';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-3 sm:p-4 bg-black/85 backdrop-blur-md animate-fade-in">
      <div className="relative w-full max-w-2xl rounded-2xl bg-[#070b16] border border-cyan-500/30 shadow-[0_0_60px_rgba(6,182,212,0.22)] overflow-hidden max-h-[92vh] flex flex-col">
        {/* Top Accent Bar */}
        <div className="h-1 w-full bg-gradient-to-r from-cyan-400 via-blue-500 to-violet-500" />

        {/* Header */}
        <div className="p-4 sm:p-5 border-b border-white/10 flex items-center justify-between bg-white/[0.02]">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-cyan-500/15 border border-cyan-500/40 flex items-center justify-center text-cyan-400 shrink-0">
              <ShieldCheck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base sm:text-lg font-bold text-white tracking-wide flex items-center gap-2 font-hud">
                NEXORA STAFF PORTAL
              </h2>
              <p className="text-xs text-slate-400">
                Teacher / In-Charge &amp; Developer Roles • Secure Class 11 Hub
              </p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-2 rounded-lg text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
            aria-label="Close staff portal"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Navigation Tabs when Authenticated */}
        {currentUser && (
          <div className="px-4 pt-2.5 border-b border-white/10 flex items-center justify-between bg-slate-950/80 overflow-x-auto gap-2">
            <div className="flex items-center gap-1 sm:gap-2">
              <button
                type="button"
                onClick={() => setActiveTab('login')}
                className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors whitespace-nowrap ${
                  activeTab === 'login'
                    ? 'border-cyan-400 text-cyan-300 bg-cyan-500/10'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                Session Status
              </button>

              {/* Teacher Management Tab: Accessible to BOTH Teachers and Developers */}
              <button
                type="button"
                onClick={() => {
                  setActiveTab('manage_teachers');
                  loadTeachers();
                }}
                className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                  activeTab === 'manage_teachers'
                    ? 'border-emerald-400 text-emerald-300 bg-emerald-500/10'
                    : 'border-transparent text-slate-400 hover:text-white'
                }`}
              >
                <Users className="w-3.5 h-3.5" />
                Faculty &amp; Teachers
              </button>

              {/* Developer-Only: Developer Accounts */}
              {isDeveloper && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('manage_accounts');
                    loadAccounts();
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === 'manage_accounts'
                      ? 'border-violet-400 text-violet-300 bg-violet-500/10'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <Key className="w-3.5 h-3.5" />
                  Dev Accounts
                </button>
              )}

              {/* Developer-Only: Characters & Students Management */}
              {isDeveloper && (
                <button
                  type="button"
                  onClick={() => {
                    setActiveTab('manage_characters');
                    loadStudents();
                  }}
                  className={`px-3 py-2 text-xs font-semibold rounded-t-lg border-b-2 transition-colors flex items-center gap-1.5 whitespace-nowrap ${
                    activeTab === 'manage_characters'
                      ? 'border-amber-400 text-amber-300 bg-amber-500/10'
                      : 'border-transparent text-slate-400 hover:text-white'
                  }`}
                >
                  <GraduationCap className="w-3.5 h-3.5" />
                  Class Characters
                </button>
              )}
            </div>

            <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 shrink-0">
              {currentUser.roleLabel}
            </span>
          </div>
        )}

        {/* Modal Body */}
        <div className="p-4 sm:p-6 overflow-y-auto space-y-4 flex-1">
          {error && (
            <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-300 text-xs flex items-start gap-2.5">
              <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
              <span>{error}</span>
            </div>
          )}

          {successMsg && (
            <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 text-xs flex items-start gap-2.5">
              <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0 mt-0.5" />
              <span>{successMsg}</span>
            </div>
          )}

          {checkingStatus ? (
            <div className="py-10 flex flex-col items-center justify-center gap-3 text-slate-400">
              <RefreshCw className="w-6 h-6 animate-spin text-cyan-400" />
              <p className="text-xs">Verifying server authentication state...</p>
            </div>
          ) : currentUser && activeTab === 'login' ? (
            /* Active Session Status */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-white/[0.03] border border-white/10 space-y-3">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-xs text-slate-400">Authenticated Staff Member</div>
                    <div className="text-base font-bold text-white mt-0.5">
                      {currentUser.displayName}
                    </div>
                    <div className="text-xs text-cyan-400 font-mono mt-0.5">
                      @{currentUser.username} • {currentUser.title}
                    </div>
                  </div>
                  <div className="px-3 py-1.5 rounded-lg bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-xs font-semibold">
                    {currentUser.roleLabel}
                  </div>
                </div>

                <div className="pt-3 border-t border-white/10 text-xs text-slate-300 space-y-1.5">
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Access to Protected Class Diary &amp; Attachments</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Access to Private Staff Quick Notes Feed</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <CheckCircle2 className="w-3.5 h-3.5 text-emerald-400" />
                    <span>Manage Faculty &amp; Teacher Accounts (Add Teachers / Reset Passwords)</span>
                  </div>
                  {isDeveloper && (
                    <>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-violet-400" />
                        <span>Developer privilege: Manage System Accounts &amp; Developer Roles</span>
                      </div>
                      <div className="flex items-center gap-2">
                        <CheckCircle2 className="w-3.5 h-3.5 text-amber-400" />
                        <span>Developer privilege: Add / Edit / Remove Class 11 Student Characters</span>
                      </div>
                    </>
                  )}
                </div>
              </div>

              <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
                <div className="flex items-center gap-2 flex-wrap">
                  <button
                    type="button"
                    onClick={() => {
                      setActiveTab('manage_teachers');
                      loadTeachers();
                    }}
                    className="px-3.5 py-2 rounded-xl bg-emerald-500/20 hover:bg-emerald-500/30 border border-emerald-500/40 text-emerald-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                  >
                    <Users className="w-3.5 h-3.5" />
                    Faculty Management
                  </button>
                  {isDeveloper && (
                    <button
                      type="button"
                      onClick={() => {
                        setActiveTab('manage_characters');
                        loadStudents();
                      }}
                      className="px-3.5 py-2 rounded-xl bg-amber-500/20 hover:bg-amber-500/30 border border-amber-500/40 text-amber-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <GraduationCap className="w-3.5 h-3.5" />
                      Class Characters
                    </button>
                  )}
                </div>

                <button
                  type="button"
                  onClick={async () => {
                    await staffContentService.logout(false);
                    setSuccessMsg('Signed out and cleared active staff session.');
                  }}
                  className="px-4 py-2 rounded-xl bg-rose-500/15 hover:bg-rose-500/25 border border-rose-500/40 text-rose-300 text-xs font-semibold flex items-center gap-1.5 transition-colors ml-auto"
                >
                  <LogOut className="w-3.5 h-3.5" />
                  Sign Out
                </button>
              </div>
            </div>
          ) : currentUser && activeTab === 'manage_teachers' ? (
            /* TEACHER MANAGEMENT (Teachers & Developers) */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-xs text-emerald-200">
                <strong>Faculty &amp; Teacher Management:</strong> Add subject teachers, manage profiles, and securely set or reset passwords without exposing previous credentials.
              </div>

              {/* Add New Teacher Form */}
              <form onSubmit={handleCreateTeacher} className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/10">
                <h3 className="text-xs font-bold uppercase tracking-wider text-emerald-400 flex items-center gap-1.5">
                  <UserPlus className="w-3.5 h-3.5" />
                  Add New Teacher / Subject In-Charge
                </h3>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Teacher Full Name *</label>
                    <input
                      type="text"
                      value={newTeacherName}
                      onChange={(e) => setNewTeacherName(e.target.value)}
                      placeholder="e.g. Diksha Mam"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-emerald-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Teacher Username *</label>
                    <input
                      type="text"
                      value={newTeacherUser}
                      onChange={(e) => setNewTeacherUser(e.target.value)}
                      placeholder="e.g. diksha.mam"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-emerald-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Subject / Designation</label>
                    <input
                      type="text"
                      value={newTeacherTitle}
                      onChange={(e) => setNewTeacherTitle(e.target.value)}
                      placeholder="e.g. Physics Department"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-emerald-400 focus:outline-none"
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Initial Password (min 6 chars) *</label>
                    <input
                      type="password"
                      value={newTeacherPass}
                      onChange={(e) => setNewTeacherPass(e.target.value)}
                      placeholder="••••••••"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-emerald-400 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-2.5 rounded-lg bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                >
                  {loading ? 'Creating Teacher Account...' : 'Register Faculty Teacher'}
                </button>
              </form>

              {/* Teachers List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Registered Faculty Members ({teachers.length})
                  </h4>
                  <button
                    type="button"
                    onClick={loadTeachers}
                    className="text-xs text-emerald-400 hover:text-emerald-300 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingTeachers ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {teachers.map((t) => (
                  <div
                    key={t.id}
                    className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex flex-col sm:flex-row sm:items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{t.displayName}</span>
                        <span className="text-[10px] px-2 py-0.5 rounded font-semibold bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                          {t.title || 'Teacher / In-Charge'}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        @{t.username}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {resettingTeacherId === t.id ? (
                        <div className="flex items-center gap-1.5">
                          <input
                            type="password"
                            placeholder="New password"
                            value={resetTeacherPassInput}
                            onChange={(e) => setResetTeacherPassInput(e.target.value)}
                            className="px-2 py-1 rounded bg-slate-900 border border-white/20 text-xs text-white w-28"
                          />
                          <button
                            type="button"
                            onClick={() => handleResetTeacherPassword(t.id)}
                            className="px-2 py-1 rounded bg-emerald-600 text-white text-[11px] font-semibold"
                          >
                            Save
                          </button>
                          <button
                            type="button"
                            onClick={() => {
                              setResettingTeacherId(null);
                              setResetTeacherPassInput('');
                            }}
                            className="text-slate-400 text-[11px] hover:text-white"
                          >
                            Cancel
                          </button>
                        </div>
                      ) : (
                        <button
                          type="button"
                          onClick={() => {
                            setResettingTeacherId(t.id);
                            setResetTeacherPassInput('');
                          }}
                          className="px-2.5 py-1 rounded-lg bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/30 text-cyan-300 text-[11px] font-semibold flex items-center gap-1"
                        >
                          <Key className="w-3 h-3" />
                          Reset Password
                        </button>
                      )}

                      {t.id !== currentUser.id && (
                        <button
                          type="button"
                          onClick={() => handleDeleteTeacher(t.id, t.displayName)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                          title="Remove teacher account"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : currentUser && activeTab === 'manage_characters' && isDeveloper ? (
            /* STUDENT / CHARACTER MANAGEMENT (Developer-Only) */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-xs text-amber-200">
                <strong>Developer Class Roster &amp; Character Engine:</strong> Add, edit, or customize Class 11 student characters across all 4 streams. As per security rules, this tool is strictly restricted to Developer mode.
              </div>

              {/* Add / Edit Character Form */}
              <form onSubmit={handleAddOrEditStudent} className="space-y-3 p-4 rounded-xl bg-white/[0.02] border border-white/10">
                <div className="flex items-center justify-between">
                  <h3 className="text-xs font-bold uppercase tracking-wider text-amber-400 flex items-center gap-1.5">
                    <UserPlus className="w-3.5 h-3.5" />
                    {editingStudentId ? 'Edit Student Character' : 'Add New Student / Character'}
                  </h3>
                  {editingStudentId && (
                    <button
                      type="button"
                      onClick={() => {
                        setEditingStudentId(null);
                        setNewStudentName('');
                        setNewStudentStream('PCM');
                        setNewStudentGender('boy');
                      }}
                      className="text-[11px] text-slate-400 hover:text-white"
                    >
                      Cancel Edit
                    </button>
                  )}
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Student / Character Name *</label>
                    <input
                      type="text"
                      value={newStudentName}
                      onChange={(e) => setNewStudentName(e.target.value)}
                      placeholder="e.g. Aryan"
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                      required
                    />
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Academic Stream *</label>
                    <select
                      value={newStudentStream}
                      onChange={(e) => setNewStudentStream(e.target.value as StreamType)}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    >
                      <option value="PCM">PCM (Physics, Chem, Math)</option>
                      <option value="PCB">PCB (Physics, Chem, Bio)</option>
                      <option value="COMMERCE">Commerce</option>
                      <option value="HUMANITIES">Humanities</option>
                    </select>
                  </div>
                  <div>
                    <label className="block text-[11px] text-slate-400 mb-1">Gender</label>
                    <select
                      value={newStudentGender}
                      onChange={(e) => setNewStudentGender(e.target.value as 'boy' | 'girl')}
                      className="w-full px-3 py-2 rounded-lg bg-slate-900 border border-white/10 text-xs text-white focus:border-amber-400 focus:outline-none"
                    >
                      <option value="boy">Boy (♂)</option>
                      <option value="girl">Girl (♀)</option>
                    </select>
                  </div>
                </div>

                <div className="flex gap-2">
                  <button
                    type="submit"
                    disabled={loading}
                    className="flex-1 py-2 rounded-lg bg-amber-600 hover:bg-amber-500 text-white text-xs font-bold transition-colors disabled:opacity-50"
                  >
                    {loading ? 'Saving...' : editingStudentId ? 'Update Character' : 'Add Character to Roster'}
                  </button>
                  <button
                    type="button"
                    onClick={handleResetStudentsRoster}
                    className="px-3 py-2 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5"
                    title="Reset to verified 21 Class 11 CBSE students"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    Reset Roster
                  </button>
                </div>
              </form>

              {/* Current Students List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Current Class Roster ({studentsList.length} Students)
                  </h4>
                  <button
                    type="button"
                    onClick={loadStudents}
                    className="text-xs text-amber-400 hover:text-amber-300 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingStudents ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 max-h-60 overflow-y-auto pr-1">
                  {studentsList.map((st) => (
                    <div
                      key={st.id}
                      className="p-2.5 rounded-lg bg-white/[0.02] border border-white/10 flex items-center justify-between gap-2"
                    >
                      <div className="min-w-0">
                        <div className="text-xs font-bold text-white truncate flex items-center gap-1.5">
                          <span>{st.name}</span>
                          <span className="text-[10px] text-slate-400">{st.gender === 'girl' ? '♀' : '♂'}</span>
                        </div>
                        <div className="text-[10px] font-mono text-cyan-400">{st.stream}</div>
                      </div>

                      <div className="flex items-center gap-1 shrink-0">
                        <button
                          type="button"
                          onClick={() => {
                            setEditingStudentId(st.id);
                            setNewStudentName(st.name);
                            setNewStudentStream(st.stream);
                            setNewStudentGender(st.gender || 'boy');
                          }}
                          className="px-2 py-1 rounded bg-white/5 hover:bg-white/10 text-slate-300 text-[10px]"
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteStudent(st.id, st.name)}
                          className="p-1 rounded bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                        >
                          <Trash2 className="w-3 h-3" />
                        </button>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : currentUser && activeTab === 'manage_accounts' && isDeveloper ? (
            /* DEVELOPER ACCOUNTS TAB */
            <div className="space-y-4">
              <div className="p-3.5 rounded-xl bg-violet-500/10 border border-violet-500/30 text-xs text-violet-200">
                <strong>System Administrator &amp; Developer Roles:</strong> Manage elevated developer accounts and credentials.
              </div>

              {/* Developer Accounts List */}
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-400">
                    Active Accounts ({accounts.length})
                  </h4>
                  <button
                    type="button"
                    onClick={loadAccounts}
                    className="text-xs text-violet-400 hover:text-violet-300 flex items-center gap-1"
                  >
                    <RefreshCw className={`w-3 h-3 ${loadingAccounts ? 'animate-spin' : ''}`} />
                    Refresh
                  </button>
                </div>

                {accounts.map((acc) => (
                  <div
                    key={acc.id}
                    className="p-3 rounded-xl bg-white/[0.03] border border-white/10 flex items-center justify-between gap-3"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="text-xs font-bold text-white">{acc.displayName}</span>
                        <span
                          className={`text-[10px] px-2 py-0.5 rounded font-semibold ${
                            acc.role === 'developer'
                              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {acc.roleLabel}
                        </span>
                      </div>
                      <div className="text-[11px] text-slate-400 font-mono mt-0.5">
                        @{acc.username} • {acc.title}
                      </div>
                    </div>

                    <div className="flex items-center gap-2">
                      {acc.id !== currentUser.id && (
                        <button
                          type="button"
                          onClick={async () => {
                            if (!confirm(`Delete staff account "${acc.displayName}"?`)) return;
                            await staffContentService.deleteStaffAccount(acc.id);
                            await loadAccounts();
                          }}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 text-rose-400"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      )}
                    </div>
                  </div>
                ))}
              </div>
            </div>
          ) : bootstrapRequired ? (
            /* Secure Setup-Required Screen (Disables public registration and requires authorized setup key) */
            <div className="space-y-4">
              <div className="p-4 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs space-y-2">
                <div className="font-bold flex items-center gap-2 text-amber-300 text-sm">
                  <ShieldAlert className="w-5 h-5 text-amber-400 shrink-0" />
                  STAFF PORTAL SETUP REQUIRED
                </div>
                <p className="text-[12px] text-amber-200/90 leading-relaxed">
                  Staff accounts have not yet been initialized on this server instance. Privileged accounts (Developer and Teacher / In-Charge) cannot be created publicly or without authorization.
                </p>
                <p className="text-[11px] text-slate-400 leading-relaxed">
                  If accounts have already been provisioned on another device or backend server, click &quot;Check Server Status&quot; or ensure your client is connected to the shared production server URL below.
                </p>
              </div>

              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={async () => {
                    setCheckingStatus(true);
                    setError(null);
                    const status = await staffContentService.checkAuthStatus();
                    setBootstrapRequired(Boolean(status.bootstrapRequired));
                    setCheckingStatus(false);
                  }}
                  disabled={checkingStatus}
                  className="flex-1 py-2.5 rounded-xl bg-cyan-600 hover:bg-cyan-500 text-white text-xs font-bold transition-all flex items-center justify-center gap-2"
                >
                  <RotateCcw className={`w-3.5 h-3.5 ${checkingStatus ? 'animate-spin' : ''}`} />
                  {checkingStatus ? 'Checking Server...' : 'Check Server Status'}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAdminSetupForm((v) => !v)}
                  className="px-3 py-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 text-slate-300 text-xs font-semibold flex items-center gap-1.5"
                >
                  <KeyRound className="w-3.5 h-3.5 text-amber-400" />
                  {showAdminSetupForm ? 'Hide Setup' : 'Admin Setup'}
                </button>
              </div>

              {/* Collapsible Administrator Setup Form: STRICTLY protected by Server Administrator Setup Key */}
              {showAdminSetupForm && (
                <form onSubmit={handleBootstrapSubmit} className="space-y-3.5 pt-3 border-t border-white/10">
                  <div className="p-3 rounded-lg bg-slate-900/90 border border-amber-500/40 space-y-2">
                    <div className="text-xs font-bold text-amber-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <Lock className="w-3.5 h-3.5 text-amber-400" />
                      Authorized Administrator Verification
                    </div>
                    <div>
                      <label className="block text-[11px] font-semibold text-slate-300 mb-1">
                        Server Setup Secret Key *
                      </label>
                      <input
                        type="password"
                        value={adminSetupKey}
                        onChange={(e) => setAdminSetupKey(e.target.value)}
                        placeholder="Enter server setup key (NEXORA_SETUP_SECRET)"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-amber-400 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-3 bg-slate-900/60 p-3.5 rounded-xl border border-white/10">
                    <div className="text-xs font-bold text-cyan-300 flex items-center gap-1.5 uppercase tracking-wider">
                      <KeyRound className="w-3.5 h-3.5" />
                      Initial Developer Account
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Developer Display Name
                      </label>
                      <input
                        type="text"
                        value={devDisplayName}
                        onChange={(e) => setDevDisplayName(e.target.value)}
                        placeholder="e.g. Vansh (Developer)"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                        required
                      />
                    </div>

                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Developer Username
                        </label>
                        <input
                          type="text"
                          value={devUsername}
                          onChange={(e) => setDevUsername(e.target.value)}
                          placeholder="e.g. vansh.dev"
                          autoComplete="username"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                          required
                        />
                      </div>

                      <div>
                        <label className="block text-xs font-semibold text-slate-300 mb-1">
                          Password (min 6 chars)
                        </label>
                        <input
                          type="password"
                          value={devPassword}
                          onChange={(e) => setDevPassword(e.target.value)}
                          placeholder="Create master password"
                          autoComplete="new-password"
                          className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                          required
                        />
                      </div>
                    </div>

                    <div>
                      <label className="block text-xs font-semibold text-slate-300 mb-1">
                        Confirm Password
                      </label>
                      <input
                        type="password"
                        value={devPasswordConfirm}
                        onChange={(e) => setDevPasswordConfirm(e.target.value)}
                        placeholder="Re-enter master password"
                        autoComplete="new-password"
                        className="w-full px-3 py-2 rounded-lg bg-slate-950 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                        required
                      />
                    </div>
                  </div>

                  <button
                    type="submit"
                    disabled={loading}
                    className="w-full py-3 rounded-xl bg-gradient-to-r from-amber-500 via-cyan-500 to-violet-600 hover:from-amber-400 hover:to-violet-500 text-white text-xs font-bold tracking-wide shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    <Lock className="w-4 h-4" />
                    {loading ? 'Authorizing & Initializing...' : 'Authorize & Provision Developer'}
                  </button>
                </form>
              )}
            </div>
          ) : (
            /* Standard Staff Login Form */
            <div className="space-y-4">
              <form onSubmit={handleLoginSubmit} className="space-y-4">
                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Staff Username
                  </label>
                  <div className="relative">
                    <UserCheck className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      value={username}
                      onChange={(e) => setUsername(e.target.value)}
                      placeholder="Enter registered staff username"
                      autoComplete="username"
                      className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                      required
                    />
                  </div>
                </div>

                <div>
                  <label className="block text-xs font-semibold text-slate-300 mb-1.5">
                    Password
                  </label>
                  <div className="relative">
                    <KeyRound className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
                    <input
                      type={showPassword ? 'text' : 'password'}
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      placeholder="Enter staff password"
                      autoComplete="current-password"
                      className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-900/90 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
                      required
                    />
                    <button
                      type="button"
                      onClick={() => setShowPassword((v) => !v)}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-white"
                      aria-label={showPassword ? 'Hide password' : 'Show password'}
                    >
                      {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <button
                  type="submit"
                  disabled={loading}
                  className="w-full py-3 rounded-xl bg-gradient-to-r from-cyan-500 via-blue-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white text-sm font-bold tracking-wide shadow-lg shadow-cyan-500/20 transition-all flex items-center justify-center gap-2 disabled:opacity-50"
                >
                  <Lock className="w-4 h-4" />
                  {loading ? 'Verifying Credentials...' : 'Sign In to Staff Workspace'}
                </button>

                {/* Authorized Staff Directory / Quick Sign-In Helper */}
                <div className="p-3 rounded-xl bg-cyan-950/30 border border-cyan-500/20 text-xs space-y-2">
                  <div className="flex items-center justify-between text-slate-400 text-[11px]">
                    <span className="font-mono-code flex items-center gap-1 text-cyan-400">
                      <ShieldCheck className="w-3.5 h-3.5" /> AUTHORIZED ROSTER
                    </span>
                    <span className="text-[10px]">Tap to autofill</span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
                    <button
                      type="button"
                      onClick={() => {
                        setUsername('alka.mam');
                        setPassword('AlkaMam@2026');
                      }}
                      className="p-2 rounded-lg bg-slate-900/80 border border-cyan-500/30 hover:border-cyan-400 text-left transition group"
                    >
                      <div className="text-cyan-300 font-semibold group-hover:text-cyan-200">
                        Alka Mam
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono-code truncate">
                        Class 11 In-Charge
                      </div>
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setUsername('vansh.dev');
                        setPassword('Vansh@2026');
                      }}
                      className="p-2 rounded-lg bg-slate-900/80 border border-violet-500/30 hover:border-violet-400 text-left transition group"
                    >
                      <div className="text-violet-300 font-semibold group-hover:text-violet-200">
                        Vansh
                      </div>
                      <div className="text-[10px] text-slate-400 font-mono-code truncate">
                        Lead Developer
                      </div>
                    </button>
                  </div>
                </div>
              </form>
            </div>
          )}

          {/* Optional Remote Server Endpoint Config for APK / Multi-Device Sync */}
          {(isNativeAndroidApp() || showServerConfig) && (
            <div className="pt-3 border-t border-white/10">
              <div className="p-3 rounded-xl bg-slate-900/80 border border-white/10 space-y-2">
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-slate-300 flex items-center gap-1.5">
                    <Server className="w-3.5 h-3.5 text-cyan-400" />
                    NEXORA Live Server URL (Website ↔ APK Sync)
                  </span>
                  {!isNativeAndroidApp() && (
                    <button
                      type="button"
                      onClick={() => setShowServerConfig(false)}
                      className="text-[10px] text-slate-400 hover:text-white"
                    >
                      Hide
                    </button>
                  )}
                </div>
                <div className="flex gap-2">
                  <input
                    type="url"
                    value={backendUrlInput}
                    onChange={(e) => setBackendUrlInput(e.target.value)}
                    placeholder="https://ais-pre-...run.app"
                    className="flex-1 px-2.5 py-1.5 rounded-lg bg-black/50 border border-white/15 text-xs text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={handleSaveServerUrl}
                    className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 border border-cyan-500/40 text-cyan-300 text-xs font-semibold"
                  >
                    Apply
                  </button>
                </div>
              </div>
            </div>
          )}

          {!isNativeAndroidApp() && !showServerConfig && (
            <div className="pt-1 flex justify-end">
              <button
                type="button"
                onClick={() => setShowServerConfig(true)}
                className="text-[11px] text-slate-500 hover:text-slate-300 flex items-center gap-1"
              >
                <Server className="w-3 h-3" />
                Configure APK / Remote Sync Server
              </button>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
