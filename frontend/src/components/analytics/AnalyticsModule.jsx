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
    <div>
      {/* Header & Export Actions */}
      <div style={{
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginBottom: '24px',
        flexWrap: 'wrap',
        gap: '12px'
      }}>
        <div>
          <h1 style={{ fontSize: '1.5rem', marginBottom: '4px' }}>Clinic Analytics & Performance Reports</h1>
          <p style={{ fontSize: '0.875rem', color: 'var(--color-text-muted)' }}>
            Track front-desk response SLA, slot conversion rates, and download audit CSVs.
          </p>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '10px' }}>
          <button
            onClick={() => exportService.exportAppointmentsToCSV(appointments)}
            className="btn btn-secondary btn-sm"
          >
            <DownloadIcon size={14} color="var(--color-primary)" />
            📥 Export Appointments CSV
          </button>

          <button
            onClick={() => exportService.exportAttendanceToCSV(staffList)}
            className="btn btn-secondary btn-sm"
          >
            <DownloadIcon size={14} color="var(--color-primary)" />
            📥 Export Attendance CSV
          </button>
        </div>
      </div>

      {/* KPI Summary Cards */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(210px, 1fr))',
        gap: '16px',
        marginBottom: '28px'
      }}>
        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Total Processed Bookings
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--color-primary-dark)', marginTop: '4px' }}>
            {total_bookings}
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginTop: '4px', fontWeight: '600' }}>
            ↑ +18% vs last week
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Patient Attendance Rate
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--color-success)', marginTop: '4px' }}>
            {attendance_rate_percent}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Confirmed & honored visits
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Clinic No-Show Rate
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--color-danger)', marginTop: '4px' }}>
            {no_show_rate_percent}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Target: Under 6.0% (Well within SLA)
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            Front Desk SLA Response
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--color-primary)', marginTop: '4px' }}>
            {avg_receptionist_response_minutes} <span style={{ fontSize: '1rem', fontWeight: '500' }}>mins</span>
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-success)', marginTop: '4px', fontWeight: '600' }}>
            ⚡ 75% faster than 15m SLA
          </div>
        </div>

        <div className="card" style={{ padding: '20px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--color-text-muted)', textTransform: 'uppercase' }}>
            1-Hour Recovery Rate
          </div>
          <div style={{ fontSize: '2rem', fontWeight: '800', color: 'var(--color-warning-text)', marginTop: '4px' }}>
            {re_engagement_recovery_rate_percent}%
          </div>
          <div style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginTop: '4px' }}>
            Recovered via "See New Times"
          </div>
        </div>
      </div>

      {/* Visual Charts Grid */}
      <div style={{
        display: 'grid',
        gridTemplateColumns: 'repeat(auto-fit, minmax(420px, 1fr))',
        gap: '20px'
      }}>
        {/* Hourly Distribution Bar Chart */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.0625rem', marginBottom: '6px' }}>Hourly Patient Arrival Demand</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '24px' }}>
            Peak clinic rush occurs between 10:00 AM and 11:30 AM.
          </p>

          <div style={{
            display: 'flex',
            alignItems: 'flex-end',
            gap: '12px',
            height: '180px',
            paddingTop: '20px',
            borderBottom: '1px solid var(--color-border)'
          }}>
            {hourly_distribution.map((item) => {
              const heightPercent = (item.count / maxHourlyCount) * 100;
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
                  <span style={{ fontSize: '0.6875rem', fontWeight: '700', color: 'var(--color-primary-dark)', marginBottom: '4px' }}>
                    {item.count}
                  </span>
                  <div
                    style={{
                      width: '100%',
                      maxWidth: '28px',
                      height: `${heightPercent}%`,
                      backgroundColor: item.count === maxHourlyCount ? 'var(--color-primary)' : 'var(--color-primary-accent)',
                      borderRadius: '4px 4px 0 0',
                      transition: 'height 0.3s ease'
                    }}
                    title={`${item.hour}: ${item.count} bookings`}
                  />
                  <span style={{ fontSize: '0.6875rem', color: 'var(--color-text-muted)', marginTop: '8px' }}>
                    {item.hour.split(':')[0]}h
                  </span>
                </div>
              );
            })}
          </div>
        </div>

        {/* Top Services Breakdown */}
        <div className="card" style={{ padding: '24px' }}>
          <h3 style={{ fontSize: '1.0625rem', marginBottom: '6px' }}>Top Clinical Procedures & Services</h3>
          <p style={{ fontSize: '0.75rem', color: 'var(--color-text-muted)', marginBottom: '20px' }}>
            Breakdown of consultation categories booked this period.
          </p>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '16px' }}>
            {services_breakdown.map((srv) => (
              <div key={srv.name}>
                <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.8125rem', marginBottom: '6px' }}>
                  <span style={{ fontWeight: '600' }}>{srv.name}</span>
                  <span style={{ color: 'var(--color-text-muted)' }}>
                    {srv.count} bookings ({srv.percent}%)
                  </span>
                </div>
                <div style={{
                  height: '8px',
                  backgroundColor: 'var(--color-surface-subtle)',
                  borderRadius: 'var(--radius-full)',
                  overflow: 'hidden'
                }}>
                  <div style={{
                    width: `${srv.percent * 2.2}%`,
                    maxWidth: '100%',
                    height: '100%',
                    backgroundColor: 'var(--color-primary)',
                    borderRadius: 'var(--radius-full)'
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
