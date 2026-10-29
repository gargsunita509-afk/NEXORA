import React, { useState, useEffect, useMemo } from 'react';
import {
  StickyNote,
  Plus,
  Search,
  Pin,
  Edit3,
  Trash2,
  CheckCircle2,
  Clock,
  AlertCircle,
  ShieldAlert,
  Lock,
  RefreshCw,
  Send,
  X,
  CloudOff,
  Filter,
} from 'lucide-react';
import { StaffQuickNote, StaffUser, QuickNoteCategory } from '../../types';
import { staffContentService } from '../../services/staffContentService';

interface QuickNotesModuleProps {
  onRequestStaffLogin?: () => void;
}

const CATEGORY_META: Record<
  QuickNoteCategory,
  { label: string; badgeClass: string }
> = {
  general: {
    label: 'General Staff Note',
    badgeClass: 'bg-cyan-500/15 text-cyan-300 border-cyan-500/30',
  },
  announcement: {
    label: 'Staff Announcement',
    badgeClass: 'bg-emerald-500/15 text-emerald-300 border-emerald-500/30',
  },
  academic: {
    label: 'Academic Coordination',
    badgeClass: 'bg-blue-500/15 text-blue-300 border-blue-500/30',
  },
  moderation: {
    label: 'Moderation & Discipline',
    badgeClass: 'bg-amber-500/15 text-amber-300 border-amber-500/30',
  },
  urgent: {
    label: 'Urgent Action',
    badgeClass: 'bg-rose-500/20 text-rose-300 border-rose-500/40',
  },
  handover: {
    label: 'Developer ↔ In-Charge Handover',
    badgeClass: 'bg-violet-500/15 text-violet-300 border-violet-500/30',
  },
};

