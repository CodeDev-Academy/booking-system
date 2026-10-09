import { useState, useMemo } from 'react';
import { INITIAL_STAFF } from '../utils/mockData';
import { apiService } from '../services/apiService';
import { useAuth } from '../context/AuthContext';

export const useStaffDirectory = ({ onToast }) => {
  const { currentUser, trigger401Unauthorized } = useAuth();
  const [staffList, setStaffList] = useState(INITIAL_STAFF);
  const [filterRole, setFilterRole] = useState('all');
  const [showAddModal, setShowAddModal] = useState(false);

  // Filtered staff list
  const filteredStaff = useMemo(() => {
    if (filterRole === 'all') return staffList;
    return staffList.filter(s => s.role === filterRole);
  }, [staffList, filterRole]);

  // Update duty status (on_duty, on_break, on_leave)
  const updateDutyStatus = (staffId, newDutyStatus) => {
    setStaffList(prev => prev.map(s => {
      if (s.id === staffId) {
        return { ...s, duty_status: newDutyStatus };
      }
      return s;
    }));
    if (onToast) onToast(`Duty status updated to ${newDutyStatus.replace('_', ' ')}.`);
  };

  // Add staff
  const addStaff = (newMember) => {
    setStaffList(prev => [...prev, newMember]);
    setShowAddModal(false);
    if (onToast) onToast(`Staff member ${newMember.full_name} successfully added!`);
  };

  // Reset PIN
  const resetPin = async (staffId) => {
    await apiService.admin.resetPin(staffId);
    const staff = staffList.find(s => s.id === staffId);
    if (onToast) onToast(`Quick PIN for ${staff?.full_name || 'staff'} reset to default: 1234.`);
  };

  // Deactivate staff
  const deactivateStaff = async (staffId) => {
    const staff = staffList.find(s => s.id === staffId);
    await apiService.admin.deactivateStaff(staffId);

    setStaffList(prev => prev.map(s => {
      if (s.id === staffId) {
        return { ...s, is_active: false, duty_status: 'on_leave' };
      }
      return s;
    }));

    if (onToast) onToast(`${staff?.full_name || 'Staff'} has been deactivated.`);

    // Test Security Requirement #4: Immediate 401 Unauthorized Handling!
    if (currentUser?.id === staffId) {
      setTimeout(() => {
        trigger401Unauthorized(`Account ${staff?.full_name} was deactivated by Administrator.`);
      }, 500);
    }
  };

  return {
    staffList,
    filterRole,
    setFilterRole,
    filteredStaff,
    showAddModal,
    setShowAddModal,
    updateDutyStatus,
    addStaff,
    resetPin,
    deactivateStaff
  };
};
