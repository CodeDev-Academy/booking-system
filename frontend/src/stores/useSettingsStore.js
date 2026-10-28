import { create } from 'zustand';
import { persist } from 'zustand/middleware';
import { soundService } from '../services/soundService';
import { apiService } from '../services/apiService';
import { useAppModeStore } from './appModeStore';

const DEFAULT_PROFILE = {
  clinicName: 'Cedarcare Specialist Clinic',
  tagline: 'Excellence in Dental & Family Healthcare',
  address: 'Plot 1042 Aminu Kano Crescent, Wuse 2, Abuja, FCT',
  phones: ['+234 803 000 1122'],
  phone: '+234 803 000 1122',
  emails: ['contact@cedarcare.ng'],
  email: 'contact@cedarcare.ng',
  whatsappPhoneId: 'cedarcare_wa_live',
  telegramBot: '@cedarcare_bot',
  timezone: 'Africa/Lagos (WAT, UTC+1)',
  currency: 'NGN',
  currencySymbol: '₦',
};

const DEFAULT_HOURS = [
  { day: 'Monday', dayIndex: 1, isOpen: true, openTime: '08:00', closeTime: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
  { day: 'Tuesday', dayIndex: 2, isOpen: true, openTime: '08:00', closeTime: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
  { day: 'Wednesday', dayIndex: 3, isOpen: true, openTime: '08:00', closeTime: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
  { day: 'Thursday', dayIndex: 4, isOpen: true, openTime: '08:00', closeTime: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
  { day: 'Friday', dayIndex: 5, isOpen: true, openTime: '08:00', closeTime: '18:00', lunchStart: '13:00', lunchEnd: '14:00' },
  { day: 'Saturday', dayIndex: 6, isOpen: true, openTime: '09:00', closeTime: '15:00', lunchStart: '12:30', lunchEnd: '13:00' },
  { day: 'Sunday', dayIndex: 7, isOpen: false, openTime: '10:00', closeTime: '14:00', lunchStart: '12:00', lunchEnd: '13:00' },
];

const DEFAULT_RULES = {
  offerExpiryMinutes: 60,
  holdExpiryMinutes: 15,
  defaultBufferMinutes: 10,
  emergencySlotsPerShift: 1,
  bookingHorizonDays: 14,
  gridIncrementMinutes: 15,
  minAdvanceHours: 2,
};

const DEFAULT_NOTIFICATIONS = {
  enable24hReminder: true,
  enable2hReminder: false,
  autoLockMinutes: 20,
  maxPinAttempts: 3,
  lockoutCooldownSeconds: 60,
};

export const DEFAULT_SERVICES = [
  {
    id: 'svc-dental',
    name: 'Dental Consultation',
    category: 'Dental',
    durationMin: 30,
    bufferMin: 10,
    description: 'Comprehensive examination of oral cavity, teeth, and gums.',
    isActive: true,
  },
  {
    id: 'svc-extract',
    name: 'Tooth Extraction',
    category: 'Dental / Surgery',
    durationMin: 45,
    bufferMin: 15,
    description: 'Simple or surgical extraction of impacted or compromised tooth.',
    isActive: true,
  },
  {
    id: 'svc-checkup',
    name: 'General Health Check-up',
    category: 'General Practice',
    durationMin: 20,
    bufferMin: 10,
    description: 'Routine physical review, vital signs, and baseline screening.',
    isActive: true,
  },
  {
    id: 'svc-eye',
    name: 'Ophthalmology Eye Examination',
    category: 'Eye Care',
    durationMin: 30,
    bufferMin: 10,
    description: 'Visual acuity testing, refraction assessment, and ophthalmoscopy.',
    isActive: true,
  },
  {
    id: 'svc-ent',
    name: 'ENT Ear & Nose Consultation',
    category: 'ENT Care',
    durationMin: 25,
    bufferMin: 10,
    description: 'Specialized otolaryngology examination for nasal, sinus, or ear symptoms.',
    isActive: true,
  },
];

export const DEFAULT_STAFF_ROLES = [
  'Receptionist',
  'Doctor',
  'Front-Desk Lead',
  'Nurse',
  'Practice Manager',
  'Billing / Records Officer',
];

export const DEFAULT_STAFF_SPECIALTIES = [
  'General Practice',
  'Dental Surgery',
  'Family Medicine',
  'Orthodontics',
  'Pediatrics',
  'Triage & Verification',
  'Follow-up & Patient Welfare',
];

export const useSettingsStore = create(
  persist(
    (set, get) => ({
      clinicProfile: { ...DEFAULT_PROFILE },
      operatingHours: DEFAULT_HOURS.map((h) => ({ ...h })),
      schedulingRules: { ...DEFAULT_RULES },
      notificationRules: { ...DEFAULT_NOTIFICATIONS },
      services: DEFAULT_SERVICES.map((s) => ({ ...s })),
      customCategories: [],
      staffRoles: [...DEFAULT_STAFF_ROLES],
      staffSpecialties: [...DEFAULT_STAFF_SPECIALTIES],
      isDirty: false,
      toast: null,

  updateProfile: (field, value) => {
    set((state) => {
      const updated = { ...state.clinicProfile, [field]: value };
      if (field === 'phones' && Array.isArray(value)) {
        updated.phone = value[0] || '';
      }
      if (field === 'emails' && Array.isArray(value)) {
        updated.email = value[0] || '';
      }
      return {
        clinicProfile: updated,
        isDirty: true,
      };
    });
  },

  updateDayHours: (dayIndex, field, value) => {
    set((state) => ({
      operatingHours: state.operatingHours.map((d) =>
        d.dayIndex === dayIndex ? { ...d, [field]: value } : d
      ),
      isDirty: true,
    }));
  },

  toggleDayOpen: (dayIndex) => {
    set((state) => ({
      operatingHours: state.operatingHours.map((d) =>
        d.dayIndex === dayIndex ? { ...d, isOpen: !d.isOpen } : d
      ),
      isDirty: true,
    }));
  },

  updateRule: (field, value) => {
    set((state) => ({
      schedulingRules: { ...state.schedulingRules, [field]: Number(value) },
      isDirty: true,
    }));
  },

  toggleNotification: (field) => {
    const nextVal = !get().notificationRules[field];
    const ruleNames = {
      enable24hReminder: '24-Hour Pre-Visit Notice',
      enable2hReminder: '2-Hour Arrival Alert',
    };
    const label = ruleNames[field] || field;

    set((state) => ({
      notificationRules: {
        ...state.notificationRules,
        [field]: nextVal,
      },
      toast: {
        tone: 'success',
        text: `${label} has been ${nextVal ? 'Activated & Saved' : 'Deactivated & Saved'} to live system.`,
      },
    }));
    soundService.playChime();
  },

  saveSettings: async () => {
    try {
      soundService.playChime();
    } catch {
      // Audio autoplay policy fallback
    }

    if (!useAppModeStore.getState().isDemoMode) {
      const config = get().generateClientConfigJson();
      try {
        await apiService.updateSettings({
          clinic_name: config.clinic.name,
          tagline: config.clinic.tagline,
          address: config.clinic.address,
          phone: config.clinic.phone,
          phones: get().clinicProfile.phones,
          emails: get().clinicProfile.emails,
          whatsapp_phone_id: config.clinic.whatsapp_phone_id,
          open_time: config.schedule_engine.open_time,
          close_time: config.schedule_engine.close_time,
          offer_expiry_minutes: config.schedule_engine.rules.offer_expiry_minutes,
          hold_expiry_minutes: config.schedule_engine.rules.hold_expiry_minutes,
          default_buffer_minutes: config.schedule_engine.rules.default_buffer_minutes,
          emergency_slots_per_shift: config.schedule_engine.rules.emergency_slots_per_shift,
          booking_horizon_days: config.schedule_engine.rules.booking_horizon_days,
          grid_increment_minutes: config.schedule_engine.rules.grid_increment_minutes,
          min_advance_hours: config.schedule_engine.rules.min_advance_hours,
          enable_24h_reminder: config.notifications.enable_24h_reminder,
          enable_2h_reminder: config.notifications.enable_2h_reminder,
          custom_config: {
            telegram_bot: config.clinic.telegram_bot,
            currency: config.clinic.currency,
            currency_symbol: config.clinic.currency_symbol,
            timezone: config.clinic.timezone,
            custom_categories: get().customCategories,
          },
        });
      } catch (err) {
        console.warn('Backend updateSettings failed:', err);
      }
    }

    set({
      isDirty: false,
      toast: {
        tone: 'success',
        text: 'Clinic settings & scheduling rules successfully saved to configuration memory.',
      },
    });
  },

  resetToDefaults: () => {
    try {
      soundService.playKeyClick();
    } catch {
      // Audio fallback
    }
    set({
      clinicProfile: { ...DEFAULT_PROFILE },
      operatingHours: DEFAULT_HOURS.map((h) => ({ ...h })),
      schedulingRules: { ...DEFAULT_RULES },
      notificationRules: { ...DEFAULT_NOTIFICATIONS },
      services: DEFAULT_SERVICES.map((s) => ({ ...s })),
      customCategories: [],
      isDirty: false,
      toast: {
        tone: 'neutral',
        text: 'Configuration reset to MedPulse agency default benchmarks.',
      },
    });
  },

  dismissToast: () => set({ toast: null }),

  generateClientConfigJson: () => {
    const { clinicProfile, operatingHours, schedulingRules, notificationRules } = get();
    const workingDays = operatingHours
      .filter((d) => d.isOpen)
      .map((d) => d.dayIndex);

    const config = {
      version: '1.0.0',
      exported_at: new Date().toISOString(),
      generator: 'MedPulse Agency Template White-Label Engine',
      clinic: {
        name: clinicProfile.clinicName,
        tagline: clinicProfile.tagline,
        address: clinicProfile.address,
        phone: clinicProfile.phone,
        email: clinicProfile.email,
        whatsapp_phone_id: clinicProfile.whatsappPhoneId,
        telegram_bot: clinicProfile.telegramBot,
        timezone: clinicProfile.timezone,
        currency: clinicProfile.currency,
        currency_symbol: clinicProfile.currencySymbol,
      },
      schedule_engine: {
        open_time: operatingHours[0]?.openTime || '08:00',
        close_time: operatingHours[0]?.closeTime || '18:00',
        working_days: workingDays,
        operating_hours_by_day: operatingHours.map((d) => ({
          day: d.day,
          day_index: d.dayIndex,
          is_open: d.isOpen,
          open_time: d.openTime,
          close_time: d.closeTime,
          lunch_break: d.isOpen
            ? { start: d.lunchStart, end: d.lunchEnd }
            : null,
        })),
        rules: {
          offer_expiry_minutes: schedulingRules.offerExpiryMinutes,
          hold_expiry_minutes: schedulingRules.holdExpiryMinutes,
          default_buffer_minutes: schedulingRules.defaultBufferMinutes,
          emergency_slots_per_shift: schedulingRules.emergencySlotsPerShift,
          booking_horizon_days: schedulingRules.bookingHorizonDays,
          grid_increment_minutes: schedulingRules.gridIncrementMinutes,
          min_advance_hours: schedulingRules.minAdvanceHours,
        },
      },
      notifications: {
        enable_24h_reminder: notificationRules.enable24hReminder,
        enable_2h_reminder: notificationRules.enable2hReminder,
        auto_lock_minutes: notificationRules.autoLockMinutes,
        max_pin_attempts: notificationRules.maxPinAttempts,
        lockout_cooldown_seconds: notificationRules.lockoutCooldownSeconds,
      },
    };

    return config;
  },

  exportClientConfigJson: () => {
    const config = get().generateClientConfigJson();
    const jsonString = JSON.stringify(config, null, 2);
    const blob = new Blob([jsonString], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    const slug = (get().clinicProfile.clinicName || 'clinic')
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '-');
    link.download = `${slug}-client-config.json`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);

    try {
      soundService.playChime();
    } catch {
      // Audio fallback
    }

    set({
      toast: {
        tone: 'success',
        text: `Exported ${slug}-client-config.json for zero-code onboarding.`,
      },
    });
  },

  addCustomCategory: (categoryName) => {
    const trimmed = (categoryName || '').trim();
    if (!trimmed) return;
    set((state) => {
      if (state.customCategories.includes(trimmed)) return state;
      return {
        customCategories: [...state.customCategories, trimmed],
        isDirty: true,
      };
    });
  },

  addService: (newService) => {
    const id = `svc-${Date.now()}`;
    const category = (newService.category || 'General Practice').trim();
    const serviceToAdd = {
      id,
      name: newService.name || 'New Service',
      category,
      durationMin: Number(newService.durationMin) || 30,
      bufferMin: Number(newService.bufferMin) || 10,
      description: newService.description || '',
      isActive: true,
    };
    set((state) => {
      const updatedCategories =
        category && !state.customCategories.includes(category)
          ? [...state.customCategories, category]
          : state.customCategories;

      return {
        services: [...state.services, serviceToAdd],
        customCategories: updatedCategories,
        isDirty: true,
        toast: {
          tone: 'success',
          text: `Clinical service "${serviceToAdd.name}" added successfully.`,
        },
      };
    });

    if (!useAppModeStore.getState().isDemoMode) {
      apiService.createService(serviceToAdd).catch((err) => {
        console.warn('Backend createService failed:', err);
      });
    }

    soundService.playChime();
  },

  deleteService: (serviceId) => {
    const s = get().services.find((x) => x.id === serviceId);
    set((state) => ({
      services: state.services.filter((x) => x.id !== serviceId),
      isDirty: true,
      toast: {
        tone: 'amber',
        text: `Service "${s?.name || 'Service'}" removed from clinic registry.`,
      },
    }));

    if (!useAppModeStore.getState().isDemoMode) {
      apiService.deleteService(serviceId).catch((err) => {
        console.warn('Backend deleteService failed:', err);
      });
    }

    soundService.playKeyClick();
  },

  addStaffRole: (role) => {
    const trimmed = String(role || '').trim();
    if (!trimmed) return;
    const current = get().staffRoles || DEFAULT_STAFF_ROLES;
    if (!current.includes(trimmed)) {
      set({ staffRoles: [...current, trimmed], isDirty: true });
    }
  },

  removeStaffRole: (role) => {
    const current = get().staffRoles || DEFAULT_STAFF_ROLES;
    set({ staffRoles: current.filter((r) => r !== role), isDirty: true });
  },

  addStaffSpecialty: (spec) => {
    const trimmed = String(spec || '').trim();
    if (!trimmed) return;
    const current = get().staffSpecialties || DEFAULT_STAFF_SPECIALTIES;
    if (!current.includes(trimmed)) {
      set({ staffSpecialties: [...current, trimmed], isDirty: true });
    }
  },

  removeStaffSpecialty: (spec) => {
    const current = get().staffSpecialties || DEFAULT_STAFF_SPECIALTIES;
    set({ staffSpecialties: current.filter((s) => s !== spec), isDirty: true });
  },

  toggleServiceActive: (serviceId) => {
    const target = get().services.find((s) => s.id === serviceId);
    const nextActive = target ? !target.isActive : false;

    set((state) => ({
      services: state.services.map((s) =>
        s.id === serviceId ? { ...s, isActive: !s.isActive } : s
      ),
      isDirty: true,
    }));

    if (!useAppModeStore.getState().isDemoMode) {
      apiService.updateService(serviceId, { is_active: nextActive }).catch((err) => {
        console.warn('Backend updateService failed:', err);
      });
    }
  },

  copyClientConfigJson: async () => {
    const config = get().generateClientConfigJson();
    const jsonString = JSON.stringify(config, null, 2);
    try {
      await navigator.clipboard.writeText(jsonString);
      set({
        toast: {
          tone: 'success',
          text: 'client-config.json copied to clipboard!',
        },
      });
    } catch {
      set({
        toast: {
          tone: 'neutral',
          text: 'Clipboard copy unavailable in current browser sandbox.',
        },
      });
    }
  },
}),
    {
      name: 'cedarcare_settings_storage',
      partialize: (state) => ({
        clinicProfile: state.clinicProfile,
        operatingHours: state.operatingHours,
        schedulingRules: state.schedulingRules,
        notificationRules: state.notificationRules,
        services: state.services,
        customCategories: state.customCategories,
        staffRoles: state.staffRoles,
        staffSpecialties: state.staffSpecialties,
      }),
    }
  )
);
