import { useState, useEffect, useRef } from "react"
import { useNavigate } from "react-router-dom"
import { ArrowLeft, X, Pencil, Loader2, Camera, Upload, Trash2, User } from "lucide-react"
import { Button } from "@food/components/ui/button"
import { Input } from "@food/components/ui/input"
import { Label } from "@food/components/ui/label"
import { Card, CardContent } from "@food/components/ui/card"
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@food/components/ui/select"
import { Avatar, AvatarFallback, AvatarImage } from "@food/components/ui/avatar"
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from "@food/components/ui/dialog"
import { useProfile } from "@food/context/ProfileContext"
import { userAPI } from "@food/api"
import { toast } from "sonner"
import useAppBackNavigation from "@food/hooks/useAppBackNavigation"
import { ImageSourcePicker } from "@food/components/ImageSourcePicker"
import { isFlutterBridgeAvailable } from "@food/utils/imageUploadUtils"
import { resolveMediaUrl } from "@food/utils/common"
import { LocalizationProvider } from '@mui/x-date-pickers/LocalizationProvider'
import { AdapterDayjs } from '@mui/x-date-pickers/AdapterDayjs'
import { DatePicker } from '@mui/x-date-pickers/DatePicker'
import dayjs from 'dayjs'
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}
const EDIT_PROFILE_DRAFT_KEY = "user_edit_profile_draft"


// Gender options
const genderOptions = [
  { value: "male", label: "Male" },
  { value: "female", label: "Female" },
  { value: "other", label: "Other" },
  { value: "prefer-not-to-say", label: "Prefer not to say" },
]

// Load profile data from localStorage (legacy + current keys)
const loadProfileFromStorage = () => {
  try {
    const candidates = ["user_user", "userProfile", "switcheats_user_profile"]
    for (const key of candidates) {
      const stored = localStorage.getItem(key)
      if (stored) return JSON.parse(stored)
    }
  } catch (error) {
    debugError('Error loading profile from localStorage:', error)
  }
  return null
}

// Save profile data to localStorage (keep keys used by ProfileContext)
const saveProfileToStorage = (data) => {
  try {
    localStorage.setItem('user_user', JSON.stringify(data))
    localStorage.setItem('userProfile', JSON.stringify(data))
  } catch (error) {
    debugError('Error saving profile to localStorage:', error)
  }
}

const normalizePhoneToTenDigits = (value) =>
  String(value || "").replace(/\D/g, "").slice(-10)

const buildFormDataFromProfile = (profile = {}) => ({
  name: profile.name || "",
  mobile: normalizePhoneToTenDigits(profile.mobile || profile.phone || ""),
  email: profile.email || "",
  dateOfBirth: profile.dateOfBirth
    ? dayjs(profile.dateOfBirth).format('YYYY-MM-DD')
    : "",
  anniversary: profile.anniversary
    ? dayjs(profile.anniversary).format('YYYY-MM-DD')
    : "",
  gender: profile.gender || "",
})

const loadEditProfileDraft = () => {
  try {
    const saved = localStorage.getItem(EDIT_PROFILE_DRAFT_KEY)
    return saved ? JSON.parse(saved) : null
  } catch (error) {
    debugError('Error loading edit profile draft from localStorage:', error)
    return null
  }
}

const saveEditProfileDraft = (data) => {
  try {
    localStorage.setItem(EDIT_PROFILE_DRAFT_KEY, JSON.stringify(data))
  } catch (error) {
    debugError('Error saving edit profile draft to localStorage:', error)
  }
}

const clearEditProfileDraft = () => {
  try {
    localStorage.removeItem(EDIT_PROFILE_DRAFT_KEY)
  } catch (error) {
    debugError('Error clearing edit profile draft from localStorage:', error)
  }
}

