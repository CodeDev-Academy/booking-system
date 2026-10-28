import React from 'react';

/** AgingBadge — pure presentational. level: fresh | waiting | delayed */
export const AgingBadge = ({ level, label }) => (
  <span className={`aging-badge aging-${level}`}>
    <span className="aging-dot" />
    {label}
  </span>
);
