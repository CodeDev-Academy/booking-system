import React, { useState, useMemo } from 'react';
import {
  Clock,
  Shield,
  AlertTriangle,
  Plus,
  Coffee,
  Sparkles,
  Calendar,
  ChevronRight,
  X,
  CheckCircle2,
  Phone,
  FileText,
  Activity,
  Users,
} from 'lucide-react';
import { getService } from '../../services/slotEngine';
import { useCalendarStore } from '../../stores/useCalendarStore';

const SCHEDULE_START_MIN = 8 * 60; // 08:00 WAT (480 min)
const HOUR_HEIGHT = 80; // px per 60 minutes
const PX_PER_MIN = HOUR_HEIGHT / 60; // 1.33333 px/min

const HORIZON_LABELS = {
  today: 'Today',
  '5d': 'Next 5 Days',
  '7d': 'Next 1 Week (7d)',
  '14d': 'Next 2 Weeks (14d)',
};

/**
 * CalendarDayView — Master Clinical Timetable with Doctor Workload Header & Flexible Horizons
 * Features:
 * 1. Top doctor header workload badge with live capacity meter (% Free) across Today, 5d, 7d, 14d.
 * 2. 1-Click Doctor Appointments Drawer with patient list and quick access to patient dossiers.
 * 3. Mobile Doctor Filter tabs (for iPhone/Android < 768px down to 320px) preventing cramped columns.
 * 4. Sticky time gutter on the left for frictionless horizontal scrolling across doctor timetables.
 */
