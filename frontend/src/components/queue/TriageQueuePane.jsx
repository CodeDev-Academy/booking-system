import React from 'react';
import { Inbox, CheckCircle2, X, ChevronRight, Search } from 'lucide-react';
import { QueueCard } from './QueueCard';

const EMPTY_COPY = {
  new: 'No new requests. Fresh patient requests will appear here, oldest first.',
  rerequested: 'No re-requested slots right now.',
  expired: 'No expired offers to follow up.',
};

/** TriageQueuePane — tabs + FIFO card list + today's schedule + toast. Pure presentational. */
export const TriageQueuePane = ({
  tabs,
  activeTab,
  cards,
  todayRows,
  searchQuery,
  onSearch,
  toast,
  onTab,
  onOpen,
  onSelectTodayRow,
  onDismissToast,
}) => (
  <section className="triage-pane" aria-label="Inbound requests queue">
    {toast && (
      <div className={`queue-toast toast-${toast.tone}`} role="status">
        <CheckCircle2 size={16} />
        <span>{toast.text}</span>
        <button type="button" className="toast-close" onClick={onDismissToast} aria-label="Dismiss notification">
          <X size={14} />
        </button>
      </div>
    )}

    <div className="queue-toolbar-row" style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '14px', flexWrap: 'wrap', marginBottom: '14px' }}>
      <div className="queue-tabs" role="tablist">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            role="tab"
            aria-selected={activeTab === tab.id}
            className={`queue-tab ${activeTab === tab.id ? 'active' : ''}`}
            onClick={() => onTab(tab.id)}
          >
            <span className="queue-tab-label">{tab.label}</span>
            <span className={`queue-tab-count tone-${tab.tone} tabular-nums`}>{tab.count}</span>
          </button>
        ))}
      </div>

      <div className="queue-search-box" style={{
        display: 'flex',
        alignItems: 'center',
        gap: '6px',
        background: 'var(--surface-1)',
        border: '1px solid var(--line)',
        borderRadius: 'var(--radius-full)',
        padding: '5px 12px',
        minWidth: '240px',
      }}>
        <Search size={14} color="var(--text-3)" />
        <input
          type="text"
          className="queue-search-input"
          placeholder="Search by patient, phone, doctor..."
          value={searchQuery || ''}
          onChange={(e) => onSearch && onSearch(e.target.value)}
          style={{
            background: 'transparent',
            border: 'none',
            outline: 'none',
            fontSize: '12px',
            color: 'var(--text)',
            width: '100%',
          }}
        />
        {searchQuery && (
          <button
            type="button"
            onClick={() => onSearch && onSearch('')}
            style={{ background: 'transparent', border: 'none', color: 'var(--text-3)', cursor: 'pointer', fontSize: '14px' }}
          >
            &times;
          </button>
        )}
      </div>
    </div>

    {activeTab === 'today' ? (
      <ul className="today-list">
        {todayRows.map((row) => (
          <li
            key={row.id}
            className="today-row today-row-clickable"
            onClick={() => onSelectTodayRow && onSelectTodayRow(row.id)}
            role="button"
            tabIndex={0}
            onKeyDown={(e) => {
              if (e.key === 'Enter' || e.key === ' ') {
                e.preventDefault();
                onSelectTodayRow && onSelectTodayRow(row.id);
              }
            }}
            title={`Click to view patient profile & details for ${row.patientName}`}
          >
            <span className="today-time tabular-nums">{row.timeLabel}</span>
            <div className="today-main">
              <span className="today-name">{row.patientName}</span>
              <span className="today-sub">
                {row.serviceName} · {row.doctorName}
              </span>
            </div>
            <div className="today-right">
              <span className={`badge-pill ${row.status === 'completed' ? 'badge-success' : row.status === 'held' ? 'badge-amber' : 'badge-info'}`}>
                {row.status === 'held' ? 'hold' : row.status}
              </span>
              <ChevronRight size={15} className="today-chevron" />
            </div>
          </li>
        ))}
      </ul>
    ) : cards.length === 0 ? (
      <div className="queue-empty">
        <Inbox size={28} />
        <p>{EMPTY_COPY[activeTab]}</p>
      </div>
    ) : (
      <div className="queue-grid">
        {cards.map((card) => (
          <QueueCard key={card.id} card={card} onOpen={onOpen} />
        ))}
      </div>
    )}
  </section>
);
