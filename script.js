(function () {
  "use strict";
  const TEST = new URLSearchParams(location.search).get('test') === '1';
  function sendLead(path, payload) {
    try {
      var _b = JSON.stringify(payload);
      if (navigator.sendBeacon && navigator.sendBeacon(path, new Blob([_b], { type: 'application/json' }))) return;
      fetch(path, { method: 'POST', headers: { 'Content-Type': 'application/json' }, keepalive: true, body: _b }).catch(function () {});
    } catch (_) {}
  }

  // ------- Configuration -------
  const SERVICE_NAME = "Summer Back Perfection Treatment";
  const SERVICE_DURATION_MIN = 60;

  // GHL credentials
  const GHL = {
    locationId: 'pJBFlsjSjC7Lty1gVlzh',
    calendarId: 'P37JWc6DyJzo9EpoJqH9',
    userId:     '2tQreqXcDpaAiSBqlK7T',
    apiKey:     'pit-19e91655-07a8-410c-921a-7391b3662655',
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
  let cachedSlots = {}; // { "2026-05-13": [{label, iso}, ...] }

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
    return d.toLocaleDateString('en-US', {
      weekday: "long", month: "long", day: "numeric", year: "numeric",
    });
  }
  function formatTimeFromIso(isoStr) {
    const d = new Date(isoStr);
    const opts = { timeZone: BUSINESS_TZ, hour: '2-digit', minute: '2-digit', hour12: true, hourCycle: 'h12' };
    return d.toLocaleTimeString('en-US', opts);
  }

  // ------- Timezone helpers -------
  function offsetMinutesForTz(date, tz) {
    const dtf = new Intl.DateTimeFormat("en-US", {
      timeZone: tz,
      year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
      hourCycle: "h23",
    });
    const parts = dtf.formatToParts(date);
    function get(t) { return parseInt(parts.find(function(p) { return p.type === t; }).value, 10); }
    const asUtc = Date.UTC(get("year"), get("month") - 1, get("day"),
      get("hour"), get("minute"), get("second"));
    return Math.round((asUtc - date.getTime()) / 60000);
  }

  function isoInTz(date, tz) {
    const off = offsetMinutesForTz(date, tz);
    const wall = new Date(date.getTime() + off * 60000);
    const sign = off >= 0 ? "+" : "-";
    const abs = Math.abs(off);
    return wall.getUTCFullYear() + "-" +
      pad(wall.getUTCMonth() + 1) + "-" +
      pad(wall.getUTCDate()) + "T" +
      pad(wall.getUTCHours()) + ":" +
      pad(wall.getUTCMinutes()) + ":00" +
      sign + pad(Math.floor(abs / 60)) + ":" + pad(abs % 60);
  }

  // ------- Fetch real available slots from GHL -------
  async function fetchSlotsForDate(date) {
    const dateKey = date.getFullYear() + '-' + pad(date.getMonth() + 1) + '-' + pad(date.getDate());
    if (cachedSlots[dateKey]) return cachedSlots[dateKey];

    // Generate all desired 1-hour slots: 9-11 AM and 12-5 PM
    var desiredHours = [9, 10, 11, 12, 13, 14, 15, 16, 17];
    var off = -420; // PDT offset
    var sign = "-";
    var absOff = 420;
    var tzString = '-07:00';

    var slots = [];
    desiredHours.forEach(function (h) {
      var iso = dateKey + 'T' + pad(h) + ':00:00' + tzString;
      // Use dateKey directly for the label (local date parts)
      var labelDate = new Date(date.getFullYear(), date.getMonth(), date.getDate(), h);
      var labelStr = labelDate.toLocaleTimeString('en-US', {
        hour: 'numeric', minute: '2-digit', hour12: true, hourCycle: 'h12'
      });
      slots.push({ label: labelStr, iso: iso });
    });

    cachedSlots[dateKey] = slots;
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
      cells.push(new Date(cursor));
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

    if (timeLoading) timeLoading.classList.add("hidden");

    const now = new Date();
    const isToday = selectedDate && sameDay(selectedDate, today);

    const available = slots.filter(s => {
      if (!isToday) return true;
      return new Date(s.iso).getTime() > now.getTime();
    });

    if (available.length === 0) {
      const msg = '<p style="font-size:.8rem;color:var(--muted-foreground);text-align:center;grid-column:1/-1;padding:6px 0;">No available slots for this date</p>';
      morningGrid.innerHTML = msg;
      return;
    }

    // Split into morning (< 12 PM) and afternoon (>= 12 PM) using timezone-aware hour
    function localHour(isoStr) {
      var d = new Date(isoStr);
      var off = offsetMinutesForTz(d, BUSINESS_TZ);
      var wall = new Date(d.getTime() + off * 60000);
      return wall.getUTCHours() + wall.getUTCMinutes() / 60;
    }
    var morning = available.filter(function (s) {
      return localHour(s.iso) < 12;
    });
    var afternoon = available.filter(function (s) {
      return localHour(s.iso) >= 12;
    });

    function renderSlotList(arr, grid) {
      if (arr.length === 0) {
        grid.innerHTML = '<p style="font-size:.8rem;color:var(--muted-foreground);text-align:center;grid-column:1/-1;padding:6px 0;">No available slots</p>';
        return;
      }
      arr.forEach(function (s) {
        var b = document.createElement("button");
        b.type = "button"; b.className = "time-cell";
        if (selectedSlotIso === s.iso) b.classList.add("selected");
        b.textContent = s.label;
        b.addEventListener("click", function () { selectTime(s); });
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
    timeSummary.textContent = formatLongDate(selectedDate);
    showStep("time");
    track("AddToCart", { content_name: SERVICE_NAME });

    // Show loading state
    const morningGrid = $("morning-grid");
    const afternoonGrid = $("afternoon-grid");
    morningGrid.innerHTML = "";
    afternoonGrid.innerHTML = "";
    if (timeLoading) timeLoading.classList.remove("hidden");

    try {
      const slots = await fetchSlotsForDate(selectedDate);
      renderTimes(slots);
    } catch (err) {
      console.error("Failed to fetch slots", err);
      if (timeLoading) timeLoading.classList.add("hidden");
      morningGrid.innerHTML = '<p style="font-size:.8rem;color:var(--muted-foreground);text-align:center;grid-column:1/-1;padding:16px 0;">Could not load available times. Please try again.</p>';
    }
  }

  function selectTime(slot) {
    selectedTime = { label: slot.label };
    selectedSlotIso = slot.iso;
    // Re-render to show selected state
    const dateKey = selectedDate.getFullYear() + '-' + pad(selectedDate.getMonth() + 1) + '-' + pad(selectedDate.getDate());
    renderTimes(cachedSlots[dateKey] || []);
    detailsSummary.textContent =
      formatLongDate(selectedDate) + ' \u2022 ' + selectedTime.label;
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
    const endMs = start.getTime() + SERVICE_DURATION_MIN * 60000;
    const endDate = new Date(endMs);
    const [firstName, ...rest] = name.split(/\s+/);
    const lastName = rest.join(" ");

    try {
      var leadId = (window.crypto && crypto.randomUUID) ? crypto.randomUUID() : ('lead_' + Date.now() + '_' + Math.random().toString(36).slice(2));
      sendLead('/api/lead', {
        leadId: leadId,
        locationId: GHL.locationId,
        client: location.hostname.split('.')[0].split('-')[0],
        page: location.hostname,
        treatment: SERVICE_NAME,
        calendarId: GHL.calendarId,
        startTime: selectedSlotIso,
        endTime: isoInTz(endDate, BUSINESS_TZ),
        name: name, email: email, phone: phone,
        fbclid: (new URLSearchParams(location.search)).get('fbclid') || undefined,
        fbp: (document.cookie.match(/_fbp=([^;]+)/) || [])[1],
        fbc: (document.cookie.match(/_fbc=([^;]+)/) || [])[1],
        test: TEST,
      });
      const contactRes = await ghlPost('/contacts/upsert', {
        locationId: GHL.locationId,
        firstName: (TEST ? "[TEST] " : "") + (firstName || name),
        lastName: lastName || '-',
        email,
        phone,
        source: 'Summer Back Perfection Treatment LP',
        tags: TEST ? ['Summer Back Perfection Treatment', 'TEST-DONOTCOUNT'] : ['Summer Back Perfection Treatment'],
      });
      const contactId = contactRes.contact?.id || contactRes.id;

      const _aptRes = await ghlPost('/calendars/events/appointments', {
        calendarId: GHL.calendarId,
        ignoreFreeSlotValidation: true,
        locationId: GHL.locationId,
        contactId,
        assignedUserId: GHL.userId,
        startTime: selectedSlotIso,
        endTime:   isoInTz(endDate, BUSINESS_TZ),
        title:     `${name} — Summer Back Perfection Treatment`,
        status:    'pending',
      });

      var appointmentId = (_aptRes && (_aptRes.id || _aptRes.appointmentId || (_aptRes.appointment && _aptRes.appointment.id))) || null;
      // Record the TRUE outcome: ghl call throws on non-2xx (-> outer catch ->
      // 'fail'), so reaching here means 2xx; a missing id is a captured lead,
      // not a booking — gate status + Schedule pixels on a real booking.
      const bookingStatus = appointmentId ? 'success' : 'lead_only';
      sendLead('/api/lead/result', { leadId: leadId, locationId: GHL.locationId, status: bookingStatus, appointmentId: appointmentId, eventId: (typeof eventId !== 'undefined' ? eventId : null), scheduleFired: (!TEST && bookingStatus === 'success'), test: TEST });
      track("Lead", { content_name: SERVICE_NAME });
      if (!TEST && bookingStatus === 'success') track("Schedule", { content_name: SERVICE_NAME });
      if (!TEST && bookingStatus === 'success') track("CompleteRegistration", { content_name: SERVICE_NAME });

      renderConfirmation({
        service: SERVICE_NAME,
        name, email, phone,
        time: selectedTime.label,
      });
      showStep("confirmed");
    } catch (err) {
      console.error("GHL booking error", err);
      sendLead('/api/lead/result', { leadId: leadId, locationId: GHL.locationId, status: 'fail', error: (err && err.message) ? err.message : String(err), test: TEST });
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
    const startMs = new Date(selectedSlotIso).getTime();
    const endMs = startMs + SERVICE_DURATION_MIN * 60000;
    const fmt = function (ms) {
      var d = new Date(ms);
      return d.getUTCFullYear() +
      pad(d.getUTCMonth() + 1) +
      pad(d.getUTCDate()) + "T" +
      pad(d.getUTCHours()) +
      pad(d.getUTCMinutes()) +
      pad(d.getUTCSeconds()) + "Z";
    };
    const params = new URLSearchParams({
      action: "TEMPLATE",
      text: SERVICE_NAME,
      dates: fmt(startMs) + "/" + fmt(endMs),
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
    cachedSlots = {};
    detailsForm.reset();
    renderMonth();
    showStep("date");
  });

  // ------- Init -------
  renderMonth();
  showStep("date");
})();