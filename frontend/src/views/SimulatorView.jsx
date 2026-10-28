import React from 'react';
import { Smartphone } from 'lucide-react';
import { usePitchSimulator } from '../hooks/usePitchSimulator';
import { MobilePhoneFrame } from '../components/simulator/MobilePhoneFrame';
import { LiveSyncMonitor } from '../components/simulator/LiveSyncMonitor';
import '../styles/components/views.css';
import '../styles/components/simulator.css';

/**
 * SimulatorView — Route View for Interactive Client Pitch Simulator & Mobile Frame Booking Widget
 * Pure presentational orchestration consuming the headless usePitchSimulator hook.
 */
export const SimulatorView = () => {
  const {
    channel,
    setChannel,
    simulatorStage,
    webForm,
    updateWebForm,
    applyPreset,
    submitWebBooking,
    telegramMessages,
    handleTelegramOptionSelect,
    isSubmitting,
    activeRequest,
    offeredSlots,
    remainingOfferSeconds,
    confirmedAppointment,
    approveAndDispatchQuickly,
    selectCandidateSlot,
    simulateOfferExpiry,
    reRequestFreshTimes,
    syncLatencyMs,
    toast,
    dismissToast,
    resetSimulator,
    servicesList,
    doctorsList,
  } = usePitchSimulator();

  return (
    <div className="view-container">
      {/* Toast Notification Banner */}
      {toast && (
        <div
          className={`calendar-toast-banner toast-${toast.tone}`}
          style={{ marginBottom: '14px' }}
        >
          <div className="toast-content">
            <span className="duty-dot" />
            <span>{toast.text}</span>
          </div>
          <button
            type="button"
            className="toast-close-btn"
            onClick={dismissToast}
          >
            &times;
          </button>
        </div>
      )}

      {/* View Header */}
      <div className="view-header">
        <div className="view-title-group">
          <div className="view-heading">
            <Smartphone size={24} color="var(--rose)" />
            <span>Interactive Split-Screen Pitch Simulator</span>
            <span className="badge-pill badge-ember mono-tag">DEMO SHOWROOM</span>
            <span className="badge-pill badge-neutral mono-tag">BIDIRECTIONAL SYNC</span>
          </div>
          <p className="view-description">
            Dual-channel phone intake frame synchronized in real-time with receptionist review cards. Test the complete 10-step lifecycle from patient intake to calendar commitment.
          </p>
        </div>
      </div>

      {/* Split-Screen Interactive Pitch Canvas */}
      <div className="simulator-split-layout">
        {/* Left: Mobile Phone Intake Frame */}
        <MobilePhoneFrame
          channel={channel}
          onSetChannel={setChannel}
          stage={simulatorStage}
          webForm={webForm}
          servicesList={servicesList}
          doctorsList={doctorsList}
          onUpdateWebForm={updateWebForm}
          onApplyPreset={applyPreset}
          onSubmitWeb={submitWebBooking}
          activeRequest={activeRequest}
          offeredSlots={offeredSlots}
          remainingOfferSeconds={remainingOfferSeconds}
          confirmedAppointment={confirmedAppointment}
          onSelectSlot={selectCandidateSlot}
          onReRequestFreshTimes={reRequestFreshTimes}
          telegramMessages={telegramMessages}
          onSelectTelegramOption={handleTelegramOptionSelect}
          isSubmitting={isSubmitting}
          onReset={resetSimulator}
        />

        {/* Right: Live Receptionist Sync Monitor */}
        <LiveSyncMonitor
          stage={simulatorStage}
          activeRequest={activeRequest}
          offeredSlots={offeredSlots}
          remainingOfferSeconds={remainingOfferSeconds}
          confirmedAppointment={confirmedAppointment}
          syncLatencyMs={syncLatencyMs}
          onApproveAndDispatch={approveAndDispatchQuickly}
          onSimulateExpiry={simulateOfferExpiry}
          onReset={resetSimulator}
        />
      </div>
    </div>
  );
};
