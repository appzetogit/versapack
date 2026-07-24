import { useEffect, useMemo, useState } from "react";
import { Loader2, Save } from "lucide-react";
import { toast } from "sonner";
import { adminAPI } from "@food/api";
import { getCachedSettings, setCachedSettings } from "@food/utils/businessSettings";

const MODULES = [
  { key: "user", label: "User Module", fallbackColor: "#FA0272" },
  { key: "restaurant", label: "Restaurant Module", fallbackColor: "#2563EB" },
  { key: "delivery", label: "Delivery Module", fallbackColor: "#00B761" },
];

const FONT_OPTIONS = [
  "Poppins", "Outfit", "Inter", "Roboto", "Montserrat",
  "Nunito", "Open Sans", "Lato", "Manrope", "Raleway",
  "Merriweather", "Playfair Display", "Ubuntu", "Rubik", "Work Sans",
];

const clamp = (value, min, max) => Math.min(Math.max(value, min), max);

const hexToRgb = (hex) => {
  const normalized = String(hex || "").replace("#", "").trim();
  if (!/^[0-9A-Fa-f]{6}$/.test(normalized)) return null;
  return {
    r: parseInt(normalized.slice(0, 2), 16),
    g: parseInt(normalized.slice(2, 4), 16),
    b: parseInt(normalized.slice(4, 6), 16),
  };
};

const rgbToHex = ({ r, g, b }) =>
  `#${[r, g, b].map((v) => clamp(Math.round(v), 0, 255).toString(16).padStart(2, "0")).join("").toUpperCase()}`;

const rgbToHsv = ({ r, g, b }) => {
  const rr = r / 255;
  const gg = g / 255;
  const bb = b / 255;
  const max = Math.max(rr, gg, bb);
  const min = Math.min(rr, gg, bb);
  const delta = max - min;
  let h = 0;
  if (delta !== 0) {
    if (max === rr) h = ((gg - bb) / delta) % 6;
    else if (max === gg) h = (bb - rr) / delta + 2;
    else h = (rr - gg) / delta + 4;
    h = Math.round(h * 60);
    if (h < 0) h += 360;
  }
  const s = max === 0 ? 0 : delta / max;
  const v = max;
  return { h, s, v };
};

const hsvToRgb = ({ h, s, v }) => {
  const c = v * s;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = v - c;
  let rr = 0;
  let gg = 0;
  let bb = 0;
  if (h >= 0 && h < 60) { rr = c; gg = x; bb = 0; }
  else if (h < 120) { rr = x; gg = c; bb = 0; }
  else if (h < 180) { rr = 0; gg = c; bb = x; }
  else if (h < 240) { rr = 0; gg = x; bb = c; }
  else if (h < 300) { rr = x; gg = 0; bb = c; }
  else { rr = c; gg = 0; bb = x; }
  return {
    r: Math.round((rr + m) * 255),
    g: Math.round((gg + m) * 255),
    b: Math.round((bb + m) * 255),
  };
};

function SpectrumColorPicker({ value, fallback, onChange }) {
  const normalized = normalizeHex(value, fallback);
  const initialRgb = hexToRgb(normalized) || hexToRgb(fallback) || { r: 250, g: 2, b: 114 };
  const initialHsv = rgbToHsv(initialRgb);
  const [hsv, setHsv] = useState(initialHsv);

  useEffect(() => {
    const rgb = hexToRgb(normalized);
    if (!rgb) return;
    const next = rgbToHsv(rgb);
    setHsv(next);
  }, [normalized]);

  const hueColor = rgbToHex(hsvToRgb({ h: hsv.h, s: 1, v: 1 }));
  const previewColor = rgbToHex(hsvToRgb(hsv));
  const svX = `${hsv.s * 100}%`;
  const svY = `${(1 - hsv.v) * 100}%`;

  const updateSv = (clientX, clientY, rect) => {
    const s = clamp((clientX - rect.left) / rect.width, 0, 1);
    const v = clamp(1 - ((clientY - rect.top) / rect.height), 0, 1);
    const next = { ...hsv, s, v };
    setHsv(next);
    onChange(rgbToHex(hsvToRgb(next)));
  };

  const handleSvMouseDown = (event) => {
    const rect = event.currentTarget.getBoundingClientRect();
    updateSv(event.clientX, event.clientY, rect);

    const onMove = (moveEvent) => updateSv(moveEvent.clientX, moveEvent.clientY, rect);
    const onUp = () => {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup", onUp);
    };
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup", onUp);
  };

  const handleHueChange = (event) => {
    const h = clamp(Number(event.target.value || 0), 0, 360);
    const next = { ...hsv, h };
    setHsv(next);
    onChange(rgbToHex(hsvToRgb(next)));
  };

  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 space-y-3">
      <div
        role="presentation"
        onMouseDown={handleSvMouseDown}
        className="relative h-40 w-full rounded-lg cursor-crosshair"
        style={{ backgroundColor: hueColor }}
      >
        <div className="absolute inset-0 rounded-lg" style={{ background: "linear-gradient(to right, #ffffff 0%, rgba(255,255,255,0) 100%)" }} />
        <div className="absolute inset-0 rounded-lg" style={{ background: "linear-gradient(to top, #000000 0%, rgba(0,0,0,0) 100%)" }} />
        <div
          className="absolute h-4 w-4 rounded-full border-2 border-white shadow"
          style={{ left: svX, top: svY, transform: "translate(-50%, -50%)" }}
        />
      </div>

      <input
        type="range"
        min={0}
        max={360}
        value={hsv.h}
        onChange={handleHueChange}
        className="w-full h-2 rounded-lg appearance-none cursor-pointer"
        style={{ background: "linear-gradient(90deg, #ff0000 0%, #ffff00 17%, #00ff00 33%, #00ffff 50%, #0000ff 67%, #ff00ff 83%, #ff0000 100%)" }}
      />

      <div className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2">
        <span className="h-6 w-6 rounded-full border border-slate-200" style={{ backgroundColor: previewColor }} />
        <span className="text-sm font-semibold text-slate-700">{previewColor}</span>
      </div>
    </div>
  );
}

