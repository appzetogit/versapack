import { create } from 'zustand'

/**
 * useDeliveryOnboardingStore - Persists onboarding files in memory
 * during the signup flow to prevent loss on back navigation.
 */
export const useDeliveryOnboardingStore = create((set) => ({
  documents: {
    profilePhoto: null,
    aadharPhoto: null,
    panPhoto: null,
    drivingLicensePhoto: null
  },
  
  setDocument: (type, file) => set((state) => ({
    documents: { ...state.documents, [type]: file }
  })),
  
  removeDocument: (type) => set((state) => ({
    documents: { ...state.documents, [type]: null }
  })),
  
  clearOnboardingState: () => set({
    documents: {
      profilePhoto: null,
      aadharPhoto: null,
      panPhoto: null,
      drivingLicensePhoto: null
    }
  })
}))
