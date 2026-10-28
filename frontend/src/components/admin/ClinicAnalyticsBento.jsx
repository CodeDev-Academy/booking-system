import React from 'react';
import {
  Download,
  Clock,
  CheckCircle2,
  AlertTriangle,
  FileSpreadsheet,
  Zap,
  Activity,
  Layers,
  HelpCircle,
} from 'lucide-react';

const HOURLY_DISTRIBUTION = [
  { hour: '08:00', count: 4, heightPct: 40 },
  { hour: '09:00', count: 7, heightPct: 70 },
  { hour: '10:00', count: 10, heightPct: 100 },
  { hour: '11:00', count: 8, heightPct: 80 },
  { hour: '12:00', count: 2, heightPct: 20 }, // lunch buffer
  { hour: '13:00', count: 5, heightPct: 50 },
  { hour: '14:00', count: 9, heightPct: 90 },
  { hour: '15:00', count: 6, heightPct: 60 },
  { hour: '16:00', count: 4, heightPct: 40 },
  { hour: '17:00', count: 2, heightPct: 20 },
];

export const ClinicAnalyticsBento = ({
  metrics,
  onExportAppointments,
  onExportAttendance,
}) => {
  return (
    <div className="analytics-bento-grid">
      {/* Bento Card 1: Attendance Reliability */}
      <div className="bento-card bento-span-1">
        <div className="bento-card-header">
          <div className="bento-title-group">
            <CheckCircle2 size={16} color="var(--success-text)" />
            <span className="bento-title">Attendance & Reliability</span>
          </div>
          <span className="badge-pill badge-success mono-tag">97.4% ON-TIME</span>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '0', lineHeight: 1.4 }}>
          Percentage of booked patients who physically show up for their appointments vs missed visits.
        </p>

        <div className="bento-hero-metric">
          <span className="bento-metric-value tabular-nums">{metrics.attendanceRatePct}%</span>
          <span className="bento-metric-sub">Attended vs Scheduled</span>
        </div>

        <div className="bento-progress-track">
          <div
            className="bento-progress-fill"
            style={{ width: `${metrics.attendanceRatePct}%`, background: 'var(--success)' }}
          />
        </div>

        <div className="bento-card-footer">
          <span className="footer-subtext">38 Attended &bull; 1 No-Show Today</span>
        </div>
      </div>

      {/* Bento Card 2: Front-Desk Triage Velocity */}
      <div className="bento-card bento-span-1">
        <div className="bento-card-header">
          <div className="bento-title-group">
            <Zap size={16} color="var(--amber)" />
            <span className="bento-title">Front-Desk Triage Velocity</span>
          </div>
          <span className="badge-pill badge-amber mono-tag">FAST &bull; 3.8m</span>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '0', lineHeight: 1.4 }}>
          Average time in minutes it takes receptionists to review, verify, and dispatch appointment options.
        </p>

        <div className="bento-hero-metric">
          <span className="bento-metric-value tabular-nums">{metrics.avgTriageVelocityMin}m</span>
          <span className="bento-metric-sub">Avg Review & Dispatch Time</span>
        </div>

        <div className="bento-progress-track">
          <div
            className="bento-progress-fill"
            style={{ width: '88%', background: 'var(--amber)' }}
          />
        </div>

        <div className="bento-card-footer">
          <span className="footer-subtext">94% requests triaged in &lt; 15 mins</span>
        </div>
      </div>

      {/* Bento Card 3: 1-Click CSV Export Station (RFC 4180 Standard) */}
      <div className="bento-card bento-span-1 export-card">
        <div className="bento-card-header">
          <div className="bento-title-group">
            <FileSpreadsheet size={16} color="var(--success-text)" />
            <span className="bento-title">Data Exports (RFC 4180)</span>
          </div>
          <span className="badge-pill badge-neutral mono-tag">EXCEL &bull; SHEETS</span>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '0', lineHeight: 1.4 }}>
          Standard spreadsheet files (RFC 4180) that open cleanly in Excel or Google Sheets without corrupted symbols.
        </p>

        <div className="export-buttons-group" style={{ marginTop: 'auto', display: 'flex', flexDirection: 'column', gap: '8px' }}>
          <button
            type="button"
            className="btn-base btn-secondary export-btn"
            onClick={onExportAppointments}
            style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
          >
            <Download size={13} />
            <span>Export Appointments CSV</span>
          </button>

          <button
            type="button"
            className="btn-base btn-secondary export-btn"
            onClick={onExportAttendance}
            style={{ width: '100%', justifyContent: 'center', fontSize: '12px' }}
          >
            <Download size={13} />
            <span>Export Staff Attendance CSV</span>
          </button>
        </div>
      </div>

      {/* Bento Card 4: Hourly Booking Distribution Trend */}
      <div className="bento-card bento-span-3" style={{ gridColumn: '1 / -1' }}>
        <div className="bento-card-header">
          <div className="bento-title-group">
            <Activity size={16} color="var(--text-2)" />
            <span className="bento-title">Hourly Patient Intake Distribution (WAT)</span>
          </div>
          <span className="bento-subtag">Peak Rush: 10:00 AM &bull; 02:00 PM</span>
        </div>

        <p style={{ fontSize: '11px', color: 'var(--text-3)', margin: '0', lineHeight: 1.4 }}>
          Hourly patient check-in volume throughout the day. Helps reception and clinic managers staff front desks during peak rush hours.
        </p>

        <div className="bento-chart-container" style={{ marginTop: '6px' }}>
          <div className="mini-bars-row">
            {HOURLY_DISTRIBUTION.map((item) => (
              <div key={item.hour} className="mini-bar-col" title={`${item.hour}: ${item.count} appointments`}>
                <div className="mini-bar-track">
                  <div
                    className="mini-bar-fill"
                    style={{ height: `${item.heightPct}%` }}
                  />
                </div>
                <span className="mini-bar-label tabular-nums">{item.hour.split(':')[0]}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};

