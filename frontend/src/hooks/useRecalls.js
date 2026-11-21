/**
 * useRecalls — headless logic for the Recalls page.
 *
 * LOGIC ONLY: fetch, filter, and the three actions. Every sentence that matters
 * (including refusals like "already sent") comes from Django.
 */

import { useCallback, useEffect, useRef, useState } from 'react';
import { apiService } from '../services/apiService';

const EMPTY_COUNTS = { upcoming: 0, sent: 0, done: 0, cancelled: 0 };

const emptyEdit = (item) => ({
  id: item?.id || null,
  followUpDate: item?.follow_up_date || '',
  sendAt: (item?.send_at || '09:00').slice(0, 5),
  patientMessage: item?.patient_message || '',
});

export function useRecalls() {
  const [items, setItems] = useState([]);
  const [counts, setCounts] = useState(EMPTY_COUNTS);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState(null);
  const [tab, setTab] = useState('upcoming');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [edit, setEdit] = useState(null);
  const [saving, setSaving] = useState(false);
  const searchTimer = useRef(null);

  const load = useCallback(async (status = '', query = '') => {
    setLoading(true);
    setError('');
    try {
      const data = await apiService.fetchFollowUps({ status, search: query });
      setItems(Array.isArray(data?.items) ? data.items : []);
      setCounts({ ...EMPTY_COUNTS, ...(data?.counts || {}) });
    } catch (err) {
      setError(err?.message || 'Could not load the recalls.');
    } finally {
      setLoading(false);
    }
  }, []);

  // The tab decides the server-side filter; the counts always come back for all.
  useEffect(() => {
    load(tab === 'all' ? '' : tab, appliedSearch);
  }, [load, tab, appliedSearch]);

  const onSearchChange = useCallback((value) => {
    setSearch(value);
    if (searchTimer.current) clearTimeout(searchTimer.current);
    searchTimer.current = setTimeout(() => setAppliedSearch(value.trim()), 300);
  }, []);

  useEffect(() => () => {
    if (searchTimer.current) clearTimeout(searchTimer.current);
  }, []);

  const refresh = useCallback(
    () => load(tab === 'all' ? '' : tab, appliedSearch),
    [load, tab, appliedSearch],
  );

  const act = useCallback(async (id, payload, successText) => {
    setSaving(true);
    setError('');
    try {
      await apiService.updateFollowUp(id, payload);
      setNotice({ tone: 'success', text: successText });
      await refresh();
      return { success: true };
    } catch (err) {
      // Django's sentence is the truth (already sent, cancelled, bad date).
      setNotice({ tone: 'error', text: err?.message || 'That change was refused.' });
      return { success: false };
    } finally {
      setSaving(false);
    }
  }, [refresh]);

  const cancel = useCallback(
    (item) => act(item.id, { cancelled: true }, `Recall cancelled for ${item.patient_name}.`),
    [act],
  );

  const markDone = useCallback(
    (item) => act(item.id, { is_completed: true }, `Recall marked done for ${item.patient_name}.`),
    [act],
  );

  const startEdit = useCallback((item) => setEdit(emptyEdit(item)), []);
  const closeEdit = useCallback(() => setEdit(null), []);
  const changeEdit = useCallback(
    (key, value) => setEdit((prev) => (prev ? { ...prev, [key]: value } : prev)),
    [],
  );

  const saveEdit = useCallback(async () => {
    if (!edit?.id) return { success: false };
    if (!edit.followUpDate) {
      setNotice({ tone: 'error', text: 'Pick a date before saving.' });
      return { success: false };
    }
    const result = await act(
      edit.id,
      {
        follow_up_date: edit.followUpDate,
        send_at: edit.sendAt || '09:00',
        patient_message: String(edit.patientMessage || '').trim(),
      },
      edit.patientMessage?.trim()
        ? 'Recall updated. The new words will be sent.'
        : 'Recall saved as a note — no message will be sent.',
    );
    if (result.success) setEdit(null);
    return result;
  }, [edit, act]);

  const dismissNotice = useCallback(() => setNotice(null), []);

  return {
    items,
    counts,
    loading,
    error,
    notice,
    tab,
    setTab,
    search,
    onSearchChange,
    edit,
    startEdit,
    closeEdit,
    changeEdit,
    saveEdit,
    saving,
    cancel,
    markDone,
    refresh,
    dismissNotice,
  };
}
