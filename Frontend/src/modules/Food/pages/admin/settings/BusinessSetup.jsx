import { useState, useRef, useEffect } from "react";
import { Info, Phone, Upload, X, Loader2 } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import { setCachedSettings, updateFavicon, updateTitle } from "@food/utils/businessSettings";
const debugLog = (...args) => {}
const debugWarn = (...args) => {}
const debugError = (...args) => {}
const BUSINESS_EMAIL_REGEX = /^(?!.*\.\.)([A-Za-z0-9]+[._%+-]?)*[A-Za-z0-9]+@[A-Za-z0-9-]+\.[A-Za-z]{2,}$/

const hasSuspiciousEmailTld = (emailValue) => {
  const email = String(emailValue || "").trim().toLowerCase()
  const domain = email.split("@")[1] || ""
  const tld = domain.split(".").pop() || ""
  if (!tld) return true
  // Block malformed TLDs like "commm", "cooom", etc.
  if (/^com+$/i.test(tld) && tld !== "com") return true
  if (/(.)\1{2,}/.test(tld)) return true
  return false
}


export default function BusinessSetup() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [logoPreview, setLogoPreview] = useState(null);
  const [faviconPreview, setFaviconPreview] = useState(null);
  const [restaurantLogoPreview, setRestaurantLogoPreview] = useState(null);
  const [restaurantFaviconPreview, setRestaurantFaviconPreview] = useState(null);
  const [deliveryLogoPreview, setDeliveryLogoPreview] = useState(null);
  const [deliveryFaviconPreview, setDeliveryFaviconPreview] = useState(null);
  const [logoFile, setLogoFile] = useState(null);
  const [faviconFile, setFaviconFile] = useState(null);
  const [restaurantLogoFile, setRestaurantLogoFile] = useState(null);
  const [restaurantFaviconFile, setRestaurantFaviconFile] = useState(null);
  const [deliveryLogoFile, setDeliveryLogoFile] = useState(null);
  const [deliveryFaviconFile, setDeliveryFaviconFile] = useState(null);
  const logoInputRef = useRef(null);
  const faviconInputRef = useRef(null);
  const restaurantLogoInputRef = useRef(null);
  const restaurantFaviconInputRef = useRef(null);
  const deliveryLogoInputRef = useRef(null);
  const deliveryFaviconInputRef = useRef(null);

  const [formData, setFormData] = useState({
    companyName: "",
    email: "",
    phoneCountryCode: "+91",
    phoneNumber: "",
    address: "",
    state: "",
    pincode: "",
    region: "",
    googleMapsApiKey: "",
    firebase: {
      apiKey: "",
      authDomain: "",
      projectId: "",
      storageBucket: "",
      messagingSenderId: "",
      appId: "",
      measurementId: "",
      databaseURL: "",
      vapidKey: "",
    },
  });

  // Kept out of formData: it is write-only. The server never sends the
  // credential back, so there is nothing to pre-fill and an empty box must mean
  // "leave the saved one alone" rather than "clear it".
  const [serviceAccountInput, setServiceAccountInput] = useState("");
  const [serviceAccountStatus, setServiceAccountStatus] = useState(null);

  // Fetch business settings on mount
  useEffect(() => {
    fetchBusinessSettings();
  }, []);

  const fetchBusinessSettings = async () => {
    try {
      setLoading(true);
      const response = await adminAPI.getBusinessSettings();
      const settings = response?.data?.data || response?.data;

      if (settings) {
        setFormData({
          companyName: settings.companyName || "",
          email: settings.email || "",
          phoneCountryCode: settings.phone?.countryCode || "+91",
          phoneNumber: settings.phone?.number || "",
          address: settings.address || "",
          state: settings.state || "",
          pincode: settings.pincode || "",
          region: settings.region || "India",
          googleMapsApiKey: settings.googleMapsApiKey || "",
          firebase: {
            apiKey: settings.firebase?.apiKey || "",
            authDomain: settings.firebase?.authDomain || "",
            projectId: settings.firebase?.projectId || "",
            storageBucket: settings.firebase?.storageBucket || "",
            messagingSenderId: settings.firebase?.messagingSenderId || "",
            appId: settings.firebase?.appId || "",
            measurementId: settings.firebase?.measurementId || "",
            databaseURL: settings.firebase?.databaseURL || "",
            vapidKey: settings.firebase?.vapidKey || "",
          },
        });

        setServiceAccountStatus(settings.firebaseServiceAccount || null);

        // Set logo and favicon previews if they exist
        if (settings.logo?.url) {
          setLogoPreview(settings.logo.url);
        }
        if (settings.favicon?.url) {
          setFaviconPreview(settings.favicon.url);
        }
        if (settings.restaurantLogo?.url) {
          setRestaurantLogoPreview(settings.restaurantLogo.url);
        }
        if (settings.restaurantFavicon?.url) {
          setRestaurantFaviconPreview(settings.restaurantFavicon.url);
        }
        if (settings.deliveryLogo?.url) {
          setDeliveryLogoPreview(settings.deliveryLogo.url);
        }
        if (settings.deliveryFavicon?.url) {
          setDeliveryFaviconPreview(settings.deliveryFavicon.url);
        }
      }
    } catch (error) {
      debugError("Error fetching business settings:", error);
      toast.error(error?.response?.data?.message || "Failed to load business settings");
    } finally {
      setLoading(false);
    }
  };

  const handleInputChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      [field]: value,
    }));
  };

  const handleFirebaseChange = (field, value) => {
    setFormData((prev) => ({
      ...prev,
      firebase: { ...prev.firebase, [field]: value },
    }));
  };

  const handleSave = async () => {
    try {
      // Validate required fields
      if (!formData.companyName.trim()) {
        toast.error("Company name is required");
        return;
      }
      if (formData.companyName.trim().length < 2) {
        toast.error("Company name must be at least 2 characters long");
        return;
      }

      if (!formData.email.trim()) {
        toast.error("Email is required");
        return;
      }
      const normalizedEmail = formData.email.trim()
      if (!BUSINESS_EMAIL_REGEX.test(normalizedEmail) || hasSuspiciousEmailTld(normalizedEmail)) {
        toast.error("Please enter a valid email address");
        return;
      }

      if (!formData.phoneNumber.trim()) {
        toast.error("Phone number is required");
        return;
      }
      const phoneRegex = /^\d{7,15}$/;
      if (!phoneRegex.test(formData.phoneNumber.trim())) {
        toast.error("Please enter a valid phone number (7-15 digits)");
        return;
      }

      if (formData.pincode.trim() && !/^\d{4,10}$/.test(formData.pincode.trim())) {
        toast.error("Please enter a valid pincode (4-10 digits)");
        return;
      }

      setSaving(true);

      // Prepare form data
      const dataToSend = {
        companyName: formData.companyName.trim(),
        email: normalizedEmail,
        phoneCountryCode: formData.phoneCountryCode,
        phoneNumber: formData.phoneNumber.trim(),
        address: formData.address.trim(),
        state: formData.state.trim(),
        pincode: formData.pincode.trim(),
        region: formData.region,
        // Trimmed, and sent even when empty so clearing the field revokes it.
        googleMapsApiKey: formData.googleMapsApiKey.trim(),
        firebase: Object.fromEntries(
          Object.entries(formData.firebase).map(([k, v]) => [k, String(v || "").trim()])
        ),
      };

      // Omitted entirely when the box is empty. Sending "" would be read as an
      // explicit clear and wipe a working credential on any unrelated save.
      const serviceAccount = serviceAccountInput.trim();
      if (serviceAccount) {
        dataToSend.firebaseServiceAccount = serviceAccount;
      }

      // Prepare files
      const files = {};
      if (logoFile) {
        files.logo = logoFile;
      }
      if (faviconFile) {
        files.favicon = faviconFile;
      }
      if (restaurantLogoFile) {
        files.restaurantLogo = restaurantLogoFile;
      }
      if (restaurantFaviconFile) {
        files.restaurantFavicon = restaurantFaviconFile;
      }
      if (deliveryLogoFile) {
        files.deliveryLogo = deliveryLogoFile;
      }
      if (deliveryFaviconFile) {
        files.deliveryFavicon = deliveryFaviconFile;
      }

      const response = await adminAPI.updateBusinessSettings(dataToSend, files);
      const updatedSettings = response?.data?.data || response?.data;

      if (updatedSettings) {
        // Update global cache immediately
        setCachedSettings(updatedSettings);

        // Update previews with new URLs if files were uploaded
        if (updatedSettings.logo?.url) {
          setLogoPreview(updatedSettings.logo.url);
          setLogoFile(null);
        }
        if (updatedSettings.favicon?.url) {
          setFaviconPreview(updatedSettings.favicon.url);
          setFaviconFile(null);
        }
        if (updatedSettings.restaurantLogo?.url) {
          setRestaurantLogoPreview(updatedSettings.restaurantLogo.url);
          setRestaurantLogoFile(null);
        }
        if (updatedSettings.restaurantFavicon?.url) {
          setRestaurantFaviconPreview(updatedSettings.restaurantFavicon.url);
          setRestaurantFaviconFile(null);
        }
        if (updatedSettings.deliveryLogo?.url) {
          setDeliveryLogoPreview(updatedSettings.deliveryLogo.url);
          setDeliveryLogoFile(null);
        }
        if (updatedSettings.deliveryFavicon?.url) {
          setDeliveryFaviconPreview(updatedSettings.deliveryFavicon.url);
          setDeliveryFaviconFile(null);
        }
      }

      // Emptied on success so the credential is not left sitting in the DOM,
      // and the status line below takes over as the record of what is saved.
      if (serviceAccount) {
        setServiceAccountInput("");
        setServiceAccountStatus(updatedSettings?.firebaseServiceAccount || null);
      }

      toast.success("Business settings saved successfully");

      // Dispatch custom event to notify other components (like Sidebar)
      window.dispatchEvent(new CustomEvent('businessSettingsUpdated'));
    } catch (error) {
      debugError("Error saving business settings:", error);
      toast.error(error?.response?.data?.message || "Failed to save business settings");
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    fetchBusinessSettings();
    setLogoFile(null);
    setFaviconFile(null);
    setRestaurantLogoFile(null);
    setRestaurantFaviconFile(null);
    setDeliveryLogoFile(null);
    setDeliveryFaviconFile(null);
    if (logoInputRef.current) {
      logoInputRef.current.value = "";
    }
    if (faviconInputRef.current) {
      faviconInputRef.current.value = "";
    }
    if (restaurantLogoInputRef.current) {
      restaurantLogoInputRef.current.value = "";
    }
    if (restaurantFaviconInputRef.current) {
      restaurantFaviconInputRef.current.value = "";
    }
    if (deliveryLogoInputRef.current) {
      deliveryLogoInputRef.current.value = "";
    }
    if (deliveryFaviconInputRef.current) {
      deliveryFaviconInputRef.current.value = "";
    }
    toast.info("Form reset to saved values");
  };


  if (loading) {
    return (
      <div className="p-4 lg:p-6 bg-slate-50 min-h-screen flex items-center justify-center">
        <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
      </div>
    );
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen">
      {/* Page header */}
      <div className="flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 mb-4">
        <div>
          <h1 className="text-xl lg:text-2xl font-bold text-slate-900">Business setup</h1>
          <p className="text-xs lg:text-sm text-slate-500 mt-1">
            Manage your company information, general configuration and business rules.
          </p>
        </div>

        {/* Note card (top-right) */}
        <div className="bg-amber-50 border border-amber-200 rounded-lg px-4 py-3 flex items-start gap-3 max-w-md">
          <div className="mt-0.5">
            <Info className="w-4 h-4 text-amber-500" />
          </div>
          <div className="text-xs lg:text-sm text-slate-700">
            <p className="font-semibold text-amber-700 mb-0.5">Note</p>
            <p>Don&apos;t forget to click the &quot;Save Information&quot; button below to save changes.</p>
          </div>
        </div>
      </div>

      <div className="space-y-4">
        {/* Company info */}
        <div className="bg-white rounded-lg shadow-sm border border-slate-200">
          {/* Company information */}
          <div className="px-4 py-4 border-b border-slate-100">
            <h3 className="text-sm font-semibold text-slate-900 mb-4 flex items-center gap-2">
              <span>Company Information</span>
            </h3>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Company name <span className="text-red-500">*</span>
                </label>
                <input
                  type="text"
                  placeholder="Enter Your Company Name"
                  value={formData.companyName}
                  maxLength={50}
                  onChange={(e) => handleInputChange("companyName", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Email <span className="text-red-500">*</span>
                </label>
                <input
                  type="email"
                  placeholder="Enter Your Email"
                  value={formData.email}
                  maxLength={100}
                  onChange={(e) => handleInputChange("email", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Region <span className="text-red-500">*</span>
                </label>
                <select
                  value={formData.region}
                  onChange={(e) => handleInputChange("region", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                >
                  <option value="India">India</option>
                </select>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Phone <span className="text-red-500">*</span>
                </label>
                <div className="flex gap-2">
                  <div className="relative w-32">
                    <select
                      value={formData.phoneCountryCode}
                      onChange={(e) => handleInputChange("phoneCountryCode", e.target.value)}
                      className="w-full pl-8 pr-6 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 appearance-none"
                    >
                      <option value="+91">+91 (IN)</option>
                    </select>
                    <Phone className="w-3.5 h-3.5 text-slate-400 absolute left-2.5 top-1/2 -translate-y-1/2" />
                    <span className="absolute right-2 top-1/2 -translate-y-1/2 text-[10px] text-slate-400 pointer-events-none">
                      ?
                    </span>
                  </div>
                  <input
                    type="text"
                    placeholder="Enter Your Phone Number"
                    value={formData.phoneNumber}
                    maxLength={15}
                    onChange={(e) => {
                      const val = e.target.value.replace(/\D/g, "");
                      handleInputChange("phoneNumber", val);
                    }}
                    className="flex-1 px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                  />
                </div>
              </div>

              <div className="md:col-span-2">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Address
                </label>
                <textarea
                  rows={2}
                  placeholder="Enter Your Addresss"
                  value={formData.address}
                  maxLength={250}
                  onChange={(e) => handleInputChange("address", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500 resize-none"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  State
                </label>
                <input
                  type="text"
                  placeholder="Enter Your State"
                  value={formData.state}
                  maxLength={50}
                  onChange={(e) => handleInputChange("state", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Pincode
                </label>
                <input
                  type="text"
                  placeholder="Enter Your Pincode"
                  value={formData.pincode}
                  maxLength={10}
                  onChange={(e) => {
                    const val = e.target.value.replace(/\D/g, "");
                    handleInputChange("pincode", val);
                  }}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
              </div>
            </div>

            {/* Google Maps key. Set here so rotating it does not need a rebuild
                of every surface that draws a map. */}
            <div className="mb-4">
              <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                Google Maps API Key
              </label>
              <input
                type="text"
                placeholder="AIza..."
                value={formData.googleMapsApiKey}
                onChange={(e) =>
                  handleInputChange("googleMapsApiKey", e.target.value)
                }
                className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
              />
              <p className="mt-1.5 text-[11px] text-slate-500">
                Used by every map in the customer app, seller panel and delivery
                app. A browser key is visible to anyone who opens the site, so
                restrict it to your domains under{" "}
                <span className="font-medium">
                  Google Cloud &rarr; Credentials &rarr; HTTP referrers
                </span>
                . Leave empty to fall back to the build&apos;s environment.
              </p>
            </div>

            {/* Firebase. Split in two on purpose: the web config is public and
                editable inline, the service account is a server credential and
                is write-only. */}
            <div className="mb-4 border border-slate-200 rounded-lg p-4">
              <h3 className="text-xs font-bold text-slate-800 mb-1">Firebase</h3>
              <p className="text-[11px] text-slate-500 mb-3">
                Used for push notifications and realtime order tracking across
                the customer app, seller app and delivery app. Leave a field
                empty to fall back to the build&apos;s environment.
              </p>

              <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                {[
                  ["apiKey", "Web API Key", "AIza..."],
                  ["projectId", "Project ID", "my-project-a1b2c"],
                  ["authDomain", "Auth Domain", "my-project.firebaseapp.com"],
                  ["storageBucket", "Storage Bucket", "my-project.firebasestorage.app"],
                  ["messagingSenderId", "Messaging Sender ID", "123456789012"],
                  ["appId", "App ID", "1:1234:web:abcd"],
                  ["measurementId", "Measurement ID", "G-XXXXXXX"],
                  ["databaseURL", "Realtime Database URL", "https://my-project-default-rtdb.firebaseio.com"],
                ].map(([field, label, placeholder]) => (
                  <div key={field}>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                      {label}
                    </label>
                    <input
                      type="text"
                      placeholder={placeholder}
                      value={formData.firebase[field]}
                      onChange={(e) => handleFirebaseChange(field, e.target.value)}
                      className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                    />
                  </div>
                ))}
              </div>

              <div className="mt-3">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Web Push Certificate (VAPID public key)
                </label>
                <input
                  type="text"
                  placeholder="BC..."
                  value={formData.firebase.vapidKey}
                  onChange={(e) => handleFirebaseChange("vapidKey", e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Firebase Console &rarr; Project settings &rarr; Cloud
                  Messaging &rarr; Web Push certificates. These values above are
                  public — Firebase ships them inside every app build — so they
                  are safe here. Your project is protected by its security rules
                  and by restricting the API key, not by hiding them.
                </p>
              </div>

              <div className="mt-4 pt-4 border-t border-slate-200">
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">
                  Service Account JSON
                  <span className="ml-2 font-normal text-[11px] text-amber-700">
                    server credential — never shown again after saving
                  </span>
                </label>

                {serviceAccountStatus?.configured ? (
                  <div className="mb-2 text-[11px] rounded-lg bg-slate-50 border border-slate-200 px-3 py-2">
                    {serviceAccountStatus.invalid ? (
                      <span className="text-red-600 font-medium">
                        A service account is saved but is not valid JSON. Push
                        will fail until it is replaced.
                      </span>
                    ) : (
                      <span className="text-slate-600">
                        <span className="text-green-700 font-medium">Configured</span>
                        {" — project "}
                        <span className="font-mono">{serviceAccountStatus.projectId || "unknown"}</span>
                        {serviceAccountStatus.clientEmail ? (
                          <>
                            {", "}
                            <span className="font-mono">{serviceAccountStatus.clientEmail}</span>
                          </>
                        ) : null}
                        {serviceAccountStatus.privateKeyId ? (
                          <>
                            {", key "}
                            <span className="font-mono">{serviceAccountStatus.privateKeyId}</span>
                          </>
                        ) : null}
                      </span>
                    )}
                  </div>
                ) : (
                  <div className="mb-2 text-[11px] rounded-lg bg-amber-50 border border-amber-200 px-3 py-2 text-amber-800">
                    No service account saved — push is using the value from the
                    server&apos;s environment.
                  </div>
                )}

                <textarea
                  rows={5}
                  placeholder='Paste the full JSON here to replace it, e.g. {"type":"service_account","project_id":"...","private_key":"..."}'
                  value={serviceAccountInput}
                  onChange={(e) => setServiceAccountInput(e.target.value)}
                  className="w-full px-3 py-2 text-xs border border-slate-300 rounded-lg bg-white font-mono focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-blue-500"
                />
                <p className="mt-1.5 text-[11px] text-slate-500">
                  Firebase Console &rarr; Project settings &rarr; Service
                  accounts &rarr; Generate new private key. Unlike the values
                  above, this one can send push to every device and read your
                  whole database, so it is stored write-only and never sent back
                  to this page. Leave the box empty to keep the saved one.
                </p>
              </div>
            </div>

            {/* Logo & favicon upload */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Logo</label>
                <input
                  ref={logoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    // Validate file type
                    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.");
                      return;
                    }

                    // Validate file size (max 5MB)
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    if (file.size > maxSize) {
                      toast.error("File size exceeds 5MB limit.");
                      return;
                    }

                    setLogoFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setLogoPreview(reader.result);
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => logoInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-lg bg-slate-50/60 h-28 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                >
                  {logoPreview ? (
                    <>
                      <img
                        src={logoPreview}
                        alt="Logo preview"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setLogoPreview(null);
                          setLogoFile(null);
                          if (logoInputRef.current) {
                            logoInputRef.current.value = "";
                          }
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click to upload logo</p>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Favicon</label>
                <input
                  ref={faviconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/x-icon"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;

                    // Validate file type
                    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/x-icon"];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, WEBP, or ICO.");
                      return;
                    }

                    // Validate file size (max 5MB)
                    const maxSize = 5 * 1024 * 1024; // 5MB
                    if (file.size > maxSize) {
                      toast.error("File size exceeds 5MB limit.");
                      return;
                    }

                    setFaviconFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => {
                      setFaviconPreview(reader.result);
                    };
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => faviconInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-lg bg-slate-50/60 h-28 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                >
                  {faviconPreview ? (
                    <>
                      <img
                        src={faviconPreview}
                        alt="Favicon preview"
                        className="w-full h-full object-contain"
                      />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setFaviconPreview(null);
                          setFaviconFile(null);
                          if (faviconInputRef.current) {
                            faviconInputRef.current.value = "";
                          }
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click to upload favicon</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Restaurant Logo</label>
                <input
                  ref={restaurantLogoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.");
                      return;
                    }
                    const maxSize = 5 * 1024 * 1024;
                    if (file.size > maxSize) {
                      toast.error("File size exceeds 5MB limit.");
                      return;
                    }
                    setRestaurantLogoFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setRestaurantLogoPreview(reader.result);
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => restaurantLogoInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-lg bg-slate-50/60 h-28 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                >
                  {restaurantLogoPreview ? (
                    <>
                      <img src={restaurantLogoPreview} alt="Restaurant logo preview" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRestaurantLogoPreview(null);
                          setRestaurantLogoFile(null);
                          if (restaurantLogoInputRef.current) restaurantLogoInputRef.current.value = "";
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click to upload restaurant logo</p>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Restaurant Favicon</label>
                <input
                  ref={restaurantFaviconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/x-icon"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/x-icon"];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, WEBP, or ICO.");
                      return;
                    }
                    const maxSize = 5 * 1024 * 1024;
                    if (file.size > maxSize) {
                      toast.error("File size exceeds 5MB limit.");
                      return;
                    }
                    setRestaurantFaviconFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setRestaurantFaviconPreview(reader.result);
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => restaurantFaviconInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-lg bg-slate-50/60 h-28 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                >
                  {restaurantFaviconPreview ? (
                    <>
                      <img src={restaurantFaviconPreview} alt="Restaurant favicon preview" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setRestaurantFaviconPreview(null);
                          setRestaurantFaviconFile(null);
                          if (restaurantFaviconInputRef.current) restaurantFaviconInputRef.current.value = "";
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click to upload restaurant favicon</p>
                    </div>
                  )}
                </div>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Delivery Logo</label>
                <input
                  ref={deliveryLogoInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp"];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, or WEBP.");
                      return;
                    }
                    const maxSize = 5 * 1024 * 1024;
                    if (file.size > maxSize) {
                      toast.error("File size exceeds 5MB limit.");
                      return;
                    }
                    setDeliveryLogoFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setDeliveryLogoPreview(reader.result);
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => deliveryLogoInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-lg bg-slate-50/60 h-28 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                >
                  {deliveryLogoPreview ? (
                    <>
                      <img src={deliveryLogoPreview} alt="Delivery logo preview" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeliveryLogoPreview(null);
                          setDeliveryLogoFile(null);
                          if (deliveryLogoInputRef.current) deliveryLogoInputRef.current.value = "";
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click to upload delivery logo</p>
                    </div>
                  )}
                </div>
              </div>
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Delivery Favicon</label>
                <input
                  ref={deliveryFaviconInputRef}
                  type="file"
                  accept="image/png,image/jpeg,image/jpg,image/webp,image/x-icon"
                  onChange={(e) => {
                    const file = e.target.files?.[0];
                    if (!file) return;
                    const allowedTypes = ["image/png", "image/jpeg", "image/jpg", "image/webp", "image/x-icon"];
                    if (!allowedTypes.includes(file.type)) {
                      toast.error("Invalid file type. Please upload PNG, JPG, JPEG, WEBP, or ICO.");
                      return;
                    }
                    const maxSize = 5 * 1024 * 1024;
                    if (file.size > maxSize) {
                      toast.error("File size exceeds 5MB limit.");
                      return;
                    }
                    setDeliveryFaviconFile(file);
                    const reader = new FileReader();
                    reader.onloadend = () => setDeliveryFaviconPreview(reader.result);
                    reader.readAsDataURL(file);
                  }}
                  className="hidden"
                />
                <div
                  onClick={() => deliveryFaviconInputRef.current?.click()}
                  className="border border-dashed border-slate-300 rounded-lg bg-slate-50/60 h-28 flex items-center justify-center cursor-pointer hover:bg-slate-100 transition-colors relative overflow-hidden"
                >
                  {deliveryFaviconPreview ? (
                    <>
                      <img src={deliveryFaviconPreview} alt="Delivery favicon preview" className="w-full h-full object-contain" />
                      <button
                        type="button"
                        onClick={(e) => {
                          e.stopPropagation();
                          setDeliveryFaviconPreview(null);
                          setDeliveryFaviconFile(null);
                          if (deliveryFaviconInputRef.current) deliveryFaviconInputRef.current.value = "";
                        }}
                        className="absolute top-1 right-1 p-1 bg-red-500 text-white rounded-full hover:bg-red-600 transition-colors"
                      >
                        <X className="w-3 h-3" />
                      </button>
                    </>
                  ) : (
                    <div className="text-center">
                      <Upload className="w-5 h-5 text-slate-400 mx-auto mb-1" />
                      <p className="text-xs text-slate-400">Click to upload delivery favicon</p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>

          {/* Save Button Section */}
          <div className="px-4 py-4 border-t border-slate-100">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
              <p className="text-[11px] text-slate-500">
                Changes will only be applied after clicking the <span className="font-semibold">Save Information</span> button.
              </p>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={handleReset}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg border border-slate-300 text-slate-700 hover:bg-slate-100 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Reset
                </button>
                <button
                  type="button"
                  onClick={handleSave}
                  disabled={saving}
                  className="px-4 py-2 text-xs font-semibold rounded-lg bg-blue-600 text-white hover:bg-blue-700 transition-colors disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
                >
                  {saving ? (
                    <>
                      <Loader2 className="w-3 h-3 animate-spin" />
                      Saving...
                    </>
                  ) : (
                    "Save Information"
                  )}
                </button>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ToggleSwitch({ initial = false }) {
  const [enabled, setEnabled] = useState(initial);

  return (
    <button
      type="button"
      onClick={() => setEnabled((prev) => !prev)}
      className={`inline-flex items-center w-10 h-5 rounded-full border transition-all ${enabled ? "bg-blue-600 border-blue-600 justify-end" : "bg-slate-200 border-slate-300 justify-start"
        }`}
    >
      <span className="h-4 w-4 rounded-full bg-white shadow-sm" />
    </button>
  );
}
