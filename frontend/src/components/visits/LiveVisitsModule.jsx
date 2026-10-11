import React, { useState } from 'react';
import {
  ClockIcon,
  CheckCircleIcon,
  ChevronRightIcon
} from '../common/Icons';
import { FollowUpCompletionModal } from './FollowUpCompletionModal';
import { PastAppointmentsHistory } from './PastAppointmentsHistory';

export const LiveVisitsModule = ({ controller, doctors = [] }) => {
  const [activeView, setActiveView] = useState('live'); // 'live' or 'history'
  const {
    filterDoctor,
    setFilterDoctor,
    filterStatus,
    setFilterStatus,
    selectedAppointmentForCompletion,
    setSelectedAppointmentForCompletion,
    arrivedCount,
    inConsultCount,
    completedCount,
    noShowCount,
    filteredAppointments,
    updateVisitStatus,
    completeWithFollowUp
  } = controller;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {/* Primary Section Switcher: Today's Live Visits vs Past Appointments History */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '12px',
        paddingBottom: '2px'
      }}>
        <div style={{
          display: 'flex',
          alignItems: 'center',
          gap: '6px',
          backgroundColor: 'rgba(255, 255, 255, 0.04)',
          padding: '4px',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--color-border-glass)'
        }}>
          <button
            onClick={() => setActiveView('live')}
            className="btn-pill"
            style={{
              padding: '7px 18px',
              fontSize: '0.8125rem',
              fontWeight: activeView === 'live' ? '700' : '500',
              backgroundColor: activeView === 'live' ? 'var(--color-accent-orange)' : 'transparent',
              color: activeView === 'live' ? '#ffffff' : '#8e8e93',
              boxShadow: activeView === 'live' ? '0 0 15px rgba(255, 107, 0, 0.4)' : 'none',
              border: 'none'
            }}
          >
            🕒 Today's Live Queue
          </button>

          <button
            onClick={() => setActiveView('history')}
            className="btn-pill"
            style={{
              padding: '7px 18px',
              fontSize: '0.8125rem',
              fontWeight: activeView === 'history' ? '700' : '500',
              backgroundColor: activeView === 'history' ? 'var(--color-accent-orange)' : 'transparent',
              color: activeView === 'history' ? '#ffffff' : '#8e8e93',
              boxShadow: activeView === 'history' ? '0 0 15px rgba(255, 107, 0, 0.4)' : 'none',
              border: 'none'
            }}
          >
            📋 Past Appointments History
          </button>
        </div>
      </div>

      {/* Conditional Rendering between Live Queue and Past History */}
      {activeView === 'history' ? (
        <PastAppointmentsHistory doctors={doctors} />
      ) : (
        <>
          {/* Top Filter Bar (Simple Plain English & Dynamic Doctors Filter from Staff Directory) */}
          <div style={{
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'space-between',
            flexWrap: 'wrap',
            gap: '12px'
          }}>
            {/* Simple Tabs with live counts, including Missed / No-Show */}
            <div style={{
              display: 'flex',
              alignItems: 'center',
              gap: '8px',
          background: 'rgba(255, 255, 255, 0.03)',
          padding: '4px',
          borderRadius: 'var(--radius-pill)',
          border: '1px solid var(--color-border-glass)'
        }}>
          {[
            { id: 'all', label: 'All Today' },
            { id: 'arrived', label: 'Waiting Room', count: arrivedCount },
            { id: 'in_consultation', label: 'Inside with Doctor', count: inConsultCount },
            { id: 'completed', label: 'Completed', count: completedCount },
            { id: 'no_show', label: 'Missed / No-Show', count: noShowCount, isCoral: true }
          ].map(tab => {
            const isActive = filterStatus === tab.id;
            return (
              <button
                key={tab.id}
                onClick={() => setFilterStatus(tab.id)}
                className="btn-pill"
                style={{
                  padding: '7px 16px',
                  fontSize: '0.8125rem',
                  fontWeight: isActive ? '700' : '500',
                  backgroundColor: isActive ? '#ffffff' : 'transparent',
                  color: isActive ? '#0c0d0e' : '#8e8e93',
                  boxShadow: isActive ? '0 0 20px rgba(255, 255, 255, 0.25)' : 'none'
                }}
              >
                <span>{tab.label}</span>
                {tab.count !== undefined && (
                  <span style={{
                    fontSize: '0.6875rem',
                    fontWeight: '800',
                    padding: '2px 6px',
                    borderRadius: '10px',
                    backgroundColor: isActive
                      ? '#0c0d0e'
                      : tab.isCoral && tab.count > 0
                      ? 'rgba(255, 77, 77, 0.2)'
                      : 'rgba(255, 255, 255, 0.08)',
                    color: isActive
                      ? '#ffffff'
                      : tab.isCoral && tab.count > 0
                      ? 'var(--color-accent-coral)'
                      : '#8e8e93'
                  }}>
                    {tab.count}
                  </span>
                )}
              </button>
            );
          })}
        </div>

        {/* Dynamic Doctor Filter Dropdown powered by Staff Directory */}
        <div>
          <select
            className="form-control-glass"
            style={{ width: 'auto', padding: '6px 14px', fontSize: '0.8125rem', borderRadius: 'var(--radius-pill)' }}
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
          >
            <option value="all">All Doctors ({doctors.length})</option>
            {doctors.map(d => (
              <option key={d.id} value={d.id}>{d.name || d.full_name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* Patient Visits List */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        {filteredAppointments.map((apt) => {
          const isArrived = apt.status === 'arrived';
          const isInConsult = apt.status === 'in_consultation';
          const isCompleted = apt.status === 'completed';
          const isNoShow = apt.status === 'no_show';

          return (
            <div
              key={apt.appointment_id}
              className="glass-card"
              style={{
                padding: '18px 24px',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                flexWrap: 'wrap',
                gap: '14px',
                borderLeft: isNoShow
                  ? '3px solid var(--color-accent-coral)'
                  : isInConsult
                  ? '3px solid var(--color-accent-green)'
                  : isArrived
                  ? '3px solid var(--color-accent-orange)'
                  : isCompleted
                  ? '3px solid rgba(255, 255, 255, 0.2)'
                  : '3px solid rgba(255, 255, 255, 0.1)'
              }}
            >
              {/* Left Column: Time & Patient Details */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '18px' }}>
                {/* Clean Time Pill */}
                <div style={{
                  minWidth: '85px',
                  padding: '6px 10px',
                  backgroundColor: 'rgba(255, 255, 255, 0.04)',
                  borderRadius: 'var(--radius-md)',
                  textAlign: 'center',
                  border: isNoShow
                    ? '1px solid rgba(255, 77, 77, 0.25)'
                    : '1px solid rgba(255, 255, 255, 0.08)'
                }}>
                  <div style={{ fontSize: '0.875rem', fontWeight: '700', color: isNoShow ? 'var(--color-accent-coral)' : '#ffffff' }}>
                    {apt.time_label?.split('-')[0] || '10:00 AM'}
                  </div>
                  <div style={{ fontSize: '0.6875rem', color: '#8e8e93' }}>
                    {apt.room || 'Clinic'}
                  </div>
                </div>

                {/* Patient Information & Live Status Dot */}
                <div>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <span style={{ fontWeight: '700', fontSize: '1.0625rem', color: '#ffffff' }}>
                      {apt.patient_name}
                    </span>

                    {/* Clean Live Status Tag */}
                    {isNoShow && (
                      <span className="glass-badge glass-badge-coral" style={{ fontSize: '0.6875rem' }}>
                        ❌ Did Not Show Up
                      </span>
                    )}
                    {isInConsult && (
                      <span className="glass-badge glass-badge-green" style={{ fontSize: '0.6875rem' }}>
                        ● Inside with Doctor
                      </span>
                    )}
                    {isArrived && (
                      <span className="glass-badge glass-badge-orange" style={{ fontSize: '0.6875rem' }}>
                        ● Waiting in Clinic ({apt.arrival_at?.includes('Waiting') ? apt.arrival_at.match(/\(.*\)/)[0] : 'Just arrived'})
                      </span>
                    )}
                    {apt.status === 'confirmed' && (
                      <span className="glass-badge glass-badge-neutral" style={{ fontSize: '0.6875rem' }}>
                        Expected Today
                      </span>
                    )}
                    {isCompleted && (
                      <span className="glass-badge glass-badge-neutral" style={{ fontSize: '0.6875rem' }}>
                        ✓ Completed
                      </span>
                    )}
                  </div>

                  {/* Service, Doctor & Phone Line */}
                  <div style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    fontSize: '0.8125rem',
                    color: 'var(--color-text-secondary)',
                    marginTop: '4px'
                  }}>
                    <span style={{ color: '#ffffff', fontWeight: '500' }}>{apt.service_name}</span>
                    <span>•</span>
                    <span style={{ color: isNoShow ? '#e0e0e0' : 'inherit' }}>Doctor: {apt.doctor_name}</span>
                    <span>•</span>
                    <span>{apt.patient_phone}</span>
                    {apt.notes && isNoShow && (
                      <>
                        <span>•</span>
                        <span style={{ color: '#8e8e93', fontStyle: 'italic' }}>{apt.notes}</span>
                      </>
                    )}
                  </div>
                </div>
              </div>

              {/* Right Column: Clean, Unified Action Buttons */}
              <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                {apt.status === 'confirmed' && (
                  <button
                    onClick={() => updateVisitStatus(apt.appointment_id, 'arrived')}
                    className="btn-pill btn-pill-orange"
                    style={{ padding: '8px 18px' }}
                  >
                    <span>Mark Arrived</span>
                    <ChevronRightIcon size={14} color="currentColor" />
                  </button>
                )}

                {isArrived && (
                  <button
                    onClick={() => updateVisitStatus(apt.appointment_id, 'in_consultation')}
                    className="btn-pill btn-pill-green"
                    style={{ padding: '8px 18px' }}
                  >
                    <span>Call Inside</span>
                    <ChevronRightIcon size={14} color="currentColor" />
                  </button>
                )}

                {isInConsult && (
                  <button
                    onClick={() => setSelectedAppointmentForCompletion(apt)}
                    className="btn-pill btn-pill-glass"
                    style={{ border: '1px solid var(--color-accent-green)', color: 'var(--color-accent-green)', padding: '8px 18px' }}
                  >
                    <span>Finish Visit</span>
                    <CheckCircleIcon size={14} color="var(--color-accent-green)" />
                  </button>
                )}

                {/* No-Show Patient Actions: Allow 1-click Check-In if patient arrives late */}
                {isNoShow && (
                  <button
                    onClick={() => updateVisitStatus(apt.appointment_id, 'arrived')}
                    className="btn-pill btn-pill-orange"
                    style={{ padding: '7px 16px', fontSize: '0.75rem' }}
                    title="Patient arrived late — Check into Waiting Room"
                  >
                    <span>Check In (Late Arrival)</span>
                    <ChevronRightIcon size={13} color="currentColor" />
                  </button>
                )}

                {/* Mark as No-Show Button with Confirmation */}
                {['confirmed', 'arrived'].includes(apt.status) && (
                  <button
                    onClick={() => {
                      if (window.confirm(`Mark ${apt.patient_name} as Missed / No-Show?\nThey will be moved to the "Missed / No-Show" section so reception maintains the record.`)) {
                        updateVisitStatus(apt.appointment_id, 'no_show');
                      }
                    }}
                    style={{
                      color: '#8e8e93',
                      fontSize: '0.75rem',
                      padding: '6px 12px',
                      borderRadius: 'var(--radius-pill)',
                      border: '1px solid rgba(255, 255, 255, 0.05)',
                      backgroundColor: 'rgba(255, 255, 255, 0.02)',
                      transition: 'all 0.15s ease'
                    }}
                    onMouseEnter={(e) => {
                      e.currentTarget.style.color = 'var(--color-accent-coral)';
                      e.currentTarget.style.borderColor = 'rgba(255, 77, 77, 0.3)';
                    }}
                    onMouseLeave={(e) => {
                      e.currentTarget.style.color = '#8e8e93';
                      e.currentTarget.style.borderColor = 'rgba(255, 255, 255, 0.05)';
                    }}
                  >
                    Did Not Show Up
                  </button>
                )}
              </div>
            </div>
          );
        })}

        {filteredAppointments.length === 0 && (
          <div className="glass-card" style={{
            padding: '50px 20px',
            textAlign: 'center',
            color: 'var(--color-text-secondary)'
          }}>
            <div style={{
              width: '42px',
              height: '42px',
              borderRadius: '50%',
              backgroundColor: 'rgba(255, 255, 255, 0.05)',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              margin: '0 auto 10px'
            }}>
              <CheckCircleIcon size={20} color="var(--color-accent-green)" />
            </div>
            <h3 style={{ fontSize: '1rem', color: '#ffffff', marginBottom: '2px' }}>
              {filterStatus === 'no_show' ? 'No Missed Appointments' : 'No Appointments Found'}
            </h3>
            <p style={{ fontSize: '0.8125rem' }}>
              {filterStatus === 'no_show'
                ? 'All scheduled patients have attended or are currently progressing.'
                : 'No patients found matching this filter.'}
            </p>
          </div>
        )}
      </div>
    </>
  )}

      {/* Completion & Follow-up Modal */}
      <FollowUpCompletionModal
        appointment={selectedAppointmentForCompletion}
        isOpen={Boolean(selectedAppointmentForCompletion)}
        onClose={() => setSelectedAppointmentForCompletion(null)}
        onCompleteWithFollowUp={completeWithFollowUp}
        doctors={doctors}
      />
    </div>
  );
};