export const QuickNotesModule: React.FC<QuickNotesModuleProps> = ({
  onRequestStaffLogin,
}) => {
  const [staffUser, setStaffUser] = useState<StaffUser | null>(
    staffContentService.getCurrentStaffUser()
  );
  const [notes, setNotes] = useState<StaffQuickNote[]>(
    staffContentService.getMemoryQuickNotes()
  );
  const [loading, setLoading] = useState(false);
  const [isOfflineMode, setIsOfflineMode] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  // Composer / Editor state
  const [editingNoteId, setEditingNoteId] = useState<string | null>(null);
  const [baseVersion, setBaseVersion] = useState<number | undefined>(undefined);
  const [title, setTitle] = useState('');
  const [content, setContent] = useState('');
  const [category, setCategory] = useState<QuickNoteCategory>('general');
  const [pinned, setPinned] = useState(false);
  const [saving, setSaving] = useState(false);
  const [conflictNote, setConflictNote] = useState<StaffQuickNote | null>(null);

  // Search & Filter state
  const [searchQuery, setSearchQuery] = useState('');
  const [categoryFilter, setCategoryFilter] = useState<string>('ALL');
  const [roleFilter, setRoleFilter] = useState<'ALL' | 'teacher_in_charge' | 'developer'>('ALL');

  // Delete confirmation modal
  const [confirmDeleteNote, setConfirmDeleteNote] = useState<StaffQuickNote | null>(null);

  useEffect(() => {
    const unsub = staffContentService.subscribe(() => {
      setStaffUser(staffContentService.getCurrentStaffUser());
      setNotes(staffContentService.getMemoryQuickNotes());
    });
    return unsub;
  }, []);

  useEffect(() => {
    if (staffUser) {
      loadQuickNotes();
    } else {
      setNotes([]);
    }
  }, [staffUser?.id]);

  const loadQuickNotes = async () => {
    setLoading(true);
    setErrorMsg(null);
    const res = await staffContentService.fetchQuickNotes();
    setLoading(false);
    setIsOfflineMode(res.offline);
    if (res.error) {
      setErrorMsg(res.error);
    } else {
      setNotes(res.notes);
    }
  };

  const resetComposer = () => {
    setEditingNoteId(null);
    setBaseVersion(undefined);
    setTitle('');
    setContent('');
    setCategory('general');
    setPinned(false);
    setConflictNote(null);
  };

  const handleStartEdit = (note: StaffQuickNote) => {
    setEditingNoteId(note.id);
    setBaseVersion(note.version);
    setTitle(note.title || '');
    setContent(note.content);
    setCategory(note.category || 'general');
    setPinned(Boolean(note.pinned));
    setConflictNote(null);
    setErrorMsg(null);
  };

  const handleSubmitNote = async (e: React.FormEvent) => {
    e.preventDefault();
    if (saving) return;

    setErrorMsg(null);
    setStatusBanner(null);

    if (!content.trim()) {
      setErrorMsg('Quick Note content cannot be empty.');
      return;
    }

    setSaving(true);
    if (editingNoteId) {
      const res = await staffContentService.updateQuickNote(editingNoteId, {
        title: title.trim(),
        content: content.trim(),
        category,
        pinned,
        baseVersion,
      });
      setSaving(false);

      if (res.conflict && res.latestNote) {
        setConflictNote(res.latestNote);
        setErrorMsg(
          res.error ||
            'Concurrent edit conflict detected. Review the latest server note before saving.'
        );
        return;
      }

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to update Quick Note.');
        return;
      }

      resetComposer();
      setStatusBanner('Quick Note updated and synchronized with all authorized staff.');
    } else {
      const res = await staffContentService.createQuickNote({
        title: title.trim(),
        content: content.trim(),
        category,
        pinned,
      });
      setSaving(false);

      if (!res.success) {
        setErrorMsg(res.error || 'Failed to save Quick Note.');
        return;
      }

      resetComposer();
      if (res.queuedOffline) {
        setStatusBanner(
          'Saved to your encrypted offline staff queue (Pending Sync — not yet visible to other staff until connection is restored).'
        );
      } else {
        setStatusBanner(
          'Quick Note published to the private Teacher/In-Charge & Developer feed.'
        );
      }
    }
  };

  const handleTogglePin = async (note: StaffQuickNote) => {
    setErrorMsg(null);
    const res = await staffContentService.updateQuickNote(note.id, {
      title: note.title,
      content: note.content,
      category: note.category,
      pinned: !note.pinned,
      baseVersion: note.version,
    });
    if (!res.success) {
      setErrorMsg(res.error || 'Could not update pin status.');
    }
  };

  const handleConfirmDelete = async () => {
    if (!confirmDeleteNote) return;
    const target = confirmDeleteNote;
    setConfirmDeleteNote(null);
    setErrorMsg(null);
    const res = await staffContentService.deleteQuickNote(target.id);
    if (!res.success) {
      setErrorMsg(res.error || 'Failed to delete Quick Note.');
    } else {
      setStatusBanner('Quick Note permanently deleted from the staff feed.');
    }
  };

  const filteredNotes = useMemo(() => {
    return notes.filter((n) => {
      const matchCat = categoryFilter === 'ALL' || (n.category || 'general') === categoryFilter;
      const matchRole = roleFilter === 'ALL' || n.authorRole === roleFilter;
      const q = searchQuery.trim().toLowerCase();
      const matchQuery =
        !q ||
        (n.title || '').toLowerCase().includes(q) ||
        n.content.toLowerCase().includes(q) ||
        n.authorName.toLowerCase().includes(q);
      return matchCat && matchRole && matchQuery;
    });
  }, [notes, categoryFilter, roleFilter, searchQuery]);

  // Strict Permission Gate
  if (!staffUser) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center p-6 animate-fade-in">
        <div className="max-w-lg w-full rounded-2xl bg-[#0B0F19]/90 border border-rose-500/30 p-8 text-center space-y-5 shadow-[0_0_50px_rgba(244,63,94,0.12)]">
          <div className="w-16 h-16 rounded-2xl bg-rose-500/15 border border-rose-500/40 flex items-center justify-center mx-auto text-rose-400">
            <ShieldAlert className="w-8 h-8" />
          </div>
          <div className="space-y-2">
            <span className="px-3 py-1 rounded-full bg-rose-500/15 border border-rose-500/30 text-rose-300 text-[11px] font-mono uppercase tracking-widest">
              Private Staff Channel
            </span>
            <h2 className="text-xl font-bold text-white">
              Quick Notes — Restricted to Teacher/In-Charge &amp; Developer
            </h2>
            <p className="text-xs text-slate-400 leading-relaxed">
              Quick Notes is a private internal communication and coordination feed shared exclusively between the{' '}
              <strong className="text-slate-200">Teacher / In-Charge</strong> and{' '}
              <strong className="text-slate-200">Developer</strong>. Students and unauthenticated visitors have zero access.
            </p>
          </div>
          {onRequestStaffLogin && (
            <button
              type="button"
              onClick={onRequestStaffLogin}
              className="px-6 py-3 rounded-xl bg-gradient-to-r from-cyan-500 to-violet-600 hover:from-cyan-400 hover:to-violet-500 text-white text-xs font-bold tracking-wider uppercase inline-flex items-center gap-2 shadow-lg shadow-cyan-500/20 transition-all"
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
      {/* Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 pb-4 border-b border-white/10">
        <div>
          <div className="flex items-center gap-2.5">
            <StickyNote className="w-6 h-6 text-violet-400" />
            <h2 className="text-2xl font-bold font-display tracking-tight text-white">
              Staff Quick Notes — Shared Internal Feed
            </h2>
            <span className="px-2.5 py-0.5 rounded-md bg-violet-500/15 border border-violet-500/40 text-violet-300 text-[11px] font-mono">
              Private: Teacher/In-Charge ↔ Developer
            </span>
          </div>
          <p className="text-slate-400 text-sm mt-1">
            Write, edit, and synchronize private internal operational notes between Alka Mam (In-Charge) and the Developer across Website &amp; APK
          </p>
        </div>

        <div className="flex items-center gap-2.5">
          <button
            type="button"
            onClick={() => {
              staffContentService.syncPendingMutations().then(() => loadQuickNotes());
            }}
            disabled={loading}
            className="px-3.5 py-2 rounded-xl bg-white/5 hover:bg-white/10 border border-white/10 text-slate-200 text-xs font-semibold flex items-center gap-2 transition-colors"
          >
            <RefreshCw className={`w-3.5 h-3.5 text-cyan-400 ${loading ? 'animate-spin' : ''}`} />
            Sync Shared Feed
          </button>
        </div>
      </div>

      {/* Banners */}
      {isOfflineMode && (
        <div className="p-3.5 rounded-xl bg-amber-500/10 border border-amber-500/30 text-amber-200 text-xs flex items-center justify-between gap-3">
          <div className="flex items-center gap-2.5">
            <CloudOff className="w-4 h-4 text-amber-400 shrink-0" />
            <span>
              <strong>Offline Staff Mode:</strong> Showing account-isolated cached Quick Notes for{' '}
              <strong>{staffUser.displayName}</strong>. Notes created while offline are marked as{' '}
              <em>Pending Sync (Local Only)</em> until server confirmation.
            </span>
          </div>
          <button
            type="button"
            onClick={loadQuickNotes}
            className="px-2.5 py-1 rounded-lg bg-amber-500/20 hover:bg-amber-500/30 text-amber-200 font-semibold shrink-0"
          >
            Reconnect
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

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Quick Note Composer */}
        <div className="lg:col-span-5">
          <form
            onSubmit={handleSubmitNote}
            className="rounded-2xl bg-[#0B0F19]/95 border border-violet-500/30 p-5 space-y-4 shadow-[0_0_35px_rgba(139,92,246,0.12)] sticky top-24"
          >
            <div className="flex items-center justify-between border-b border-white/10 pb-3">
              <div className="flex items-center gap-2">
                <Plus className="w-4 h-4 text-violet-400" />
                <h3 className="text-sm font-bold uppercase tracking-wider text-violet-300">
                  {editingNoteId ? 'Edit Shared Quick Note' : 'Compose Shared Staff Note'}
                </h3>
              </div>
              {editingNoteId && (
                <button
                  type="button"
                  onClick={resetComposer}
                  className="text-xs text-slate-400 hover:text-white"
                >
                  Cancel Edit
                </button>
              )}
            </div>

            {conflictNote && (
              <div className="p-3.5 rounded-xl bg-amber-500/15 border border-amber-500/40 text-xs text-amber-200 space-y-2">
                <div className="font-bold text-amber-300">
                  Concurrent Edit Conflict (Server v{conflictNote.version})
                </div>
                <p>
                  {conflictNote.authorName} updated this note while you were editing. Load the latest server version below so no changes are lost.
                </p>
                <button
                  type="button"
                  onClick={() => handleStartEdit(conflictNote)}
                  className="px-3 py-1.5 rounded-lg bg-amber-500/30 hover:bg-amber-500/40 text-white font-semibold"
                >
                  Load Latest Version
                </button>
              </div>
            )}

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Note Title / Subject (Optional)
              </label>
              <input
                type="text"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder="e.g. Morning Assembly Roster / Quiz Moderation Update"
                className="w-full px-3.5 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
              />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="block text-xs text-slate-400 mb-1">Category</label>
                <select
                  value={category}
                  onChange={(e) => setCategory(e.target.value as any)}
                  className="w-full px-3 py-2 rounded-xl bg-slate-900 border border-white/15 text-xs text-white focus:border-violet-400 focus:outline-none"
                >
                  <option value="general">General Staff Note</option>
                  <option value="academic">Academic Coordination</option>
                  <option value="moderation">Moderation &amp; Discipline</option>
                  <option value="urgent">Urgent Action</option>
                  <option value="handover">Dev ↔ In-Charge Handover</option>
                </select>
              </div>

              <div className="flex items-end">
                <button
                  type="button"
                  onClick={() => setPinned((p) => !p)}
                  className={`w-full py-2 px-3 rounded-xl border text-xs font-semibold flex items-center justify-center gap-1.5 transition-colors ${
                    pinned
                      ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                      : 'bg-slate-900 border-white/15 text-slate-400 hover:text-white'
                  }`}
                >
                  <Pin className="w-3.5 h-3.5" />
                  {pinned ? 'Pinned to Top' : 'Pin Note'}
                </button>
              </div>
            </div>

            <div>
              <label className="block text-xs text-slate-400 mb-1">
                Quick Note Content *
              </label>
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                rows={5}
                placeholder="Write a private staff note visible to Teacher/In-Charge and Developer..."
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-900 border border-white/15 text-sm text-white placeholder:text-slate-500 focus:border-violet-400 focus:outline-none"
                required
              />
            </div>

            <div className="pt-1 flex items-center justify-between gap-3">
              <span className="text-[11px] text-slate-400 font-mono">
                Posting as: <strong className="text-slate-200">{staffUser.displayName}</strong>
              </span>
              <button
                type="submit"
                disabled={saving || !content.trim()}
                className="px-5 py-2.5 rounded-xl bg-gradient-to-r from-violet-500 to-cyan-600 hover:from-violet-400 hover:to-cyan-500 text-white text-xs font-bold flex items-center gap-2 shadow-lg shadow-violet-500/20 disabled:opacity-50"
              >
                <Send className="w-3.5 h-3.5" />
                {saving
                  ? 'Saving...'
                  : editingNoteId
                  ? 'Save Changes'
                  : 'Post to Staff Feed'}
              </button>
            </div>
          </form>
        </div>

        {/* Right Column: Shared Staff Feed */}
        <div className="lg:col-span-7 space-y-4">
          {/* Search & Filters */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 bg-white/[0.02] p-3.5 rounded-2xl border border-white/10">
            <div className="relative sm:col-span-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                placeholder="Search notes or author..."
                className="w-full pl-9 pr-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-white placeholder:text-slate-500 focus:border-cyan-400 focus:outline-none"
              />
            </div>

            <div className="flex items-center gap-2">
              <Filter className="w-3.5 h-3.5 text-slate-400 shrink-0" />
              <select
                value={categoryFilter}
                onChange={(e) => setCategoryFilter(e.target.value)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="ALL">All Categories</option>
                <option value="general">General</option>
                <option value="academic">Academic</option>
                <option value="moderation">Moderation</option>
                <option value="urgent">Urgent</option>
                <option value="handover">Dev ↔ In-Charge</option>
              </select>
            </div>

            <div>
              <select
                value={roleFilter}
                onChange={(e) => setRoleFilter(e.target.value as any)}
                className="w-full px-3 py-2 rounded-xl bg-slate-900/90 border border-white/10 text-xs text-white focus:border-cyan-400 focus:outline-none"
              >
                <option value="ALL">All Staff Roles</option>
                <option value="teacher_in_charge">Teacher / In-Charge</option>
                <option value="developer">Developer</option>
              </select>
            </div>
          </div>

          {/* Notes List */}
          {loading && notes.length === 0 ? (
            <div className="py-16 text-center text-slate-400 space-y-2">
              <RefreshCw className="w-6 h-6 animate-spin text-violet-400 mx-auto" />
              <p className="text-xs">Loading shared staff Quick Notes...</p>
            </div>
          ) : filteredNotes.length === 0 ? (
            <div className="rounded-2xl bg-white/[0.02] border border-white/10 p-10 text-center space-y-2">
              <StickyNote className="w-9 h-9 text-slate-500 mx-auto" />
              <h4 className="text-sm font-bold text-white">No Staff Quick Notes Found</h4>
              <p className="text-xs text-slate-400 max-w-sm mx-auto">
                Use the composer on the left to share a private operational note between the Teacher/In-Charge and Developer.
              </p>
            </div>
          ) : (
            <div className="space-y-3">
              {filteredNotes.map((note) => {
                const catInfo =
                  CATEGORY_META[note.category || 'general'] || CATEGORY_META.general;
                const isPending = note.syncStatus === 'pending';
                const isFailed = note.syncStatus === 'failed';

                return (
                  <div
                    key={note.id}
                    className={`rounded-2xl bg-[#0B0F19]/90 border p-4 transition-all space-y-3 ${
                      note.pinned
                        ? 'border-amber-500/40 shadow-[0_0_25px_rgba(245,158,11,0.08)]'
                        : 'border-white/10 hover:border-violet-500/30'
                    }`}
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="flex flex-wrap items-center gap-2">
                        {note.pinned && (
                          <span className="px-2 py-0.5 rounded bg-amber-500/20 border border-amber-500/40 text-amber-300 text-[10px] font-bold flex items-center gap-1">
                            <Pin className="w-3 h-3" />
                            PINNED
                          </span>
                        )}
                        <span
                          className={`text-[10px] font-bold px-2.5 py-0.5 rounded border ${catInfo.badgeClass}`}
                        >
                          {catInfo.label}
                        </span>

                        {isPending ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-amber-500/20 text-amber-300 border border-amber-500/40 flex items-center gap-1">
                            <Clock className="w-3 h-3" />
                            Pending Sync (Local Only)
                          </span>
                        ) : isFailed ? (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-rose-500/20 text-rose-300 border border-rose-500/40">
                            Sync Failed
                          </span>
                        ) : (
                          <span className="text-[10px] font-mono px-2 py-0.5 rounded bg-emerald-500/15 text-emerald-300 border border-emerald-500/30 flex items-center gap-1">
                            <CheckCircle2 className="w-3 h-3" />
                            Synced to Staff Feed
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-1.5">
                        <button
                          type="button"
                          onClick={() => handleTogglePin(note)}
                          className={`p-1.5 rounded-lg border text-xs transition-colors ${
                            note.pinned
                              ? 'bg-amber-500/20 border-amber-500/40 text-amber-300'
                              : 'bg-white/5 border-white/10 text-slate-400 hover:text-white'
                          }`}
                          title={note.pinned ? 'Unpin note' : 'Pin note'}
                        >
                          <Pin className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleStartEdit(note)}
                          className="p-1.5 rounded-lg bg-white/5 hover:bg-white/10 border border-white/10 text-slate-300 hover:text-white"
                          title="Edit note"
                        >
                          <Edit3 className="w-3.5 h-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => setConfirmDeleteNote(note)}
                          className="p-1.5 rounded-lg bg-rose-500/10 hover:bg-rose-500/20 border border-rose-500/30 text-rose-400"
                          title="Delete note"
                        >
                          <Trash2 className="w-3.5 h-3.5" />
                        </button>
                      </div>
                    </div>

                    {note.title && (
                      <h4 className="text-sm font-bold text-white">{note.title}</h4>
                    )}

                    <p className="text-sm text-slate-200 whitespace-pre-wrap leading-relaxed">
                      {note.content}
                    </p>

                    <div className="pt-2.5 border-t border-white/10 flex flex-wrap items-center justify-between gap-2 text-[11px] text-slate-400">
                      <div className="flex items-center gap-2">
                        <span className="font-semibold text-slate-200">{note.authorName}</span>
                        <span
                          className={`px-2 py-0.5 rounded font-mono text-[10px] ${
                            note.authorRole === 'developer'
                              ? 'bg-violet-500/20 text-violet-300 border border-violet-500/30'
                              : 'bg-cyan-500/20 text-cyan-300 border border-cyan-500/30'
                          }`}
                        >
                          {note.authorRoleLabel}
                        </span>
                      </div>
                      <div className="font-mono">
                        {new Date(note.updatedAt || note.createdAt).toLocaleString()} • v
                        {note.version || 1}
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Delete Confirmation Modal */}
      {confirmDeleteNote && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/80 backdrop-blur-md">
          <div className="w-full max-w-md rounded-2xl bg-[#0B0F19] border border-rose-500/40 p-6 space-y-4">
            <div className="flex items-center gap-3 text-rose-400">
              <Trash2 className="w-6 h-6" />
              <h3 className="text-base font-bold text-white">Delete Staff Quick Note?</h3>
            </div>
            <p className="text-xs text-slate-300 leading-relaxed">
              Are you sure you want to permanently delete this Quick Note by{' '}
              <strong className="text-white">{confirmDeleteNote.authorName}</strong> from the shared staff feed?
            </p>
            <div className="flex items-center justify-end gap-3 pt-2">
              <button
                type="button"
                onClick={() => setConfirmDeleteNote(null)}
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
    </div>
  );
};
