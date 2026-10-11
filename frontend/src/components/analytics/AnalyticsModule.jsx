import React from 'react';
import { DownloadIcon } from '../common/Icons';
import { INITIAL_ANALYTICS } from '../../utils/mockData';
import { exportService } from '../../services/exportService';

export const AnalyticsModule = ({ appointments, requests, staffList }) => {
  const {
    total_bookings,
    attendance_rate_percent,
    no_show_rate_percent,
    avg_receptionist_response_minutes,
    re_engagement_recovery_rate_percent,
    hourly_distribution,
    services_breakdown
  } = INITIAL_ANALYTICS;

  const maxHourlyCount = Math.max(...hourly_distribution.map(h => h.count));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      {/* Top Section Header & Export Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        flexWrap: 'wrap',
        gap: '14px'
      }}>
        <div>
          <h2 style={{ fontSize: '1.25rem', color: '#ffffff', margin: 0 }}>Clinical Analytics & Reports</h2>
          <p style={{ fontSize: '0.8125rem', color: '#8e8e93', margin: 0, marginTop: '2px' }}>
            Daily attendance metrics, response time SLAs, and audit CSV exports.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => exportService.exportAppointmentsToCSV(appointments)}
            className="btn-pill btn-pill-glass"
          >
            <DownloadIcon size={14} color="var(--color-accent-orange)" />
            <span>Export Appointments CSV</span>
          </button>

          <button
            onClick={() => exportService.exportAttendanceToCSV(staffList)}
            className="btn-pill btn-pill-glass"
          >
            <DownloadIcon size={14} color="var(--color-accent-orange)" />
            <span>Export Attendance CSV</span>
          </button>
        </div>
      </div>

      {/* KPI Cards Grid (Matching Pinterest dark glass style) */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '14px'
      }}>
        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            Total Bookings
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: '800', color: '#ffffff', marginTop: '4px', letterSpacing: '-0.03em' }}>
            {total_bookings}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-accent-green)', marginTop: '4px', fontWeight: '600' }}>
            ↑ +18% vs last week
          </div>
        </div>

        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            Attendance Rate
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--color-accent-green)', marginTop: '4px', letterSpacing: '-0.03em' }}>
            {attendance_rate_percent}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '4px' }}>
            Target: 90%+
          </div>
        </div>

        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            No-Show Rate
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--color-accent-coral)', marginTop: '4px', letterSpacing: '-0.03em' }}>
            {no_show_rate_percent}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '4px' }}>
            Well within 6.0% SLA
          </div>
        </div>

        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            Response SLA
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--color-accent-orange)', marginTop: '4px', letterSpacing: '-0.03em' }}>
            {avg_receptionist_response_minutes} <span style={{ fontSize: '1rem', fontWeight: '500', color: '#8e8e93' }}>mins</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-accent-green)', marginTop: '4px', fontWeight: '600' }}>
            ⚡ 75% faster than SLA
          </div>
        </div>

        <div className="glass-card" style={{ padding: '22px' }}>
          <div style={{ fontSize: '0.6875rem', fontWeight: '700', color: '#8e8e93', textTransform: 'uppercase' }}>
            1-Hour Recovery Rate
          </div>
          <div style={{ fontSize: '2.25rem', fontWeight: '800', color: 'var(--color-accent-cyan)', marginTop: '4px', letterSpacing: '-0.03em' }}>
            {re_engagement_recovery_rate_percent}%
          </div>
          <div style={{ fontSize: '0.75rem', color: '#8e8e93', marginTop: '4px' }}>
            Via "See New Times"
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        gap: '20px'
      }}>
        {/* Hourly Distribution Bar Chart (Matching Reference Aesthetic) */}
        <div className="glass-card" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.0625rem', color: '#ffffff', marginBottom: '4px' }}>Hourly Patient Rush</h3>
          <p style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '28px' }}>
            Peak clinic arrival occurs between 10:00 AM and 11:30 AM.
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '12px',
            height: '180px',
            paddingTop: '20px',
            borderBottom: '1px solid rgba(255, 255, 255, 0.08)'
          }}>
            {hourly_distribution.map((item) => {
              const heightPercent = (item.count / maxHourlyCount) * 100;
              const isPeak = item.count === maxHourlyCount;
              return (
                <div
                  key={item.hour}
                  style={{
                    flex: 1,
                    display: 'flex',
                    flexDirection: 'column',
                    alignItems: 'center',
                    height: '100%',
                    justifyContent: 'flex-end'
                  }}
                >
                  <span style={{
                    fontSize: '0.6875rem',
                    fontWeight: '700',
                    color: isPeak ? 'var(--color-accent-orange)' : '#8e8e93',
                    marginBottom: '6px'
                  }}>
                    {item.count}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '24px',
                      height: `${heightPercent}%`,
                      backgroundColor: isPeak ? 'var(--color-accent-orange)' : 'rgba(255, 255, 255, 0.1)',
                      boxShadow: isPeak ? '0 0 16px rgba(255, 107, 0, 0.4)' : 'none',
                      borderRadius: '6px 6px 0 0',
                      transition: 'height 0.3s ease'
                    }}
                  />
                  <span style={{ fontSize: '0.6875rem', color: '#8e8e93', marginTop: '10px' }}>
                    {item.hour.split(':')[0]}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Procedures Breakdown */}
        <div className="glass-card" style={{ padding: '28px' }}>
          <h3 style={{ fontSize: '1.0625rem', color: '#ffffff', marginBottom: '4px' }}>Top Procedures</h3>
          <p style={{ fontSize: '0.75rem', color: '#8e8e93', marginBottom: '22px' }}>
            Breakdown of consultation categories booked this period.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {services_breakdown.map((srv) => (
              <div key={srv.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '600', color: '#ffffff' }}>{srv.name}</span>
                  <span style={{ color: '#8e8e93' }}>
                    {srv.count} ({srv.percent}%)
                  </span>
                </div>
                <div style={{
                  height: '6px',
                  backgroundColor: 'rgba(255, 255, 255, 0.05)',
                  borderRadius: 'var(--radius-pill)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${srv.percent * 2.2}%`,
                    maxWidth: '100%',
                    height: '100%',
                    background: 'linear-gradient(90deg, #ff6b00, #ff8533)',
                    borderRadius: 'var(--radius-pill)'
                  }} />
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  );
};
