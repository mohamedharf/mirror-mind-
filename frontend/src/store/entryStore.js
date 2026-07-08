import { create } from 'zustand'

export const useEntryStore = create((set, get) => ({
  todayEntries:       [],
  selectedParentId:   null,
  selectedParentText: '',
  lastReflection:     null,
  metrics:            [],
  isRecording:        false,
  isSaving:           false,
  streak:             0,

  setTodayEntries: (entries) => set({ todayEntries: entries }),

  addToTodayEntries: (entry) =>
    set((s) => ({ todayEntries: [entry, ...s.todayEntries] })),

  updateTodayEntry: (updated) =>
    set((s) => ({
      todayEntries: s.todayEntries.map(e => e.id === updated.id ? updated : e)
    })),

  setSelectedParent: (id, text) =>
    set({ selectedParentId: id, selectedParentText: text }),

  clearSelectedParent: () =>
    set({ selectedParentId: null, selectedParentText: '' }),

  setLastReflection: (data) => set({ lastReflection: data }),
  setMetrics:        (m)    => set({ metrics: m }),
  setRecording:      (v)    => set({ isRecording: v }),
  setSaving:         (v)    => set({ isSaving: v }),
  setStreak:         (n)    => set({ streak: n }),
}))
