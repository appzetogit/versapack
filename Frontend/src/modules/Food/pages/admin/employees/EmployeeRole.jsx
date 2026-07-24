import { useEffect, useMemo, useState } from "react";
import { useSearchParams } from "react-router-dom";
import { adminAPI } from "@food/api";

export default function EmployeeRole() {
  const [searchParams] = useSearchParams();
  const subAdminId = searchParams.get("id");
  const [catalog, setCatalog] = useState({ sections: [], actions: [] });
  const [subAdmin, setSubAdmin] = useState(null);
  const [permissions, setPermissions] = useState({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const load = async () => {
    if (!subAdminId) return;
    setLoading(true);
    try {
      const [catalogRes, subAdminRes] = await Promise.all([
        adminAPI.getSubAdminPermissionCatalog(),
        adminAPI.getSubAdminById(subAdminId),
      ]);
      const sections = catalogRes?.data?.data?.sections || [];
      const actions = catalogRes?.data?.data?.actions || [];
      const sa = subAdminRes?.data?.data?.subAdmin || null;
      setCatalog({ sections, actions });
      setSubAdmin(sa);
      setPermissions(sa?.permissions || {});
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    load();
  }, [subAdminId]);

  const canSave = useMemo(() => Boolean(subAdminId && subAdmin), [subAdminId, subAdmin]);

  const toggleAction = (sectionKey, action) => {
    setPermissions((prev) => {
      const current = Array.isArray(prev?.[sectionKey]) ? prev[sectionKey] : [];
      const next = current.includes(action)
        ? current.filter((it) => it !== action)
        : [...current, action];
      return { ...prev, [sectionKey]: next };
    });
  };

  const toggleAllSection = (sectionKey, checked) => {
    setPermissions((prev) => ({
      ...prev,
      [sectionKey]: checked ? [...catalog.actions] : [],
    }));
  };

  const save = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      await adminAPI.updateSubAdminPermissions(subAdminId, permissions);
      await load();
    } finally {
      setSaving(false);
    }
  };

  if (!subAdminId) {
    return <div className="p-6 text-sm text-red-600">Missing sub-admin id in URL. Open from Sub Admin List.</div>;
  }

  return (
    <div className="p-4 lg:p-6 bg-slate-50 min-h-screen space-y-6">
      <div className="bg-white border border-slate-200 rounded-xl p-5">
        <h1 className="text-2xl font-bold text-slate-900">Sub Admin Permission Matrix</h1>
        <p className="text-sm text-slate-600 mt-1">{subAdmin ? `${subAdmin.name || "Unnamed"} (${subAdmin.email})` : "Loading sub-admin..."}</p>
      </div>

      <div className="bg-white border border-slate-200 rounded-xl p-5 overflow-x-auto">
        {loading ? (
          <p className="text-sm text-slate-500">Loading permissions...</p>
        ) : (
          <table className="w-full min-w-[760px]">
            <thead>
              <tr className="border-b border-slate-200">
                <th className="text-left p-3 text-sm font-semibold">Section</th>
                <th className="text-left p-3 text-sm font-semibold">All</th>
                {catalog.actions.map((action) => (
                  <th key={action} className="text-left p-3 text-sm font-semibold capitalize">{action}</th>
                ))}
              </tr>
            </thead>
            <tbody>
              {catalog.sections.map((section) => {
                const selected = Array.isArray(permissions?.[section.key]) ? permissions[section.key] : [];
                const allChecked = catalog.actions.every((a) => selected.includes(a));
                return (
                  <tr key={section.key} className="border-b border-slate-100">
                    <td className="p-3 text-sm font-medium">{section.key}</td>
                    <td className="p-3">
                      <input type="checkbox" checked={allChecked} onChange={(e) => toggleAllSection(section.key, e.target.checked)} />
                    </td>
                    {catalog.actions.map((action) => (
                      <td key={action} className="p-3">
                        <input
                          type="checkbox"
                          checked={selected.includes(action)}
                          onChange={() => toggleAction(section.key, action)}
                        />
                      </td>
                    ))}
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </div>

      <div>
        <button disabled={!canSave || saving} onClick={save} className="px-4 py-2 bg-black text-white rounded-lg">
          {saving ? "Saving..." : "Save Permissions"}
        </button>
      </div>
    </div>
  );
}
