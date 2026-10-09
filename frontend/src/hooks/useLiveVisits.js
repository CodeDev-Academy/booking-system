import { useState, useMemo } from 'react';
import { INITIAL_LIVE_APPOINTMENTS } from '../utils/mockData';
import { apiService } from '../services/apiService';

export const useLiveVisits = ({ onNotification }) => {
  const [appointments, setAppointments] = useState(INITIAL_LIVE_APPOINTMENTS);
  const [filterDoctor, setFilterDoctor] = useState('all');
  const [filterStatus, setFilterStatus] = useState('active'); // 'active', 'all', 'arrived', 'in_consultation', 'completed'
  const [selectedAppointmentForCompletion, setSelectedAppointmentForCompletion] = useState(null);

  // Metrics (Separation of Logic)
  const arrivedCount = useMemo(() => appointments.filter(a => a.status === 'arrived').length, [appointments]);
  const inConsultCount = useMemo(() => appointments.filter(a => a.status === 'in_consultation').length, [appointments]);
  const completedCount = useMemo(() => appointments.filter(a => a.status === 'completed').length, [appointments]);
  const confirmedCount = useMemo(() => appointments.filter(a => a.status === 'confirmed').length, [appointments]);

  // Filtered appointments list
  const filteredAppointments = useMemo(() => {
    return appointments.filter(a => {
      if (filterDoctor !== 'all' && a.doctor_id !== filterDoctor) return false;
      if (filterStatus === 'active') return ['confirmed', 'arrived', 'in_consultation'].includes(a.status);
      if (filterStatus !== 'all' && a.status !== filterStatus) return false;
      return true;
    });
  }, [appointments, filterDoctor, filterStatus]);

  // 1-Click Status Progression
  const updateVisitStatus = async (appointmentId, newStatus) => {
    await apiService.appointments.updateStatus(appointmentId, newStatus);

    setAppointments(prev => prev.map(apt => {
      if (apt.appointment_id === appointmentId) {
        return {
          ...apt,
          status: newStatus,
          arrival_at: newStatus === 'arrived' ? 'Just now' : apt.arrival_at,
          consultation_start_at: newStatus === 'in_consultation' ? 'Just now' : apt.consultation_start_at
        };
      }
      return apt;
    }));
  };

  // Complete consultation with doctor follow-up directions
  const completeWithFollowUp = async (appointmentId, followUpData) => {
    await apiService.appointments.updateStatus(appointmentId, 'completed');

    setAppointments(prev => prev.map(apt => {
      if (apt.appointment_id === appointmentId) {
        return {
          ...apt,
          status: 'completed',
          follow_up_scheduled: followUpData.followUpDate,
          notes: apt.notes ? `${apt.notes} | ${followUpData.notes}` : followUpData.notes
        };
      }
      return apt;
    }));

    setSelectedAppointmentForCompletion(null);
  };

  // Add new appointment confirmed by patient
  const addConfirmedAppointment = (appointmentData) => {
    setAppointments(prev => [appointmentData, ...prev]);
    if (onNotification) onNotification();
  };

  return {
    appointments,
    filterDoctor,
    setFilterDoctor,
    filterStatus,
    setFilterStatus,
    selectedAppointmentForCompletion,
    setSelectedAppointmentForCompletion,
    arrivedCount,
    inConsultCount,
    completedCount,
    confirmedCount,
    filteredAppointments,
    updateVisitStatus,
    completeWithFollowUp,
    addConfirmedAppointment
  };
};
