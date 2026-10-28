import React from 'react';
import { ShieldCheck, History, UserPlus } from 'lucide-react';

/**
 * PatientDossier — returning-patient reliability card.
 * ZERO DIAGNOSIS EXPOSURE (HIPAA/NDPR): shows operational procedure names only.
 */
export const PatientDossier = ({ dossier }) => {
  if (!dossier) {
    return (
      <div className="dossier dossier-new">
        <UserPlus size={16} />
        <div>
          <strong>New patient</strong>
          <p>No visit history found for this phone number.</p>
        </div>
      </div>
    );
  }
  return (
    <div className="dossier">
      <div className="dossier-head">
        <span className="dossier-title">
          <History size={14} /> Patient reliability
        </span>
        <span className={`dossier-score tone-${dossier.reliabilityTone} tabular-nums`}>
          {dossier.reliabilityPct}% reliable
        </span>
      </div>
      <div className="dossier-sub tabular-nums">{dossier.attendedLabel}</div>
      <ul className="dossier-visits">
        {dossier.lastVisits.map((v) => (
          <li key={`${v.date}-${v.procedure}`}>
            <span className="tabular-nums">{v.date}</span>
            <span>{v.procedure}</span>
          </li>
        ))}
      </ul>
      <div className="dossier-note">
        <ShieldCheck size={12} /> Clinical notes are never shown on reception screens.
      </div>
    </div>
  );
};
