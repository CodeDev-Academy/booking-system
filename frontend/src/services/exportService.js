/**
 * Export Service — Handles CSV generation, formatting, and file downloads.
 */

export const exportService = {
  /**
   * Export appointment records to CSV
   */
  exportAppointmentsToCSV(appointments, filename = null) {
    const defaultFilename = `MedPulse_Appointments_${new Date().toISOString().split('T')[0]}.csv`;
    const headers = [
      'Appointment ID',
      'Patient Name',
      'Phone',
      'Doctor',
      'Service',
      'Time Slot',
      'Status',
      'Follow-Up Date',
      'Notes'
    ];

    const rows = appointments.map(a => [
      a.appointment_id,
      `"${(a.patient_name || '').replace(/"/g, '""')}"`,
      `"${(a.patient_phone || '').replace(/"/g, '""')}"`,
      `"${(a.doctor_name || '').replace(/"/g, '""')}"`,
      `"${(a.service_name || '').replace(/"/g, '""')}"`,
      `"${(a.time_label || '').replace(/"/g, '""')}"`,
      a.status,
      `"${a.follow_up_scheduled || 'None'}"`,
      `"${(a.notes || '').replace(/"/g, '""')}"`
    ]);

    this._downloadCSV([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), filename || defaultFilename);
  },

  /**
   * Export staff attendance records to CSV
   */
  exportAttendanceToCSV(staffList, filename = null) {
    const defaultFilename = `MedPulse_Staff_Attendance_${new Date().toISOString().split('T')[0]}.csv`;
    const headers = [
      'Staff ID',
      'Staff Name',
      'Role',
      'Shift',
      'Duty Status',
      'Station / Desk',
      'Last Check-in'
    ];

    const rows = staffList.map(s => [
      s.id,
      `"${(s.full_name || '').replace(/"/g, '""')}"`,
      s.role,
      `"${(s.shift || 'General').replace(/"/g, '""')}"`,
      s.duty_status,
      `"${(s.desk || '').replace(/"/g, '""')}"`,
      `"${(s.last_login || '').replace(/"/g, '""')}"`
    ]);

    this._downloadCSV([headers.join(','), ...rows.map(r => r.join(','))].join('\n'), filename || defaultFilename);
  },

  /**
   * Internal helper to create blob and trigger browser download
   */
  _downloadCSV(content, filename) {
    const blob = new Blob([content], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', filename);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  }
};