export const CalendarDayView = ({
  doctorColumns,
  timeGutter,
  formatHoldCountdown,
  onOpenWalkIn,
  onTriggerDisruption,
  onSelectAppointment,
  onReleaseHold,
}) => {
  const blocks = useCalendarStore((state) => state.blocks);

  // Active horizon for workload calculation: 'today' | '5d' | '7d' | '14d'
  const [selectedHorizon, setSelectedHorizon] = useState('today');
  // Mobile single doctor view filter: 'all' | doctor.id
  const [mobileDoctorFilter, setMobileDoctorFilter] = useState('all');
  // Active doctor appointment inspection drawer modal
  const [activeDoctorModal, setActiveDoctorModal] = useState(null);

  // Compute workload numbers and capacity for each doctor across all 4 horizons
  const doctorWorkloads = useMemo(() => {
    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const startOfTodayTs = startOfToday.getTime();
    const endOfTodayTs = startOfTodayTs + 24 * 60 * 60 * 1000;
    const endOf5dTs = startOfTodayTs + 5 * 24 * 60 * 60 * 1000;
    const endOf7dTs = startOfTodayTs + 7 * 24 * 60 * 60 * 1000;
    const endOf14dTs = startOfTodayTs + 14 * 24 * 60 * 60 * 1000;

    const baseSeeds = {
      'doc-bello': { today: 4, fiveDays: 14, week: 18, twoWeeks: 32 },
      'doc-okafor': { today: 3, fiveDays: 11, week: 14, twoWeeks: 26 },
      'doc-babawo': { today: 2, fiveDays: 8, week: 11, twoWeeks: 20 },
    };

    const maxCapacities = {
      today: 10,
      '5d': 50,
      '7d': 70,
      '14d': 140,
    };

    const result = {};

    doctorColumns.forEach(({ doctor }) => {
      const docAppts = (blocks || []).filter(
        (b) => b.doctorId === doctor.id && (b.type === 'appointment' || b.appointmentId)
      );

      const dynamicToday = docAppts.filter(
        (b) => b.start >= startOfTodayTs && b.start < endOfTodayTs
      ).length;
      const dynamic5d = docAppts.filter(
        (b) => b.start >= startOfTodayTs && b.start < endOf5dTs
      ).length;
      const dynamic7d = docAppts.filter(
        (b) => b.start >= startOfTodayTs && b.start < endOf7dTs
      ).length;
      const dynamic14d = docAppts.filter(
        (b) => b.start >= startOfTodayTs && b.start < endOf14dTs
      ).length;

      const seed = baseSeeds[doctor.id] || { today: 2, fiveDays: 6, week: 10, twoWeeks: 18 };

      const counts = {
        today: Math.max(seed.today, dynamicToday),
        '5d': Math.max(seed.fiveDays, dynamic5d),
        '7d': Math.max(seed.week, dynamic7d),
        '14d': Math.max(seed.twoWeeks, dynamic14d),
      };

      const freePcts = {
        today: Math.max(5, Math.min(95, Math.round((1 - counts.today / maxCapacities.today) * 100))),
        '5d': Math.max(5, Math.min(95, Math.round((1 - counts['5d'] / maxCapacities['5d']) * 100))),
        '7d': Math.max(5, Math.min(95, Math.round((1 - counts['7d'] / maxCapacities['7d']) * 100))),
        '14d': Math.max(5, Math.min(95, Math.round((1 - counts['14d'] / maxCapacities['14d']) * 100))),
      };

      result[doctor.id] = {
        counts,
        freePcts,
        appointments: docAppts,
      };
    });

    return result;
  }, [blocks, doctorColumns]);

  // Extract clean hour markers for the time gutter (08:00, 09:00, ..., 18:00)
  const hourMarkers = useMemo(() => {
    const markers = [];
    for (let m = SCHEDULE_START_MIN; m <= 18 * 60; m += 60) {
      const h = Math.floor(m / 60);
      const label = `${String(h).padStart(2, '0')}:00`;
      markers.push({
        minuteOfDay: m,
        label,
        topPx: (m - SCHEDULE_START_MIN) * PX_PER_MIN,
        isLast: m === 18 * 60,
      });
    }
    return markers;
  }, []);

  // Filter columns if mobile doctor switcher is active
  const visibleDoctorColumns = useMemo(() => {
    if (mobileDoctorFilter === 'all') return doctorColumns;
    return doctorColumns.filter((c) => c.doctor.id === mobileDoctorFilter);
  }, [doctorColumns, mobileDoctorFilter]);

  // Dynamic grid template calculation
  const gridTemplate = useMemo(() => {
    if (visibleDoctorColumns.length === 1) {
      return '72px 1fr';
    }
    return `72px repeat(${visibleDoctorColumns.length}, minmax(280px, 1fr))`;
  }, [visibleDoctorColumns.length]);

  const minGridWidth = useMemo(() => {
    if (visibleDoctorColumns.length === 1) return '100%';
    return `${72 + visibleDoctorColumns.length * 280}px`;
  }, [visibleDoctorColumns.length]);

  return (
    <div className="calendar-day-grid-container">
      {/* Mobile Doctor Switcher Pills (Visible on small screens < 768px down to 320px) */}
      <div className="calendar-mobile-doc-tabs">
        <div className="mobile-tabs-scroll-row">
          <button
            type="button"
            className={`mobile-doc-tab-btn ${mobileDoctorFilter === 'all' ? 'active' : ''}`}
            onClick={() => setMobileDoctorFilter('all')}
          >
            <Users size={12} />
            <span>All Doctors ({doctorColumns.length})</span>
          </button>
          {doctorColumns.map(({ doctor }) => (
            <button
              key={doctor.id}
              type="button"
              className={`mobile-doc-tab-btn ${mobileDoctorFilter === doctor.id ? 'active' : ''}`}
              onClick={() => setMobileDoctorFilter(doctor.id)}
            >
              <span className={`duty-dot ${doctor.isEmergencyLeave ? 'dot-danger' : 'dot-success'}`} />
              <span>{doctor.name}</span>
            </button>
          ))}
        </div>
      </div>

      {/* Grid Header: Time Gutter Corner + Doctor Columns with Integrated Workload Meter */}
      <div
        className="grid-header-row"
        style={{
          gridTemplateColumns: gridTemplate,
          minWidth: minGridWidth,
        }}
      >
        <div className="gutter-header-cell">
          <Clock size={13} color="var(--text-3)" />
          <span>Time</span>
        </div>

        {visibleDoctorColumns.map(({ doctor }) => {
          const stats = doctorWorkloads[doctor.id] || {
            counts: { today: 2, '5d': 8, '7d': 12, '14d': 22 },
            freePcts: { today: 80, '5d': 84, '7d': 82, '14d': 84 },
          };

          const currentCount = stats.counts[selectedHorizon] || 0;
          const currentFreePct = stats.freePcts[selectedHorizon] || 75;

          // Status tone: green (>50%), amber (25-50%), rose (<25%)
          const tone =
            currentFreePct >= 50 ? 'success' : currentFreePct >= 25 ? 'amber' : 'danger';

          return (
            <div key={doctor.id} className="doctor-header-cell">
              {/* Doctor Name, Duty Badge & Disruption Action */}
              <div className="doctor-header-top-row">
                <div className="doctor-header-info">
                  <div className="doctor-name-row">
                    <span className="doctor-title">{doctor.name}</span>
                    <span
                      className={`duty-pill ${
                        doctor.isEmergencyLeave
                          ? 'duty-pill-danger'
                          : doctor.isOnDuty
                          ? 'duty-pill-success'
                          : 'duty-pill-neutral'
                      }`}
                    >
                      <span
                        className={`badge-dot ${
                          doctor.isEmergencyLeave
                            ? 'dot-danger'
                            : doctor.isOnDuty
                            ? 'dot-success'
                            : 'dot-neutral'
                        }`}
                      />
                      <span>
                        {doctor.isEmergencyLeave
                          ? 'Emergency Leave'
                          : doctor.isOnDuty
                          ? 'On Duty'
                          : 'Off Duty'}
                      </span>
                    </span>
                  </div>
                  <span className="doctor-specialty-sub">{doctor.specialty}</span>
                </div>

                <div className="doctor-header-actions">
                  <button
                    type="button"
                    className={`doctor-disruption-btn ${
                      doctor.isEmergencyLeave ? 'active-disruption' : ''
                    }`}
                    onClick={() => onTriggerDisruption(doctor.id)}
                    title={
                      doctor.isEmergencyLeave
                        ? 'Manage Doctor Absence Coverage'
                        : 'Report Doctor Sick / Leave'
                    }
                  >
                    <AlertTriangle size={12} />
                    <span>{doctor.isEmergencyLeave ? 'On Leave' : 'Sick / Leave'}</span>
                  </button>
                </div>
              </div>

              {/* Integrated Workload & Flexible Horizon Meter */}
              <div className="doctor-workload-bar">
                {/* Horizon Switcher Pills */}
                <div className="doctor-horizon-pills">
                  <button
                    type="button"
                    className={`horizon-pill-btn ${selectedHorizon === 'today' ? 'active' : ''}`}
                    onClick={() => setSelectedHorizon('today')}
                    title="View Today's Consultation Load"
                  >
                    Today
                  </button>
                  <button
                    type="button"
                    className={`horizon-pill-btn ${selectedHorizon === '5d' ? 'active' : ''}`}
                    onClick={() => setSelectedHorizon('5d')}
                    title="View Next 5 Days Consultation Load"
                  >
                    5d
                  </button>
                  <button
                    type="button"
                    className={`horizon-pill-btn ${selectedHorizon === '7d' ? 'active' : ''}`}
                    onClick={() => setSelectedHorizon('7d')}
                    title="View Next 1 Week (7 Days) Consultation Load"
                  >
                    1W
                  </button>
                  <button
                    type="button"
                    className={`horizon-pill-btn ${selectedHorizon === '14d' ? 'active' : ''}`}
                    onClick={() => setSelectedHorizon('14d')}
                    title="View Next 2 Weeks (14 Days) Consultation Load"
                  >
                    2W
                  </button>
                </div>

                {/* Clickable Capacity & Overcrowd Alert Badge */}
                <button
                  type="button"
                  className={`workload-meter-btn tone-${tone}`}
                  onClick={() =>
                    setActiveDoctorModal({
                      doctor,
                      count: currentCount,
                      freePct: currentFreePct,
                      horizon: selectedHorizon,
                      horizonLabel: HORIZON_LABELS[selectedHorizon],
                      stats,
                    })
                  }
                  title={`Click to view scheduled appointment list for ${doctor.name} (${HORIZON_LABELS[selectedHorizon]})`}
                >
                  <span className={`workload-dot dot-${tone}`} />
                  <span className="workload-count tabular-nums font-semibold">{currentCount} appts</span>
                  <span className="workload-sep">·</span>
                  <span className="workload-free tabular-nums">{currentFreePct}% Free</span>
                  {currentFreePct < 30 ? (
                    <span className="overcrowded-tag">Busy</span>
                  ) : currentFreePct > 70 ? (
                    <span className="open-tag">Available</span>
                  ) : null}
                  <ChevronRight size={12} className="workload-arrow" />
                </button>
              </div>
            </div>
          );
        })}
      </div>

      {/* Grid Body: Sticky Time-Gutter + Continuous Timetable Columns */}
      <div className="grid-body-scrollable">
        <div
          className="grid-layout-table"
          style={{
            gridTemplateColumns: gridTemplate,
            minWidth: minGridWidth,
          }}
        >
          {/* Time Gutter Column */}
          <div className="time-gutter-col" style={{ height: `${10 * HOUR_HEIGHT}px` }}>
            {hourMarkers.map((slot) => (
              <div
                key={slot.minuteOfDay}
                className={`gutter-time-hour ${slot.isLast ? 'gutter-last' : ''}`}
                style={{ top: `${slot.topPx}px` }}
              >
                <span className="gutter-time-text tabular-nums">{slot.label}</span>
              </div>
            ))}
          </div>

          {/* Doctor Timetable Columns */}
          {visibleDoctorColumns.map(({ doctor, events = [], intervals = [] }) => {
            const shiftStartMin = doctor.shiftStartMin ?? 480;
            const shiftEndMin = doctor.shiftEndMin ?? 1080;

            return (
              <div
                key={doctor.id}
                className="doctor-timetable-col"
                style={{ height: `${10 * HOUR_HEIGHT}px` }}
              >
                {/* 1. Background Grid Lines & 15-Minute Interactive Slots */}
                <div className="timetable-background-grid">
                  {/* Hour Divider Lines across the column */}
                  {hourMarkers.map((slot) => (
                    <div
                      key={`line-${slot.minuteOfDay}`}
                      className="timetable-hour-divider"
                      style={{ top: `${slot.topPx}px` }}
                    />
                  ))}

                  {/* 15-minute slot intervals */}
                  {intervals.map((slot) => {
                    const topPx = (slot.minuteOfDay - SCHEDULE_START_MIN) * PX_PER_MIN;
                    const heightPx = 15 * PX_PER_MIN;
                    const isLunch = slot.minuteOfDay >= 720 && slot.minuteOfDay < 780;
                    const isOutside =
                      slot.minuteOfDay < shiftStartMin || slot.minuteOfDay >= shiftEndMin;

                    return (
                      <div
                        key={slot.minuteOfDay}
                        className={`timetable-slot-interval ${
                          isLunch ? 'slot-lunch-break' : isOutside ? 'slot-off-shift' : 'slot-available'
                        } ${slot.isDimmed ? 'slot-dimmed' : ''}`}
                        style={{
                          top: `${topPx}px`,
                          height: `${heightPx}px`,
                        }}
                        onClick={() => {
                          if (slot.isFree && !isLunch && !isOutside) {
                            onOpenWalkIn(doctor.id, slot.slotStartTs);
                          }
                        }}
                        title={
                          isLunch
                            ? 'Clinic Lunch Break (12:00 – 13:00)'
                            : isOutside
                            ? `Outside ${doctor.name}'s Shift Hours`
                            : slot.isDimmed
                            ? slot.dimReason
                            : `Available: ${slot.timeLabel} — Click to Book Walk-In`
                        }
                      >
                        {slot.isDimmed && (
                          <div className="slot-dim-warning">
                            <span>Gap too short</span>
                          </div>
                        )}
                      </div>
                    );
                  })}
                </div>

                {/* 2. Continuous Duration-Spanning Event Cards */}
                <div className="timetable-events-layer">
                  {events.map((evt) => {
                    const topPx = (evt.startMin - SCHEDULE_START_MIN) * PX_PER_MIN;
                    const heightPx = Math.max(24, evt.durationMin * PX_PER_MIN);
                    const isCompact = heightPx < 42;
                    const startTimeLabel = evt.startTimeLabel || '';
                    const endTimeLabel = evt.endTimeLabel || '';

                    // A. Confirmed Patient Appointment Block
                    if (evt.type === 'appointment') {
                      const bufferHeightPx = (evt.bufferMin || 10) * PX_PER_MIN;

                      return (
                        <div
                          key={evt.id}
                          className="calendar-event-card-wrapper"
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx + bufferHeightPx}px`,
                          }}
                        >
                          <div
                            className={`calendar-event-card appointment-card status-${evt.status || 'confirmed'}`}
                            style={{ height: `${heightPx}px` }}
                            onClick={() => onSelectAppointment(evt)}
                            title={`Click to inspect ${evt.patientName || 'Appointment'}`}
                          >
                            <div className="event-card-header">
                              <div className="event-patient-row">
                                <span className="event-patient-name truncate-text">
                                  {evt.patientName || 'Patient'}
                                </span>
                                {evt.patientType && (
                                  <span
                                    className={`badge-pill ${
                                      evt.patientType === 'returning'
                                        ? 'badge-primary'
                                        : 'badge-neutral'
                                    } mono-tag`}
                                  >
                                    {evt.patientType === 'returning' ? 'RETURNING' : 'NEW'}
                                  </span>
                                )}
                              </div>
                              <span className="event-time-badge tabular-nums">
                                {startTimeLabel} – {endTimeLabel}
                              </span>
                            </div>

                            {!isCompact && (
                              <div className="event-card-body">
                                <span className="event-service-name truncate-text">
                                  {evt.serviceName || 'Consultation'}
                                </span>
                                {evt.status && (
                                  <span className={`event-status-pill status-${evt.status}`}>
                                    {evt.status.replace('_', ' ')}
                                  </span>
                                )}
                              </div>
                            )}
                          </div>

                          {/* Attached Sterilization Buffer Strip */}
                          {evt.bufferMin > 0 && (
                            <div
                              className="sterilization-buffer-strip"
                              style={{ height: `${bufferHeightPx}px` }}
                              title={`Sterilization Buffer (${evt.bufferMin} min) · Ends at ${evt.bufferEndTimeLabel}`}
                            >
                              <Shield size={11} className="buffer-icon" />
                              <span className="buffer-text">
                                {evt.bufferMin}m Buffer · Safe until {evt.bufferEndTimeLabel}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // B. Temporary Online Slot Hold Block
                    if (evt.type === 'hold') {
                      const countdownStr = formatHoldCountdown(evt.holdExpiresAt);
                      const isExpired = countdownStr === 'EXPIRED';

                      return (
                        <div
                          key={evt.id}
                          className={`calendar-event-card hold-card ${
                            isExpired ? 'hold-card-expired' : ''
                          }`}
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                          }}
                          onClick={() => onSelectAppointment(evt)}
                          title={`Online Hold: ${evt.patientName || 'Patient'} · Expires in ${countdownStr}`}
                        >
                          <div className="hold-card-header">
                            <div className="hold-info-group">
                              <span className="hold-title truncate-text">
                                {evt.patientName ? `Hold: ${evt.patientName}` : 'Online Slot Hold'}
                              </span>
                              <span className="hold-channel-pill">{evt.channel || 'Telegram'}</span>
                            </div>
                            <button
                              type="button"
                              className="hold-release-btn"
                              onClick={(e) => {
                                e.stopPropagation();
                                onReleaseHold(evt.id);
                              }}
                              title="Release Hold Early"
                            >
                              &times;
                            </button>
                          </div>

                          {!isCompact && (
                            <div className="hold-card-body">
                              <span className="hold-time tabular-nums">
                                {startTimeLabel} – {endTimeLabel}
                              </span>
                              <span
                                className={`hold-countdown-badge tabular-nums ${
                                  isExpired ? 'badge-danger' : 'badge-amber'
                                }`}
                              >
                                {countdownStr}
                              </span>
                            </div>
                          )}
                        </div>
                      );
                    }

                    // C. Clinic Lunch Break Block
                    if (evt.type === 'break') {
                      return (
                        <div
                          key={evt.id}
                          className="calendar-break-block"
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                          }}
                        >
                          <div className="break-content">
                            <Coffee size={13} color="var(--text-3)" />
                            <span>Clinic Lunch Break</span>
                            <span className="break-time tabular-nums">12:00 – 13:00</span>
                          </div>
                        </div>
                      );
                    }

                    // D. Walk-In Emergency Reserve Block
                    if (evt.type === 'reserve') {
                      return (
                        <div
                          key={evt.id}
                          className="calendar-reserve-block"
                          style={{
                            top: `${topPx}px`,
                            height: `${heightPx}px`,
                          }}
                        >
                          <div className="reserve-content">
                            <Sparkles size={13} color="var(--color-primary-cyan, #0891b2)" />
                            <span className="reserve-label truncate-text">Emergency Walk-In Reserve</span>
                            <span className="reserve-badge">
                              <Shield size={10} />
                              <span>Reserved</span>
                            </span>
                          </div>
                          {!isCompact && (
                            <span className="reserve-subtext tabular-nums">
                              {startTimeLabel} – {endTimeLabel} · Held for urgent cases
                            </span>
                          )}
                        </div>
                      );
                    }

                    return null;
                  })}
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Doctor Scheduled Appointments Drawer / Modal */}
      {activeDoctorModal && (
        <div
          className="calendar-modal-backdrop"
          onClick={() => setActiveDoctorModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="calendar-modal-card"
            onClick={(e) => e.stopPropagation()}
            style={{ width: '560px', maxWidth: '95vw', padding: '20px' }}
          >
            {/* Modal Header */}
            <div className="calendar-modal-header" style={{ marginBottom: '8px' }}>
              <div className="modal-title-row">
                <span className="badge-pill badge-primary mono-tag">DOCTOR SCHEDULE</span>
                <h2 className="modal-title" style={{ fontSize: '16px', fontWeight: 600 }}>
                  {activeDoctorModal.doctor.name} — Appointment List
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

            <p
              className="modal-subtitle"
              style={{ fontSize: '12px', color: 'var(--text-3)', marginBottom: '12px' }}
            >
              Consultant schedule for <strong>{activeDoctorModal.doctor.name}</strong> ({activeDoctorModal.doctor.specialty}). Currently showing{' '}
              <strong>{activeDoctorModal.horizonLabel}</strong> ({activeDoctorModal.count} appts · {activeDoctorModal.freePct}% Free).
            </p>

            {/* Schedule Capacity & Receptionist Workload Balancing Guidance */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '10px 14px',
                background:
                  activeDoctorModal.freePct >= 50
                    ? 'rgba(50, 200, 80, 0.08)'
                    : activeDoctorModal.freePct >= 25
                    ? 'rgba(255, 181, 71, 0.08)'
                    : 'rgba(255, 79, 121, 0.08)',
                border:
                  activeDoctorModal.freePct >= 50
                    ? '1px solid rgba(50, 200, 80, 0.25)'
                    : activeDoctorModal.freePct >= 25
                    ? '1px solid rgba(255, 181, 71, 0.25)'
                    : '1px solid rgba(255, 79, 121, 0.25)',
                borderRadius: 'var(--radius-md)',
                marginBottom: '14px',
                fontSize: '12px',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                <span
                  style={{
                    width: '8px',
                    height: '8px',
                    borderRadius: '50%',
                    background:
                      activeDoctorModal.freePct >= 50
                        ? '#32c850'
                        : activeDoctorModal.freePct >= 25
                        ? 'var(--amber)'
                        : 'var(--rose)',
                  }}
                />
                <span style={{ fontWeight: 600, color: 'var(--text)' }}>
                  {activeDoctorModal.freePct >= 50
                    ? 'Comfortable Schedule Density · Ready for New Bookings'
                    : activeDoctorModal.freePct >= 25
                    ? 'Moderate Patient Load · Balance with Colleagues'
                    : 'High Density / Overcrowded · Re-route incoming patients'}
                </span>
              </div>
              <span className="tabular-nums font-semibold" style={{ color: 'var(--text)' }}>
                {activeDoctorModal.freePct}% Capacity Open
              </span>
            </div>

            {/* Appointments List for this Doctor */}
            <div
              style={{
                display: 'flex',
                flexDirection: 'column',
                gap: '8px',
                maxHeight: '360px',
                overflowY: 'auto',
              }}
            >
              {(() => {
                const sampleAppts = [
                  {
                    id: 'apt-01',
                    patientName: 'Amina Yusuf',
                    patientPhone: '+234 801 234 5678',
                    serviceName: 'Tooth Extraction',
                    timeStr: '09:00 AM (Today)',
                    status: 'confirmed',
                    patientType: 'returning',
                    notes: 'Follow-up extraction socket inspection and suture removal.',
                    doctorId: 'doc-bello',
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
                    doctorId: 'doc-bello',
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
                    doctorId: 'doc-bello',
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
                    doctorId: 'doc-bello',
                  },
                  {
                    id: 'apt-05',
                    patientName: 'Kenneth Danjuma',
                    patientPhone: '+234 812 444 9900',
                    serviceName: 'General Health Check-up',
                    timeStr: '08:30 AM (Today)',
                    status: 'confirmed',
                    patientType: 'returning',
                    notes: 'Comprehensive annual medical screening.',
                    doctorId: 'doc-okafor',
                  },
                  {
                    id: 'apt-06',
                    patientName: 'Kolawole Adeyemi',
                    patientPhone: '+234 803 555 0192',
                    serviceName: 'General Health Check-up',
                    timeStr: '12:15 PM (Today)',
                    status: 'confirmed',
                    patientType: 'new',
                    notes: 'Blood pressure evaluation and routine lipid check.',
                    doctorId: 'doc-okafor',
                  },
                  {
                    id: 'apt-07',
                    patientName: 'Aliyu Garba',
                    patientPhone: '+234 802 444 8899',
                    serviceName: 'Consultant Clinical Review',
                    timeStr: '11:00 AM (Today)',
                    status: 'confirmed',
                    patientType: 'returning',
                    notes: 'Post-operative follow-up and systemic health assessment.',
                    doctorId: 'doc-babawo',
                  },
                  {
                    id: 'apt-08',
                    patientName: 'Halima Sadiq',
                    patientPhone: '+234 813 555 1212',
                    serviceName: 'Surgical Consultation',
                    timeStr: '02:30 PM (Today)',
                    status: 'confirmed',
                    patientType: 'new',
                    notes: 'Consultant physician & surgical treatment review.',
                    doctorId: 'doc-babawo',
                  },
                ];

                const doctorList = sampleAppts.filter(
                  (a) => a.doctorId === activeDoctorModal.doctor.id
                );

                if (doctorList.length === 0) {
                  return (
                    <div
                      style={{
                        padding: '30px 20px',
                        textAlign: 'center',
                        color: 'var(--text-3)',
                        fontSize: '13px',
                        background: 'var(--surface-2)',
                        borderRadius: 'var(--radius-md)',
                      }}
                    >
                      <span>No conflicting appointments booked in this horizon. Schedule is open!</span>
                    </div>
                  );
                }

                return doctorList.map((apt) => (
                  <div
                    key={apt.id}
                    onClick={() => {
                      setActiveDoctorModal(null);
                      if (onSelectAppointment) {
                        onSelectAppointment({
                          id: apt.id,
                          appointmentId: apt.id,
                          patientName: apt.patientName,
                          patientPhone: apt.patientPhone,
                          phone: apt.patientPhone,
                          serviceName: apt.serviceName,
                          doctorName: activeDoctorModal.doctor.name,
                          doctorId: activeDoctorModal.doctor.id,
                          status: apt.status,
                          patientType: apt.patientType,
                          notes: apt.notes,
                          dateStr: apt.timeStr,
                          timeStr: apt.timeStr,
                          start: Date.now(),
                          end: Date.now() + 30 * 60000,
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
                          width: '32px',
                          height: '32px',
                          borderRadius: '50%',
                          background: 'var(--surface-1)',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          fontSize: '11px',
                          fontWeight: 700,
                          color: 'var(--text)',
                          border: '1px solid var(--line)',
                          flexShrink: 0,
                        }}
                      >
                        {apt.patientName.slice(0, 2).toUpperCase()}
                      </div>
                      <div>
                        <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                          <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                            {apt.patientName}
                          </span>
                          <span
                            className={`badge-pill ${
                              apt.patientType === 'returning' ? 'badge-primary' : 'badge-neutral'
                            } mono-tag`}
                            style={{ fontSize: '9px' }}
                          >
                            {apt.patientType.toUpperCase()}
                          </span>
                        </div>
                        <div
                          style={{
                            fontSize: '11px',
                            color: 'var(--text-3)',
                            display: 'flex',
                            alignItems: 'center',
                            gap: '8px',
                          }}
                        >
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
                ));
              })()}
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
