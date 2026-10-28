import React from 'react';
import { Activity } from 'lucide-react';
import { useLiveVisits } from '../hooks/useLiveVisits';
import { LiveVisitsGrid } from '../components/swimlanes/LiveVisitsGrid';
import '../styles/components/views.css';
import '../styles/components/swimlanes.css';

/**
 * LiveVisitsView — Real-time in-clinic patient visit progression
 */
export const LiveVisitsView = () => {
  const visitsData = useLiveVisits();

  return (
    <div className="view-container">
      {/* View Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-heading">
            <Activity size={22} color="var(--ember)" />
            <span>Live Clinic Visits</span>
          </div>
        </div>
      </div>

      {/* 3-Swimlane Interactive Board */}
      <LiveVisitsGrid visitsData={visitsData} />
    </div>
  );
};
