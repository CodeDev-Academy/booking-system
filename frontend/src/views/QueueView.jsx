import React from 'react';
import { Inbox } from 'lucide-react';
import { useTriageQueue } from '../hooks/useTriageQueue';
import { TriageQueuePane } from '../components/queue/TriageQueuePane';
import { ReviewModal } from '../components/review/ReviewModal';
import '../styles/components/views.css';
import '../styles/components/queue.css';
import '../styles/components/calendar.css';

/**
 * QueueView — Patient Booking Requests Route View
 * Pure presentational orchestration consuming the headless useTriageQueue hook.
 */
export const QueueView = () => {
  const {
    tabs,
    activeTab,
    searchQuery,
    cards,
    review,
    toast,
    actions,
  } = useTriageQueue();

  return (
    <div className="view-container">
      {/* Compact View Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-heading">
            <Inbox size={18} color="var(--amber)" />
            <span>Patient Booking Requests</span>
          </div>
        </div>
      </div>

      <TriageQueuePane
        tabs={tabs}
        activeTab={activeTab}
        cards={cards}
        searchQuery={searchQuery}
        onSearch={actions.setSearchQuery}
        toast={toast}
        onTab={actions.setActiveTab}
        onOpen={actions.openRequest}
        onDismissToast={actions.dismissToast}
      />

      <ReviewModal review={review} actions={actions} />
    </div>
  );
};
