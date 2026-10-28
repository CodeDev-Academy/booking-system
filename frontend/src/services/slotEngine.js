import { DOCTORS, SERVICES, TIME_WINDOWS, CLINIC_RULES, at } from './mockData';
import { useSettingsStore } from '../stores/useSettingsStore';
import { useStaffStore } from '../stores/useStaffStore';

/**
 * slotEngine — Demo-mode Double-Booking Shield + candidate slot generation.
 * LOGIC LAYER. In Live API mode the Django availability engine replaces this;
 * the shapes returned here mirror the API so the UI is identical in both modes.
 */

const MIN = 60000;

export const getService = (id) => {
  try {
    const custom = useSettingsStore.getState()?.services?.find((s) => s.id === id);
    if (custom) return custom;
  } catch {
    // SSR / initial hydration fallback
  }
  return SERVICES.find((s) => s.id === id);
};

export const getAllDoctors = () => {
  try {
    const staffDocs = useStaffStore.getState()?.staffList?.filter((s) => s.role === 'doctor' && s.isActive !== false);
    if (staffDocs && staffDocs.length > 0) {
      return staffDocs.map((s) => {
        const seedDoc = DOCTORS.find((d) => d.id === s.id);
        return {
          id: s.id,
          name: s.name,
          specialty: s.specialty || (seedDoc ? seedDoc.specialty : 'General Practitioner'),
          shiftStartMin: seedDoc ? seedDoc.shiftStartMin : 8 * 60,
          shiftEndMin: seedDoc ? seedDoc.shiftEndMin : 17 * 60,
          serviceIds: seedDoc ? seedDoc.serviceIds : ['svc-checkup', 'svc-dental', 'svc-extract'],
        };
      });
    }
  } catch {}
  return DOCTORS;
};

export const getDoctor = (id) => {
  const all = getAllDoctors();
  return all.find((d) => d.id === id) || DOCTORS.find((d) => d.id === id);
};

export const doctorsForService = (serviceId) => {
  const all = getAllDoctors();
  const direct = all.filter((d) => d.serviceIds?.includes(serviceId));
  if (direct.length > 0) return direct;

  // Fallback for custom or newly registered clinic services
  const s = getService(serviceId);
  const cat = (s?.category || s?.name || '').toLowerCase();
  if (cat.includes('dent') || cat.includes('tooth') || cat.includes('oral') || cat.includes('extract')) {
    const dentists = all.filter((d) => d.specialty?.toLowerCase().includes('dent'));
    if (dentists.length > 0) return dentists;
  }
  // Otherwise general practice / all available clinicians
  return all;
};

export const slotEnd = (slot) => slot.start + slot.durationMin * MIN;
export const slotBlockEnd = (slot) => slotEnd(slot) + slot.bufferMin * MIN;

/**
 * Validate one slot against shift hours and every busy block.
 * Returns { ok, code, message, nextSafeStart }.
 * codes: OK | OUT_OF_SHIFT | BUFFER | BREAK | RESERVE | BOOKED
 */
export const validateSlot = (slot, busyBlocks) => {
  const doctor = getDoctor(slot.doctorId);
  const d = new Date(slot.start);
  const startMin = d.getHours() * 60 + d.getMinutes();

  const bufferMin = slot.bufferMin !== undefined ? slot.bufferMin : 10;
  if (!doctor || startMin < doctor.shiftStartMin || startMin + slot.durationMin + bufferMin > doctor.shiftEndMin) {
    return {
      ok: false,
      code: 'OUT_OF_SHIFT',
      message: `Outside ${doctor ? doctor.name : 'doctor'}'s shift hours (procedure + buffer)`,
      nextSafeStart: null,
    };
  }

  const blockEnd = slotBlockEnd(slot);
  const hit = busyBlocks.find(
    (b) => (b.doctorId === null || b.doctorId === slot.doctorId) && slot.start < b.end && blockEnd > b.start
  );

  if (!hit) return { ok: true, code: 'OK', message: 'Conflict-free', nextSafeStart: null };

  const codeMap = { buffer: 'BUFFER', break: 'BREAK', reserve: 'RESERVE', appointment: 'BOOKED' };
  const code = codeMap[hit.type] || 'BOOKED';
  const messages = {
    BUFFER: 'Sanitization buffer conflict — previous procedure needs sterilization time',
    BREAK: `${hit.label} overlaps this slot`,
    RESERVE: 'Designated Walk-In Emergency Reserve — not for routine bookings',
    BOOKED: `${hit.label} already occupies this time`,
  };
  return { ok: false, code, message: messages[code], nextSafeStart: hit.end };
};

let slotCounter = 0;
export const makeSlot = ({ doctorId, start, service, custom = false }) => {
  slotCounter += 1;
  return {
    id: `slot-${Date.now()}-${slotCounter}`,
    doctorId,
    start,
    durationMin: service.durationMin,
    bufferMin: service.bufferMin !== undefined ? service.bufferMin : 10,
    custom,
  };
};

/** Pick up to `count` conflict-free candidate slots in the patient's window. */
export const generateCandidateSlots = (request, busyBlocks, count = 3) => {
  const service = request.customService || getService(request.serviceId);
  if (!service) return [];
  const window = TIME_WINDOWS[request.timeWindow] || TIME_WINDOWS.morning;
  const allDoctors = getAllDoctors();
  const candidateDoctors = request.preferredDoctorId
    ? [getDoctor(request.preferredDoctorId)].filter(Boolean)
    : (request.customService ? allDoctors : doctorsForService(request.serviceId));
  const doctors = candidateDoctors.length > 0 ? candidateDoctors : allDoctors;
  const step = CLINIC_RULES.gridIncrementMin;
  const picked = [];
  const now = Date.now();
  const bufferMin = service.bufferMin !== undefined ? service.bufferMin : 10;

  for (let day = request.dateRange.fromOffset; day <= request.dateRange.toOffset && picked.length < count; day += 1) {
    const dayOfWeek = new Date(at(day, 0)).getDay();
    // Sunday (0) is closed
    if (dayOfWeek === 0) continue;

    // Saturday (6) operates on adjusted hours (09:00 - 15:00)
    const dayWindowFrom = dayOfWeek === 6 ? Math.max(window.fromMin, 9 * 60) : window.fromMin;
    const dayWindowTo = dayOfWeek === 6 ? Math.min(window.toMin, 15 * 60) : window.toMin;
    if (dayWindowFrom >= dayWindowTo) continue;

    for (const doctor of doctors) {
      for (let m = dayWindowFrom; m + service.durationMin + bufferMin <= dayWindowTo && picked.length < count; m += step) {
        const start = at(day, 0) + m * MIN;
        if (start < now) continue;
        const candidate = makeSlot({ doctorId: doctor.id, start, service });
        const nearPick = picked.some(
          (p) => p.doctorId === candidate.doctorId && Math.abs(p.start - candidate.start) < 90 * MIN
        );
        if (nearPick) continue;
        if (validateSlot(candidate, busyBlocks).ok) picked.push(candidate);
      }
    }
  }
  return picked.sort((a, b) => a.start - b.start);
};
