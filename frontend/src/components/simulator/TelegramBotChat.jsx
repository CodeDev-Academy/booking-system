import React from 'react';
import { Stethoscope, CheckCheck, Send, Smile } from 'lucide-react';

export const TelegramBotChat = ({
  telegramMessages,
  onSelectOption,
  isSubmitting,
}) => {
  return (
    <div className="telegram-chat-container">
      {/* Telegram Chat Header */}
      <div className="tg-header">
        <div className="tg-avatar">
          <Stethoscope size={18} color="#fff" />
        </div>
        <div className="tg-header-info">
          <div className="tg-name-row">
            <span className="tg-name">Dr AI (@{import.meta.env.VITE_TELEGRAM_BOT_USERNAME || 'babawo_bot'})</span>
            <span className="tg-badge">bot</span>
          </div>
          <span className="tg-status">online · verified clinical gateway</span>
        </div>
      </div>

      {/* Telegram Messages Scroll Area */}
      <div className="tg-messages-scroll">
        <div className="tg-date-divider">
          <span>Today</span>
        </div>

        {telegramMessages.map((msg) => {
          const isBot = msg.sender === 'bot';
          return (
            <div
              key={msg.id}
              className={`tg-bubble-row ${isBot ? 'bot-row' : 'user-row'}`}
            >
              <div className={`tg-bubble ${isBot ? 'bot-bubble' : 'user-bubble'}`}>
                <div className="tg-bubble-text">{msg.text}</div>

                {/* Inline Keyboard Buttons */}
                {isBot && msg.options && msg.options.length > 0 && (
                  <div className="tg-inline-keyboard">
                    {msg.options.map((opt, i) => (
                      <button
                        key={i}
                        id={`tg-opt-${opt.key}-${i}`}
                        data-testid={`tg-opt-${opt.key}`}
                        type="button"
                        className="tg-inline-btn"
                        disabled={isSubmitting}
                        onClick={() =>
                          onSelectOption(opt.key, opt.value, opt.label, opt.slotData)
                        }
                      >
                        {opt.label}
                      </button>
                    ))}
                  </div>
                )}

                <div className="tg-bubble-footer">
                  <span className="tg-time">{msg.time}</span>
                  {!isBot && (
                    <CheckCheck size={13} color="var(--success-text)" />
                  )}
                </div>
              </div>
            </div>
          );
        })}

        {isSubmitting && (
          <div className="tg-bubble-row bot-row">
            <div className="tg-bubble bot-bubble typing-bubble">
              <span className="typing-dot" />
              <span className="typing-dot" />
              <span className="typing-dot" />
            </div>
          </div>
        )}
      </div>

      {/* Telegram Bottom Bar */}
      <div className="tg-bottom-bar">
        <button type="button" className="tg-icon-btn" title="Emoji">
          <Smile size={18} color="var(--text-3)" />
        </button>
        <input
          type="text"
          className="tg-input"
          placeholder="Tap an option button above..."
          disabled
        />
        <button type="button" className="tg-send-btn" disabled>
          <Send size={15} color="#fff" />
        </button>
      </div>
    </div>
  );
};
