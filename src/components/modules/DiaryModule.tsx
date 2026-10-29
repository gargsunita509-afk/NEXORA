import React, { useState, useEffect, useMemo, useRef } from 'react';
import {
  BookMarked,
  Plus,
  Calendar,
  Tag,
  Trash2,
  Edit3,
  Upload,
  FileText,
  Image as ImageIcon,
  Eye,
  Download,
  CheckCircle2,
  AlertCircle,
  Clock,
  ShieldAlert,
  Lock,
  RefreshCw,
  Search,
  Filter,
  X,
  Send,
  Sparkles,
  Paperclip,
  CloudOff,
} from 'lucide-react';
import { DiaryEntry, DiaryAttachment, StreamType, StaffUser } from '../../types';
import { staffContentService } from '../../services/staffContentService';
import { formatReadableDate, type DiaryCycleInfo } from '../../utils/diaryHelper';
import {
  isAndroidApkEnvironment,
  saveBase64PdfViaAndroidBridge,
} from '../../utils/pdfGenerator';

const SUBJECT_CATALOG = [
  { id: 'eng', name: 'English' },
  { id: 'phy', name: 'Physics' },
  { id: 'chem', name: 'Chemistry' },
  { id: 'math', name: 'Mathematics' },
  { id: 'bio', name: 'Biology' },
  { id: 'acc', name: 'Accountancy' },
  { id: 'bst', name: 'Business Studies' },
  { id: 'eco', name: 'Economics' },
  { id: 'hist', name: 'History' },
  { id: 'pol', name: 'Political Science' },
  { id: 'geo', name: 'Geography' },
  { id: 'pe', name: 'Physical Education' },
  { id: 'ai', name: 'Artificial Intelligence' },
  { id: 'art', name: 'Fine Art' },
];

interface DiaryModuleProps {
  selectedStream?: StreamType | 'ALL';
  onRequestStaffLogin?: () => void;
}

