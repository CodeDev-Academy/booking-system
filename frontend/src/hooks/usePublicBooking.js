/**
 * usePublicBooking — headless logic for the public booking page.
 *
 * LOGIC LAYER ONLY: no JSX, no styles. The view renders what this hook returns.
 *
 * Flow: service → details → when → done. Validation lives here so the
 * presentation layer stays dumb, and the wire payload is built by the pure
 * `bookingIntakePayload` module (the same one the Node harness executes).
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { apiService } from '../services/apiService';
import { buildBookingIntakePayload } from '../services/bookingIntakePayload';

export const PUBLIC_BOOKING_STEPS = ['service', 'details', 'when', 'done'];

const EMPTY_FORM = {
  patientName: '',
  patientPhone: '',
  serviceId: '',
  preferredDoctorId: '',
  fromDate: '',
  toDate: '',
  timeWindow: 'morning',
  dateOfBirth: '',
  gender: '',
  isEmergency: false,
  notes: '',
  trap: '',
};

const digits = (value) => String(value || '').replace(/[^0-9]/g, '');

export function usePublicBooking() {
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  const [step, setStep] = useState('service');
  const [form, setForm] = useState(EMPTY_FORM);
  const [errors, setErrors] = useState({});

  const [submitting, setSubmitting] = useState(false);
  const [submitError, setSubmitError] = useState('');
  const [result, setResult] = useState(null);
  // A fast double-tap must not create two requests: state is async, a ref is not.
  const submitLock = useRef(false);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const data = await apiService.fetchPublicBookingInfo();
      setInfo(data);
      if (!form.serviceId && Array.isArray(data?.services) && data.services.length === 1) {
        setForm((prev) => ({ ...prev, serviceId: data.services[0].id }));
      }
    } catch (err) {
      setLoadError(
        err?.message
          ? `We could not load the booking desk: ${err.message}`
          : 'We could not load the booking desk.'
      );
    } finally {
      setLoading(false);
    }
    // `form.serviceId` is intentionally not a dependency: this runs once.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const setField = useCallback((key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setErrors((prev) => (prev[key] ? { ...prev, [key]: '' } : prev));
  }, []);

  const selectedService = useMemo(() => {
    const list = info?.services || [];
    return list.find((item) => item.id === form.serviceId) || null;
  }, [info, form.serviceId]);

  const selectedDoctor = useMemo(() => {
    const list = info?.doctors || [];
    return list.find((item) => item.id === form.preferredDoctorId) || null;
  }, [info, form.preferredDoctorId]);

  const validate = useCallback((which) => {
    const next = {};
    if (which === 'service') {
      if (!form.serviceId) next.serviceId = 'Choose the service you need.';
    }
    if (which === 'details') {
      if (form.patientName.trim().length < 2) next.patientName = 'Please enter your full name.';
      if (digits(form.patientPhone).length < 8) {
        next.patientPhone = 'Please enter a phone number we can reach you on.';
      }
      if (form.dateOfBirth && form.dateOfBirth > new Date().toISOString().slice(0, 10)) {
        next.dateOfBirth = 'That date of birth is in the future.';
      }
    }
    if (which === 'when') {
      if (form.fromDate && form.toDate && form.toDate < form.fromDate) {
        next.toDate = 'The last date cannot be before the first date.';
      }
    }
    setErrors(next);
    return Object.keys(next).length === 0;
  }, [form]);

  const goTo = useCallback((target) => {
    setStep(target);
    if (typeof window !== 'undefined') window.scrollTo({ top: 0, behavior: 'smooth' });
  }, []);

  const next = useCallback(() => {
    const index = PUBLIC_BOOKING_STEPS.indexOf(step);
    if (index < 0) return;
    if (!validate(step)) return;
    goTo(PUBLIC_BOOKING_STEPS[index + 1]);
  }, [step, validate, goTo]);

  const back = useCallback(() => {
    const index = PUBLIC_BOOKING_STEPS.indexOf(step);
    if (index > 0) goTo(PUBLIC_BOOKING_STEPS[index - 1]);
  }, [step, goTo]);

  const submit = useCallback(async () => {
    if (submitLock.current) return;
    if (!validate('when')) return;
    submitLock.current = true;
    setSubmitting(true);
    setSubmitError('');
    try {
      const payload = buildBookingIntakePayload(form);
      const created = await apiService.createBookingRequest(payload);
      setResult(created);
      goTo('done');
    } catch (err) {
      // The server's own sentence is the truth (rate limit, missing service,
      // closed intake). Never replace it with a friendlier guess.
      setSubmitError(
        err?.details?.patient_phone
          || err?.details?.service_id
          || err?.message
          || 'We could not send your request. Please try again.'
      );
    } finally {
      submitLock.current = false;
      setSubmitting(false);
    }
  }, [form, validate, goTo]);

  const restart = useCallback(() => {
    // A one-service clinic should not have to re-pick after "book another".
    const onlyService = (info?.services || []).length === 1 ? info.services[0].id : '';
    setForm({ ...EMPTY_FORM, serviceId: onlyService });
    setErrors({});
    setResult(null);
    setSubmitError('');
    goTo('service');
  }, [info, goTo]);

  return {
    info,
    loading,
    loadError,
    reload: load,
    step,
    form,
    errors,
    setField,
    selectedService,
    selectedDoctor,
    submitting,
    submitError,
    result,
    next,
    back,
    submit,
    restart,
    canGoBack: step !== 'service' && step !== 'done',
  };
}
