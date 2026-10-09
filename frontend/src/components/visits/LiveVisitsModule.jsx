import React from 'react';
import {
  CalendarIcon,
  ClockIcon,
  UserIcon,
  PhoneIcon,
  StethoscopeIcon,
  CheckCircleIcon,
  AlertTriangleIcon
} from '../common/Icons';
import { FollowUpCompletionModal } from './FollowUpCompletionModal';
import { INITIAL_DOCTORS } from '../../utils/mockData';

export const LiveVisitsModule = ({ controller }) => {
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
    confirmedCount,
    filteredAppointments,
    updateVisitStatus,
    completeWithFollowUp
  } = controller;

  const getStatusBadge = (status) => {
    switch (status) {
      case 'arrived':
        return <span className="badge badge-warning">Waiting in Clinic</span>;
      case 'in_consultation':
        return <span className="badge badge-primary">🩺 In Consultation</span>;
      case 'completed':
        return <span className="badge badge-success">✅ Completed</span>;
      case 'no_show':
        return <span className="badge badge-danger">⚠️ No-Show</span>;
      default:
        return <span className="badge badge-info">📅 Confirmed Today</span>;
    }
  };

  return (
    <div>
      {/* Header & Metrics Strip */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '20px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Live Clinic Visits Tracker</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Real-time patient progression from waiting room to doctor consultation and discharge.
          </p>
        </div>

        {/* Doctor Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
          <span style={{ fontSize: '0.8125rem', color: 'var(--color-text-muted)', fontWeight: '600' }}>
            Filter Doctor:
          </span>
          <select
            className="form-control"
            style={{ width: 'auto', padding: '6px 12px', fontSize: '0.8125rem' }}
            value={filterDoctor}
            onChange={(e) => setFilterDoctor(e.target.value)}
          >
            <option value="all">All Doctors</option>
            {INITIAL_DOCTORS.map(d => (
              <option key={d.id} value={d.id}>{d.name}</option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Status Tracker Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
        gap: '14px',
        marginBottom: '24px'
      }}>
        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-warning)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Waiting in Reception
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-warning-text)', marginTop: '4px' }}>
            {arrivedCount} <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>patients</span>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-primary)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            In Consultation Room
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-primary-dark)', marginTop: '4px' }}>
            {inConsultCount} <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>active</span>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-info)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Upcoming Expected
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-info-text)', marginTop: '4px' }}>
            {confirmedCount} <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>slotted</span>
          </div>
        </div>

        <div className="card" style={{ padding: '16px 20px', borderLeft: '4px solid var(--color-success)' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Completed Today
          </div>
          <div style={{ fontSize: '1.75rem', fontWeight: '800', color: 'var(--color-success-text)', marginTop: '4px' }}>
            {completedCount} <span style={{ fontSize: '0.875rem', fontWeight: '500' }}>seen</span>
          </div>
        </div>
      </div>

      {/* Filter Tabs */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        gap: '8px',
        marginBottom: '18px',
        borderBottom: '1px solid var(--color-border)',
        paddingBottom: '2px',
        overflowX: 'auto'
      }}>
        {[
          { id: 'active', label: 'Active Schedule & Waiting Room' },
          { id: 'all', label: 'All Today' },
          { id: 'arrived', label: 'Waiting Room' },
          { id: 'in_consultation', label: 'In Consultation' },
          { id: 'completed', label: 'Completed' }
        ].map(tab => (
          <button
            key={tab.id}
            onClick={() => setFilterStatus(tab.id)}
            style={{
              padding: '8px 14px',
              borderRadius: '8px',
              fontSize: '0.8125rem',
              fontWeight: filterStatus === tab.id ? '700' : '500',
              backgroundColor: filterStatus === tab.id ? 'var(--color-surface)' : 'transparent',
              color: filterStatus === tab.id ? 'var(--color-primary)' : 'var(--color-text-muted)',
              border: filterStatus === tab.id ? '1px solid var(--color-border)' : '1px solid transparent',
              boxShadow: filterStatus === tab.id ? 'var(--shadow-sm)' : 'none'
            }}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {/* Appointments Grid */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        {filteredAppointments.map((apt) => (
          <div
            key={apt.appointment_id}
            className="card"
            style={{
              padding: '18px 22px',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              flexWrap: 'wrap',
              gap: '14px',
              borderLeft: apt.status === 'arrived'
                ? '5px solid var(--color-warning)'
                : apt.status === 'in_consultation'
                ? '5px solid var(--color-primary)'
                : apt.status === 'completed'
                ? '5px solid var(--color-success)'
                : '5px solid var(--color-border)'
            }}
          >
            {/* Left: Time & Patient */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
              <div style={{
                minWidth: '110px',
                padding: '8px 10px',
                backgroundColor: 'var(--color-surface-subtle)',
                borderRadius: '10px',
                textAlign: 'center',
                border: '1px solid var(--color-border)'
              }}>
                <div style={{ fontSize: '0.875rem', fontWeight: '700', color: 'var(--color-text-main)' }}>
                  {apt.time_label?.split('-')[0] || '10:00 AM'}
                </div>
                <div style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)' }}>
                  {apt.room || 'Clinic Suite'}
                </div>
              </div>

              <div>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                  <span style={{ fontWeight: '700', fontSize: '1.0625rem', color: 'var(--color-text-main)' }}>
                    {apt.patient_name}
                  </span>
                  {getStatusBadge(apt.status)}
                </div>

                <div style={{ display: 'flex', alignItems: 'center', gap: '12px', fontSize: '0.8125rem', color: 'var(--color-text-muted)', marginTop: '3px' }}>
                  <span>{apt.service_name}</span>
                  <span>•</span>
                  <span style={{ display: 'flex', alignItems: 'center', gap: '4px' }}>
                    <StethoscopeIcon size={13} color="var(--color-primary)" />
                    {apt.doctor_name}
                  </span>
                  <span>•</span>
                  <span>{apt.patient_phone}</span>
                </div>

                {apt.arrival_at && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-warning-text)', marginTop: '4px', fontWeight: '500' }}>
                    🕒 Arrival: {apt.arrival_at}
                  </div>
                )}
                {apt.follow_up_scheduled && (
                  <div style={{ fontSize: '0.75rem', color: 'var(--color-success-text)', marginTop: '4px', fontWeight: '500' }}>
                    🗓️ Follow-up scheduled for: {apt.follow_up_scheduled}
                  </div>
                )}
              </div>
            </div>

            {/* Right: 1-Click Status Transitions */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
              {apt.status === 'confirmed' && (
                <button
                  onClick={() => updateVisitStatus(apt.appointment_id, 'arrived')}
                  className="btn btn-warning btn-sm"
                  style={{ backgroundColor: 'var(--color-warning)', color: 'white' }}
                >
                  ➡️ Mark Arrived
                </button>
              )}

              {apt.status === 'arrived' && (
                <button
                  onClick={() => updateVisitStatus(apt.appointment_id, 'in_consultation')}
                  className="btn btn-primary btn-sm"
                >
                  🩺 In Consultation
                </button>
              )}

              {apt.status === 'in_consultation' && (
                <button
                  onClick={() => setSelectedAppointmentForCompletion(apt)}
                  className="btn btn-success btn-sm"
                >
                  ✅ Completed
                </button>
              )}

              {['confirmed', 'arrived'].includes(apt.status) && (
                <button
                  onClick={() => updateVisitStatus(apt.appointment_id, 'no_show')}
                  className="btn btn-ghost btn-sm"
                  style={{ color: 'var(--color-danger)' }}
                >
                  ⚠️ Mark No-Show
                </button>
              )}
            </div>
          </div>
        ))}

        {filteredAppointments.length === 0 && (
          <div style={{
            padding: '40px',
            textAlign: 'center',
            backgroundColor: 'var(--color-surface)',
            borderRadius: '16px',
            border: '1px dashed var(--color-border)',
            color: 'var(--color-text-muted)'
          }}>
            No visits matching current filter.
          </div>
        )}
      </div>

      {/* Completion & Follow-up Modal */}
      <FollowUpCompletionModal
        appointment={selectedAppointmentForCompletion}
        isOpen={Boolean(selectedAppointmentForCompletion)}
        onClose={() => setSelectedAppointmentForCompletion(null)}
        onCompleteWithFollowUp={completeWithFollowUp}
      />
    </div>
  );
};
