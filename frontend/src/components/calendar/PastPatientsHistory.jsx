import React, { useState, useMemo } from 'react';
import {
  Calendar,
  Clock,
  Search,
  User,
  Phone,
  Stethoscope,
  CheckCircle2,
  CalendarCheck,
  ChevronRight,
  Filter,
  FileText,
  UserCheck,
  X,
  RotateCcw,
} from 'lucide-react';
import { buildPastPatientRecords, DOCTORS } from '../../services/mockData';
import { matchesPhone } from '../../services/phoneUtils';
import { getAllDoctors } from '../../services/slotEngine';

/**
 * PastPatientsHistory — Compact Patient Archive Cards (Task 4.4)
 * Refactored per user request to replace bulky tables with compact, easy-to-read cards:
 * Name, Returning/New Tag, Phone, Last Visit Date, Doctor seen, and 1-Click Dossier Modal.
 */
export const PastPatientsHistory = ({ onSelectPatient }) => {
  const [selectedDate, setSelectedDate] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedDoctor, setSelectedDoctor] = useState('all');

  const allRecords = useMemo(() => buildPastPatientRecords(), []);

  // Filter by date, doctor, and search query
  const filteredRecords = useMemo(() => {
    return allRecords.filter((rec) => {
      // 1. Date filter
      if (selectedDate && rec.isoDate !== selectedDate) return false;

      // 2. Doctor filter
      if (selectedDoctor !== 'all' && rec.doctorId !== selectedDoctor) return false;

      // 3. Search query
      if (searchQuery.trim()) {
        const q = searchQuery.toLowerCase().trim();
        const matchName = rec.patientName.toLowerCase().includes(q);
        const matchPhone = matchesPhone(rec.patientPhone, searchQuery);
        const matchDoc = rec.doctorName.toLowerCase().includes(q);
        const matchRecep = rec.receptionistName.toLowerCase().includes(q);
        const matchService = rec.serviceName.toLowerCase().includes(q);
        const matchDateText =
          rec.dateStr.toLowerCase().includes(q) ||
          (rec.isoDate && rec.isoDate.includes(q)) ||
          q.includes('10th') ||
          (q.includes('jan') && rec.dateStr.toLowerCase().includes('jan'));
        const matchNotes = (rec.notes || '').toLowerCase().includes(q);
        const matchId = (rec.appointmentId || '').toLowerCase().includes(q);
        return matchName || matchPhone || matchDoc || matchRecep || matchService || matchDateText || matchNotes || matchId;
      }

      return true;
    });
  }, [allRecords, selectedDate, selectedDoctor, searchQuery]);

  return (
    <div className="past-patients-section" style={{ marginTop: '12px' }}>
      {/* Search & Filter Toolbar */}
      <div
        className="past-patients-toolbar"
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          flexWrap: 'wrap',
          gap: '10px',
          padding: '10px 14px',
          background: 'var(--surface-1)',
          border: '1px solid var(--border)',
          borderRadius: 'var(--radius-lg)',
          marginBottom: '12px',
        }}
      >
        {/* Search Input */}
        <div
          className="search-input-wrapper"
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            background: 'var(--surface-2)',
            border: '1px solid var(--border)',
            borderRadius: 'var(--radius-md)',
            padding: '6px 10px',
            flex: '1 1 200px',
            minWidth: '0',
            maxWidth: '100%',
            boxSizing: 'border-box',
          }}
        >
          <Search size={13} color="var(--text-3)" style={{ flexShrink: 0 }} />
          <input
            type="text"
            placeholder="Search patient name, 080... phone number, doctor..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            style={{
              background: 'transparent',
              border: 'none',
              outline: 'none',
              color: 'var(--text)',
              fontSize: '12px',
              width: '100%',
              minWidth: 0,
            }}
          />
          {searchQuery && (
            <button
              type="button"
              onClick={() => setSearchQuery('')}
              style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-3)', padding: 0 }}
            >
              <X size={12} />
            </button>
          )}
        </div>

        {/* Date Filter & Doctor Filter */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap', flex: '1 1 auto', maxWidth: '100%' }}>
          <input
            type="date"
            value={selectedDate}
            onChange={(e) => setSelectedDate(e.target.value)}
            style={{
              background: 'var(--surface-2)',
              border: selectedDate ? '1px solid var(--amber)' : '1px solid var(--border)',
              borderRadius: '6px',
              padding: '5px 8px',
              fontSize: '11px',
              color: 'var(--text)',
              cursor: 'pointer',
              maxWidth: '140px',
              boxSizing: 'border-box',
            }}
          />

          <button
            type="button"
            className="btn-base btn-secondary btn-sm"
            onClick={() => setSelectedDate('2026-01-10')}
            style={{ fontSize: '11px', padding: '4px 8px', minHeight: '32px' }}
          >
            10 Jan 2026
          </button>

          {selectedDate && (
            <button
              type="button"
              className="btn-base btn-ghost-sm"
              onClick={() => setSelectedDate('')}
              style={{ fontSize: '11px', padding: '4px 6px', minHeight: '32px' }}
              title="Reset date filter"
            >
              <RotateCcw size={11} />
              <span>All</span>
            </button>
          )}

          {/* Doctor Filter Dropdown with clean compact typography */}
          <select
            value={selectedDoctor}
            onChange={(e) => setSelectedDoctor(e.target.value)}
            style={{
              background: 'var(--surface-2)',
              border: '1px solid var(--border)',
              borderRadius: '6px',
              padding: '5px 10px',
              fontSize: '11px',
              fontWeight: 500,
              color: 'var(--text)',
              maxWidth: '100%',
              minWidth: 0,
              textOverflow: 'ellipsis',
              overflow: 'hidden',
              whiteSpace: 'nowrap',
              boxSizing: 'border-box',
              cursor: 'pointer',
            }}
          >
            <option value="all">All Doctors</option>
            {getAllDoctors().map((d) => (
              <option key={d.id} value={d.id}>
                {d.name}
              </option>
            ))}
          </select>
        </div>
      </div>

      {/* KPI Count Strip */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          gap: '12px',
          marginBottom: '12px',
          fontSize: '12px',
          color: 'var(--text-3)',
        }}
      >
        <span>
          Showing <strong style={{ color: 'var(--text)' }}>{filteredRecords.length}</strong> patient records
        </span>
        <span>&bull;</span>
        <span>
          <strong style={{ color: 'var(--color-primary-cyan, #0891b2)' }}>
            {filteredRecords.filter((r) => r.patientType === 'returning').length}
          </strong>{' '}
          Returning
        </span>
      </div>

      {/* Doctor-Card Patterned Patient Records Grid */}
      {filteredRecords.length === 0 ? (
        <div
          style={{
            padding: '36px',
            textAlign: 'center',
            background: 'var(--surface-1)',
            borderRadius: 'var(--radius-lg)',
            border: '1px solid var(--border)',
          }}
        >
          <Calendar size={24} color="var(--text-3)" style={{ margin: '0 auto 8px auto', display: 'block' }} />
          <div style={{ fontSize: '13px', fontWeight: 600, color: 'var(--text)' }}>No patient records found</div>
          <div style={{ fontSize: '11px', color: 'var(--text-3)', marginTop: '4px' }}>
            Try clearing the search query or date filter.
          </div>
        </div>
      ) : (
        <div className="past-patients-cards-grid">
          {filteredRecords.map((rec) => (
            <div
              key={rec.id}
              className="patient-record-select-card"
              onClick={() => onSelectPatient && onSelectPatient(rec)}
              role="button"
              tabIndex={0}
              onKeyDown={(e) => {
                if (e.key === 'Enter' || e.key === ' ') {
                  e.preventDefault();
                  onSelectPatient && onSelectPatient(rec);
                }
              }}
              title={`Click to view complete history and clinical notes for ${rec.patientName}`}
            >
              {/* Card Top: Avatar, Name & Phone */}
              <div className="patient-record-info-row">
                <div
                  className="patient-record-avatar"
                  style={{
                    background: rec.patientType === 'returning' ? '#e0f2fe' : '#fef3c7',
                    color: rec.patientType === 'returning' ? '#0369a1' : '#b45309',
                  }}
                >
                  {rec.patientName.slice(0, 2).toUpperCase()}
                </div>

                <div className="patient-record-text">
                  <div className="patient-record-header-line">
                    <span className="patient-record-name">{rec.patientName}</span>
                    <span
                      className={`event-type-pill ${rec.patientType === 'returning' ? 'returning' : 'new'}`}
                    >
                      {rec.patientType.toUpperCase()}
                    </span>
                  </div>

                  <span className="patient-record-phone">{rec.patientPhone}</span>
                  <span className="patient-record-service-tag">
                    {rec.serviceName} &bull; {rec.doctorName}
                  </span>
                </div>
              </div>

              {/* Card Middle: Last Visit & Clinical Outcome */}
              <div className="patient-record-meta-strip">
                <div className="meta-strip-item">
                  <span className="meta-strip-label">Last Visit:</span>
                  <span className="meta-strip-val">{rec.dateStr}</span>
                </div>
                <div className="meta-strip-item">
                  <span className="meta-strip-label">Clinical Status:</span>
                  <span className="meta-strip-val" style={{ color: '#16a34a' }}>
                    {rec.outcome || 'Consultation Completed'}
                  </span>
                </div>
              </div>

              {/* Card Footer Action: Doctor-Box Patterned Full Width Navy Pill */}
              <button
                type="button"
                className="patient-record-action-btn"
                onClick={(e) => {
                  e.stopPropagation();
                  onSelectPatient && onSelectPatient(rec);
                }}
              >
                View Patient Dossier
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};
