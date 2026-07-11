/**
 * Facilities.gs
 * Read-only directory of evacuation centers and hospitals, seeded via
 * Setup.gs and editable directly in the "Facilities" sheet by admins.
 */

const Facilities_ = {
  list() {
    return Utils_.getAllRows(SHEET_NAMES.FACILITIES).map((f) => ({
      ...f,
      lat: Number(f.lat),
      lng: Number(f.lng),
    }));
  },
};
