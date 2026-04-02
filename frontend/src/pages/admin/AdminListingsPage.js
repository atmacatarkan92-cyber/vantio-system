import React, { useEffect, useMemo, useState } from "react";
import { API_BASE_URL, getApiHeaders } from "../../config";

const cardClass =
  "rounded-[14px] border border-black/10 dark:border-white/[0.07] bg-white dark:bg-[#141824] p-6";

const inputClass =
  "w-full rounded-[8px] border border-black/10 dark:border-white/[0.08] bg-slate-100 dark:bg-[#111520] px-3 py-2.5 text-sm text-[#0f172a] dark:text-[#eef2ff] box-border";

const labelClass = "mb-1.5 block text-[10px] font-semibold text-[#64748b] dark:text-[#6b7a9a]";

const initialForm = {
  unit_id: "",
  city_id: "",
  room_id: "",
  slug: "",
  title_de: "",
  title_en: "",
  description_de: "",
  description_en: "",
  price_chf_month: "",
  bedrooms: "",
  bathrooms: "",
  size_sqm: "",
  latitude: "",
  longitude: "",
  is_published: false,
  sort_order: "0",
};

function AdminListingsPage() {
  const [listings, setListings] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [createSuccess, setCreateSuccess] = useState("");
  const [createError, setCreateError] = useState("");
  const [showForm, setShowForm] = useState(false);
  const [submitting, setSubmitting] = useState(false);

  const [listingType, setListingType] = useState("apartment");
  const [form, setForm] = useState(initialForm);
  const [imageUrls, setImageUrls] = useState([""]);
  const [amenitiesDe, setAmenitiesDe] = useState("");
  const [amenitiesEn, setAmenitiesEn] = useState("");

  const [units, setUnits] = useState([]);
  const [unitsLoading, setUnitsLoading] = useState(true);
  const [unitsError, setUnitsError] = useState("");
  const [roomsForSelectedUnit, setRoomsForSelectedUnit] = useState([]);
  const [roomsLoading, setRoomsLoading] = useState(false);
  const [statusUpdateLoadingId, setStatusUpdateLoadingId] = useState(null);
  const [statusUpdateError, setStatusUpdateError] = useState("");

  const citiesFromListings = useMemo(() => {
    const seen = new Map();
    (listings || []).forEach((l) => {
      if (l.city_id && !seen.has(l.city_id)) {
        seen.set(l.city_id, l.city_code || l.city_id);
      }
    });
    return Array.from(seen.entries()).map(([id, code]) => ({ city_id: id, city_code: code }));
  }, [listings]);

  const fetchListings = () => {
    setLoading(true);
    setError("");
    fetch(`${API_BASE_URL}/api/admin/listings`, { headers: getApiHeaders() })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) throw new Error("Nicht autorisiert. Bitte anmelden.");
          if (res.status === 403) throw new Error("Keine Berechtigung.");
          throw new Error("Listings konnten nicht geladen werden.");
        }
        return res.json();
      })
      .then((data) => {
        setListings(Array.isArray(data) ? data : []);
      })
      .catch((err) => {
        console.error(err);
        setError(err.message || "Fehler beim Laden.");
      })
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    fetchListings();
  }, []);

  useEffect(() => {
    setUnitsLoading(true);
    setUnitsError("");
    fetch(`${API_BASE_URL}/api/admin/units`, { headers: getApiHeaders() })
      .then((res) => {
        if (!res.ok) {
          if (res.status === 401) throw new Error("Nicht autorisiert.");
          if (res.status === 403) throw new Error("Keine Berechtigung.");
          throw new Error("Units konnten nicht geladen werden.");
        }
        return res.json();
      })
      .then((data) => {
        const list = data && typeof data.items !== "undefined" ? data.items : (Array.isArray(data) ? data : []);
        setUnits(list);
      })
      .catch((err) => {
        console.error(err);
        setUnitsError(err.message || "Fehler beim Laden der Units.");
      })
      .finally(() => setUnitsLoading(false));
  }, []);

  useEffect(() => {
    if (listingType !== "room" || !form.unit_id.trim()) {
      setRoomsForSelectedUnit([]);
      return;
    }
    setRoomsLoading(true);
    fetch(
      `${API_BASE_URL}/api/admin/units/${encodeURIComponent(form.unit_id)}/rooms`,
      { headers: getApiHeaders() }
    )
      .then((res) => {
        if (!res.ok) {
          if (res.status === 404) return [];
          throw new Error("Rooms konnten nicht geladen werden.");
        }
        return res.json();
      })
      .then((data) => setRoomsForSelectedUnit(Array.isArray(data) ? data : []))
      .catch(() => setRoomsForSelectedUnit([]))
      .finally(() => setRoomsLoading(false));
  }, [listingType, form.unit_id]);

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target;
    setForm((prev) => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleUnitChange = (e) => {
    const unitId = e.target.value;
    const unit = units.find((u) => (u.id || u.unitId) === unitId);
    let cityId = form.city_id;
    if (unit && citiesFromListings.length > 0) {
      const place = (unit.place || unit.city || "").trim();
      const match = citiesFromListings.find(
        (c) => c.city_code && String(c.city_code).toLowerCase() === place.toLowerCase()
      );
      if (match) cityId = match.city_id;
    }
    setForm((prev) => ({ ...prev, unit_id: unitId, city_id: cityId, room_id: "" }));
  };

  const handleListingTypeChange = (e) => {
    const value = e.target.value;
    setListingType(value);
    if (value === "apartment") setForm((prev) => ({ ...prev, room_id: "" }));
  };

  const handleCityChange = (e) => {
    setForm((prev) => ({ ...prev, city_id: e.target.value }));
  };

  const addImageRow = () => setImageUrls((prev) => [...prev, ""]);
  const removeImageRow = (index) => setImageUrls((prev) => prev.filter((_, i) => i !== index));
  const setImageUrl = (index, url) => setImageUrls((prev) => prev.map((u, i) => (i === index ? url : u)));

  const handleSubmitCreate = (e) => {
    e.preventDefault();
    setCreateError("");
    setCreateSuccess("");
    if (listingType === "room" && !form.room_id.trim()) {
      setCreateError("Bei Listing-Typ «Single Room» bitte einen Room wählen oder room_id eingeben.");
      return;
    }
    setSubmitting(true);

    const images = imageUrls
      .map((url) => url.trim())
      .filter(Boolean)
      .map((url, i) => ({ url, is_main: i === 0, position: i }));

    const deList = amenitiesDe.split(",").map((s) => s.trim()).filter(Boolean);
    const enList = amenitiesEn.split(",").map((s) => s.trim()).filter(Boolean);
    const maxLen = Math.max(deList.length, enList.length);
    const amenities = Array.from({ length: maxLen }, (_, i) => ({
      label_de: deList[i] || enList[i] || "",
      label_en: enList[i] || deList[i] || "",
    })).filter((a) => a.label_de || a.label_en);

    const body = {
      unit_id: form.unit_id.trim(),
      city_id: form.city_id.trim(),
      slug: form.slug.trim(),
      title_de: form.title_de.trim() || "",
      title_en: form.title_en.trim() || "",
      description_de: form.description_de.trim() || "",
      description_en: form.description_en.trim() || "",
      price_chf_month: parseInt(form.price_chf_month, 10) || 0,
      bedrooms: parseInt(form.bedrooms, 10) || 0,
      bathrooms: parseInt(form.bathrooms, 10) || 0,
      size_sqm: parseInt(form.size_sqm, 10) || 0,
      is_published: !!form.is_published,
      sort_order: parseInt(form.sort_order, 10) || 0,
      images,
      amenities,
    };

    if (listingType === "room" && form.room_id.trim()) {
      body.room_id = form.room_id.trim();
    }
    if (form.latitude.trim() && !Number.isNaN(parseFloat(form.latitude))) body.latitude = parseFloat(form.latitude);
    if (form.longitude.trim() && !Number.isNaN(parseFloat(form.longitude))) body.longitude = parseFloat(form.longitude);

    fetch(`${API_BASE_URL}/api/admin/listings`, {
      method: "POST",
      headers: getApiHeaders(),
      body: JSON.stringify(body),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json()
            .then((data) => { throw new Error(data.detail || "Fehler beim Erstellen."); })
            .catch(() => { throw new Error(`Fehler ${res.status}`); });
        }
        return res.json();
      })
      .then(() => {
        setCreateSuccess("Listing wurde erstellt.");
        setListingType("apartment");
        setForm(initialForm);
        setImageUrls([""]);
        setAmenitiesDe("");
        setAmenitiesEn("");
        fetchListings();
      })
      .catch((err) => {
        setCreateError(err.message || "Fehler beim Erstellen.");
      })
      .finally(() => setSubmitting(false));
  };

  const hasCities = citiesFromListings.length > 0;

  const patchListingStatus = (listingId, payload) => {
    setStatusUpdateError("");
    setStatusUpdateLoadingId(listingId);
    fetch(`${API_BASE_URL}/api/admin/listings/${encodeURIComponent(listingId)}/status`, {
      method: "PATCH",
      headers: getApiHeaders(),
      body: JSON.stringify(payload),
    })
      .then((res) => {
        if (!res.ok) {
          return res.json().then((d) => { throw new Error(d.detail || "Aktualisierung fehlgeschlagen."); }).catch((e) => { throw e.message ? e : new Error(`Fehler ${res.status}`); });
        }
        return res.json();
      })
      .then((updated) => {
        setListings((prev) => prev.map((l) => (l.id === listingId ? { ...l, ...updated } : l)));
      })
      .catch((err) => setStatusUpdateError(err.message || "Aktualisierung fehlgeschlagen."))
      .finally(() => setStatusUpdateLoadingId(null));
  };

  const availabilityLabel = (s) => {
    const v = (s || "available").toLowerCase();
    if (v === "occupied") return "Belegt";
    if (v === "unavailable") return "Nicht verfügbar";
    return "Verfügbar";
  };

  const availabilityBadgeStyle = (s) => {
    const v = (s || "available").toLowerCase();
    if (v === "occupied") {
      return {
        bg: "rgba(251, 146, 60, 0.1)",
        color: "#fb923c",
        border: "rgba(251, 146, 60, 0.2)",
      };
    }
    if (v === "unavailable") {
      return {
        bg: "rgba(255, 255, 255, 0.05)",
        color: "#6b7a9a",
        border: "rgba(255, 255, 255, 0.08)",
      };
    }
    return {
      bg: "rgba(34, 197, 94, 0.1)",
      color: "#4ade80",
      border: "rgba(34, 197, 94, 0.2)",
    };
  };

  const secondaryBtn = {
    padding: "8px 12px",
    borderRadius: "8px",
    background: "transparent",
    color: "#8090b0",
    cursor: "pointer",
    fontSize: "13px",
  };
  const secondaryBtnClass = "border border-black/10 dark:border-white/[0.1]";

  const dangerBtn = {
    padding: "8px 12px",
    border: "1px solid rgba(239, 68, 68, 0.2)",
    borderRadius: "8px",
    background: "rgba(239, 68, 68, 0.1)",
    color: "#f87171",
    cursor: "pointer",
    fontSize: "13px",
  };

  return (
    <div
      className="content-start bg-[#f8fafc] text-[#0f172a] [color-scheme:light] dark:bg-[#07090f] dark:text-[#eef2ff] dark:[color-scheme:dark]"
      style={{ display: "grid", gap: "24px" }}
    >
      <div>
        <h2 className="mb-2 text-[22px] font-bold text-[#0f172a] dark:text-[#eef2ff]">
          Website Listings
        </h2>
        <p className="m-0 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
          Listing basiert auf einer bestehenden Unit. Unit wählen, dann Website-Felder ausfüllen.
        </p>
      </div>

      <div className={cardClass}>
        <button
          type="button"
          onClick={() => setShowForm(!showForm)}
          className="text-sky-700 hover:text-sky-800 dark:text-sky-400"
          style={{
            background: "none",
            border: "none",
            fontSize: "16px",
            fontWeight: 700,
            cursor: "pointer",
            marginBottom: showForm ? "16px" : 0,
          }}
        >
          {showForm ? "− Neues Listing ausblenden" : "+ Neues Listing anlegen"}
        </button>
        {showForm && (
          <form onSubmit={handleSubmitCreate} style={{ display: "grid", gap: "16px", maxWidth: "680px" }}>
            <div>
              <label className={labelClass}>Listing-Typ *</label>
              <div style={{ display: "flex", gap: "24px", alignItems: "center", flexWrap: "wrap" }}>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0f172a] dark:text-[#eef2ff]">
                  <input
                    type="radio"
                    name="listing_type"
                    value="apartment"
                    checked={listingType === "apartment"}
                    onChange={handleListingTypeChange}
                  />
                  Gesamte Wohnung (Unit)
                </label>
                <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0f172a] dark:text-[#eef2ff]">
                  <input
                    type="radio"
                    name="listing_type"
                    value="room"
                    checked={listingType === "room"}
                    onChange={handleListingTypeChange}
                  />
                  Einzelnes Zimmer (Co-Living)
                </label>
              </div>
            </div>

            <div>
              <label className={labelClass}>Unit (Apartment) *</label>
              {unitsLoading && <p className="mb-2 text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Units werden geladen…</p>}
              {unitsError && <p style={{ fontSize: "13px", color: "#f87171", margin: "0 0 8px 0" }}>{unitsError}</p>}
              <select
                name="unit_id"
                value={form.unit_id}
                onChange={handleUnitChange}
                required
                disabled={unitsLoading}
                className={inputClass}
              >
                <option value="">— Unit wählen —</option>
                {units.map((u) => {
                  const id = u.id;
                  const label = [u.title, u.address, u.city].filter(Boolean).join(" · ") || id;
                  return (
                    <option key={id} value={id}>
                      {label}
                    </option>
                  );
                })}
              </select>
              {!unitsLoading && !unitsError && units.length === 0 && (
                <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
                  Keine Units in der Datenbank. Zuerst Units anlegen (z.B. per Seed-Script).
                </p>
              )}
            </div>

            <div>
              <label className={labelClass}>Stadt (City) *</label>
              {hasCities ? (
                <select
                  name="city_id"
                  value={form.city_id}
                  onChange={handleCityChange}
                  required
                  className={inputClass}
                >
                  <option value="">— Stadt wählen —</option>
                  {citiesFromListings.map((c) => (
                    <option key={c.city_id} value={c.city_id}>
                      {c.city_code}
                    </option>
                  ))}
                </select>
              ) : (
                <>
                  <input
                    type="text"
                    name="city_id"
                    value={form.city_id}
                    onChange={handleChange}
                    required
                    placeholder="city_id (UUID aus DB)"
                    className={inputClass}
                  />
                  <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
                    Noch keine Städte aus Listings. UUID der Stadt eingeben (z.B. aus Seed) oder zuerst ein Listing mit Stadt anlegen.
                  </p>
                </>
              )}
            </div>

            {listingType === "room" && (
              <div>
                <label className={labelClass}>Room *</label>
                {roomsLoading && <p className="mb-2 text-[13px] text-[#64748b] dark:text-[#6b7a9a]">Rooms werden geladen…</p>}
                {!roomsLoading && roomsForSelectedUnit.length > 0 ? (
                  <select
                    name="room_id"
                    value={form.room_id}
                    onChange={handleChange}
                    required
                    className={inputClass}
                  >
                    <option value="">— Room wählen —</option>
                    {roomsForSelectedUnit.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name || r.id}
                      </option>
                    ))}
                  </select>
                ) : !roomsLoading ? (
                  <>
                    <input
                      type="text"
                      name="room_id"
                      value={form.room_id}
                      onChange={handleChange}
                      required
                      placeholder="room_id (UUID aus Datenbank)"
                      className={inputClass}
                    />
                    <p className="mt-1 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">
                      Keine Rooms für diese Unit in der Datenbank. room_id manuell eingeben oder Rooms für die Unit anlegen.
                    </p>
                  </>
                ) : null}
              </div>
            )}

            <div>
              <label className={labelClass}>slug *</label>
              <input
                type="text"
                name="slug"
                value={form.slug}
                onChange={handleChange}
                required
                placeholder="z.B. zurich-bahnhof-1"
                className={inputClass}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label className={labelClass}>title_de</label>
                <input
                  type="text"
                  name="title_de"
                  value={form.title_de}
                  onChange={handleChange}
                  placeholder="Titel DE"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>title_en</label>
                <input
                  type="text"
                  name="title_en"
                  value={form.title_en}
                  onChange={handleChange}
                  placeholder="Title EN"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>description_de</label>
              <textarea
                name="description_de"
                value={form.description_de}
                onChange={handleChange}
                placeholder="Beschreibung DE"
                rows={2}
                className={inputClass}
                style={{ resize: "vertical" }}
              />
            </div>
            <div>
              <label className={labelClass}>description_en</label>
              <textarea
                name="description_en"
                value={form.description_en}
                onChange={handleChange}
                placeholder="Description EN"
                rows={2}
                className={inputClass}
                style={{ resize: "vertical" }}
              />
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr 1fr", gap: "16px" }}>
              <div>
                <label className={labelClass}>price_chf_month</label>
                <input
                  type="number"
                  name="price_chf_month"
                  value={form.price_chf_month}
                  onChange={handleChange}
                  min={0}
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>bedrooms</label>
                <input type="number" name="bedrooms" value={form.bedrooms} onChange={handleChange} min={0} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>bathrooms</label>
                <input type="number" name="bathrooms" value={form.bathrooms} onChange={handleChange} min={0} className={inputClass} />
              </div>
              <div>
                <label className={labelClass}>size_sqm</label>
                <input type="number" name="size_sqm" value={form.size_sqm} onChange={handleChange} min={0} className={inputClass} />
              </div>
            </div>

            <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: "16px" }}>
              <div>
                <label className={labelClass}>latitude</label>
                <input
                  type="text"
                  name="latitude"
                  value={form.latitude}
                  onChange={handleChange}
                  placeholder="z.B. 47.3769"
                  className={inputClass}
                />
              </div>
              <div>
                <label className={labelClass}>longitude</label>
                <input
                  type="text"
                  name="longitude"
                  value={form.longitude}
                  onChange={handleChange}
                  placeholder="z.B. 8.5417"
                  className={inputClass}
                />
              </div>
            </div>

            <div>
              <label className={labelClass}>Bilder (URLs)</label>
              {imageUrls.map((url, index) => (
                <div key={index} style={{ display: "flex", gap: "8px", marginBottom: "8px" }}>
                  <input
                    type="url"
                    value={url}
                    onChange={(e) => setImageUrl(index, e.target.value)}
                    placeholder={`Bild-URL ${index + 1}`}
                    className={inputClass}
                  />
                  <button
                    type="button"
                    onClick={() => removeImageRow(index)}
                    style={dangerBtn}
                  >
                    Entfernen
                  </button>
                </div>
              ))}
              <button type="button" onClick={addImageRow} className={secondaryBtnClass} style={secondaryBtn}>
                + Bild-URL hinzufügen
              </button>
            </div>

            <div>
              <label className={labelClass}>Amenities DE (kommagetrennt)</label>
              <input
                type="text"
                value={amenitiesDe}
                onChange={(e) => setAmenitiesDe(e.target.value)}
                placeholder="z.B. WLAN, Waschmaschine, Balkon"
                className={inputClass}
              />
            </div>
            <div>
              <label className={labelClass}>Amenities EN (kommagetrennt)</label>
              <input
                type="text"
                value={amenitiesEn}
                onChange={(e) => setAmenitiesEn(e.target.value)}
                placeholder="e.g. WiFi, Washing machine, Balcony"
                className={inputClass}
              />
            </div>

            <div style={{ display: "flex", alignItems: "center", gap: "12px", flexWrap: "wrap" }}>
              <label className="flex cursor-pointer items-center gap-2 text-sm text-[#0f172a] dark:text-[#eef2ff]">
                <input
                  type="checkbox"
                  name="is_published"
                  checked={form.is_published}
                  onChange={handleChange}
                />
                is_published
              </label>
              <div style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                <label className={labelClass}>sort_order</label>
                <input
                  type="number"
                  name="sort_order"
                  value={form.sort_order}
                  onChange={handleChange}
                  className={inputClass}
                  style={{ width: "80px" }}
                />
              </div>
            </div>

            {createSuccess && (
              <p
                className="text-sky-700 dark:text-sky-400"
                style={{
                  margin: 0,
                  fontSize: "14px",
                  padding: "10px 12px",
                  borderRadius: "10px",
                  background: "rgba(59, 130, 246, 0.06)",
                  border: "1px solid rgba(59, 130, 246, 0.12)",
                }}
              >
                {createSuccess}
              </p>
            )}
            {createError && <p style={{ color: "#f87171", margin: 0, fontSize: "14px" }}>{createError}</p>}
            <button
              type="submit"
              disabled={submitting}
              className="bg-gradient-to-r from-[#5b8cff] to-[#7c5cfc] text-white font-semibold rounded-[8px] border-none"
              style={{
                padding: "10px 20px",
                fontSize: "14px",
                cursor: submitting ? "not-allowed" : "pointer",
                opacity: submitting ? 0.7 : 1,
              }}
            >
              {submitting ? "Wird erstellt…" : "Listing erstellen"}
            </button>
          </form>
        )}
      </div>

      <div className={cardClass}>
        <h3 className="mb-4 text-[9px] font-bold uppercase tracking-[1px] text-[#64748b] dark:text-[#6b7a9a]">
          Alle Listings
        </h3>
        {loading && <p className="text-[#64748b] dark:text-[#6b7a9a]">Listings werden geladen…</p>}
        {error && <p style={{ color: "#f87171" }}>{error}</p>}
        {!loading && !error && listings.length === 0 && (
          <p className="text-[#64748b] dark:text-[#6b7a9a]">
            Noch keine Listings. Unit wählen und oben ein neues Listing anlegen.
          </p>
        )}
        {statusUpdateError && (
          <p style={{ color: "#f87171", fontSize: "14px", margin: "0 0 12px 0" }}>{statusUpdateError}</p>
        )}
        {!loading && !error && listings.length > 0 && (
          <div style={{ overflowX: "auto" }}>
            <table className="w-full border-collapse text-sm">
              <thead>
                <tr className="text-left text-[9px] font-bold uppercase tracking-[0.8px] text-[#64748b] dark:bg-[#111520] dark:text-[#6b7a9a] bg-slate-100">
                  <th className="p-3">Slug</th>
                  <th className="p-3">Titel (DE/EN)</th>
                  <th className="p-3">City</th>
                  <th className="p-3">Preis (CHF)</th>
                  <th className="p-3">Published</th>
                  <th className="p-3">Availability</th>
                  <th className="p-3">Sort</th>
                  <th className="p-3">ID</th>
                </tr>
              </thead>
              <tbody>
                {listings.map((row) => {
                  const isUpdating = statusUpdateLoadingId === row.id;
                  const status = row.availability_status || "available";
                  const badgeStyle = availabilityBadgeStyle(status);
                  const isUnavailable = (status || "available").toLowerCase() === "unavailable";
                  return (
                    <tr
                      key={row.id}
                      className="border-b border-black/10 dark:border-white/[0.05]"
                    >
                      <td className="p-3 text-[13px] font-semibold text-[#0f172a] dark:text-[#eef2ff]">
                        {row.slug || "—"}
                      </td>
                      <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                        {row.title_de || "—"} / {row.title_en || "—"}
                      </td>
                      <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                        {row.city_code || row.city_id || "—"}
                      </td>
                      <td className="p-3 text-[13px] font-medium text-[#4ade80]">
                        {row.price_chf_month != null ? row.price_chf_month : "—"}
                      </td>
                      <td className="p-3">
                        <span className="mr-2 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                          {row.is_published ? "Online" : "Offline"}
                        </span>
                        <button
                          type="button"
                          disabled={isUpdating}
                          onClick={() => patchListingStatus(row.id, { is_published: !row.is_published })}
                          className={secondaryBtnClass}
                          style={{
                            ...secondaryBtn,
                            padding: "4px 10px",
                            fontSize: "12px",
                            cursor: isUpdating ? "not-allowed" : "pointer",
                            opacity: isUpdating ? 0.7 : 1,
                          }}
                        >
                          {isUpdating ? "…" : row.is_published ? "Ausblenden" : "Veröffentlichen"}
                        </button>
                      </td>
                      <td className="p-3">
                        <span
                          style={
                            isUnavailable
                              ? {
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  marginRight: "8px",
                                }
                              : {
                                  display: "inline-flex",
                                  alignItems: "center",
                                  padding: "6px 10px",
                                  borderRadius: "999px",
                                  fontSize: "10px",
                                  fontWeight: 700,
                                  background: badgeStyle.bg,
                                  color: badgeStyle.color,
                                  border: `1px solid ${badgeStyle.border}`,
                                  marginRight: "8px",
                                }
                          }
                          className={
                            isUnavailable
                              ? "mr-2 border border-black/10 bg-slate-100 text-[10px] font-bold text-[#64748b] dark:border-white/[0.08] dark:bg-white/[0.05] dark:text-[#6b7a9a]"
                              : undefined
                          }
                        >
                          {availabilityLabel(status)}
                        </span>
                        <select
                          value={status}
                          disabled={isUpdating}
                          onChange={(e) => patchListingStatus(row.id, { availability_status: e.target.value })}
                          className={`${inputClass} min-w-[120px] px-2 py-1 text-xs`}
                          style={{ padding: "4px 8px" }}
                        >
                          <option value="available">Verfügbar</option>
                          <option value="occupied">Belegt</option>
                          <option value="unavailable">Nicht verfügbar</option>
                        </select>
                      </td>
                      <td className="p-3 text-[13px] text-[#0f172a] dark:text-[#eef2ff]">
                        {row.sort_order != null ? row.sort_order : "—"}
                      </td>
                      <td className="p-3 text-[12px] text-[#64748b] dark:text-[#6b7a9a]">{row.id}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

export default AdminListingsPage;
