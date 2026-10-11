import { useState, useMemo, useEffect } from 'react';
import { INITIAL_STAFF } from '../utils/mockData';
import { apiService } from '../services/apiService';
import { useAuth } from '../context/AuthContext';

export const useStaffDirectory = ({ onToast }) => {
  const { currentUser, trigger401Unauthorized } = useAuth();
  const [staffList, setStaffList] = useState(() => {
    const saved = localStorage.getItem('clinic_staff_roster');
    if (saved) {
      try {
        return JSON.parse(saved);
      } catch (e) {
        console.error('Failed to parse saved staff roster from localStorage:', e);
      }
    }
    return INITIAL_STAFF;
  });

  // Persist any duty tag or staff changes to localStorage
  useEffect(() => {
    localStorage.setItem('clinic_staff_roster', JSON.stringify(staffList));
  }, [staffList]);
  const [filterCategory, setFilterCategory] = useState('all'); // 'all', 'doctors', 'dashboard', 'support'
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [editingStaff, setEditingStaff] = useState(null);
  const [credentialsStaff, setCredentialsStaff] = useState(null);
  const [selectedStaffDetail, setSelectedStaffDetail] = useState(null);

  // Helper to determine if a staff member has dashboard system login access
  const isDashboardUser = (staff) => {
    return staff && ['receptionist', 'clinic_admin'].includes(staff.role);
  };

  // Filtered & Searched staff list
  const filteredStaff = useMemo(() => {
    return staffList.filter(s => {
      // Category filter
      if (filterCategory === 'doctors' && s.role !== 'doctor') return false;
      if (filterCategory === 'dashboard' && !['receptionist', 'clinic_admin'].includes(s.role)) return false;
      if (filterCategory === 'support' && ['doctor', 'receptionist', 'clinic_admin'].includes(s.role)) return false;

      // Text search query
      if (searchQuery.trim()) {
        const query = searchQuery.toLowerCase().trim();
        const matchName = s.full_name?.toLowerCase().includes(query);
        const matchRole = s.role?.toLowerCase().includes(query);
        const matchDesk = s.desk?.toLowerCase().includes(query);
        const matchSpecialty = s.specialty?.toLowerCase().includes(query);
        const matchPhone = s.phone?.toLowerCase().includes(query);
        const matchEmail = s.email?.toLowerCase().includes(query);
        if (!matchName && !matchRole && !matchDesk && !matchSpecialty && !matchPhone && !matchEmail) {
          return false;
        }
      }

      return true;
    });
  }, [staffList, filterCategory, searchQuery]);

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

  // Update existing staff profile
  const updateStaff = (staffId, updatedFields) => {
    setStaffList(prev => prev.map(s => {
      if (s.id === staffId) {
        return { ...s, ...updatedFields };
      }
      return s;
    }));
    setEditingStaff(null);
    if (onToast) onToast(`Updated details for ${updatedFields.full_name || 'staff member'}.`);
  };

  // Update or reset credentials (PIN & Password)
  const updateCredentials = (staffId, { pin, password }) => {
    setStaffList(prev => prev.map(s => {
      if (s.id === staffId) {
        return {
          ...s,
          quick_pin: pin || s.quick_pin || '1234',
          password: password || s.password
        };
      }
      return s;
    }));
    setCredentialsStaff(null);
    const staff = staffList.find(s => s.id === staffId);
    if (onToast) onToast(`Credentials updated for ${staff?.full_name || 'staff'}.`);
  };

  // 1-Click Reset PIN to default 1234
  const resetPin = async (staffId) => {
    await apiService.admin.resetPin(staffId);
    const staff = staffList.find(s => s.id === staffId);
    setStaffList(prev => prev.map(s => {
      if (s.id === staffId) {
        return { ...s, quick_pin: '1234' };
      }
      return s;
    }));
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
    setStaffList,
    filterCategory,
    setFilterCategory,
    searchQuery,
    setSearchQuery,
    filteredStaff,
    selectedStaffDetail,
    setSelectedStaffDetail,
    isDashboardUser,
    showAddModal,
    setShowAddModal,
    editingStaff,
    setEditingStaff,
    credentialsStaff,
    setCredentialsStaff,
    updateDutyStatus,
    addStaff,
    updateStaff,
    updateCredentials,
    resetPin,
    deactivateStaff
  };
};