export default function EditProfile() {
  const navigate = useNavigate()
  const goBack = useAppBackNavigation()
  const { userProfile, updateUserProfile } = useProfile()

  // Load from localStorage or use context
  const storedProfile = loadProfileFromStorage()
  const draftProfile = loadEditProfileDraft()
  const initialProfile = draftProfile || storedProfile || userProfile || {}

  const initialFormData = buildFormDataFromProfile(initialProfile)

  const [formData, setFormData] = useState(initialFormData)
  const [initialData] = useState(initialFormData)
  const [hasChanges, setHasChanges] = useState(false)
  const [isSaving, setIsSaving] = useState(false)
  const [isUploadingImage, setIsUploadingImage] = useState(false)
  const [profileImage, setProfileImage] = useState(initialProfile?.profileImage || "")
  const [imagePreview, setImagePreview] = useState(resolveMediaUrl(initialProfile?.profileImage || ""))
  const [photoPickerOpen, setPhotoPickerOpen] = useState(false)
  const [fieldErrors, setFieldErrors] = useState({
    name: "",
    mobile: "",
    email: "",
    dateOfBirth: "",
  })
  const fileInputRef = useRef(null)
  const hydratedFromDraftRef = useRef(Boolean(draftProfile))

  // Update form data when profile changes
  useEffect(() => {
    if (hydratedFromDraftRef.current) return

    const storedProfile = loadProfileFromStorage()
    const profile = storedProfile || userProfile || {}
    const newFormData = buildFormDataFromProfile(profile)
    setFormData(newFormData)

    // Update profile image
    if (profile.profileImage) {
      setProfileImage(profile.profileImage)
      setImagePreview(resolveMediaUrl(profile.profileImage))
    }
  }, [userProfile])

  useEffect(() => {
    saveEditProfileDraft({
      name: formData.name,
      phone: formData.mobile,
      mobile: formData.mobile,
      email: formData.email,
      profileImage,
      dateOfBirth: formData.dateOfBirth || null,
      anniversary: formData.anniversary || null,
      gender: formData.gender || "",
    })
  }, [formData, profileImage])

  // Get avatar initial
  const avatarInitial = formData.name?.charAt(0).toUpperCase() || 'A'

  // Check if form has changes
  useEffect(() => {
    const currentData = JSON.stringify(formData)
    const savedData = JSON.stringify(initialData)
    setHasChanges(currentData !== savedData)
  }, [formData, initialData])

  const validateName = (value) => {
    const trimmedName = String(value || "").trim()
    if (!trimmedName) return "Name is required"
    if (trimmedName.length < 2) return "Name must be at least 2 characters"
    if (trimmedName.length > 50) return "Name must be at most 50 characters"
    if (!/^[A-Za-z\s'.-]+$/.test(trimmedName)) {
      return "Name can only contain letters, spaces, apostrophes, dots and hyphens"
    }
    return ""
  }

  const validateEmail = (value) => {
    if (!value) return ""
    const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9-]+(?:\.[a-zA-Z0-9-]+)*\.[a-zA-Z]{2,6}$/;
    if (!EMAIL_REGEX.test(value)) {
      return "Please enter a valid email address";
    }
    
    const parts = value.split('@');
    if (parts.length === 2) {
      const domain = parts[1].toLowerCase()
      const commonDomainTypos = new Set([
        "gmaill.com",
        "gmailll.com",
        "gmail.comm",
        "gmail.commm",
        "gmaill.comm",
        "gmial.com",
        "gamil.com",
        "gmail.co",
        "yaho.com",
        "yahooo.com",
        "outlok.com",
        "hotnail.com",
      ])
      if (commonDomainTypos.has(domain)) {
        return "Invalid email domain. Please check spelling (e.g., gmail.com)";
      }
      if (/^gmaill+\.com+$/i.test(domain) || /^gmail\.comm+$/i.test(domain)) {
        return "Invalid email domain. Please check spelling (e.g., gmail.com)";
      }

      const domainParts = domain.split('.');
      for (let i = 0; i < domainParts.length - 1; i++) {
        if (domainParts[i] === domainParts[i + 1] && domainParts[i].length > 0) {
          return "Invalid email domain (e.g., .com.com)";
        }
      }
      if (domainParts.some((part) => !part || part.startsWith("-") || part.endsWith("-"))) {
        return "Invalid email domain format";
      }
      if (domainParts.some((part) => /(.)\1{2,}/i.test(part))) {
        return "Invalid email domain format";
      }
      const tld = domainParts[domainParts.length - 1] || ""
      if (/^(.)\1{2,}$/i.test(tld)) {
        return "Invalid email domain";
      }
    }
    
    if (value.includes('..')) {
      return "Email cannot contain consecutive dots";
    }
    
    return ""
  }

  const validateMobile = (value) => {
    if (!value) return ""
    return /^\d{10}$/.test(value) ? "" : "Mobile number must be 10 digits"
  }

  const validateDateOfBirth = (value) => {
    if (!value) return ""
    const dob = dayjs(value)
    if (!dob.isValid()) return "Please select a valid date of birth"
    return dob.isAfter(dayjs(), "day") ? "Date of birth cannot be in the future" : ""
  }

  const handleChange = (field, value) => {
    let normalizedValue = value
    let errorMessage = ""

    if (field === "name") {
      normalizedValue = String(value || "")
      errorMessage = validateName(normalizedValue)
    } else if (field === "mobile") {
      normalizedValue = String(value || "").replace(/\D/g, "").slice(0, 10)
      errorMessage = validateMobile(normalizedValue)
    } else if (field === "email") {
      normalizedValue = String(value || "").trim()
      errorMessage = validateEmail(normalizedValue)
    } else if (field === "dateOfBirth") {
      errorMessage = validateDateOfBirth(normalizedValue)
    }

    setFormData((prev) => ({
      ...prev,
      [field]: normalizedValue
    }))

    if (field === "name" || field === "mobile" || field === "email" || field === "dateOfBirth") {
      setFieldErrors((prev) => ({
        ...prev,
        [field]: errorMessage
      }))
    }
  }

  const handleClear = (field) => {
    setFormData(prev => ({
      ...prev,
      [field]: ""
    }))
  }

  const processProfileImageFile = async (file) => {
    if (!file) return

    // Validate file type
    if (!file.type.startsWith('image/')) {
      toast.error('Please select a valid image file')
      return
    }

    // Validate file size (max 5MB)
    if (file.size > 5 * 1024 * 1024) {
      toast.error('Image size should be less than 5MB')
      return
    }

    // Show preview
    const reader = new FileReader()
    reader.onloadend = () => {
      setImagePreview(reader.result)
    }
    reader.readAsDataURL(file)

    // Upload to server
    try {
      setIsUploadingImage(true)
      const response = await userAPI.uploadProfileImage(file)
      const imageUrl = response?.data?.data?.profileImage || response?.data?.profileImage

      if (imageUrl) {
        setProfileImage(imageUrl)
        setImagePreview(resolveMediaUrl(imageUrl))
        toast.success('Profile image uploaded successfully')

        const mergedProfile = {
          ...(userProfile || {}),
          name: formData.name,
          phone: formData.mobile,
          mobile: formData.mobile,
          email: getSafeEmailForLocalProfile(formData.email),
          dateOfBirth: formData.dateOfBirth || null,
          anniversary: formData.anniversary || null,
          gender: formData.gender || "",
          profileImage: imageUrl,
        }

        // Update context + local persistence with current form values so refresh keeps all fields
        updateUserProfile(mergedProfile)
        saveProfileToStorage(mergedProfile)
        saveEditProfileDraft(mergedProfile)

        // Dispatch event to refresh profile
        window.dispatchEvent(new Event("userAuthChanged"))
      }
    } catch (error) {
      debugError('Error uploading image:', error)
      toast.error(error?.response?.data?.message || 'Failed to upload image')
      // Revert preview
      setImagePreview(profileImage)
    } finally {
      setIsUploadingImage(false)
    }
  }

  const handleImageSelect = async (e) => {
    const file = e.target.files?.[0]
    if (file) {
      await processProfileImageFile(file)
    }
    e.target.value = ""
  }

  const handleProfileImageAction = () => {
    if (isFlutterBridgeAvailable()) {
      setPhotoPickerOpen(true)
      return
    }

    fileInputRef.current?.click()
  }

  const handleRemoveProfileImage = async () => {
    if (!profileImage && !imagePreview) return

    try {
      setIsUploadingImage(true)
      await userAPI.updateProfile({ profileImage: "" })

      setProfileImage("")
      setImagePreview("")

      const mergedProfile = {
        ...(userProfile || {}),
        name: formData.name,
        phone: formData.mobile,
        mobile: formData.mobile,
        email: getSafeEmailForLocalProfile(formData.email),
        dateOfBirth: formData.dateOfBirth || null,
        anniversary: formData.anniversary || null,
        gender: formData.gender || "",
        profileImage: "",
      }

      updateUserProfile(mergedProfile)
      saveProfileToStorage(mergedProfile)
      saveEditProfileDraft(mergedProfile)
      window.dispatchEvent(new Event("userAuthChanged"))
      toast.success("Profile image removed")
    } catch (error) {
      debugError("Error removing profile image:", error)
      toast.error(error?.response?.data?.message || "Failed to remove image")
    } finally {
      setIsUploadingImage(false)
    }
  }

  const validateForm = () => {
    const nextErrors = {
      name: validateName(formData.name),
      mobile: validateMobile(formData.mobile),
      email: validateEmail(formData.email),
      dateOfBirth: validateDateOfBirth(formData.dateOfBirth),
    }
    setFieldErrors(nextErrors)
    return !Object.values(nextErrors).some(Boolean)
  }

  const hasValidationErrors = Boolean(
    validateName(formData.name) ||
    validateMobile(formData.mobile) ||
    validateEmail(formData.email) ||
    validateDateOfBirth(formData.dateOfBirth)
  )

  const getSafeEmailForLocalProfile = (emailValue) => (
    validateEmail(emailValue) ? "" : String(emailValue || "").trim()
  )

  const handleUpdate = async () => {
    if (isSaving) return
    if (!validateForm()) {
      toast.error("Please fix the highlighted fields")
      return
    }

    try {
      setIsSaving(true)

      // Prepare data for API
      const updateData = {
        name: formData.name.trim(),
        email: formData.email || undefined,
        phone: formData.mobile || undefined,
        dateOfBirth: formData.dateOfBirth || undefined,
        anniversary: formData.anniversary || undefined,
        gender: formData.gender || undefined,
        profileImage: profileImage || undefined, // Include profileImage in update
      }

      // Call API to update profile
      const response = await userAPI.updateProfile(updateData)
      const updatedUser = response?.data?.data?.user || response?.data?.user

      if (updatedUser) {
        // Update context with all fields including profileImage
        updateUserProfile({
          ...updatedUser,
          phone: updatedUser.phone || formData.mobile,
          profileImage: updatedUser.profileImage || profileImage,
        })

        // Save to localStorage with complete data
        saveProfileToStorage({
          name: updatedUser.name || formData.name,
          phone: updatedUser.phone || formData.mobile,
          mobile: updatedUser.phone || formData.mobile,
          email: updatedUser.email || getSafeEmailForLocalProfile(formData.email),
          profileImage: updatedUser.profileImage || profileImage,
          dateOfBirth: updatedUser.dateOfBirth || formData.dateOfBirth,
          anniversary: updatedUser.anniversary || formData.anniversary,
          gender: updatedUser.gender || formData.gender,
        })
        clearEditProfileDraft()

        // Dispatch event to refresh profile from API
        window.dispatchEvent(new Event("userAuthChanged"))

        toast.success('Profile updated successfully')

        // Navigate back
        navigate("/user/profile")
      }
    } catch (error) {
      debugError('Error updating profile:', error)
      toast.error(error?.response?.data?.message || 'Failed to update profile')
    } finally {
      setIsSaving(false)
    }
  }

  const handleMobileChange = () => {
    // Navigate to mobile change page or show modal
    debugLog('Change mobile clicked')
  }

  const handleEmailChange = () => {
    // Navigate to email change page or show modal
    debugLog('Change email clicked')
  }

  return (
    <div className="min-h-screen bg-[#f5f5f5] dark:bg-[#0a0a0a]">
      {/* Header */}
      <div className="bg-white dark:bg-[#1a1a1a] sticky top-0 z-10 border-b border-gray-100 dark:border-gray-800">
        <div className="max-w-7xl mx-auto flex items-center gap-3 px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-4 md:py-5 lg:py-6">
          <button
            onClick={goBack}
            className="w-9 h-9 flex items-center justify-center hover:bg-gray-100 dark:hover:bg-gray-800 rounded-full transition-colors flex-shrink-0"
          >
            <ArrowLeft className="h-5 w-5 text-gray-700 dark:text-white" />
          </button>
          <h1 className="text-lg font-semibold text-gray-900 dark:text-white">Your Profile</h1>
        </div>
      </div>

      {/* Content */}
      <div className="max-w-2xl md:max-w-3xl lg:max-w-4xl xl:max-w-5xl mx-auto px-4 sm:px-6 md:px-8 lg:px-10 xl:px-12 py-6 sm:py-8 md:py-10 lg:py-12 pb-28 md:pb-12 space-y-6 md:space-y-8 lg:space-y-10">
        {/* Avatar Section */}
        <div className="flex justify-center">
          <div className="relative">
            <Avatar className="h-24 w-24 bg-[#EB590E] border-0">
              {imagePreview && (
                <AvatarImage
                  src={resolveMediaUrl(imagePreview) || undefined}
                  alt={formData.name || 'User'}
                />
              )}
              <AvatarFallback className="bg-[#EB590E] text-white text-3xl font-semibold">
                <User className="h-10 w-10 text-white" />
              </AvatarFallback>
            </Avatar>
            {/* Edit Icon */}
            <button
              onClick={handleProfileImageAction}
              disabled={isUploadingImage}
              className="absolute bottom-0 right-0 w-8 h-8 bg-[#EB590E] rounded-full flex items-center justify-center shadow-lg border-2 border-white hover:bg-[#D94F0C] transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isUploadingImage ? (
                <Loader2 className="h-4 w-4 text-white animate-spin" />
              ) : (
                <Pencil className="h-4 w-4 text-white" />
              )}
            </button>
            {(profileImage || imagePreview) && (
              <button
                onClick={handleRemoveProfileImage}
                disabled={isUploadingImage}
                className="absolute bottom-0 left-0 w-8 h-8 bg-red-500 rounded-full flex items-center justify-center shadow-lg border-2 border-white hover:bg-red-600 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                aria-label="Remove profile image"
              >
                <Trash2 className="h-4 w-4 text-white" />
              </button>
            )}
            <input
              ref={fileInputRef}
              type="file"
              accept="image/*"
              onChange={handleImageSelect}
              className="hidden"
            />
          </div>
        </div>

        {/* Form Card */}
        <Card className="bg-white dark:bg-[#1a1a1a] rounded-xl shadow-sm border-0 dark:border-gray-800">
          <CardContent className="p-4 sm:p-5 md:p-6 lg:p-8 space-y-4 md:space-y-5 lg:space-y-6">
            {/* Name Field */}
            <div className="space-y-1.5">
              <Label htmlFor="name" className="text-sm font-medium text-gray-700 dark:text-white">
                Name
              </Label>
              <div className="relative">
                <Input
                  id="name"
                  type="text"
                  value={formData.name}
                  onChange={(e) => handleChange('name', e.target.value)}
                  className="pr-10 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-[#EB590E] focus:ring-1 focus:ring-[#EB590E] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
                  placeholder="Name"
                />
                {formData.name && (
                  <button
                    type="button"
                    onClick={() => handleClear('name')}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 dark:text-gray-500 hover:text-gray-600 dark:hover:text-gray-300"
                  >
                    <X className="h-5 w-5" />
                  </button>
                )}
              </div>
              {fieldErrors.name && (
                <p className="text-xs text-red-600">{fieldErrors.name}</p>
              )}
            </div>

            {/* Mobile Field */}
            <div className="space-y-1.5">
              <Label htmlFor="mobile" className="text-sm font-medium text-gray-700 dark:text-white">
                Mobile
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="mobile"
                  type="tel"
                  value={formData.mobile}
                  onChange={(e) => handleChange('mobile', e.target.value)}
                  className="flex-1 h-12 text-base  border border-gray-300 dark:border-gray-700 focus:border-[#EB590E] focus:ring-1 focus:ring-[#EB590E] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
                  placeholder="Mobile"
                />
              </div>
              {fieldErrors.mobile && (
                <p className="text-xs text-red-600">{fieldErrors.mobile}</p>
              )}
            </div>

            {/* Email Field */}
            <div className="space-y-1.5">
              <Label htmlFor="email" className="text-sm font-medium text-gray-700 dark:text-white">
                Email
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="email"
                  type="email"
                  value={formData.email}
                  onChange={(e) => handleChange('email', e.target.value)}
                  className="flex-1 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-[#EB590E] focus:ring-1 focus:ring-[#EB590E] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white"
                  placeholder="Email"
                />
              </div>
              {fieldErrors.email && (
                <p className="text-xs text-red-600">{fieldErrors.email}</p>
              )}
            </div>

            {/* Date of Birth Field */}
            <div className="space-y-1.5">
              <Label htmlFor="dateOfBirth" className="text-sm font-medium text-gray-700 dark:text-white">
                Date of birth
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="dateOfBirth"
                  type="date"
                  value={formData.dateOfBirth}
                  onChange={(e) => handleChange('dateOfBirth', e.target.value)}
                  max={dayjs().format('YYYY-MM-DD')}
                  className="flex-1 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-[#EB590E] focus:ring-1 focus:ring-[#EB590E] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:dark:invert"
                />
              </div>
              {fieldErrors.dateOfBirth && (
                <p className="text-xs text-red-600">{fieldErrors.dateOfBirth}</p>
              )}
            </div>

            {/* Anniversary Field */}
            <div className="space-y-1.5">
              <Label htmlFor="anniversary" className="text-sm font-medium text-gray-700 dark:text-white">
                Anniversary <span className="text-gray-400 dark:text-gray-500 font-normal">(Optional)</span>
              </Label>
              <div className="flex items-center gap-2">
                <Input
                  id="anniversary"
                  type="date"
                  value={formData.anniversary}
                  onChange={(e) => handleChange('anniversary', e.target.value)}
                  max={dayjs().format('YYYY-MM-DD')}
                  className="flex-1 h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-[#EB590E] focus:ring-1 focus:ring-[#EB590E] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white [&::-webkit-calendar-picker-indicator]:dark:invert"
                />
              </div>
            </div>

            {/* Gender Field */}
            <div className="space-y-1.5">
              <Label htmlFor="gender" className="text-sm font-medium text-gray-700 dark:text-white">
                Gender
              </Label>
              <Select
                value={formData.gender || ""}
                onValueChange={(value) => handleChange('gender', value)}
              >
                <SelectTrigger className="h-12 text-base border border-gray-300 dark:border-gray-700 focus:border-[#EB590E] focus:ring-1 focus:ring-[#EB590E] rounded-lg bg-white dark:bg-[#1a1a1a] text-gray-900 dark:text-white">
                  <SelectValue placeholder="Gender" />
                </SelectTrigger>
                <SelectContent>
                  {genderOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </CardContent>
        </Card>

        {/* Update Profile Button */}
        <Button
          onClick={handleUpdate}
          disabled={!hasChanges || isSaving || isUploadingImage || hasValidationErrors}
          className={`w-full h-14 rounded-xl font-semibold text-base transition-all mb-2 ${hasChanges && !isSaving && !isUploadingImage && !hasValidationErrors
              ? 'bg-[#EB590E] hover:bg-[#D94F0C] text-white'
              : 'bg-gray-200 text-gray-400 cursor-not-allowed'
            }`}
        >
          {isSaving ? (
            <>
              <Loader2 className="h-5 w-5 mr-2 animate-spin" />
              Saving...
            </>
          ) : (
            'Update profile'
          )}
        </Button>

        <ImageSourcePicker
          isOpen={photoPickerOpen}
          onClose={() => setPhotoPickerOpen(false)}
          onFileSelect={processProfileImageFile}
          title="Update profile photo"
          description="Choose how you want to upload your profile photo."
          fileNamePrefix="profile-photo"
          galleryInputRef={fileInputRef}
        />
      </div>
    </div>
  )
}
