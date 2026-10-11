import React, { useState, useMemo } from 'react';
import {
  SearchIcon,
  ClockIcon,
  CheckCircleIcon,
  UserCheckIcon,
  PhoneIcon
} from '../common/Icons';
import { INITIAL_PAST_APPOINTMENTS } from '../../utils/mockData';

export const PastAppointmentsHistory = ({ doctors = [] }) => {
  const [historyList, setHistoryList] = useState(() => {
    const saved = localStorage.getItem('clinic_past_appointments');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved past appointments:', e);
      }
    }
    return INITIAL_PAST_APPOINTMENTS;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'completed', 'no_show', 'cancelled'
  const [doctorFilter, setDoctorFilter] = useState('all');

  // Filtered appointments
  const filteredList = useMemo(() => {
    return historyList.filter(item => {
      // Status filter
      if (statusFilter !== 'all' && item.status !== statusFilter) return false;

      // Doctor filter
      if (doctorFilter !== 'all' && item.doctor_id !== doctorFilter) return false;

      // Search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = item.patient_name?.toLowerCase().includes(query);
        const matchPhone = item.patient_phone?.toLowerCase().includes(query);
        const matchCode = item.appointment_id?.toLowerCase().includes(query);
        const matchService = item.service_name?.toLowerCase().includes(query);
        const matchDoctor = item.doctor_name?.toLowerCase().includes(query);
        const matchNotes = item.notes?.toLowerCase().includes(query);

        if (!matchName && !matchPhone && !matchCode && !matchService && !matchDoctor && !matchNotes) {
          return false;
        }
      }

      return true;
    });
  }, [historyList, statusFilter, doctorFilter, searchQuery]);

  // Aggregate metrics
  const completedCount = useMemo(() => historyList.filter(i => i.status === 'completed').length, [historyList]);
  const noShowCount = useMemo(() => historyList.filter(i => i.status === 'no_show').length, [historyList]);
  const cancelledCount = useMemo(() => historyList.filter(i => i.status === 'cancelled').length, [historyList]);
  const followUpCount = useMemo(() => historyList.filter(i => i.follow_up_scheduled && i.follow_up_scheduled !== 'None required').length, [historyList]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'completed':
        return (
          <span className="glass-badge" style={{
            backgroundColor: 'rgba(52, 199, 89, 0.15)',
            color: 'var(--color-accent-green)',
            border: '1px solid rgba(52, 199, 89, 0.3)'
          }}>
            ✓ Completed
          </span>
        );
      case 'no_show':
        return (
          <span className="glass-badge" style={{
            backgroundColor: 'rgba(255, 59, 48, 0.15)',
            color: 'var(--color-accent-coral)',
            border: '1px solid rgba(255, 59, 48, 0.3)'
          }}>
            ✕ Missed / No-Show
          </span>
        );
      case 'cancelled':
        return (
          <span className="glass-badge" style={{
            backgroundColor: 'rgba(255, 149, 0, 0.15)',
            color: 'var(--color-accent-orange)',
            border: '1px solid rgba(255, 149, 0, 0.3)'
          }}>
            ⚠ Cancelled
          </span>
        );
      default:
        return <span className="glass-badge">{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '18px' }}>
      {/* Top Aggregate Summary Strip */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(180px, 1fr))',
        gap: '12px'
      }}>
        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            Archived Visits
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: '#ffffff', marginTop: '2px' }}>
            {historyList.length}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
            Historical patient records
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            Completed Visits
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-accent-green)', marginTop: '2px' }}>
            {completedCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
            Successfully treated
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            Follow-Up Recalls
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-accent-teal)', marginTop: '2px' }}>
            {followUpCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
            Future recalls scheduled
          </div>
        </div>

        <div className="glass-card" style={{ padding: '16px 18px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            Missed / Cancelled
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-accent-coral)', marginTop: '2px' }}>
            {noShowCount + cancelledCount}
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
            {noShowCount} no-shows • {cancelledCount} cancelled
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        padding: '12px 16px',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-glass)'
      }}>
        {/* Search input */}
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '380px' }}>
          <span style={{
            position: 'absolute',
            left: '12px',
            top: '50%',
            transform: 'translateY(-50%)',
            color: '#8e8e93',
            pointerEvents: 'none'
          }}>
            <SearchIcon size={14} color="#8e8e93" />
          </span>
          <input
            type="text"
            className="form-control-glass"
            style={{
              paddingLeft: '34px',
              paddingRight: searchQuery ? '32px' : '12px',
              fontSize: '0.8125rem',
              borderRadius: 'var(--radius-pill)',
              backgroundColor: 'rgba(255, 255, 255, 0.03)'
            }}
            placeholder="Search patient, phone, doctor, AP-code..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
          />
          {searchQuery && (
            <button
              onClick={() => setSearchQuery('')}
              style={{
                position: 'absolute',
                right: '10px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#8e8e93',
                cursor: 'pointer',
                fontSize: '0.875rem'
              }}
            >
              ✕
            </button>
          )}
        </div>

        {/* Filter pills & Doctor dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Status Pills */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '6px',
            background: 'rgba(255, 255, 255, 0.03)',
            padding: '3px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-border-glass)'
          }}>
            {[
              { id: 'all', label: 'All Records' },
              { id: 'completed', label: 'Completed' },
              { id: 'no_show', label: 'No-Shows' },
              { id: 'cancelled', label: 'Cancelled' }
            ].map(tab => {
              const isActive = statusFilter === tab.id;
              return (
                <button
                  key={tab.id}
                  onClick={() => setStatusFilter(tab.id)}
                  className="btn-pill"
                  style={{
                    padding: '5px 12px',
                    fontSize: '0.75rem',
                    fontWeight: isActive ? '700' : '500',
                    backgroundColor: isActive ? 'rgba(255, 255, 255, 0.12)' : 'transparent',
                    color: isActive ? '#ffffff' : '#8e8e93',
                    border: 'none'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Doctor filter dropdown */}
          <select
            className="form-control-glass"
            style={{
              padding: '6px 12px',
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-pill)',
              minWidth: '150px'
            }}
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
          >
            <option value="all" style={{ background: '#1c1d22', color: '#fff' }}>All Doctors</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id} style={{ background: '#1c1d22', color: '#fff' }}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Results Count Banner */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '0 4px' }}>
        <span style={{ fontSize: '0.8125rem', color: '#8e8e93' }}>
          Showing <strong style={{ color: '#ffffff' }}>{filteredList.length}</strong> past appointment {filteredList.length === 1 ? 'record' : 'records'}
        </span>
      </div>

      {/* Past Appointments List */}
      {filteredList.length === 0 ? (
        <div className="glass-card" style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: '#8e8e93'
        }}>
          <CheckCircleIcon size={36} color="var(--color-border-glass)" />
          <h4 style={{ color: '#ffffff', marginTop: '12px', marginBottom: '4px' }}>No past records found</h4>
          <p style={{ fontSize: '0.8125rem', margin: 0 }}>
            {searchQuery ? `No appointments matching "${searchQuery}"` : 'No historical appointments found under this filter.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          {filteredList.map(appt => (
            <div
              key={appt.appointment_id}
              className="glass-card"
              style={{
                padding: '18px 22px',
                display: 'flex',
                flexDirection: 'column',
                gap: '12px',
                borderLeft: appt.status === 'completed'
                  ? '3px solid var(--color-accent-green)'
                  : appt.status === 'no_show'
                    ? '3px solid var(--color-accent-coral)'
                    : '3px solid var(--color-accent-orange)'
              }}
            >
              {/* Card Top: Code, Status, Date/Time */}
              <div style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '10px'
              }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontWeight: '800',
                    fontSize: '0.875rem',
                    color: '#ffffff',
                    backgroundColor: 'rgba(255, 255, 255, 0.08)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    {appt.appointment_id}
                  </span>
                  {getStatusBadge(appt.status)}
                </div>

                <div style={{
                  display: 'flex',
                  alignItems: 'center',
                  gap: '6px',
                  color: '#8e8e93',
                  fontSize: '0.8125rem'
                }}>
                  <ClockIcon size={14} color="#8e8e93" />
                  <span>{appt.date} • {appt.time_label}</span>
                </div>
              </div>

              {/* Card Middle: Patient & Doctor & Service Grid */}
              <div style={{
                display: 'grid',
                gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
                gap: '12px',
                backgroundColor: 'rgba(255, 255, 255, 0.02)',
                padding: '12px 14px',
                borderRadius: 'var(--radius-md)',
                border: '1px solid rgba(255, 255, 255, 0.04)'
              }}>
                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                    Patient
                  </div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: '700', color: '#ffffff', marginTop: '2px' }}>
                    {appt.patient_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#8e8e93', display: 'flex', alignItems: 'center', gap: '4px', marginTop: '2px' }}>
                    <PhoneIcon size={12} color="#8e8e93" />
                    <span>{appt.patient_phone}</span>
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                    Doctor & Suite
                  </div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: '600', color: '#ffffff', marginTop: '2px' }}>
                    {appt.doctor_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
                    {appt.doctor_specialty || appt.room}
                  </div>
                </div>

                <div>
                  <div style={{ fontSize: '0.6875rem', color: '#8e8e93', textTransform: 'uppercase', fontWeight: '700' }}>
                    Procedure
                  </div>
                  <div style={{ fontSize: '0.9375rem', fontWeight: '600', color: 'var(--color-accent-orange)', marginTop: '2px' }}>
                    {appt.service_name}
                  </div>
                  <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '2px' }}>
                    {appt.room}
                  </div>
                </div>
              </div>

              {/* Card Bottom: Clinical Notes & Recall */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
                {appt.notes && (
                  <div style={{ fontSize: '0.8125rem', color: '#cccccc', lineHeight: '1.4' }}>
                    <strong style={{ color: '#8e8e93' }}>Clinical Summary: </strong>
                    {appt.notes}
                  </div>
                )}

                {appt.follow_up_scheduled && appt.follow_up_scheduled !== 'None required' && (
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '6px',
                    fontSize: '0.75rem',
                    color: 'var(--color-accent-teal)',
                    backgroundColor: 'rgba(0, 210, 190, 0.08)',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    width: 'fit-content'
                  }}>
                    <UserCheckIcon size={14} color="var(--color-accent-teal)" />
                    <span>Scheduled Recall: <strong>{appt.follow_up_scheduled}</strong></span>
                  </div>
                )}

                {appt.cancellation_reason && (
                  <div style={{
                    fontSize: '0.75rem',
                    color: 'var(--color-accent-coral)',
                    backgroundColor: 'rgba(255, 59, 48, 0.08)',
                    padding: '6px 10px',
                    borderRadius: 'var(--radius-sm)',
                    width: 'fit-content'
                  }}>
                    Reason for Cancellation / Miss: <strong>{appt.cancellation_reason}</strong>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
