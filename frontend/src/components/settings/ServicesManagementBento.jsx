import React, { useState, useMemo } from 'react';
import {
  Stethoscope,
  Plus,
  Trash2,
  Clock,
  Sparkles,
  Layers,
  CheckCircle2,
  X,
  Tag,
  FileText,
  ChevronDown,
  ChevronUp,
  Save,
} from 'lucide-react';
import { useSettingsStore } from '../../stores/useSettingsStore';

const BASE_CATEGORY_OPTIONS = [
  'Dental',
  'Eye Care',
  'ENT Care',
  'General Practice',
  'Cardiology',
  'Pediatrics',
  'Dermatology',
  'Physiotherapy',
];

export const ServicesManagementBento = ({
  services = [],
  onAddService,
  onDeleteService,
  onToggleActive,
}) => {
  const customCategories = useSettingsStore((s) => s.customCategories || []);
  const addCustomCategory = useSettingsStore((s) => s.addCustomCategory);

  const [showAddForm, setShowAddForm] = useState(false);
  const [expandedServiceId, setExpandedServiceId] = useState(null);
  const [editForm, setEditForm] = useState({});

  // Add form states
  const [isCustomCategory, setIsCustomCategory] = useState(false);
  const [customCategoryInput, setCustomCategoryInput] = useState('');
  const [newFormData, setNewFormData] = useState({
    name: '',
    category: 'Dental',
    durationMin: 30,
    bufferMin: 10,
    description: '',
  });

  // Edit form states
  const [editIsCustomCategory, setEditIsCustomCategory] = useState(false);
  const [editCustomCategoryInput, setEditCustomCategoryInput] = useState('');

  // Combined unique list of categories (Base + Custom + Active Services)
  const availableCategories = useMemo(() => {
    const set = new Set([
      ...BASE_CATEGORY_OPTIONS,
      ...customCategories,
      ...services.map((s) => s.category).filter(Boolean),
    ]);
    return Array.from(set);
  }, [services, customCategories]);

  const handleToggleExpand = (svc) => {
    if (expandedServiceId === svc.id) {
      setExpandedServiceId(null);
      setEditIsCustomCategory(false);
      setEditCustomCategoryInput('');
    } else {
      setExpandedServiceId(svc.id);
      setEditForm({ ...svc });
      setEditIsCustomCategory(false);
      setEditCustomCategoryInput('');
    }
  };

  const handleSaveEdit = (e) => {
    e.preventDefault();
    if (!editForm.name?.trim()) return;

    let finalCategory = editForm.category;
    if (editIsCustomCategory) {
      finalCategory = editCustomCategoryInput.trim() || 'General Practice';
      if (addCustomCategory) addCustomCategory(finalCategory);
    }

    if (onAddService) {
      onDeleteService(editForm.id);
      onAddService({
        name: editForm.name.trim(),
        category: finalCategory,
        durationMin: Number(editForm.durationMin) || 30,
        bufferMin: Number(editForm.bufferMin) || 10,
        description: editForm.description || '',
      });
    }
    setExpandedServiceId(null);
    setEditIsCustomCategory(false);
    setEditCustomCategoryInput('');
  };

  const handleAddNew = (e) => {
    e.preventDefault();
    if (!newFormData.name.trim()) return;

    let finalCategory = newFormData.category;
    if (isCustomCategory) {
      finalCategory = customCategoryInput.trim();
      if (!finalCategory) {
        finalCategory = 'General Practice';
      } else if (addCustomCategory) {
        addCustomCategory(finalCategory);
      }
    }

    onAddService({
      name: newFormData.name.trim(),
      category: finalCategory,
      durationMin: Number(newFormData.durationMin) || 30,
      bufferMin: Number(newFormData.bufferMin) || 10,
      description: newFormData.description.trim(),
    });

    setNewFormData({
      name: '',
      category: availableCategories[0] || 'Dental',
      durationMin: 30,
      bufferMin: 10,
      description: '',
    });
    setIsCustomCategory(false);
    setCustomCategoryInput('');
    setShowAddForm(false);
  };

  return (
    <div className="settings-card">
      <div className="settings-card-header" style={{ marginBottom: '10px' }}>
        <div className="settings-card-title-group">
          <div className="settings-icon-badge">
            <Stethoscope size={18} color="var(--amber)" />
          </div>
          <div>
            <h3 className="settings-card-title">Clinical Services &amp; Specialties</h3>
            <p className="settings-card-subtitle">
              Click any service card to edit duration, room buffer, or clinical scope.
            </p>
          </div>
        </div>

        <button
          type="button"
          className="btn-base btn-primary btn-sm"
          onClick={() => setShowAddForm(!showAddForm)}
          style={{ display: 'flex', alignItems: 'center', gap: '5px', fontSize: '11px', padding: '4px 10px' }}
        >
          {showAddForm ? <X size={12} /> : <Plus size={12} />}
          <span>{showAddForm ? 'Cancel' : '+ Add Service'}</span>
        </button>
      </div>

      {/* Add New Service Form */}
      {showAddForm && (
        <form
          onSubmit={handleAddNew}
          style={{
            background: 'var(--surface-2)',
            padding: '12px 14px',
            borderRadius: 'var(--radius-md)',
            border: '1px solid var(--border)',
            marginBottom: '12px',
            display: 'flex',
            flexDirection: 'column',
            gap: '10px',
          }}
        >
          <div style={{ fontWeight: 600, fontSize: '12px', color: 'var(--text)' }}>
            Enroll New Service
          </div>

          <div style={{ display: 'flex', gap: '10px', flexWrap: 'wrap' }}>
            <div style={{ flex: 1, minWidth: '180px', maxWidth: '100%', boxSizing: 'border-box' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '3px' }}>
                Service Name *
              </label>
              <input
                type="text"
                className="input-base"
                placeholder="e.g. Eye Refraction Exam"
                value={newFormData.name}
                onChange={(e) => setNewFormData({ ...newFormData, name: e.target.value })}
                required
              />
            </div>

            <div style={{ flex: '1 1 160px', minWidth: '140px', maxWidth: '100%', boxSizing: 'border-box' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '3px' }}>
                Category
              </label>
              <select
                className="select-base"
                value={isCustomCategory ? '__custom__' : newFormData.category}
                onChange={(e) => {
                  if (e.target.value === '__custom__') {
                    setIsCustomCategory(true);
                  } else {
                    setIsCustomCategory(false);
                    setNewFormData({ ...newFormData, category: e.target.value });
                  }
                }}
              >
                {availableCategories.map((cat) => (
                  <option key={cat} value={cat}>
                    {cat}
                  </option>
                ))}
                <option value="__custom__">✨ + Create Custom Category...</option>
              </select>
            </div>

            {isCustomCategory && (
              <div style={{ flex: '1 1 200px', minWidth: '180px' }}>
                <label style={{ display: 'block', fontSize: '11px', color: 'var(--amber)', fontWeight: 600, marginBottom: '3px' }}>
                  Custom Category Name *
                </label>
                <div style={{ display: 'flex', gap: '6px' }}>
                  <input
                    type="text"
                    className="input-base"
                    placeholder="e.g. Laser Therapy, Aesthetics, Spa..."
                    value={customCategoryInput}
                    onChange={(e) => setCustomCategoryInput(e.target.value)}
                    required
                    autoFocus
                  />
                  <button
                    type="button"
                    className="btn-base btn-secondary btn-sm"
                    onClick={() => {
                      setIsCustomCategory(false);
                      setCustomCategoryInput('');
                    }}
                    title="Cancel custom category"
                    style={{ padding: '0 8px', fontSize: '11px' }}
                  >
                    <X size={12} />
                  </button>
                </div>
              </div>
            )}

            <div style={{ width: '100px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '3px' }}>
                Duration (min)
              </label>
              <input
                type="number"
                className="input-base tabular-nums"
                min="10"
                max="180"
                step="5"
                value={newFormData.durationMin}
                onChange={(e) => setNewFormData({ ...newFormData, durationMin: e.target.value })}
              />
            </div>

            <div style={{ width: '100px' }}>
              <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '3px' }}>
                Buffer (min)
              </label>
              <input
                type="number"
                className="input-base tabular-nums"
                min="0"
                max="60"
                step="5"
                value={newFormData.bufferMin}
                onChange={(e) => setNewFormData({ ...newFormData, bufferMin: e.target.value })}
              />
            </div>
          </div>

          <div>
            <label style={{ display: 'block', fontSize: '11px', color: 'var(--text-3)', marginBottom: '3px' }}>
              Description
            </label>
            <input
              type="text"
              className="input-base"
              placeholder="Brief description displayed to patients"
              value={newFormData.description}
              onChange={(e) => setNewFormData({ ...newFormData, description: e.target.value })}
            />
          </div>

          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '8px', marginTop: '4px' }}>
            <button
              type="button"
              className="btn-base btn-secondary btn-sm"
              onClick={() => setShowAddForm(false)}
            >
              Cancel
            </button>
            <button type="submit" className="btn-base btn-primary btn-sm">
              <Plus size={12} />
              <span>Save Service</span>
            </button>
          </div>
        </form>
      )}

      {/* Compact Services Cards Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fill, minmax(260px, 1fr))',
          gap: '10px',
        }}
      >
        {services.map((svc) => {
          const isExpanded = expandedServiceId === svc.id;

          return (
            <div
              key={svc.id}
              className={`service-compact-card ${!svc.isActive ? 'service-inactive' : ''}`}
              style={{
                background: 'var(--surface-1)',
                border: isExpanded ? '1px solid var(--amber)' : '1px solid var(--border)',
                borderRadius: 'var(--radius-md)',
                boxShadow: 'var(--shadow-sm)',
                overflow: 'hidden',
                transition: 'all 0.15s ease',
              }}
            >
              {/* Card Summary Line (Click to expand) */}
              <div
                onClick={() => handleToggleExpand(svc)}
                role="button"
                tabIndex={0}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    handleToggleExpand(svc);
                  }
                }}
                style={{
                  padding: '10px 12px',
                  cursor: 'pointer',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '8px',
                }}
                title="Click to view and edit details"
              >
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div style={{ display: 'flex', alignItems: 'center', gap: '6px' }}>
                    <span style={{ fontWeight: 600, fontSize: '13px', color: 'var(--text)' }}>
                      {svc.name}
                    </span>
                    <span className="badge-pill badge-neutral mono-tag" style={{ fontSize: '9px', padding: '1px 5px' }}>
                      {svc.category}
                    </span>
                  </div>

                  <p
                    style={{
                      fontSize: '11px',
                      color: 'var(--text-3)',
                      margin: '3px 0 0 0',
                      whiteSpace: 'nowrap',
                      overflow: 'hidden',
                      textOverflow: 'ellipsis',
                    }}
                  >
                    {svc.description || 'Standard outpatient clinical service'}
                  </p>

                  <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginTop: '4px', fontSize: '10px', color: 'var(--text-2)' }}>
                    <span className="tabular-nums">⏱ {svc.durationMin}m duration</span>
                    <span>&bull;</span>
                    <span className="tabular-nums">+{svc.bufferMin}m buffer</span>
                  </div>
                </div>

                <div style={{ color: 'var(--text-3)', flexShrink: 0 }}>
                  {isExpanded ? <ChevronUp size={14} color="var(--amber)" /> : <ChevronDown size={14} />}
                </div>
              </div>

              {/* Expanded Inline Edit Drawer */}
              {isExpanded && (
                <div
                  style={{
                    padding: '12px',
                    background: 'var(--surface-2)',
                    borderTop: '1px solid var(--border)',
                    fontSize: '11px',
                    display: 'flex',
                    flexDirection: 'column',
                    gap: '8px',
                  }}
                >
                  <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                    <div style={{ flex: 1, minWidth: '140px', maxWidth: '100%', boxSizing: 'border-box' }}>
                      <label style={{ display: 'block', color: 'var(--text-3)', marginBottom: '2px' }}>Name</label>
                      <input
                        type="text"
                        className="input-base"
                        value={editForm.name}
                        onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      />
                    </div>

                    <div style={{ flex: '1 1 140px', minWidth: '130px', maxWidth: '100%', boxSizing: 'border-box' }}>
                      <label style={{ display: 'block', color: 'var(--text-3)', marginBottom: '2px' }}>Category</label>
                      <select
                        className="select-base"
                        value={editIsCustomCategory ? '__custom__' : editForm.category}
                        onChange={(e) => {
                          if (e.target.value === '__custom__') {
                            setEditIsCustomCategory(true);
                          } else {
                            setEditIsCustomCategory(false);
                            setEditForm({ ...editForm, category: e.target.value });
                          }
                        }}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      >
                        {availableCategories.map((c) => (
                          <option key={c} value={c}>{c}</option>
                        ))}
                        <option value="__custom__">✨ + Create Custom Category...</option>
                      </select>
                    </div>

                    {editIsCustomCategory && (
                      <div style={{ flex: '1 1 160px', minWidth: '150px' }}>
                        <label style={{ display: 'block', color: 'var(--amber)', fontWeight: 600, marginBottom: '2px' }}>Custom Category *</label>
                        <div style={{ display: 'flex', gap: '4px' }}>
                          <input
                            type="text"
                            className="input-base"
                            placeholder="New category..."
                            value={editCustomCategoryInput}
                            onChange={(e) => setEditCustomCategoryInput(e.target.value)}
                            style={{ fontSize: '12px', padding: '4px 8px' }}
                            required
                            autoFocus
                          />
                          <button
                            type="button"
                            className="btn-base btn-secondary btn-sm"
                            onClick={() => {
                              setEditIsCustomCategory(false);
                              setEditCustomCategoryInput('');
                            }}
                            style={{ padding: '0 6px', fontSize: '10px' }}
                          >
                            <X size={11} />
                          </button>
                        </div>
                      </div>
                    )}

                    <div style={{ width: '70px' }}>
                      <label style={{ display: 'block', color: 'var(--text-3)', marginBottom: '2px' }}>Dur (min)</label>
                      <input
                        type="number"
                        className="input-base tabular-nums"
                        value={editForm.durationMin}
                        onChange={(e) => setEditForm({ ...editForm, durationMin: e.target.value })}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      />
                    </div>

                    <div style={{ width: '70px' }}>
                      <label style={{ display: 'block', color: 'var(--text-3)', marginBottom: '2px' }}>Buf (min)</label>
                      <input
                        type="number"
                        className="input-base tabular-nums"
                        value={editForm.bufferMin}
                        onChange={(e) => setEditForm({ ...editForm, bufferMin: e.target.value })}
                        style={{ fontSize: '12px', padding: '4px 8px' }}
                      />
                    </div>
                  </div>

                  <div>
                    <label style={{ display: 'block', color: 'var(--text-3)', marginBottom: '2px' }}>Description</label>
                    <input
                      type="text"
                      className="input-base"
                      value={editForm.description || ''}
                      onChange={(e) => setEditForm({ ...editForm, description: e.target.value })}
                      style={{ fontSize: '12px', padding: '4px 8px' }}
                    />
                  </div>

                  {/* Actions */}
                  <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginTop: '6px' }}>
                    <button
                      type="button"
                      className="btn-base btn-danger btn-sm"
                      onClick={() => onDeleteService(svc.id)}
                      style={{ fontSize: '10px', padding: '3px 8px' }}
                    >
                      <Trash2 size={11} />
                      <span>Delete</span>
                    </button>

                    <div style={{ display: 'flex', gap: '6px' }}>
                      <button
                        type="button"
                        className="btn-base btn-secondary btn-sm"
                        onClick={() => setExpandedServiceId(null)}
                        style={{ fontSize: '10px', padding: '3px 8px' }}
                      >
                        Cancel
                      </button>
                      <button
                        type="button"
                        className="btn-base btn-primary btn-sm"
                        onClick={handleSaveEdit}
                        style={{ fontSize: '10px', padding: '3px 8px' }}
                      >
                        <Save size={11} />
                        <span>Save Edits</span>
                      </button>
                    </div>
                  </div>
                </div>
              )}
            </div>
          );
        })}
      </div>
    </div>
  );
};