const normalizeHex = (value, fallback) => {
  const raw = String(value || "").trim();
  if (!raw) return fallback;
  const next = raw.startsWith("#") ? raw : `#${raw}`;
  return /^#[0-9A-Fa-f]{6}$/.test(next) ? next.toUpperCase() : fallback;
};

const defaultState = MODULES.reduce((acc, item) => {
  acc[item.key] = { themeColor: item.fallbackColor, fontFamily: "Poppins" };
  return acc;
}, {});

export default function PowerScanning() {
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [formData, setFormData] = useState(defaultState);

  useEffect(() => {
    const load = async () => {
      try {
        setLoading(true);
        const response = await adminAPI.getPowerScanningSettings();
        const data = response?.data?.data || {};
        setFormData((prev) => {
          const next = { ...prev };
          MODULES.forEach((module) => {
            next[module.key] = {
              themeColor: normalizeHex(data?.[module.key]?.themeColor, module.fallbackColor),
              fontFamily: FONT_OPTIONS.includes(data?.[module.key]?.fontFamily)
                ? data[module.key].fontFamily
                : "Poppins",
            };
          });
          return next;
        });
      } catch (error) {
        toast.error(error?.response?.data?.message || "Failed to load power scanning settings.");
      } finally {
        setLoading(false);
      }
    };

    load();
  }, []);

  const canSave = useMemo(() => {
    return MODULES.every((module) => {
      const color = normalizeHex(formData?.[module.key]?.themeColor, "");
      return Boolean(color) && FONT_OPTIONS.includes(formData?.[module.key]?.fontFamily);
    });
  }, [formData]);

  const updateModule = (moduleKey, patch) => {
    setFormData((prev) => ({
      ...prev,
      [moduleKey]: {
        ...prev[moduleKey],
        ...patch,
      },
    }));
  };

  const handleSave = async () => {
    try {
      if (!canSave) {
        toast.error("Please provide a valid 6-digit hex color and font for all modules.");
        return;
      }

      setSaving(true);
      const payload = MODULES.reduce((acc, module) => {
        acc[module.key] = {
          themeColor: normalizeHex(formData?.[module.key]?.themeColor, module.fallbackColor),
          fontFamily: FONT_OPTIONS.includes(formData?.[module.key]?.fontFamily)
            ? formData[module.key].fontFamily
            : "Poppins",
        };
        return acc;
      }, {});

      const response = await adminAPI.updatePowerScanningSettings(payload);
      const updated = response?.data?.data || payload;

      setFormData((prev) => {
        const next = { ...prev };
        MODULES.forEach((module) => {
          next[module.key] = {
            themeColor: normalizeHex(updated?.[module.key]?.themeColor, module.fallbackColor),
            fontFamily: FONT_OPTIONS.includes(updated?.[module.key]?.fontFamily)
              ? updated[module.key].fontFamily
              : "Poppins",
          };
        });
        return next;
      });

      const cached = getCachedSettings() || {};
      setCachedSettings({
        ...cached,
        powerScanning: updated,
      });

      window.dispatchEvent(new CustomEvent("businessSettingsUpdated"));
      toast.success("Power scanning settings updated successfully.");
    } catch (error) {
      toast.error(error?.response?.data?.message || "Failed to update power scanning settings.");
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="flex h-[320px] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="p-6 max-w-5xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-gray-900">Power Scanning</h1>
        <p className="text-sm text-gray-500 mt-1">Set module-wise theme color and font for User, Restaurant, and Delivery apps.</p>
      </div>

      {MODULES.map((module) => {
        const value = formData[module.key] || { themeColor: module.fallbackColor, fontFamily: "Poppins" };
        const normalizedColor = normalizeHex(value.themeColor, module.fallbackColor);
        return (
          <div key={module.key} className="border border-slate-200 rounded-xl bg-white p-4 space-y-4">
            <h2 className="text-lg font-semibold text-slate-900">{module.label}</h2>
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 mb-1.5">Theme Color Picker</label>
                <SpectrumColorPicker
                  value={normalizedColor}
                  fallback={module.fallbackColor}
                  onChange={(nextColor) => updateModule(module.key, { themeColor: nextColor })}
                />
              </div>

              <div>
                <div className="space-y-4">
                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Theme Color Hex</label>
                    <input
                      type="text"
                      value={value.themeColor || ""}
                      placeholder="#FA0272"
                      onChange={(e) => updateModule(module.key, { themeColor: e.target.value })}
                      onBlur={() => updateModule(module.key, { themeColor: normalizeHex(value.themeColor, module.fallbackColor) })}
                      className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    />
                  </div>

                  <div>
                    <label className="block text-xs font-semibold text-slate-700 mb-1.5">Text Font</label>
                    <select
                      value={value.fontFamily || "Poppins"}
                      onChange={(e) => updateModule(module.key, { fontFamily: e.target.value })}
                      className="h-11 w-full rounded-md border border-slate-300 px-3 text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
                    >
                      {FONT_OPTIONS.map((font) => (
                        <option key={font} value={font}>{font}</option>
                      ))}
                    </select>
                  </div>
                </div>
              </div>
            </div>
          </div>
        );
      })}

      <div className="flex justify-end">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving || !canSave}
          className="px-5 py-2.5 rounded-lg bg-blue-600 text-white font-medium hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed inline-flex items-center gap-2"
        >
          {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
          Save Changes
        </button>
      </div>
    </div>
  );
}
