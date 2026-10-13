import React, { useState, useMemo } from 'react';
import {
  SearchIcon,
  ClockIcon,
  CheckCircleIcon,
  UserCheckIcon,
  PhoneIcon,
  XIcon
} from '../common/Icons';
import { INITIAL_PAST_APPOINTMENTS } from '../../utils/mockData';
import { PatientHistoryModal } from './PatientHistoryModal';

export const PastAppointmentsHistory = ({ doctors = [] }) => {
  const [historyList, setHistoryList] = useState(() => {
    const saved = localStorage.getItem('clinic_past_appointments');
    if (saved) {
      try {
        const parsed = JSON.parse(saved);
        if (Array.isArray(parsed) && parsed.length > 0) {
          const savedIds = new Set(parsed.map(s => s.appointment_id));
          const missingDefaults = INITIAL_PAST_APPOINTMENTS.filter(s => !savedIds.has(s.appointment_id));
          return [...parsed, ...missingDefaults];
        }
      } catch (e) {
        console.error('Failed to parse saved past appointments:', e);
      }
    }
    return INITIAL_PAST_APPOINTMENTS;
  });

  const [searchQuery, setSearchQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState('all'); // 'all', 'completed', 'no_show', 'cancelled'
  const [doctorFilter, setDoctorFilter] = useState('all');
  const [selectedPatientName, setSelectedPatientName] = useState(null);

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
            backgroundColor: 'rgba(118, 226, 67, 0.12)',
            color: 'var(--color-accent-green)',
            border: '1px solid rgba(118, 226, 67, 0.25)',
            fontSize: '0.6875rem'
          }}>
            ✓ Completed
          </span>
        );
      case 'no_show':
        return (
          <span className="glass-badge" style={{
            backgroundColor: 'rgba(255, 77, 109, 0.12)',
            color: 'var(--color-accent-coral)',
            border: '1px solid rgba(255, 77, 109, 0.25)',
            fontSize: '0.6875rem'
          }}>
            ✕ Missed / No-Show
          </span>
        );
      case 'cancelled':
        return (
          <span className="glass-badge" style={{
            backgroundColor: 'rgba(255, 107, 0, 0.12)',
            color: 'var(--color-accent-orange)',
            border: '1px solid rgba(255, 107, 0, 0.25)',
            fontSize: '0.6875rem'
          }}>
            ⚠ Cancelled
          </span>
        );
      default:
        return <span className="glass-badge" style={{ fontSize: '0.6875rem' }}>{status}</span>;
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Sleek, Non-Bulky Summary KPI Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '10px',
        padding: '12px 18px',
        backgroundColor: 'rgba(255, 255, 255, 0.02)',
        borderRadius: 'var(--radius-lg)',
        border: '1px solid var(--color-border-glass)'
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '16px', flexWrap: 'wrap' }}>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>Total Archive: </span>
            <strong style={{ color: '#ffffff', fontSize: '0.9375rem' }}>{historyList.length}</strong>
          </div>
          <span style={{ color: 'rgba(255, 255, 255, 0.1)' }}>|</span>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>Completed: </span>
            <strong style={{ color: 'var(--color-accent-green)', fontSize: '0.9375rem' }}>{completedCount}</strong>
          </div>
          <span style={{ color: 'rgba(255, 255, 255, 0.1)' }}>|</span>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>Follow-Up Recalls: </span>
            <strong style={{ color: 'var(--color-accent-teal)', fontSize: '0.9375rem' }}>{followUpCount}</strong>
          </div>
          <span style={{ color: 'rgba(255, 255, 255, 0.1)' }}>|</span>
          <div>
            <span style={{ fontSize: '0.75rem', color: '#8e8e93' }}>Missed / Cancelled: </span>
            <strong style={{ color: 'var(--color-accent-coral)', fontSize: '0.9375rem' }}>{noShowCount + cancelledCount}</strong>
          </div>
        </div>

        <div style={{ fontSize: '0.75rem', color: '#8e8e93' }}>
          💡 <span style={{ color: 'var(--color-accent-orange)' }}>Click on any patient name</span> to view their full past journey dossier
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        {/* Search Input */}
        <div style={{ position: 'relative', flex: '1 1 260px', maxWidth: '380px' }}>
          <span style={{
            position: 'absolute',
            left: '14px',
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
              paddingLeft: '38px',
              paddingRight: searchQuery ? '34px' : '12px',
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
                right: '12px',
                top: '50%',
                transform: 'translateY(-50%)',
                background: 'none',
                border: 'none',
                color: '#8e8e93',
                cursor: 'pointer',
                padding: '2px'
              }}
            >
              <XIcon size={14} color="#8e8e93" />
            </button>
          )}
        </div>

        {/* Status Filter Pills & Doctor Dropdown */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
          {/* Status Pills */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '4px',
            background: 'rgba(255, 255, 255, 0.03)',
            padding: '3px',
            borderRadius: 'var(--radius-pill)',
            border: '1px solid var(--color-border-glass)'
          }}>
            {[
              { id: 'all', label: 'All' },
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
                    padding: '5px 14px',
                    fontSize: '0.75rem',
                    fontWeight: isActive ? '700' : '500',
                    backgroundColor: isActive ? '#ffffff' : 'transparent',
                    color: isActive ? '#0c0d0e' : '#8e8e93',
                    border: 'none'
                  }}
                >
                  {tab.label}
                </button>
              );
            })}
          </div>

          {/* Doctor Filter Dropdown */}
          <select
            className="form-control-glass"
            style={{
              padding: '6px 14px',
              fontSize: '0.75rem',
              borderRadius: 'var(--radius-pill)',
              minWidth: '150px'
            }}
            value={doctorFilter}
            onChange={(e) => setDoctorFilter(e.target.value)}
          >
            <option value="all">All Doctors ({doctors.length})</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>
                {d.name || d.full_name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* Past Appointments List */}
      {filteredList.length === 0 ? (
        <div className="glass-card" style={{
          padding: '48px 24px',
          textAlign: 'center',
          color: '#8e8e93'
        }}>
          <CheckCircleIcon size={32} color="var(--color-border-glass)" />
          <h4 style={{ color: '#ffffff', marginTop: '10px', marginBottom: '4px' }}>No records found</h4>
          <p style={{ fontSize: '0.8125rem', margin: 0 }}>
            {searchQuery ? `No appointments matching "${searchQuery}"` : 'No historical appointments found under this filter.'}
          </p>
        </div>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          {filteredList.map(appt => {
            const isCompleted = appt.status === 'completed';
            const isNoShow = appt.status === 'no_show';

            return (
              <div
                key={appt.appointment_id}
                className="glass-card"
                style={{
                  padding: '16px 20px',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  flexWrap: 'wrap',
                  gap: '14px',
                  borderLeft: isCompleted
                    ? '3px solid var(--color-accent-green)'
                    : isNoShow
                    ? '3px solid var(--color-accent-coral)'
                    : '3px solid var(--color-accent-orange)'
                }}
              >
                {/* Left Column: Date & Patient Details */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
                  {/* Clean Date Pill */}
                  <div style={{
                    minWidth: '95px',
                    padding: '6px 10px',
                    backgroundColor: 'rgba(255, 255, 255, 0.04)',
                    borderRadius: 'var(--radius-md)',
                    textAlign: 'center',
                    border: '1px solid rgba(255, 255, 255, 0.08)'
                  }}>
                    <div style={{ fontSize: '0.8125rem', fontWeight: '700', color: '#ffffff' }}>
                      {appt.date}
                    </div>
                    <div style={{ fontSize: '0.6875rem', color: '#8e8e93' }}>
                      {appt.time_label?.split('-')[0] || '10:00 AM'}
                    </div>
                  </div>

                  {/* Patient Name & Service Line */}
                  <div>
                    <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                      {/* Clickable Patient Name opens Dossier */}
                      <button
                        onClick={() => setSelectedPatientName(appt.patient_name)}
                        style={{
                          background: 'none',
                          border: 'none',
                          padding: 0,
                          cursor: 'pointer',
                          fontWeight: '700',
                          fontSize: '1rem',
                          color: '#ffffff',
                          display: 'flex',
                          alignItems: 'center',
                          gap: '6px',
                          textDecoration: 'underline',
                          textDecorationColor: 'rgba(255, 107, 0, 0.4)',
                          textUnderlineOffset: '3px'
                        }}
                        title="Click to view full patient journey dossier"
                      >
                        <span>{appt.patient_name}</span>
                        <span style={{ fontSize: '0.6875rem', color: 'var(--color-accent-orange)', fontWeight: '600' }}>
                          (View Dossier ➔)
                        </span>
                      </button>

                      {getStatusBadge(appt.status)}
                    </div>

                    <div style={{
                      display: 'flex',
                      alignItems: 'center',
                      gap: '8px',
                      fontSize: '0.8125rem',
                      color: 'var(--color-text-secondary)',
                      marginTop: '4px'
                    }}>
                      <span style={{ color: 'var(--color-accent-orange)', fontWeight: '500' }}>
                        {appt.service_name}
                      </span>
                      <span>•</span>
                      <span>{appt.doctor_name}</span>
                      <span>•</span>
                      <span>{appt.patient_phone}</span>
                      {appt.room && (
                        <>
                          <span>•</span>
                          <span>{appt.room}</span>
                        </>
                      )}
                    </div>

                    {/* Clinical summary or recall tag */}
                    {appt.notes && (
                      <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '4px', fontStyle: 'italic' }}>
                        "{appt.notes.length > 85 ? `${appt.notes.slice(0, 85)}...` : appt.notes}"
                      </div>
                    )}
                  </div>
                </div>

                {/* Right Column: Code and Action */}
                <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                  <span style={{
                    fontFamily: 'monospace',
                    fontSize: '0.75rem',
                    color: '#8e8e93',
                    backgroundColor: 'rgba(255, 255, 255, 0.05)',
                    padding: '3px 8px',
                    borderRadius: 'var(--radius-sm)'
                  }}>
                    {appt.appointment_id}
                  </span>

                  <button
                    onClick={() => setSelectedPatientName(appt.patient_name)}
                    className="btn-pill btn-pill-glass"
                    style={{ fontSize: '0.75rem', padding: '6px 14px' }}
                  >
                    <span>Full History</span>
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Patient Medical Journey Dossier Modal */}
      <PatientHistoryModal
        patientName={selectedPatientName}
        isOpen={Boolean(selectedPatientName)}
        onClose={() => setSelectedPatientName(null)}
        allAppointments={historyList}
      />
    </div>
  );
};
