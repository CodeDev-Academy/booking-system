import React from 'react';
import { Clock, Coffee, CalendarCheck2, Power } from 'lucide-react';

/**
 * Clinic hours are ONE schedule in the database: a single open/close pair and
 * a single lunch break. The old table offered per-day time and lunch inputs,
 * but the save only kept the first day and the lunch never reached the server
 * at all. This shows the real shape: one schedule, plus per-day open/closed.
 */
export const OperatingHoursBento = ({
  operatingHours,
  clinicHours,
  lunchBreak,
  onToggleDay,
  onUpdateClinicHours,
  onUpdateLunchBreak,
  operationalStats,
}) => {
  const minutes = (hhmm) => {
    if (!hhmm) return 0;
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
  };
  const netMinutes = Math.max(0, minutes(clinicHours.closeTime) - minutes(clinicHours.openTime)
    - Math.max(0, minutes(lunchBreak.end) - minutes(lunchBreak.start)));

  return (
    <div className="settings-card">
      <div className="settings-card-header">
        <div className="settings-card-title-group">
          <div className="settings-icon-badge">
            <Clock size={18} color="var(--amber)" />
          </div>
          <div>
            <h3 className="settings-card-title">Weekly Operating Hours & Shifts</h3>
            <p className="settings-card-subtitle">
              One clinic schedule, plus the days the clinic is open.
            </p>
          </div>
        </div>
        <div className="settings-badge-group">
          <span className="badge-pill badge-neutral mono-tag tabular-nums">
            <CalendarCheck2 size={11} style={{ marginRight: '4px' }} />
            {operationalStats.weeklyHours}h / week total
          </span>
          <span className="badge-pill badge-neutral mono-tag tabular-nums">
            ~{operationalStats.totalWeeklyAppointmentsCapacity} weekly slots cap
          </span>
        </div>
      </div>

      <div className="clinic-hours-control">
        <label className="clinic-hours-field">
          <span className="clinic-hours-label">Clinic hours</span>
          <span className="time-range-group">
            <input
              type="time"
              className="time-picker-input tabular-nums"
              value={clinicHours.openTime}
              onChange={(e) => onUpdateClinicHours('openTime', e.target.value)}
            />
            <span className="time-sep">→</span>
            <input
              type="time"
              className="time-picker-input tabular-nums"
              value={clinicHours.closeTime}
              onChange={(e) => onUpdateClinicHours('closeTime', e.target.value)}
            />
          </span>
        </label>

        <label className="clinic-hours-field">
          <span className="clinic-hours-label">
            <Coffee size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Daily lunch break
          </span>
          <span className="time-range-group">
            <input
              type="time"
              className="time-picker-input tabular-nums"
              value={lunchBreak.start}
              onChange={(e) => onUpdateLunchBreak('start', e.target.value)}
            />
            <span className="time-sep">→</span>
            <input
              type="time"
              className="time-picker-input tabular-nums"
              value={lunchBreak.end}
              onChange={(e) => onUpdateLunchBreak('end', e.target.value)}
            />
          </span>
        </label>

        <span className="clinic-hours-note">
          Applies to every open day. Bookings inside the lunch break are refused.
        </span>
      </div>

      <div className="hours-schedule-table">
        <div className="hours-table-head">
          <div className="col-day">Day of Week</div>
          <div className="col-status">Status</div>
          <div className="col-times">Clinic Hours</div>
          <div className="col-duration">Net Shift</div>
        </div>

        <div className="hours-table-body">
          {operatingHours.map((d) => {
            const durationText = d.isOpen ? `${(netMinutes / 60).toFixed(1)} hrs` : 'Closed';

            return (
              <div
                key={d.dayIndex}
                className={`hours-row ${d.isOpen ? 'is-open' : 'is-closed'}`}
              >
                <div className="col-day">
                  <span className="day-name">{d.day}</span>
                  <span className="day-short-tag mono-tag">D{d.dayIndex}</span>
                </div>

                <div className="col-status">
                  <button
                    type="button"
                    className={`day-toggle-pill ${d.isOpen ? 'active' : 'inactive'}`}
                    onClick={() => onToggleDay(d.dayIndex)}
                  >
                    <Power size={11} style={{ marginRight: '4px' }} />
                    {d.isOpen ? 'Open' : 'Closed'}
                  </button>
                </div>

                <div className="col-times">
                  <span className="col-hours-text tabular-nums">
                    {d.isOpen ? `${clinicHours.openTime} – ${clinicHours.closeTime}` : '—'}
                  </span>
                </div>

                <div className="col-duration">
                  <span
                    className={`badge-pill ${
                      d.isOpen ? 'badge-neutral' : 'badge-disabled'
                    } mono-tag tabular-nums`}
                  >
                    {durationText}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
