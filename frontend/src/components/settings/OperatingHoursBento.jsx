import React from 'react';
import { Clock, Coffee, CalendarCheck2, Power } from 'lucide-react';

export const OperatingHoursBento = ({
  operatingHours,
  onToggleDay,
  onUpdateDayHours,
  operationalStats,
}) => {
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
              Configure clinic opening times, sanitization lunch intervals, and closed days.
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

      <div className="hours-schedule-table">
        <div className="hours-table-head">
          <div className="col-day">Day of Week</div>
          <div className="col-status">Status</div>
          <div className="col-times">Open – Close Hours</div>
          <div className="col-lunch">
            <Coffee size={12} style={{ marginRight: '4px', verticalAlign: 'middle' }} />
            Lunch Break Interval
          </div>
          <div className="col-duration">Net Shift</div>
        </div>

        <div className="hours-table-body">
          {operatingHours.map((d) => {
            let durationText = 'Closed';
            if (d.isOpen && d.openTime && d.closeTime) {
              const [oH, oM] = d.openTime.split(':').map(Number);
              const [cH, cM] = d.closeTime.split(':').map(Number);
              let totalMins = cH * 60 + cM - (oH * 60 + oM);
              if (d.lunchStart && d.lunchEnd) {
                const [lsh, lsm] = d.lunchStart.split(':').map(Number);
                const [leh, lem] = d.lunchEnd.split(':').map(Number);
                totalMins -= (leh * 60 + lem - (lsh * 60 + lsm));
              }
              const hrs = (Math.max(0, totalMins) / 60).toFixed(1);
              durationText = `${hrs} hrs`;
            }

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
                  <div className="time-range-group">
                    <input
                      type="time"
                      className="time-picker-input tabular-nums"
                      value={d.openTime}
                      disabled={!d.isOpen}
                      onChange={(e) =>
                        onUpdateDayHours(d.dayIndex, 'openTime', e.target.value)
                      }
                    />
                    <span className="time-sep">→</span>
                    <input
                      type="time"
                      className="time-picker-input tabular-nums"
                      value={d.closeTime}
                      disabled={!d.isOpen}
                      onChange={(e) =>
                        onUpdateDayHours(d.dayIndex, 'closeTime', e.target.value)
                      }
                    />
                  </div>
                </div>

                <div className="col-lunch">
                  <div className="time-range-group">
                    <input
                      type="time"
                      className="time-picker-input tabular-nums input-lunch"
                      value={d.lunchStart}
                      disabled={!d.isOpen}
                      onChange={(e) =>
                        onUpdateDayHours(d.dayIndex, 'lunchStart', e.target.value)
                      }
                    />
                    <span className="time-sep">→</span>
                    <input
                      type="time"
                      className="time-picker-input tabular-nums input-lunch"
                      value={d.lunchEnd}
                      disabled={!d.isOpen}
                      onChange={(e) =>
                        onUpdateDayHours(d.dayIndex, 'lunchEnd', e.target.value)
                      }
                    />
                  </div>
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