export const DiaryModule: React.FC<DiaryModuleProps> = ({
  selectedStream = 'ALL',
  onRequestStaffLogin,
}) => {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(
    staffContentService.getCurrentStaffUser()
  );
  const [entries, setEntries] = useState<DiaryEntry[]>(
    staffContentService.getMemoryDiaryEntries()
  );
  const [cycleInfo, setCycleInfo] = useState<DiaryCycleInfo>(() =>
    staffContentService.getDiaryCycleState()
  );
  const [loading, setLoading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Filters
  const [streamFilter, setStreamFilter] = useState<StreamType | 'ALL'>(selectedStream);
  const [typeFilter, setTypeFilter] = useState<string>('ALL');
  const [statusFilter, setStatusFilter] = useState<'ALL' | 'published' | 'draft'>('ALL');
  const [searchQuery, setSearchQuery] = useState('');

  // Composer / Editor state
  const [isComposing, setIsComposing] = useState(false);
  const [editingEntryId, setEditingEntryId] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState<number | undefined>(undefined);
  const [date, setDate] = useState(() => staffContentService.getActiveDiaryCycleDate());
  const [title, setTitle] = useState('');
  const [subject, setSubject] = useState(SUBJECT_CATALOG[0]?.name || 'English');
  const [type, setType] = useState<
    'Homework' | 'Remark' | 'Notice' | 'Announcement' | 'Circular'
  >('Homework');
  const [targetStream, setTargetStream] = useState<StreamType | 'ALL'>(
    selectedStream === 'ALL' ? 'ALL' : selectedStream
  );
  const [content, setContent] = useState('');
  const [homework, setHomework] = useState('');
  const [remarks, setRemarks] = useState('');
  const [notices, setNotices] = useState('');
  const [publishStatus, setPublishStatus] = useState<'published' | 'draft'>('published');
  const [attachments, setAttachments] = useState<DiaryAttachment[]>([]);
  const [uploadingFile, setUploadingFile] = useState(false);
  const [savingEntry, setSavingEntry] = useState(false);
  const [showPreviewModal, setShowPreviewModal] = useState(false);

  // Confirmation & Attachment Viewer modals
  const [confirmDeleteEntry, setConfirmDeleteEntry] = useState<DiaryEntry | null>(null);
  const [previewAttachment, setPreviewAttachment] = useState<{
    attachment: DiaryAttachment;
    url: string;
  } | null>(null);
  const [conflictEntry, setConflictEntry] = useState<DiaryEntry | null>(null);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    const updateCycle = () => {
      setCycleInfo(staffContentService.getDiaryCycleState());
    };
    updateCycle();
    const interval = setInterval(updateCycle, 10000);

    const unsub = staffContentService.subscribe(() => {
      setStaffUser(staffContentService.getCurrentStaffUser());
      setEntries(staffContentService.getMemoryDiaryEntries());
      setCycleInfo(staffContentService.getDiaryCycleState());
    });
    return () => {
      clearInterval(interval);
      unsub();
    };
  }, []);

  const formatCountdown = (ms: number): string => {
    if (ms <= 0) return 'Refreshing now...';
    const totalSec = Math.floor(ms / 1000);
    const hours = Math.floor(totalSec / 3600);
    const minutes = Math.floor((totalSec % 3600) / 60);
    const seconds = totalSec % 60;
    if (hours > 0) {
      return `${hours}h ${minutes}m ${seconds}s`;
    }
    return `${minutes}m ${seconds}s`;
  };

  useEffect(() => {
    if (staffUser) {
      loadDiaryEntries();
    } else {
      setEntries([]);
    }
  }, [staffUser?.id]);

  const loadDiaryEntries = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await staffContentService.fetchDiaryEntries();
    setLoading(false);
    setIsOfflineMode(res.offline);
    setCycleInfo(staffContentService.getDiaryCycleState());
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setEntries(res.entries);
    }
  };

  const resetComposer = () => {
    setEditingEntryId(null);
    setBaseVersion(undefined);
    setDate(staffContentService.getActiveDiaryCycleDate());
    setTitle('');
    setSubject(SUBJECT_CATALOG[0]?.name || 'English');
    setType('Homework');
    setTargetStream(selectedStream === 'ALL' ? 'ALL' : selectedStream);
    setContent('');
    setHomework('');
    setRemarks('');
    setNotices('');
    setPublishStatus('published');
    setAttachments([]);
    setConflictEntry(null);
    setShowPreviewModal(false);
  };

  const handleStartEdit = (entry: DiaryEntry) => {
    setEditingEntryId(entry.id);
    setBaseVersion(entry.version);
    setDate(entry.date || new Date().toISOString().split('T')[0]);
    setTitle(entry.title || '');
    setSubject(entry.subject || 'English');
    setType(entry.type || 'Homework');
    setTargetStream(entry.targetStream || 'ALL');
    setContent(entry.content || '');
    setHomework(entry.homework || '');
    setRemarks(entry.remarks || '');
    setNotices(entry.notices || '');
    setPublishStatus(entry.status || 'published');
    setAttachments(Array.isArray(entry.attachments) ? entry.attachments : []);
    setConflictEntry(null);
    setIsComposing(true);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files || files.length === 0) return;

    setErrorMsg(null);
    setUploadingFile(true);
    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      const res = await staffContentService.uploadDiaryAttachment(file);
      if (!res.success || !res.attachment) {
        setErrorMsg(res.error || `Failed to upload ${file.name}`);
      } else {
        setAttachments((prev) => [...prev, res.attachment!]);
      }
    }
    setUploadingFile(false);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleRemoveAttachment = (attId: string) => {
    setAttachments((prev) => prev.filter((a) => a.id !== attId));
  };

  const handleSaveOrPublish = async (overrideStatus?: 'published' | 'draft') => {
    if (savingEntry) return;
    setErrorMsg(null);
    setStatusBanner(null);

    const finalContent = content.trim();
    const finalTitle = title.trim() || `${subject} — ${type}`;
    if (!finalContent && !homework.trim() && !remarks.trim() && !notices.trim()) {
      setErrorMsg(
        'Please provide a diary description, homework details, remarks, or notice content before saving.'
      );
      return;
    }

    const desiredStatus = overrideStatus || publishStatus;
    setSavingEntry(true);
    const res = await staffContentService.saveDiaryEntry({
      id: editingEntryId || undefined,
      date,
      subject,
      title: finalTitle,
      type,
      content:
        finalContent ||
        [homework.trim(), remarks.trim(), notices.trim()].filter(Boolean).join('\n\n'),
      homework: homework.trim(),
      remarks: remarks.trim(),
      notices: notices.trim(),
      targetStream,
      status: desiredStatus,
      attachments,
      baseVersion,
    });
    setSavingEntry(false);

    if (res.conflict && res.latestEntry) {
      setConflictEntry(res.latestEntry);
      setErrorMsg(
        res.error ||
          'Another staff member updated this diary entry. Review the latest server version below.'
      );
      return;
    }

    if (!res.success) {
      setErrorMsg(res.error || 'Failed to save diary entry.');
      return;
    }

    setShowPreviewModal(false);
    setIsComposing(false);
    resetComposer();
    if (res.queuedOffline) {
      setStatusBanner(
        'Saved to your encrypted offline staff queue (Pending Sync). It will publish to all staff once connection is restored.'
      );
    } else {
      setStatusBanner(
        desiredStatus === 'draft'
          ? 'Diary entry saved as Draft.'
          : editingEntryId
          ? 'Diary entry updated and synchronized across Web & APK.'
          : 'Diary entry published and synchronized across Web & APK.'
      );
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteEntry) return;
    const target = confirmDeleteEntry;
    setConfirmDeleteEntry(null);
    setErrorMsg(null);
    const res = await staffContentService.deleteDiaryEntry(target.id);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to delete diary entry.');
    } else {
      setStatusBanner(`Deleted diary entry "${target.title || target.subject}".`);
    }
  };

  const handleOpenAttachment = async (att: DiaryAttachment, inline: boolean) => {
    setErrorMsg(null);
    const res = await staffContentService.getProtectedAttachmentUrl(att.id, inline);
    if (res.error || !res.url) {
      setErrorMsg(res.error || 'Could not load protected attachment.');
      return;
    }
    if (inline && (att.mimeType.startsWith('image/') || att.mimeType === 'application/pdf')) {
      setPreviewAttachment({ attachment: att, url: res.url });
    } else {
      if (
        att.mimeType === 'application/pdf' &&
        isAndroidApkEnvironment() &&
        res.url.startsWith('data:application/pdf;base64,')
      ) {
        const nativeSave = saveBase64PdfViaAndroidBridge(att.originalName, res.url);
        if (nativeSave.invoked) {
          if (nativeSave.ok) {
            setStatusBanner(`PDF saved to Downloads (${nativeSave.displayPath || att.originalName}).`);
          } else {
            setErrorMsg(`Could not save PDF to Downloads: ${nativeSave.error || 'Storage error.'}`);
          }
          return;
        }
      }
      const link = document.createElement('a');
      link.href = res.url;
      link.download = att.originalName;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    }
  };

  const filteredEntries = useMemo(() => {
    return entries.filter((entry) => {
      const matchStream =
        streamFilter === 'ALL' ||
        entry.targetStream === 'ALL' ||
        entry.targetStream === streamFilter;
      const matchType = typeFilter === 'ALL' || entry.type === typeFilter;
      const matchStatus =
        statusFilter === 'ALL' || (entry.status || 'published') === statusFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        (entry.title || '').toLowerCase().includes(q) ||
        entry.subject.toLowerCase().includes(q) ||
        entry.content.toLowerCase().includes(q) ||
        (entry.homework || '').toLowerCase().includes(q) ||
        (entry.remarks || '').toLowerCase().includes(q) ||
        (entry.notices || '').toLowerCase().includes(q) ||
        entry.authorName.toLowerCase().includes(q);
      return matchStream && matchType && matchStatus && matchQuery;
    });
  }, [entries, streamFilter, typeFilter, statusFilter, searchQuery]);

  // Strict Permission Gate: Block Students and Unauthenticated Visitors
  if (!staffUser) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 animate-fade-in">
        <div className="max-w-lg w-full rounded-2xl bg-[#0B0F19]/90 border border-rose-500/30 p-8 text-center space-y-5 shadow-[0_0_50px_rgba(244,63,94,0.12)]">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono uppercase tracking-widest">
              Restricted Staff Module
            </span>
            <h2 className="text-xl font-bold text-white">
              Teacher / In-Charge &amp; Developer Access Only
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              The Protected Class Diary and document upload vault are restricted to authenticated{' '}
              <strong className="text-slate-200">Teacher / In-Charge</strong> and{' '}
              <strong className="text-slate-200">Developer</strong> accounts. Students and unauthorized users are blocked from viewing or downloading protected diary records.
            </p>
          </div>
          {onRequestStaffLogin && (
            <button
              type="button"
              onClick={onRequestStaffLogin}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold tracking-wider uppercase inline-flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
            >
              <Lock className="w-4 h-4" />
              Sign In as Authorized Staff
            </button>
          )}
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6 animate-fade-in">
      {/* Header Bar */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <BookMarked className="w-6 h-6 text-cyan-400" />
            <h2 className="text-2xl font-bold font-display tracking-tight text-white">
              Protected Digital Class Diary &amp; Vault
            </h2>
            <span className="px-2.5 py-0.5 rounded-md bg-cyan-500/15 border border-cyan-500/40 text-cyan-300 text-[11px] font-mono">
              {staffUser.roleLabel}
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Publish verified Class 11 homework, remarks, notices, and protected attachments synchronized across Website &amp; Android APK
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              staffContentService.syncPendingMutations().then(() => loadDiaryEntries());
            }}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            Sync Feed
          </button>

          <button
            type="button"
            onClick={() => {
              if (isComposing) {
                setIsComposing(false);
                resetComposer();
              } else {
                resetComposer();
                setIsComposing(true);
              }
            }}
            className="px-4 py-2 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold tracking-wide flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
          >
            <Plus className="w-4 h-4" />
            {isComposing ? 'Close Diary Editor' : 'New Diary / Upload'}
          </button>
        </div>
      </div>

      {/* 2:00 PM IST Authoritative Daily Refresh & Cycle Banner */}
      <div className="p-4 rounded-2xl bg-gradient-to-r from-cyan-950/40 via-blue-950/30 to-slate-900/60 border border-cyan-500/25 flex flex-col sm:flex-row sm:items-center justify-between gap-3 shadow-[0_0_30px_rgba(6,182,212,0.06)]">
        <div className="flex items-start sm:items-center gap-3">
          <div className="w-9 h-9 rounded-xl bg-cyan-500/15 border border-cyan-500/30 flex items-center justify-center text-cyan-400 shrink-0 mt-0.5 sm:mt-0">
            <Clock className="w-5 h-5" />
          </div>
          <div>
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-xs font-bold text-white tracking-wide">
                Active Cycle: {formatReadableDate(cycleInfo.activeCycleDate)}
              </span>
              <span className="text-[10px] font-mono px-2 py-0.5 rounded-full bg-cyan-500/15 border border-cyan-500/30 text-cyan-300">
                {cycleInfo.activeCycleDate}
              </span>
              <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-blue-500/15 border border-blue-500/30 text-blue-300">
                2:00 PM IST Daily Refresh
              </span>
            </div>
            <p className="text-[11px] text-slate-400 mt-0.5">
              Authoritative server time (Asia/Kolkata). Daily cycle refreshes automatically at 2:00 PM IST. Historical entries are permanently preserved.
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto shrink-0 bg-slate-900/80 px-3 py-1.5 rounded-xl border border-white/10 text-xs">
          <span className="text-slate-400 text-[11px]">Next Refresh:</span>
          <span className="font-mono font-bold text-cyan-300 text-[11px]">
            {formatCountdown(cycleInfo.msUntilNextRefresh)}
          </span>
        </div>
      </div>

      {/* Offline / Error / Status Banners */}
      {isOfflineMode && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CloudOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Offline Staff Vault Active:</strong> Viewing account-isolated cached diary records for{' '}
              <strong>{staffUser.displayName}</strong>. New entries will be queued locally as Pending Sync.
            </span>
          </div>
          <button
            type="button"
            onClick={loadDiaryEntries}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold shrink-0"
          >
            Retry Connection
          </button>
        </div>
      )}

      {errorMsg && (
        <div className="p-3.5 rounded-xl bg-rose-500/10 border border-rose-500/30 text-rose-200 text-xs flex items-start justify-between gap-3">
          <div className="flex items-start gap-2.5">
            <AlertCircle className="w-4 h-4 text-rose-400 shrink-0 mt-0.5" />
            <span>{errorMsg}</span>
          </div>
          <button
            type="button"
            onClick={() => setErrorMsg(null)}
            className="text-rose-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {statusBanner && (
        <div className="p-3.5 rounded-xl bg-emerald-500/10 border border-emerald-500/30 text-emerald-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
            <span>{statusBanner}</span>
          </div>
          <button
            type="button"
            onClick={() => setStatusBanner(null)}
            className="text-emerald-300 hover:text-white"
          >
            <X className="w-4 h-4" />
          </button>
        </div>
      )}

      {/* Composer / Upload Panel */}
      {isComposing && (
        <div className="rounded-2xl bg-[#0B0F19]/95 border border-cyan-500/30 p-6 space-y-5 shadow-[0_0_40px_rgba(6,182,212,0.12)]">
          <div className="flex items-center justify-between border-b border-white/10 pb-3">
            <div className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-cyan-400" />
              <h3 className="text-sm font-bold uppercase tracking-wider text-cyan-300">
                {editingEntryId
                  ? 'Edit Protected Diary Entry'
                  : 'Create & Upload Protected Diary Entry'}
              </h3>
            </div>
            <span className="text-xs text-slate-400 font-mono">
              Author: {staffUser.displayName} ({staffUser.roleLabel})
            </span>
          </div>

          {conflictEntry && (
            <div className="p-4 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 space-y-2">
              <div className="font-bold text-amber-300">
                Concurrent Edit Conflict Detected (Version {conflictEntry.version})
              </div>
              <p>
                Another staff member ({conflictEntry.authorName}) updated this entry. Click below to load their latest version before applying your changes.
              </p>
              <button
                type="button"
                onClick={() => handleStartEdit(conflictEntry)}
                className="px-3 py-1.5 rounded-lg bg-amber-500/30 hover:bg-amber-500/40 text-white font-semibold"
              >
                Load Latest Server Version
              </button>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4">
            <div>
              <div className="flex items-center justify-between mb-1">
                <label className="text-xs text-slate-400">Diary Date *</label>
                {date !== cycleInfo.activeCycleDate && (
                  <button
                    type="button"
                    onClick={() => setDate(cycleInfo.activeCycleDate)}
                    className="text-[10px] text-cyan-400 hover:text-cyan-300 underline"
                  >
                    Use Active Cycle ({cycleInfo.activeCycleDate})
                  </button>
                )}
              </div>
              <input
                type="date"
                value={date}
                onChange={(e) => setDate(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Subject *</label>
              <select
                value={subject}
                onChange={(e) => setSubject(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                {SUBJECT_CATALOG.map((s) => (
                  <option key={s.id} value={s.name}>
                    {s.name}
                  </option>
                ))}
                <option value="General Administration">General Administration</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Entry Category *</label>
              <select
                value={type}
                onChange={(e) => setType(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="Homework">Homework</option>
                <option value="Remark">Remark</option>
                <option value="Notice">Notice</option>
                <option value="Announcement">Announcement</option>
                <option value="Circular">Official Circular</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Target Stream *</label>
              <select
                value={targetStream}
                onChange={(e) => setTargetStream(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="ALL">All Class 11 Streams</option>
                <option value="PCM">PCM (Non-Medical)</option>
                <option value="PCB">PCB (Medical)</option>
                <option value="COMMERCE">Commerce</option>
                <option value="HUMANITIES">Humanities</option>
              </select>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">Visibility Status</label>
              <select
                value={publishStatus}
                onChange={(e) => setPublishStatus(e.target.value as 'published' | 'draft')}
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="published">Published (Staff Feed)</option>
                <option value="draft">Draft</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">Diary Title / Headline *</label>
            <input
              type="text"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="e.g. Chapter 4 Laws of Motion — Numericals & Lab Record Submission"
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-xs text-slate-400 mb-1">
              Main Diary Description / Class Summary *
            </label>
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              rows={3}
              placeholder="Enter detailed class summary, topics covered today, or instructions..."
              className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
            />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label className="block text-xs font-semibold text-cyan-300 mb-1">
                Homework Assignment
              </label>
              <textarea
                value={homework}
                onChange={(e) => setHomework(e.target.value)}
                rows={2}
                placeholder="Specific exercises, page numbers, or submission deadlines..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-amber-300 mb-1">
                Teacher Remarks
              </label>
              <textarea
                value={remarks}
                onChange={(e) => setRemarks(e.target.value)}
                rows={2}
                placeholder="Class discipline, copy check status, or student observations..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-xs font-semibold text-violet-300 mb-1">
                Official Notices / Circulars
              </label>
              <textarea
                value={notices}
                onChange={(e) => setNotices(e.target.value)}
                rows={2}
                placeholder="Upcoming tests, PTM reminders, or school notices..."
                className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>
          </div>

          {/* Protected Attachment Upload Zone */}
          <div className="p-4 rounded-xl bg-white/[0.02] border border-dashed border-cyan-500/30 space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <div>
                <div className="text-xs font-bold text-white flex items-center gap-2">
                  <Paperclip className="w-4 h-4 text-cyan-400" />
                  Protected Diary Documents &amp; Images
                </div>
                <p className="text-[11px] text-slate-400">
                  Supported: .png, .jpg, .webp, .gif, .pdf, .doc, .docx, .txt (Max 5 MB per file). Stored in encrypted server vault outside public web root.
                </p>
              </div>
              <div>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".png,.jpg,.jpeg,.webp,.gif,.pdf,.txt,.doc,.docx"
                  multiple
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <button
                  type="button"
                  disabled={uploadingFile}
                  onClick={() => fileInputRef.current?.click()}
                  className="px-3.5 py-2 rounded-xl bg-cyan-500/15 hover:bg-cyan-500/25 border border-cyan-500/40 text-cyan-300 text-xs font-semibold flex items-center gap-2 transition-colors disabled:opacity-50"
                >
                  <Upload className="w-3.5 h-3.5" />
                  {uploadingFile ? 'Uploading & Validating...' : 'Upload Document / Image'}
                </button>
              </div>
            </div>

            {attachments.length > 0 && (
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-2">
                {attachments.map((att) => (
                  <div
                    key={att.id}
                    className="p-2.5 rounded-lg bg-slate-900/90 border border-white/10 flex items-center justify-between gap-2"
                  >
                    <div className="flex items-center gap-2 min-w-0">
                      {att.mimeType.startsWith('image/') ? (
                        <ImageIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                      ) : (
                        <FileText className="w-4 h-4 text-violet-400 shrink-0" />
                      )}
                      <div className="truncate">
                        <div className="text-xs font-medium text-white truncate">
                          {att.originalName}
                        </div>
                        <div className="text-[10px] text-slate-400">
                          {(att.sizeBytes / 1024).toFixed(1)} KB • Protected Vault
                        </div>
                      </div>
                    </div>
                    <button
                      type="button"
                      onClick={() => handleRemoveAttachment(att.id)}
                      className="p-1 text-slate-400 hover:text-rose-400"
                      title="Remove attachment"
                    >
                      <X className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* Action Buttons: Preview before Publish, Save Draft, Publish */}
          <div className="flex flex-wrap items-center justify-end gap-3 pt-2 border-t border-white/10">
            <button
              type="button"
              onClick={() => {
                setIsComposing(false);
                resetComposer();
              }}
              className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
            >
              Cancel
            </button>

            <button
              type="button"
              onClick={() => setShowPreviewModal(true)}
              className="px-4 py-2 rounded-xl bg-violet-500/15 hover:bg-violet-500/25 border border-violet-500/40 text-violet-200 text-xs font-semibold flex items-center gap-1.5"
            >
              <Eye className="w-3.5 h-3.5" />
              Preview Entry
            </button>

            <button
              type="button"
              disabled={savingEntry || uploadingFile}
              onClick={() => handleSaveOrPublish('draft')}
              className="px-4 py-2 rounded-xl bg-slate-800 hover:bg-slate-700 border border-white/15 text-slate-200 text-xs font-semibold disabled:opacity-50"
            >
              Save as Draft
            </button>

            <button
              type="button"
              disabled={savingEntry || uploadingFile}
              onClick={() => handleSaveOrPublish('published')}
              className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-400 hover:to-blue-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-cyan-500/20 disabled:opacity-50"
            >
              <Send className="w-3.5 h-3.5" />
              {savingEntry
                ? 'Publishing...'
                : editingEntryId
                ? 'Update & Publish Entry'
                : 'Publish Diary Entry'}
            </button>
          </div>
        </div>
      )}

      {/* Search & Filter Controls */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-3 bg-white/[0.02] p-3.5 rounded-2xl border border-white/10">
        <div className="relative md:col-span-2">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search diary by title, subject, homework, remarks, or staff author..."
            className="w-full pl-10 pr-4 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
          />
        </div>

        <div className="flex items-center gap-2">
          <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
          <select
            value={streamFilter}
            onChange={(e) => setStreamFilter(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-white focus:border-cyan-400 focus:outline-none"
          >
            <option value="ALL">All Streams</option>
            <option value="PCM">PCM Stream</option>
            <option value="PCB">PCB Stream</option>
            <option value="COMMERCE">Commerce Stream</option>
            <option value="HUMANITIES">Humanities Stream</option>
          </select>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-white focus:border-cyan-400 focus:outline-none"
          >
            <option value="ALL">All Categories</option>
            <option value="Homework">Homework</option>
            <option value="Remark">Remark</option>
            <option value="Notice">Notice</option>
            <option value="Announcement">Announcement</option>
            <option value="Circular">Circular</option>
          </select>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value as any)}
            className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-white focus:border-cyan-400 focus:outline-none"
          >
            <option value="ALL">All Status</option>
            <option value="published">Published</option>
            <option value="draft">Drafts</option>
          </select>
        </div>
      </div>

      {/* Chronological Diary Feed */}
      {loading && entries.length === 0 ? (
        <div className="py-16 text-center text-slate-400 space-y-3">
          <RefreshCw className="w-7 h-7 animate-spin text-cyan-400 mx-auto" />
          <p className="text-xs">Loading protected diary entries...</p>
        </div>
      ) : filteredEntries.length === 0 ? (
        <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-12 text-center space-y-3">
          <BookMarked className="w-10 h-10 text-slate-500 mx-auto" />
          <h3 className="text-base font-bold text-white">No Protected Diary Entries Found</h3>
          <p className="text-xs text-slate-400 max-w-md mx-auto">
            No diary records match your current filter criteria. Click &ldquo;New Diary / Upload&rdquo; above to publish a diary entry or upload class attachments.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredEntries.map((entry) => {
            const isDraft = entry.status === 'draft';
            const isPending = entry.syncStatus === 'pending';
            const isFailed = entry.syncStatus === 'failed';

            return (
              <div
                key={entry.id}
                className="rounded-2xl bg-[#0B0F19]/90 border border-white/10 hover:border-cyan-500/30 p-5 transition-all space-y-4"
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span
                        className={`text-[11px] font-bold px-2.5 py-0.5 rounded-md border ${
                          entry.type === 'Homework'
                            ? 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30'
                            : entry.type === 'Remark'
                            ? 'bg-amber-500/15 text-amber-300 border-amber-500/30'
                            : 'bg-violet-500/15 text-violet-300 border-violet-500/30'
                        }`}
                      >
                        {entry.type}
                      </span>

                      <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-200 flex items-center gap-1">
                        <Tag className="w-3 h-3 text-cyan-400" />
                        {entry.subject}
                      </span>

                      <span className="text-xs font-mono px-2.5 py-0.5 rounded-md bg-white/5 border border-white/10 text-slate-300 flex items-center gap-1">
                        <Calendar className="w-3 h-3 text-slate-400" />
                        {entry.date}
                      </span>

                      {entry.date === cycleInfo.activeCycleDate ? (
                        <span className="text-[10px] font-semibold px-2 py-0.5 rounded-full bg-cyan-500/20 text-cyan-300 border border-cyan-500/40">
                          Active Cycle (2:00 PM IST)
                        </span>
                      ) : (
                        <span className="text-[10px] text-slate-400 px-2 py-0.5 rounded bg-white/5 border border-white/5">
                          Archived History
                        </span>
                      )}

                      <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-blue-500/15 text-blue-300 border border-blue-500/30">
                        Stream: {entry.targetStream}
                      </span>

                      {isDraft && (
                        <span className="text-[11px] font-bold px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40">
                          DRAFT
                        </span>
                      )}

                      {isPending ? (
                        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                          <Clock className="w-3 h-3" />
                          Pending Sync (Local Only)
                        </span>
                      ) : isFailed ? (
                        <span className="text-[11px] font-mono px-2.5 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                          Sync Failed
                        </span>
                      ) : (
                        <span className="text-[11px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                          <CheckCircle2 className="w-3 h-3" />
                          Synced
                        </span>
                      )}
                    </div>

                    <h3 className="text-base font-bold text-white pt-1">
                      {entry.title || `${entry.subject} — ${entry.type}`}
                    </h3>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={() => handleStartEdit(entry)}
                      className="px-3 py-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-1.5 transition-colors"
                    >
                      <Edit3 className="w-3.5 h-3.5 text-cyan-400" />
                      Edit
                    </button>
                    <button
                      type="button"
                      onClick={() => setConfirmDeleteEntry(entry)}
                      className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400 transition-colors"
                      title="Delete diary entry"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>

                {/* Main Content */}
                <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                  {entry.content}
                </p>

                {/* Structured Homework / Remarks / Notices Sub-sections */}
                {(entry.homework || entry.remarks || entry.notices) && (
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2">
                    {entry.homework && (
                      <div className="p-3 rounded-xl bg-cyan-500/5 border border-cyan-500/20">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-cyan-300 mb-1">
                          Homework
                        </div>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap">
                          {entry.homework}
                        </p>
                      </div>
                    )}
                    {entry.remarks && (
                      <div className="p-3 rounded-xl bg-amber-500/5 border border-amber-500/20">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-amber-300 mb-1">
                          Remarks
                        </div>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap">
                          {entry.remarks}
                        </p>
                      </div>
                    )}
                    {entry.notices && (
                      <div className="p-3 rounded-xl bg-violet-500/5 border border-violet-500/20">
                        <div className="text-[11px] font-bold uppercase tracking-wider text-violet-300 mb-1">
                          Notices
                        </div>
                        <p className="text-xs text-slate-300 whitespace-pre-wrap">
                          {entry.notices}
                        </p>
                      </div>
                    )}
                  </div>
                )}

                {/* Protected Attachments List */}
                {Array.isArray(entry.attachments) && entry.attachments.length > 0 && (
                  <div className="pt-2 space-y-2">
                    <div className="text-[11px] font-semibold uppercase tracking-wider text-slate-400 flex items-center gap-1.5">
                      <Paperclip className="w-3.5 h-3.5 text-cyan-400" />
                      Protected Attachments ({entry.attachments.length})
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-2.5">
                      {entry.attachments.map((att) => (
                        <div
                          key={att.id}
                          className="p-2.5 rounded-xl bg-slate-900/90 border border-white/10 flex items-center justify-between gap-2"
                        >
                          <div className="flex items-center gap-2 min-w-0">
                            {att.mimeType.startsWith('image/') ? (
                              <ImageIcon className="w-4 h-4 text-cyan-400 shrink-0" />
                            ) : (
                              <FileText className="w-4 h-4 text-violet-400 shrink-0" />
                            )}
                            <div className="truncate">
                              <div className="text-xs font-medium text-white truncate">
                                {att.originalName}
                              </div>
                              <div className="text-[10px] text-slate-400">
                                {(att.sizeBytes / 1024).toFixed(1)} KB
                              </div>
                            </div>
                          </div>
                          <div className="flex items-center gap-1 shrink-0">
                            {(att.mimeType.startsWith('image/') ||
                              att.mimeType === 'application/pdf') && (
                              <button
                                type="button"
                                onClick={() => handleOpenAttachment(att, true)}
                                className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-cyan-300"
                                title="Preview attachment"
                              >
                                <Eye className="w-3.5 h-3.5" />
                              </button>
                            )}
                            <button
                              type="button"
                              onClick={() => handleOpenAttachment(att, false)}
                              className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 text-slate-200"
                              title="Download protected attachment"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                {/* Footer Metadata */}
                <div className="pt-3 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                  <div className="flex items-center gap-2">
                    <span>
                      Published by <strong className="text-slate-200">{entry.authorName}</strong>
                    </span>
                    <span className="px-2 py-0.5 rounded bg-white/5 text-cyan-300 font-mono">
                      {entry.authorRoleLabel ||
                        (entry.authorRole === 'developer' ? 'Developer' : 'Teacher / In-Charge')}
                    </span>
                  </div>
                  <div className="font-mono">
                    {entry.updatedAt
                      ? `Updated ${new Date(entry.updatedAt).toLocaleString()}`
                      : entry.publishedAt
                      ? `Published ${new Date(entry.publishedAt).toLocaleString()}`
                      : ''}
                    {entry.version ? ` • v${entry.version}` : ''}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Preview Before Publishing Modal */}
      {showPreviewModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-2xl rounded-2xl bg-[#0B0F19] border border-cyan-500/40 p-6 space-y-5 shadow-2xl max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Eye className="w-5 h-5 text-cyan-400" />
                <h3 className="text-base font-bold text-white">
                  Preview Diary Entry Before Publishing
                </h3>
              </div>
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="text-slate-400 hover:text-white"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            <div className="p-5 rounded-xl bg-white/[0.03] border border-white/10 space-y-4">
              <div className="flex flex-wrap items-center gap-2">
                <span className="text-xs font-bold px-2.5 py-0.5 rounded bg-cyan-500/20 text-cyan-300">
                  {type}
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-white/5 text-slate-200">
                  {subject}
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-white/5 text-slate-300">
                  {date}
                </span>
                <span className="text-xs font-mono px-2.5 py-0.5 rounded bg-blue-500/15 text-blue-300">
                  Stream: {targetStream}
                </span>
              </div>

              <h4 className="text-lg font-bold text-white">
                {title.trim() || `${subject} — ${type}`}
              </h4>

              <p className="text-sm text-slate-200 whitespace-pre-wrap">
                {content.trim() || '(No main description entered)'}
              </p>

              {(homework.trim() || remarks.trim() || notices.trim()) && (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
                  {homework.trim() && (
                    <div className="p-3 rounded-lg bg-cyan-500/10 border border-cyan-500/20">
                      <div className="text-[10px] font-bold uppercase text-cyan-300">Homework</div>
                      <p className="text-xs text-slate-200 mt-1 whitespace-pre-wrap">{homework}</p>
                    </div>
                  )}
                  {remarks.trim() && (
                    <div className="p-3 rounded-lg bg-amber-500/10 border border-amber-500/20">
                      <div className="text-[10px] font-bold uppercase text-amber-300">Remarks</div>
                      <p className="text-xs text-slate-200 mt-1 whitespace-pre-wrap">{remarks}</p>
                    </div>
                  )}
                  {notices.trim() && (
                    <div className="p-3 rounded-lg bg-violet-500/10 border border-violet-500/20">
                      <div className="text-[10px] font-bold uppercase text-violet-300">Notices</div>
                      <p className="text-xs text-slate-200 mt-1 whitespace-pre-wrap">{notices}</p>
                    </div>
                  )}
                </div>
              )}

              {attachments.length > 0 && (
                <div className="pt-2 border-t border-white/10">
                  <div className="text-xs font-semibold text-slate-300 mb-2">
                    Attached Files ({attachments.length}):
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {attachments.map((a) => (
                      <span
                        key={a.id}
                        className="px-2.5 py-1 rounded bg-slate-900 border border-white/10 text-xs text-cyan-300"
                      >
                        {a.originalName} ({(a.sizeBytes / 1024).toFixed(1)} KB)
                      </span>
                    ))}
                  </div>
                </div>
              )}
            </div>

            <div className="flex items-center justify-end gap-3">
              <button
                type="button"
                onClick={() => setShowPreviewModal(false)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
              >
                Back to Editing
              </button>
              <button
                type="button"
                disabled={savingEntry}
                onClick={() => handleSaveOrPublish('published')}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 text-white text-xs font-bold flex items-center gap-2"
              >
                <Send className="w-3.5 h-3.5" />
                {savingEntry ? 'Publishing...' : 'Confirm & Publish Now'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {confirmDeleteEntry && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-[#0B0F19] border border-rose-500/40 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Delete Protected Diary Entry?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete{' '}
              <strong className="text-white">
                {confirmDeleteEntry.title || confirmDeleteEntry.subject}
              </strong>{' '}
              ({confirmDeleteEntry.date}) and remove its protected attachments? This action cannot be undone.
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteEntry(null)}
                className="px-4 py-2 rounded-xl bg-white/5 hover:bg-white/10 text-slate-300 text-xs font-semibold"
              >
                Cancel
              </button>
              <button
                type="button"
                onClick={handleConfirmDelete}
                className="px-4 py-2 rounded-xl bg-rose-600 hover:bg-rose-500 text-white text-xs font-bold"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Protected Attachment Inline Preview Modal */}
      {previewAttachment && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/85 backdrop-blur-md">
          <div className="w-full max-w-3xl rounded-2xl bg-[#0B0F19] border border-cyan-500/40 overflow-hidden flex flex-col max-h-[90vh]">
            <div className="p-4 border-b border-white/10 flex items-center justify-between">
              <div>
                <h4 className="text-sm font-bold text-white">
                  {previewAttachment.attachment.originalName}
                </h4>
                <p className="text-[11px] text-slate-400">
                  Protected Staff Vault Attachment • Authorized Session Verified
                </p>
              </div>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => handleOpenAttachment(previewAttachment.attachment, false)}
                  className="px-3 py-1.5 rounded-lg bg-cyan-500/20 hover:bg-cyan-500/30 text-cyan-300 text-xs font-semibold flex items-center gap-1.5"
                >
                  <Download className="w-3.5 h-3.5" />
                  Download
                </button>
                <button
                  type="button"
                  onClick={() => setPreviewAttachment(null)}
                  className="p-1.5 text-slate-400 hover:text-white"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="p-4 flex-1 overflow-auto flex items-center justify-center bg-black/60">
              {previewAttachment.attachment.mimeType.startsWith('image/') ? (
                <img
                  src={previewAttachment.url}
                  alt={previewAttachment.attachment.originalName}
                  className="max-h-[75vh] w-auto object-contain rounded-lg"
                />
              ) : (
                <iframe
                  src={previewAttachment.url}
                  title={previewAttachment.attachment.originalName}
                  className="w-full h-[75vh] rounded-lg border-0 bg-white"
                />
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
