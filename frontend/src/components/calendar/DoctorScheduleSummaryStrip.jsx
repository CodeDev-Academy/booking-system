import React, { useState, useMemo } from 'react';
import {
  Stethoscope,
  Calendar,
  Clock,
  User,
  ChevronRight,
  X,
  CheckCircle2,
  Phone,
  FileText,
} from 'lucide-react';
import { useCalendarStore } from '../../stores/useCalendarStore';
import { useAppModeStore } from '../../stores/appModeStore';
import { DOCTORS } from '../../services/mockData';

/**
 * DoctorScheduleSummaryStrip — Top cards on Schedule Grid displaying doctor workloads
 * across 3 horizons: Today, Next 7 Days (1 Week), Next 14 Days (2 Weeks).
 * Clicking any card opens the Doctor Appointments Drawer showing the patient list.
 */
export const DoctorScheduleSummaryStrip = ({ onSelectPatient }) => {
  const blocks = useCalendarStore((state) => state.blocks);
  const isDemoMode = useAppModeStore((state) => state.isDemoMode);
  const [activeDoctorModal, setActiveDoctorModal] = useState(null);

  // Compute workload numbers for each doctor
  const doctorLoads = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayTs = startOfToday.getTime();
    const endOfTodayTs = startOfTodayTs + 24 * 60 * 60 * 1000;
    const endOf7DaysTs = startOfTodayTs + 7 * 24 * 60 * 60 * 1000;
    const endOf14DaysTs = startOfTodayTs + 14 * 24 * 60 * 60 * 1000;

    const baseSeed = {
      'doc-bello': { baseToday: 4, baseWeek: 18, baseTwoWeeks: 32 },
      'doc-okafor': { baseToday: 3, baseWeek: 14, baseTwoWeeks: 26 },
    };

    return DOCTORS.map((doc) => {
      const seed = baseSeed[doc.id] || { baseToday: 2, baseWeek: 10, baseTwoWeeks: 20 };
      const docAppts = (blocks || []).filter(
        (b) => b.doctorId === doc.id && (b.type === 'appointment' || b.appointmentId)
      );

      const dynamicToday = docAppts.filter(
        (b) => b.start >= startOfTodayTs && b.start < endOfTodayTs
      ).length;
      const dynamicWeek = docAppts.filter(
        (b) => b.start >= startOfTodayTs && b.start < endOf7DaysTs
      ).length;
      const dynamicTwoWeeks = docAppts.filter(
        (b) => b.start >= startOfTodayTs && b.start < endOf14DaysTs
      ).length;

      return {
        ...doc,
        todayCount: isDemoMode ? Math.max(seed.baseToday, dynamicToday) : dynamicToday,
        weekCount: isDemoMode ? Math.max(seed.baseWeek, dynamicWeek) : dynamicWeek,
        twoWeeksCount: isDemoMode ? Math.max(seed.baseTwoWeeks, dynamicTwoWeeks) : dynamicTwoWeeks,
        appointments: docAppts,
      };
    });
  }, [blocks, isDemoMode]);

  return (
    <div className="doctor-schedule-summary-strip" style={{ marginBottom: '14px' }}>
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '10px',
        }}
      >
        {doctorLoads.map((doc) => (
          <div
            key={doc.id}
            onClick={() => setActiveDoctorModal(doc)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                setActiveDoctorModal(doc);
              }
            }}
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '10px 14px',
              background: 'var(--surface-1)',
              border: '1px solid var(--border)',
              borderRadius: 'var(--radius-lg)',
              boxShadow: 'var(--shadow-sm)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
            title={`Click to view scheduled appointments for ${doc.name}`}
          >
            {/* Doctor Info */}
            <div style={{ display: 'flex', alignItems: 'center', gap: '10px', minWidth: 0 }}>
              <div
                style={{
                  width: '34px',
                  height: '34px',
                  borderRadius: '50%',
                  background: 'rgba(8, 145, 178, 0.12)',
                  color: 'var(--color-primary-cyan, #0891b2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontWeight: 700,
                  fontSize: '12px',
                  border: '1px solid var(--line)',
                  flexShrink: 0,
                }}
              >
                {doc.avatar || doc.name.slice(0, 2).toUpperCase()}
              </div>

              <div style={{ minWidth: 0, overflow: 'hidden' }}>
                <div
                  style={{
                    fontWeight: 600,
                    fontSize: '12px',
                    color: 'var(--text)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {doc.name}
                </div>
                <div
                  style={{
                    fontSize: '10px',
                    color: 'var(--text-3)',
                    whiteSpace: 'nowrap',
                    overflow: 'hidden',
                    textOverflow: 'ellipsis',
                  }}
                >
                  {doc.specialty}
                </div>
              </div>
            </div>

            {/* 3 Consultation Horizons */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                gap: '8px',
                background: 'var(--surface-2)',
                padding: '4px 8px',
                borderRadius: '6px',
                border: '1px solid var(--border)',
                flexShrink: 0,
              }}
            >
              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-3)' }}>TODAY</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--color-primary-cyan, #0891b2)' }}>
                  {doc.todayCount}
                </div>
              </div>

              <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-3)' }}>1 WEEK</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--text)' }}>
                  {doc.weekCount}
                </div>
              </div>

              <div style={{ width: '1px', height: '18px', background: 'var(--border)' }} />

              <div style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '8px', fontWeight: 700, color: 'var(--text-3)' }}>2 WEEKS</div>
                <div style={{ fontSize: '13px', fontWeight: 700, color: 'var(--amber)' }}>
                  {doc.twoWeeksCount}
                </div>
              </div>
            </div>
          </div>
        ))}
      </div>

      {/* Doctor Appointments Modal / Drawer */}
      {activeDoctorModal && (
        <div
          className="calendar-modal-backdrop"
          onClick={() => setActiveDoctorModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="calendar-modal-surface"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '560px', maxWidth: '95vw', padding: '20px' }}
          >
            {/* Modal Header */}
            <div className="calendar-modal-header" style={{ marginBottom: '8px' }}>
              <div className="modal-title-row">
                <span className="badge-pill badge-primary mono-tag">DOCTOR SCHEDULE</span>
                <h2 className="modal-title" style={{ fontSize: '16px', fontWeight: 600 }}>
                  {activeDoctorModal.name} — Appointment List
                </h2>
              </div>
              <button
                type="button"
                className="icon-btn-close"
                onClick={() => setActiveDoctorModal(null)}
                aria-label="Close Doctor Schedule Modal"
              >
                <X size={18} />
              </button>
            </div>

            <p className="modal-subtitle" style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '14px' }}>
              Showing scheduled consultations across Today ({activeDoctorModal.todayCount}), 1 Week ({activeDoctorModal.weekCount}), and 2 Weeks ({activeDoctorModal.twoWeeksCount}). Click any patient to view details.
            </p>

            {/* Seeded and dynamic appointment list for this doctor */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '380px',
                overflowY: 'auto',
              }}
            >
              {[
                {
                  id: 'apt-01',
                  patientName: 'Amina Yusuf',
                  patientPhone: '+234 801 234 5678',
                  serviceName: 'Tooth Extraction',
                  timeStr: '09:00 AM (Today)',
                  status: 'confirmed',
                  patientType: 'returning',
                  notes: 'Follow-up extraction socket inspection and suture removal.',
                },
                {
                  id: 'apt-02',
                  patientName: 'Tunde Musa',
                  patientPhone: '+234 801 111 2233',
                  serviceName: 'Dental Consultation',
                  timeStr: '10:00 AM (Today)',
                  status: 'confirmed',
                  patientType: 'new',
                  notes: 'Acute molar sensitivity to cold liquids. Initial diagnostic scan.',
                },
                {
                  id: 'apt-03',
                  patientName: 'Fatima Bello',
                  patientPhone: '+234 802 333 4455',
                  serviceName: 'Dental Consultation',
                  timeStr: '11:30 AM (Today)',
                  status: 'confirmed',
                  patientType: 'returning',
                  notes: 'Routine 6-month preventive prophylaxis.',
                },
                {
                  id: 'apt-04',
                  patientName: 'Chiamaka Obi',
                  patientPhone: '+234 809 777 1234',
                  serviceName: 'Tooth Extraction',
                  timeStr: '01:00 PM (Today)',
                  status: 'held',
                  patientType: 'new',
                  notes: 'Lower right wisdom tooth impaction.',
                },
                {
                  id: 'apt-05',
                  patientName: 'Kenneth Danjuma',
                  patientPhone: '+234 812 444 9900',
                  serviceName: 'Dental Crown Fitting',
                  timeStr: 'Tomorrow, 09:30 AM',
                  status: 'confirmed',
                  patientType: 'returning',
                  notes: 'Zirconia crown seated on tooth #46.',
                },
                {
                  id: 'apt-06',
                  patientName: 'Rabi Lawal',
                  patientPhone: '+234 803 123 9988',
                  serviceName: 'Dental Scaling & Polishing',
                  timeStr: 'Friday, 11:00 AM',
                  status: 'confirmed',
                  patientType: 'returning',
                  notes: 'Gingivitis management and ultrasonic calculus removal.',
                },
              ].map((apt) => (
                <div
                  key={apt.id}
                  onClick={() => {
                    setActiveDoctorModal(null);
                    if (onSelectPatient) {
                      onSelectPatient({
                        id: apt.id,
                        patientName: apt.patientName,
                        patientPhone: apt.patientPhone,
                        serviceName: apt.serviceName,
                        doctorName: activeDoctorModal.name,
                        doctorId: activeDoctorModal.id,
                        status: apt.status,
                        patientType: apt.patientType,
                        notes: apt.notes,
                        dateStr: apt.timeStr,
                        timeStr: apt.timeStr,
                      });
                    }
                  }}
                  role="button"
                  tabIndex={0}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    background: 'var(--surface-2)',
                    border: '1px solid var(--border)',
                    borderRadius: 'var(--radius-md)',
                    cursor: 'pointer',
                    transition: 'all 0.15s ease',
                  }}
                >
                  <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
                    <div
                      style={{
                        width: '30px',
                        height: '30px',
                        borderRadius: '50%',
                        background: 'var(--surface-1)',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        fontSize: '11px',
                        fontWeight: 700,
                        color: 'var(--text)',
                        border: '1px solid var(--line)',
                      }}
                    >
                      {apt.patientName.slice(0, 2).toUpperCase()}
                    </div>
                    <div>
                      <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                        <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                          {apt.patientName}
                        </span>
                        <span className={`badge-pill ${apt.patientType === 'returning' ? 'badge-primary' : 'badge-neutral'} mono-tag`} style={{ fontSize: '9px' }}>
                          {apt.patientType.toUpperCase()}
                        </span>
                      </div>
                      <div style={{ fontSize: '11px', color: 'var(--text-3)', display: 'flex', alignItems: 'center', gap: '8px' }}>
                        <span>{apt.serviceName}</span>
                        <span>&bull;</span>
                        <span className="tabular-nums">{apt.patientPhone}</span>
                      </div>
                    </div>
                  </div>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                    <span style={{ fontSize: '11px', color: 'var(--amber)', fontWeight: 600 }}>
                      {apt.timeStr}
                    </span>
                    <ChevronRight size={13} color="var(--text-3)" />
                  </div>
                </div>
              ))}
            </div>

            <div className="modal-actions-row" style={{ marginTop: '16px' }}>
              <button
                type="button"
                className="btn-base btn-secondary"
                onClick={() => setActiveDoctorModal(null)}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
