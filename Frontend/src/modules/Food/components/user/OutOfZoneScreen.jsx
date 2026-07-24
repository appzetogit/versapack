import React from "react";
import { MapPin, ChevronDown } from "lucide-react";
import { Link, useLocation } from "react-router-dom";
import outOfZoneBg from "@food/assets/Outofzone_bg.jpg";

const OutOfZoneScreen = ({ location }) => {
  const BRAND_NAME = "SwitchEats";

  const routerLocation = useLocation();

  React.useEffect(() => {
    const state = window.history.state || {};
    window.history.pushState({ ...state, __outOfZoneExitGuard: true }, "");

    const handlePopState = () => {
      // Exit away from the website when back is pressed on this screen.
      window.location.replace("about:blank");
    };

    window.addEventListener("popstate", handlePopState);
    return () => {
      window.removeEventListener("popstate", handlePopState);
    };
  }, []);

  return (
    <div className="flex flex-col h-[100dvh] bg-[#2a1c3d] overflow-hidden fixed inset-0 z-[200]">
      <div className="absolute top-0 left-0 right-0 pt-6 pb-4 px-4 z-50 bg-transparent">
        <div className="flex items-start gap-3">
          <div className="flex-1 min-w-0">
            <Link
              to="/food/user/cart/address-selector"
              state={{ from: routerLocation.pathname }}
              className="inline-flex items-center gap-2 cursor-pointer group max-w-full no-underline"
            >
              <div className="p-1.5 rounded-full group-active:scale-95 transition-all shrink-0">
                <MapPin className="h-5 w-5 text-white" />
              </div>
              <div className="flex flex-col min-w-0">
                <div className="flex items-center gap-1">
                  <span className="text-[17px] font-black text-white truncate drop-shadow-md">
                    {(() => {
                      const area =
                        location?.area ||
                        location?.subLocality ||
                        location?.mainTitle ||
                        location?.neighborhood;
                      if (area && !/^-?\d+(\.\d+)?$/.test(area.trim()))
                        return area;
                      return location?.city || "Select Location";
                    })()}
                  </span>
                  <ChevronDown className="h-3.5 w-3.5 text-white/90 shrink-0" />
                </div>
                <span className="text-[12px] font-bold text-white/90 truncate leading-tight drop-shadow-sm">
                  {location?.city || "Pinpoint location"}
                </span>
              </div>
            </Link>
          </div>

        </div>
      </div>

      <div className="absolute inset-0 z-0">
        <img
          src={outOfZoneBg}
          alt="Service not available"
          className="w-full h-full object-cover scale-[1.02]"
        />
      </div>

      <div className="absolute top-[48vh] left-0 w-full -translate-y-1/2 flex flex-col items-center z-10 px-6">
        <div className="text-center">
          <h2 className="text-[28px] font-bold text-white leading-[1.2] mb-4 tracking-tight drop-shadow-md">
            Hang Tight, We're Almost There
          </h2>
          <p className="text-[16px] font-medium text-white/90 leading-[1.5] max-w-[320px] mx-auto drop-shadow-sm">
            Our service isn't available in your area yet - but we're working on
            it!
          </p>
        </div>
      </div>

      <div className="absolute top-[71vh] left-0 w-full pl-8 z-10">
        <span className="text-[34px] font-[1000] text-white/30 italic tracking-tighter leading-none mix-blend-overlay">
          {BRAND_NAME}
        </span>
      </div>
    </div>
  );
};

export default OutOfZoneScreen;
