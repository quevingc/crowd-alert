/**
 * sos.js
 * One-tap SOS mode: quickly files a high-priority "Active" report at the
 * user's current GPS location and surfaces nearby emergency contacts /
 * facilities. Intended for genuine emergencies — kept deliberately simple
 * and fast (minimal typing required).
 */

const SOS = {
  active: false,

  async trigger(emergencyType = "other") {
    try {
      const pos = await Utils.getCurrentPosition();
      const report = {
        lat: pos.lat,
        lng: pos.lng,
        type: emergencyType,
        description: `SOS: Immediate assistance requested (auto-generated at ${new Date().toLocaleString()}).`,
        reporterAlias: "SOS User",
        images: [],
      };

      Utils.markSubmitted(); // bypass normal cooldown check by pre-marking is not ideal;
      // instead we call the API/offline queue directly to skip the generic cooldown gate.

      let result;
      if (!navigator.onLine) {
        const localId = await OfflineQueue.add({
          ...report,
          reportId: Utils.generateReportId(),
          timestamp: Utils.nowISO(),
          lastUpdated: Utils.nowISO(),
          status: "Active",
          editorId: Utils.getDeviceId(),
        });
        result = { offline: true, localId };
      } else {
        const saved = await Api.createReport({
          ...report,
          reportId: Utils.generateReportId(),
          timestamp: Utils.nowISO(),
          lastUpdated: Utils.nowISO(),
          status: "Active",
          editorId: Utils.getDeviceId(),
        });
        result = { offline: false, saved };
      }

      return { success: true, position: pos, result };
    } catch (e) {
      return { success: false, error: e.message };
    }
  },

  /** Static directory — override/extend via Settings sheet in production */
  emergencyContacts: [
    { name: "National Emergency Hotline", number: "09606071677" },
  ],
};
