import React from 'react';
import { Calendar as CalendarIcon, CheckCircle2, Clock, Users, ArrowRight } from 'lucide-react';
import { startOfDayOffset } from '../../services/mockData';
import { formatDayLabel } from '../../services/timeUtils';

export const CalendarWeekView = ({
  currentDateOffset,
  doctors,
  onSelectDayOffset,
}) => {
  // Generate 5 days of the week starting from base or current week
  const weekDays = [0, 1, 2, 3, 4].map((i) => {
    const offset = currentDateOffset + i;
    const ts = startOfDayOffset(offset);
    const dateObj = new Date(ts);
    const dayName = dateObj.toLocaleDateString('en-US', { weekday: 'short' });
    const dayNum = dateObj.toLocaleDateString('en-US', { day: 'numeric', month: 'short' });
    return {
      offset,
      ts,
      dayName,
      dayNum,
      isToday: i === 0,
    };
  });

  return (
    <div className="calendar-week-container">
      <div className="week-grid-row">
        {weekDays.map((day) => (
          <div
            key={day.offset}
            role="button"
            tabIndex={0}
            aria-label={`View schedule for ${day.dayName}, ${day.dayNum}`}
            className={`week-day-card ${day.isToday ? 'week-day-today' : ''}`}
            onClick={() => onSelectDayOffset(day.offset)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectDayOffset(day.offset);
              }
            }}
          >
            <div className="week-day-header">
              <div className="week-day-title">
                <span className="week-day-name">{day.dayName}</span>
                <span className="week-day-num">{day.dayNum}</span>
              </div>
              {day.isToday && (
                <span className="badge-pill badge-primary mono-tag">TODAY</span>
              )}
            </div>

            {/* Doctor Occupancy Overview */}
            <div className="week-doctor-roster">
              {doctors.map((doc, idx) => {
                // Mock realistic utilization %
                const util = (70 + (idx * 15 + day.offset * 7) % 25);
                return (
                  <div key={doc.id} className="week-doc-row">
                    <div className="week-doc-info">
                      <span className="week-doc-name">{doc.name}</span>
                      <span className="week-doc-util tabular-nums">{util}%</span>
                    </div>
                    <div className="week-util-bar-track">
                      <div
                        className="week-util-bar-fill"
                        style={{ width: `${util}%` }}
                      />
                    </div>
                  </div>
                );
              })}
            </div>

            <div className="week-day-footer">
              <span className="week-view-prompt">Inspect Day Schedule</span>
              <ArrowRight size={13} color="var(--amber)" />
            </div>
          </div>
        ))}
      </div>
    </div>
  );
};
