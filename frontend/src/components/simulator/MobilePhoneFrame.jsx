import React from 'react';
import { Globe, MessageSquare, Wifi, Battery, Signal } from 'lucide-react';
import { WebIntakeForm } from './WebIntakeForm';
import { TelegramBotChat } from './TelegramBotChat';

export const MobilePhoneFrame = ({
  channel,
  onSetChannel,
  stage = 'intake',
  webForm,
  servicesList,
  doctorsList,
  onUpdateWebForm,
  onApplyPreset,
  onSubmitWeb,
  activeRequest,
  offeredSlots,
  remainingOfferSeconds,
  confirmedAppointment,
  onSelectSlot,
  onReRequestFreshTimes,
  telegramMessages,
  onSelectTelegramOption,
  isSubmitting,
  onReset,
}) => {
  return (
    <div className="phone-device-wrapper">
      {/* Phone Case Outer Rim */}
      <div className="phone-chassis">
        {/* Dynamic Island / Speaker Punch */}
        <div className="phone-speaker-notch">
          <div className="notch-camera" />
          <div className="notch-sensor" />
        </div>

        {/* Top Status Bar */}
        <div className="phone-status-bar">
          <span className="status-time tabular-nums">09:41</span>
          <div className="status-icons">
            <Signal size={12} color="var(--text-2)" />
            <Wifi size={12} color="var(--text-2)" />
            <Battery size={13} color="var(--text-2)" />
          </div>
        </div>

        {/* Channel Switcher Tabs Inside Device */}
        <div className="phone-channel-bar">
          <button
            id="tab-btn-web"
            type="button"
            className={`channel-switch-pill ${channel === 'web' ? 'active' : ''}`}
            onClick={() => onSetChannel('web')}
          >
            <Globe size={12} style={{ marginRight: '5px' }} />
            Web Booking Form
          </button>
          <button
            id="tab-btn-telegram"
            type="button"
            className={`channel-switch-pill ${channel === 'telegram' ? 'active' : ''}`}
            onClick={() => onSetChannel('telegram')}
          >
            <MessageSquare size={12} style={{ marginRight: '5px' }} />
            Telegram Bot Chat
          </button>
        </div>

        {/* Inner Screen Viewport */}
        <div className="phone-screen-viewport">
          {channel === 'web' ? (
            <WebIntakeForm
              stage={stage}
              webForm={webForm}
              servicesList={servicesList}
              doctorsList={doctorsList}
              onUpdateForm={onUpdateWebForm}
              onApplyPreset={onApplyPreset}
              onSubmit={onSubmitWeb}
              isSubmitting={isSubmitting}
              activeRequest={activeRequest}
              offeredSlots={offeredSlots}
              remainingOfferSeconds={remainingOfferSeconds}
              confirmedAppointment={confirmedAppointment}
              onSelectSlot={onSelectSlot}
              onReRequestFreshTimes={onReRequestFreshTimes}
              onReset={onReset}
            />
          ) : (
            <TelegramBotChat
              telegramMessages={telegramMessages}
              onSelectOption={onSelectTelegramOption}
              isSubmitting={isSubmitting}
            />
          )}
        </div>

        {/* Home Indicator Bar */}
        <div className="phone-home-indicator">
          <div className="home-bar" />
        </div>
      </div>
    </div>
  );
};
