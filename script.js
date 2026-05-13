(function () {
  "use strict";

  // ------- Configuration -------
  const SERVICE_NAME = "Non-Surgical Facelift & Neck Lift";
  const SERVICE_DURATION_MIN = 60;

  // GHL credentials
  const GHL = {
    locationId: '6Zq67hagaRvdH16ojruj',
    calendarId: 'ILJEtqDYOn1HzZmQkvGI',
    userId:     '2tQreqXcDpaAiSBqlK7T',
    apiKey:     'pit-c36347d8-0349-4362-b6dc-4c3b2ae25036',
    apiBase:    'https://services.leadconnectorhq.com',
    version:    '2021-07-28',
  };

  const BUSINESS_TZ = "America/Los_Angeles";
  const DOW_SHORT = ["Sun","Mon","Tue","Wed","Thu","Fri","Sat"];
  const STEPS = ["date", "time", "details", "confirmed"];

  // ------- State -------
  const today = startOfDay(new Date());
  let selectedDate = null;
  let selectedTime = null;
  let selectedSlotIso = null;
  let cachedSlots = {};

  // ------- Elements -------
  const $ = (id) => document.getElementById(id);
  const dateGrid = $("date-grid");
  const timeLoading = $("time-loading");
  const timeSummary    = $("time-summary");
  const detailsSummary = $("details-summary");
  const detailsForm    = $("details-form");
  const submitBtn      = $("submit-btn");
  const btnLabel       = submitBtn.querySelector(".btn-label");
  const spinner        = submitBtn.querySelector(".spinner");
  const errorText      = $("error-text");
  const resetBtn       = $("reset-btn");
  const gcalLink       = $("gcal-link");
  const confirmCard    = $("confirm-card");

  // ------- Helpers -------
  function startOfDay(d) {
    const x = new Date(d);
    x.setHours(0, 0, 0, 0);
    return x;
  }
  function pad(n) { return String(n).padStart(2, "0"); }

  function sameDay(a, b) {
    return a && b &&
      a.getFullYear() === b.getFullYear() &&
      a.getMonth() === b.getMonth() &&
      a.getDate() === b.getDate();
  }
  function formatLongDate(d) {
    return d.toLocaleDateString(undefined, {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }
  function formatTimeFromIso(isoStr) {
    const d = new Date(isoStr);
    const opts = { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hour12: true, hourCycle: 'h12' };
    return d.toLocaleTimeString('en-US', opts);
  }

  // ------- Fetch real available slots from GHL -------
  async function fetchSlotsForDate(date) {
    const startMs = date.getTime();
    const endMs = startMs + 86400000;

    const url = GHL.apiBase + '/calendars/' + encodeURIComponent(GHL.calendarId) +
      '/free-slots?startDate=' + startMs + '&endDate=' + endMs + '&timezone=' + encodeURIComponent(BUSINESS_TZ);

    const cacheKey = startMs;
    if (cachedSlots[cacheKey]) return cachedSlots[cacheKey];

    const res = await fetch(url, {
      headers: {
        'Authorization': 'Bearer ' + GHL.apiKey,
        'Version': GHL.version,
        'Accept': 'application/json',
      },
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || ('HTTP ' + res.status));

    // Collect all slots from all date keys returned by the API
    let allSlots = [];
    for (const key in data) {
      if (key === 'traceId') continue;
      if (data[key] && data[key].slots) {
        allSlots = allSlots.concat(data[key].slots);
      }
    }

    const slots = allSlots
      .filter(s => {
        const d = new Date(s);
        const h = d.getUTCHours() + d.getUTCMinutes() / 60;
        return h >= 6;
      })
      .map(s => ({
        label: formatTimeFromIso(s),
        iso: s,
      }));

    cachedSlots[cacheKey] = slots;
    return slots;
  }

  // ------- Step navigation -------
  function showStep(step) {
    STEPS.forEach((s) => {
      const el = $("step-" + s);
      if (el) el.classList.toggle("hidden", s !== step);
    });
    window.scrollTo({ top: 0, behavior: "smooth" });
  }

  // ------- Calendar render -------
  function renderMonth() {
    dateGrid.innerHTML = "";
    const cells = [];
    const cursor = new Date(today);
    while (cells.length < 6) {
      // Skip Sunday (day 0)
      if (cursor.getDay() !== 0) {
        cells.push(new Date(cursor));
      }
      cursor.setDate(cursor.getDate() + 1);
    }
    cells.forEach((d) => {
      const btn = document.createElement("button");
      btn.type = "button";
      btn.className = "date-cell";
      if (sameDay(d, selectedDate)) btn.classList.add("selected");
      const dow = document.createElement("span");
      dow.className = "dow";
      dow.textContent = DOW_SHORT[d.getDay()];
      const day = document.createElement("span");
      day.className = "day";
      day.textContent = String(d.getDate());
      btn.appendChild(dow);
      btn.appendChild(day);
      btn.addEventListener("click", () => selectDate(d));
      dateGrid.appendChild(btn);
    });
  }

  // ------- Render times from GHL slots -------
  function renderTimes(slots) {
    const morningGrid = $("morning-grid");
    const afternoonGrid = $("afternoon-grid");
    morningGrid.innerHTML = "";
    afternoonGrid.innerHTML = "";

    if (!slots || slots.length === 0) {
      morningGrid.innerHTML = '<p style="font-size:.8rem;color:var(--muted-foreground);text-align:center;grid-column:1/-1;padding:6px 0;">No available slots</p>';
      afternoonGrid.innerHTML = '<p style="font-size:.8rem;color:var(--muted-foreground);text-align:center;grid-column:1/-1;padding:6px 0;">No available slots</p>';
      return;
    }

    // Remove 9am slots from all dates
    const filtered = slots.filter(s => {
      const d = new Date(s.iso);
      const opts = { timeZone: BUSINESS_TZ, hour: '2-digit', hour12: false, hourCycle: 'h23' };
      const h = parseInt(new Intl.DateTimeFormat('en-US', opts).format(d), 10);
      return h !== 9;
    });

    const morning = filtered.filter(s => {
      const d = new Date(s.iso);
      const opts = { timeZone: BUSINESS_TZ, hour: '2-digit', hour12: false, hourCycle: 'h23' };
      const h = parseInt(new Intl.DateTimeFormat('en-US', opts).format(d), 10);
      return h < 12;
    });

    const afternoon = slots.filter(s => {
      const d = new Date(s.iso);
      const opts = { timeZone: BUSINESS_TZ, hour: '2-digit', hour12: false, hourCycle: 'h23' };
      const h = parseInt(new Intl.DateTimeFormat('en-US', opts).format(d), 10);
      return h >= 12;
    });

    function renderSlotList(arr, grid) {
      if (arr.length === 0) {
        grid.innerHTML = '<p style="font-size:.8rem;color:var(--muted-foreground);text-align:center;grid-column:1/-1;padding:6px 0;">No available slots</p>';
        return;
      }
      arr.forEach((s) => {
        const b = document.createElement("button");
        b.type = "button"; b.className = "time-cell";
        if (selectedSlotIso === s.iso) b.classList.add("selected");
        b.textContent = s.label;
        b.addEventListener("click", () => selectTime(s));
        grid.appendChild(b);
      });
    }

    renderSlotList(morning, morningGrid);
    renderSlotList(afternoon, afternoonGrid);
  }

  // ------- Selection handlers -------
  async function selectDate(d) {
    selectedDate = startOfDay(d);
    selectedTime = null;
    selectedSlotIso = null;
    renderMonth();
    if (timeLoading) timeLoading.classList.remove("hidden");
    timeSummary.textContent = formatLongDate(selectedDate);
    showStep("time");
    track("AddToCart", { content_name: SERVICE_NAME });

    try {
      const slots = await fetchSlotsForDate(selectedDate);
      if (timeLoading) timeLoading.classList.add("hidden");
      renderTimes(slots);
    } catch (err) {
      console.error("Failed to fetch slots", err);
      if (timeLoading) timeLoading.classList.add("hidden");
      const morningGrid = $("morning-grid");
      const afternoonGrid = $("afternoon-grid");
      if (morningGrid) morningGrid.innerHTML = '<p style="font-size:.875rem;color:var(--muted-foreground);text-align:center;padding:16px 0;">Could not load times</p>';
      if (afternoonGrid) afternoonGrid.innerHTML = "";
    }
  }

  function selectTime(slot) {
    selectedTime = { label: slot.label };
    selectedSlotIso = slot.iso;
    detailsSummary.textContent =
      `${formatLongDate(selectedDate)} • ${selectedTime.label}`;
    showStep("details");
    track("InitiateCheckout", { content_name: SERVICE_NAME });
  }

  function track(event, params) {
    if (typeof window.fbq === "function") {
      try { window.fbq("track", event, params || {}); } catch (_) {}
    }
  }

  // ------- Back buttons -------
  document.querySelectorAll(".back-btn").forEach((btn) => {
    btn.addEventListener("click", () => showStep(btn.dataset.back));
  });

  // ------- GHL API call (POST) -------
  async function ghlPost(path, body) {
    const res = await fetch(GHL.apiBase + path, {
      method: 'POST',
      headers: {
        'Authorization': 'Bearer ' + GHL.apiKey,
        'Version': GHL.version,
        'Content-Type': 'application/json',
        'Accept': 'application/json',
      },
      body: JSON.stringify(body),
    });
    const data = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(data.message || ('HTTP ' + res.status));
    return data;
  }

  // ------- Form submit -------
  detailsForm.addEventListener("submit", async (e) => {
    e.preventDefault();
    errorText.classList.add("hidden");

    const name  = $("name").value.trim();
    const email = $("email").value.trim();
    const phone = $("phone").value.trim();

    if (!name || !email || !phone || !selectedDate || !selectedSlotIso) {
      errorText.textContent = "Please fill in all fields.";
      errorText.classList.remove("hidden");
      return;
    }

    submitBtn.disabled = true;
    btnLabel.textContent = "Booking";
    spinner.classList.remove("hidden");

    const start = new Date(selectedSlotIso);
    const end = new Date(start.getTime() + SERVICE_DURATION_MIN * 60000);
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ");

    try {
      const contactRes = await ghlPost('/contacts/upsert', {
        locationId: GHL.locationId,
        firstName: firstName || name,
        lastName: lastName || '-',
        email,
        phone,
        source: 'Non-Surgical Face & Neck Lift LP',
        tags: ['Non-Surgical Facelift & Neck Lift'],
      });
      const contactId = contactRes.contact?.id || contactRes.id;

      await ghlPost('/calendars/events/appointments', {
        calendarId: GHL.calendarId,
        locationId: GHL.locationId,
        contactId,
        assignedUserId: GHL.userId,
        startTime: start.toISOString(),
        endTime:   end.toISOString(),
        title:     `${name} — Non-Surgical Facelift & Neck Lift`,
      });

      track("Lead", { content_name: SERVICE_NAME });
      track("Schedule", { content_name: SERVICE_NAME });

      renderConfirmation({
        service: SERVICE_NAME,
        name, email, phone,
        time: selectedTime.label,
      });
      showStep("confirmed");
    } catch (err) {
      console.error("GHL booking error", err);
      const detail = (err && err.message) ? err.message : "Booking failed. Please try again or call us.";
      errorText.textContent = detail;
      errorText.classList.remove("hidden");
    } finally {
      submitBtn.disabled = false;
      btnLabel.textContent = "Schedule Appointment";
      spinner.classList.add("hidden");
    }
  });

  // ------- Confirmation rendering -------
  function renderConfirmation(p) {
    confirmCard.innerHTML = `
      <div class="row"><span class="label">Service</span><span>${escapeHtml(p.service)}</span></div>
      <div class="row"><span class="label">Date</span><span>${escapeHtml(formatLongDate(selectedDate))}</span></div>
      <div class="row"><span class="label">Time</span><span>${escapeHtml(p.time)}</span></div>
      <div class="row"><span class="label">Name</span><span>${escapeHtml(p.name)}</span></div>
      <div class="row"><span class="label">Email</span><span>${escapeHtml(p.email)}</span></div>
      <div class="row"><span class="label">Phone</span><span>${escapeHtml(p.phone)}</span></div>
    `;
    gcalLink.href = buildGCalUrl(p);
  }

  function buildGCalUrl(p) {
    const start = new Date(selectedSlotIso);
    const end = new Date(start.getTime() + SERVICE_DURATION_MIN * 60000);
    const fmt = (d) =>
      d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z";
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: SERVICE_NAME,
      dates: `${fmt(start)}/${fmt(end)}`,
      details: `Booking for ${p.name} (${p.email}, ${p.phone}).`,
    });
    return `https://calendar.google.com/calendar/render?${params.toString()}`;
  }

  function escapeHtml(s) {
    return String(s).replace(/[&<>"']/g, (c) => ({
      "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;",
    }[c]));
  }

  // ------- Reset -------
  resetBtn.addEventListener("click", () => {
    selectedDate = null;
    selectedTime = null;
    selectedSlotIso = null;
    detailsForm.reset();
    renderMonth();
    showStep("date");
  });

  // ------- Init -------
  renderMonth();
  showStep("date");
})();
