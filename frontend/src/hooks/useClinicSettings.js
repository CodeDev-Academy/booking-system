import { useState } from 'react';
import { INITIAL_CLINIC_SETTINGS } from '../utils/mockData';

export const useClinicSettings = ({ onToast }) => {
  const [settings, setSettings] = useState(INITIAL_CLINIC_SETTINGS);
  const [formData, setFormData] = useState({ ...INITIAL_CLINIC_SETTINGS });
  const [saveSuccess, setSaveSuccess] = useState(false);

  const toggleDay = (day) => {
    setFormData(prev => {
      const current = prev.working_days || [];
      const updated = current.includes(day)
        ? current.filter(d => d !== day)
        : [...current, day];
      return { ...prev, working_days: updated };
    });
  };

  const updateField = (field, value) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  };

  const saveSettings = () => {
    setSettings(formData);
    setSaveSuccess(true);
    if (onToast) onToast('Clinic configuration rules successfully updated.');
    setTimeout(() => setSaveSuccess(false), 3000);
  };

  return {
    settings,
    formData,
    saveSuccess,
    toggleDay,
    updateField,
    saveSettings
  };
};
