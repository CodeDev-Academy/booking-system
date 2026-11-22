import React, { useState, useEffect } from 'react';
import { useLocation } from 'react-router-dom';
import { Activity, CalendarClock } from 'lucide-react';
import { useLiveVisits } from '../hooks/useLiveVisits';
import { LiveVisitsGrid } from '../components/swimlanes/LiveVisitsGrid';
import { RecallsView } from './RecallsView';
import '../styles/components/views.css';
import '../styles/components/swimlanes.css';

/**
 * LiveVisitsView — Unified In-Clinic Patient Progression & Follow-Up Recalls
 */
export const LiveVisitsView = ({ initialTab = 'visits' }) => {
  const location = useLocation();
  const visitsData = useLiveVisits();
  const [activeTab, setActiveTab] = useState(
    location.pathname === '/recalls' ? 'recalls' : initialTab
  );

  useEffect(() => {
    if (location.pathname === '/recalls') {
      setActiveTab('recalls');
    } else if (location.pathname === '/live-visits') {
      setActiveTab('visits');
    }
  }, [location.pathname]);

  const activeVisitsCount =
    (visitsData.kpis?.waitingCount || 0) +
    (visitsData.kpis?.inConsultationCount || 0);

  return (
    <div className="view-container">
      {/* Compact Header with Unified Segmented Switcher */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-heading">
            <Activity size={18} color="var(--amber)" />
            <span>Visits &amp; Follow-Up Recalls</span>
          </div>
        </div>

        <div className="segmented-tabs" role="tablist" aria-label="Visits and recalls view switcher">
          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'visits'}
            className={`segmented-tab-btn ${activeTab === 'visits' ? 'active' : ''}`}
            onClick={() => setActiveTab('visits')}
          >
            <Activity size={13} />
            <span>Live Clinic Visits</span>
            {activeVisitsCount > 0 && (
              <span className="segmented-tab-count">{activeVisitsCount}</span>
            )}
          </button>

          <button
            type="button"
            role="tab"
            aria-selected={activeTab === 'recalls'}
            className={`segmented-tab-btn ${activeTab === 'recalls' ? 'active' : ''}`}
            onClick={() => setActiveTab('recalls')}
          >
            <CalendarClock size={13} />
            <span>Follow-Up Recalls</span>
          </button>
        </div>
      </div>

      {activeTab === 'visits' ? (
        <LiveVisitsGrid visitsData={visitsData} />
      ) : (
        <RecallsView embedded />
      )}
    </div>
  );
};
