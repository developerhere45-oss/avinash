const state = {
  csrfToken: sessionStorage.getItem("doctorCsrfToken") || "",
  doctor: null,
  appointments: [],
  reviews: [],
  filter: "all",
  activeAppointment: null,
  roomEvents: null,
  roomPollTimer: null,
  seenMessages: new Set(),
  localStream: null,
  peerConnection: null,
  pendingCandidates: [],
  processedSignals: new Set(),
  role: "doctor"
};

const toast = document.querySelector("#toast");

const RENDER_API_BASE = "https://dishahealthq-c7gv.onrender.com";
const PUBLIC_WEBSITE_HOSTS = new Set(["dishahealthq.in", "www.dishahealthq.in"]);
const API_BASE = PUBLIC_WEBSITE_HOSTS.has(window.location.hostname) ? RENDER_API_BASE : "";

function apiUrl(path) {
  if (/^https?:\/\//i.test(path)) return path;
  return `${API_BASE}${path}`;
}

function apiCredentials() {
  return API_BASE ? "include" : "same-origin";
}

async function initDoctorDashboard() {
  await loadSession();
  await loadDashboard();
  bindEvents();
  if (window.lucide) {
    window.lucide.createIcons();
  } else {
    window.addEventListener("load", () => window.lucide && window.lucide.createIcons());
  }
}

async function loadSession() {
  try {
    const response = await fetch(apiUrl("/api/doctor/session"), { credentials: apiCredentials() });
    const payload = await response.json();
    if (!payload.authenticated) throw new Error("Doctor login required.");
    state.csrfToken = payload.csrfToken || state.csrfToken;
    sessionStorage.setItem("doctorCsrfToken", state.csrfToken);
    state.doctor = payload.doctor;
  } catch {
    window.location.href = "doctor-login.html";
  }
}

async function loadDashboard() {
  try {
    const response = await fetch(apiUrl("/api/doctor/appointments"), { credentials: apiCredentials() });
    const payload = await response.json();
    if (!response.ok) throw new Error(payload.message || "Dashboard unavailable.");
    state.doctor = payload.doctor;
    state.appointments = payload.appointments || [];
    state.reviews = payload.reviews || [];
    renderDoctor(payload.metrics || {});
    renderAppointments();
    renderReviews();
  } catch (error) {
    showToast(error.message || "Dashboard unavailable.");
  }
}

function renderDoctor(metrics) {
  const doctor = state.doctor || {};
  document.querySelector("#dashboardDoctorName").textContent = doctor.name || "Doctor";
  document.querySelector("#dashboardDoctorMeta").textContent = `${doctor.specialty || "Specialist"} - ${doctor.experience || "Experience"}`;
  document.querySelector("#dashboardDoctorImage").src = safeImageUrl(doctor.image) || "assets/disha-healthq-logo-new.png?v=2";
  document.querySelector("#metricTotal").textContent = metrics.total || 0;
  document.querySelector("#metricUpcoming").textContent = metrics.upcoming || 0;
  document.querySelector("#metricCompleted").textContent = metrics.completed || 0;
  document.querySelector("#metricRating").textContent = "Live";
}

function renderAppointments() {
  const list = document.querySelector("#doctorAppointmentList");
  const appointments = state.appointments.filter((appointment) => {
    if (state.filter === "all") return true;
    if (state.filter === "confirmed") return ["pending", "confirmed"].includes(appointment.status);
    return appointment.status === state.filter;
  });

  if (!appointments.length) {
    list.innerHTML = `
      <article class="appointment-empty">
        <i data-lucide="calendar-x-2"></i>
        <h3>No appointments found</h3>
        <p>New patient bookings will appear here automatically after confirmation.</p>
      </article>
    `;
    refreshIcons();
    return;
  }

  list.innerHTML = appointments.map((appointment) => `
    <article class="doctor-appointment-card">
      <div class="appointment-main">
        <span class="appointment-status ${escapeHtml(appointment.status)}">${statusLabel(appointment.status)}</span>
        <h3>${escapeHtml(appointment.patientName)}</h3>
        <p>${escapeHtml(appointment.concern || "No concern added")}</p>
        <div class="appointment-meta">
          <span><i data-lucide="calendar-clock"></i>${escapeHtml(appointment.slot)}</span>
          <span><i data-lucide="phone"></i>${escapeHtml(appointment.phone || "Phone hidden")}</span>
          <span><i data-lucide="video"></i>${escapeHtml(appointment.roomId || "Room pending")}</span>
        </div>
      </div>
      <div class="appointment-actions">
        <button type="button" data-open-room="${escapeHtml(appointment.id)}">Open VC/Chat</button>
        <button type="button" data-update-appointment="${escapeHtml(appointment.id)}" data-next-status="confirmed">Upcoming</button>
        <button type="button" data-update-appointment="${escapeHtml(appointment.id)}" data-next-status="completed">Completed</button>
        <button type="button" data-update-appointment="${escapeHtml(appointment.id)}" data-next-status="cancelled">Cancel</button>
      </div>
    </article>
  `).join("");

  list.querySelectorAll("[data-update-appointment]").forEach((button) => {
    button.addEventListener("click", () => updateAppointmentStatus(button.dataset.updateAppointment, button.dataset.nextStatus));
  });
  list.querySelectorAll("[data-open-room]").forEach((button) => {
    button.addEventListener("click", () => openDoctorRoom(button.dataset.openRoom));
  });
  refreshIcons();
}

function renderReviews() {
  const list = document.querySelector("#doctorReviewList");
  if (!state.reviews.length) {
    list.innerHTML = `
      <article class="doctor-review-card">
        <div>
          <strong>No feedback yet</strong>
          <span>Launch</span>
        </div>
        <p>Patient feedback will appear here after real consultations are completed.</p>
        <small>Waiting for first feedback</small>
      </article>
    `;
    return;
  }
  list.innerHTML = state.reviews.map((review) => `
    <article class="doctor-review-card">
      <div>
        <strong>${escapeHtml(review.patientName)}</strong>
        <span>${Number(review.rating) || 5}/5</span>
      </div>
      <p>${escapeHtml(review.text)}</p>
      <small>${escapeHtml(review.date)}</small>
    </article>
  `).join("");
}

function ensureDoctorRoomModal() {
  let modal = document.querySelector("#doctorConsultRoom");
  if (modal) return modal;
  modal = document.createElement("aside");
  modal.className = "consult-room doctor-consult-room";
  modal.id = "doctorConsultRoom";
  modal.setAttribute("aria-hidden", "true");
  modal.innerHTML = `
    <div class="consult-room-card">
      <header class="consult-room-head">
        <div>
          <span class="eyebrow">Doctor consultation room</span>
          <h2 id="doctorRoomTitle">Patient room</h2>
          <p id="doctorRoomSummary">Open VC or continue chat.</p>
        </div>
        <button class="drawer-close" type="button" id="doctorRoomClose" aria-label="Close doctor room">
          <i data-lucide="x"></i>
        </button>
      </header>
      <div class="consult-room-grid">
        <section class="video-panel" aria-label="Doctor video consultation">
          <div class="doctor-video doctor-dashboard-remote">
            <video id="doctorRemoteVideo" autoplay playsinline></video>
            <div class="video-overlay">
              <strong id="doctorRemoteLabel">Patient</strong>
              <span><i data-lucide="wifi"></i> Backend signaling</span>
            </div>
          </div>
          <div class="patient-video">
            <video id="doctorLocalVideo" muted playsinline></video>
            <div class="patient-fallback" id="doctorLocalFallback">
              <i data-lucide="stethoscope"></i>
              <span>DR</span>
            </div>
            <small>You</small>
          </div>
          <div class="call-status" id="doctorCallStatus"><span></span>Room ready</div>
          <div class="video-controls">
            <button type="button" id="doctorJoinCall"><i data-lucide="video"></i>Join VC</button>
            <button type="button" id="doctorToggleMic"><i data-lucide="mic"></i>Mic On</button>
            <button type="button" id="doctorToggleCamera"><i data-lucide="video"></i>Camera On</button>
            <button class="end-call" type="button" id="doctorEndCall"><i data-lucide="phone-off"></i>End</button>
          </div>
        </section>
        <section class="chat-panel" aria-label="Patient chat">
          <div class="chat-head">
            <div>
              <strong>Patient Chat</strong>
              <small id="doctorRoomId">Room ID: --</small>
            </div>
            <span class="chat-online"><span></span>Live</span>
          </div>
          <div class="chat-messages" id="doctorChatMessages"></div>
          <form class="chat-form" id="doctorChatForm">
            <input id="doctorChatInput" type="text" placeholder="Type message to patient..." autocomplete="off" />
            <button type="submit" aria-label="Send message"><i data-lucide="send"></i></button>
          </form>
        </section>
      </div>
    </div>
  `;
  document.body.appendChild(modal);
  modal.addEventListener("click", (event) => {
    if (event.target === modal || event.target.closest("#doctorRoomClose")) closeDoctorRoom();
  });
  modal.querySelector("#doctorJoinCall").addEventListener("click", joinDoctorCall);
  modal.querySelector("#doctorToggleMic").addEventListener("click", toggleDoctorMic);
  modal.querySelector("#doctorToggleCamera").addEventListener("click", toggleDoctorCamera);
  modal.querySelector("#doctorEndCall").addEventListener("click", () => endDoctorCall(true));
  modal.querySelector("#doctorChatForm").addEventListener("submit", (event) => {
    event.preventDefault();
    const input = modal.querySelector("#doctorChatInput");
    const text = input.value.trim();
    if (!text) return;
    input.value = "";
    sendDoctorMessage(text).catch((error) => showToast(error.message || "Message send failed."));
  });
  return modal;
}

async function openDoctorRoom(appointmentId) {
  const appointment = state.appointments.find((item) => item.id === appointmentId);
  if (!appointment?.roomId) {
    showToast("Consultation room not available for this appointment.");
    return;
  }
  state.activeAppointment = appointment;
  state.seenMessages.clear();
  const modal = ensureDoctorRoomModal();
  modal.querySelector("#doctorRoomTitle").textContent = appointment.patientName;
  modal.querySelector("#doctorRoomSummary").textContent = `${appointment.slot} - ${appointment.concern || "No concern added"}`;
  modal.querySelector("#doctorRemoteLabel").textContent = appointment.patientName;
  modal.querySelector("#doctorRoomId").textContent = `Room ID: ${appointment.roomId}`;
  modal.querySelector("#doctorChatMessages").innerHTML = "";
  modal.classList.add("open");
  modal.setAttribute("aria-hidden", "false");
  connectDoctorRoomBackend();
  refreshIcons();
}

function closeDoctorRoom() {
  endDoctorCall(true);
  disconnectDoctorRoomBackend();
  const modal = document.querySelector("#doctorConsultRoom");
  if (modal) {
    modal.classList.remove("open");
    modal.setAttribute("aria-hidden", "true");
  }
}

async function connectDoctorRoomBackend() {
  disconnectDoctorRoomBackend();
  state.processedSignals.clear();
  const roomId = state.activeAppointment?.roomId;
  if (!roomId) return;
  try {
    const snapshot = await fetch(apiUrl(`/api/consultations/${encodeURIComponent(roomId)}`), { credentials: apiCredentials() }).then((response) => response.ok ? response.json() : null);
    (snapshot?.messages || []).forEach(renderDoctorMessage);
    (snapshot?.signals || []).forEach(processDoctorSignal);
  } catch {
    showToast("Consultation backend unavailable.");
  }
  startDoctorRoomPolling(roomId);
  if (!window.EventSource) return;
  const events = new EventSource(apiUrl(`/api/consultations/${encodeURIComponent(roomId)}/events`), { withCredentials: Boolean(API_BASE) });
  state.roomEvents = events;
  events.addEventListener("connected", (event) => {
    const payload = JSON.parse(event.data);
    (payload.messages || []).forEach(renderDoctorMessage);
    (payload.signals || []).forEach(processDoctorSignal);
  });
  events.addEventListener("message", (event) => renderDoctorMessage(JSON.parse(event.data)));
  events.addEventListener("signal", (event) => processDoctorSignal(JSON.parse(event.data)));
  events.onerror = () => updateDoctorCallStatus("Realtime room reconnecting...", Boolean(state.localStream));
}

function disconnectDoctorRoomBackend() {
  stopDoctorRoomPolling();
  if (state.roomEvents) {
    state.roomEvents.close();
    state.roomEvents = null;
  }
}

function startDoctorRoomPolling(roomId) {
  stopDoctorRoomPolling();
  if (!roomId) return;
  const pollRoom = async () => {
    if (state.activeAppointment?.roomId !== roomId) return;
    try {
      const response = await fetch(apiUrl(`/api/consultations/${encodeURIComponent(roomId)}`), { credentials: apiCredentials() });
      const payload = response.ok ? await response.json() : null;
      if (!payload) return;
      (payload.messages || []).forEach(renderDoctorMessage);
      (payload.signals || []).forEach(processDoctorSignal);
    } catch {
      // SSE remains primary; polling keeps the room synced if realtime drops.
    }
  };
  pollRoom();
  state.roomPollTimer = window.setInterval(pollRoom, 1500);
}

function stopDoctorRoomPolling() {
  if (!state.roomPollTimer) return;
  window.clearInterval(state.roomPollTimer);
  state.roomPollTimer = null;
}

function renderDoctorMessage(message) {
  if (!message?.id || state.seenMessages.has(message.id)) return;
  state.seenMessages.add(message.id);
  const list = document.querySelector("#doctorChatMessages");
  if (!list) return;
  const item = document.createElement("div");
  item.className = `message ${message.senderType === "doctor" ? "patient" : "doctor"}`;
  const strong = document.createElement("strong");
  strong.textContent = message.senderType === "doctor" ? "You" : message.senderName;
  const span = document.createElement("span");
  span.textContent = message.text;
  item.append(strong, span);
  list.appendChild(item);
  list.scrollTop = list.scrollHeight;
}

async function sendDoctorMessage(text) {
  const roomId = state.activeAppointment?.roomId;
  if (!roomId) return;
  const response = await fetch(apiUrl(`/api/consultations/${encodeURIComponent(roomId)}/messages`), {
    method: "POST",
    credentials: apiCredentials(),
    headers: { "Content-Type": "application/json", "x-csrf-token": state.csrfToken },
    body: JSON.stringify({
      senderType: "doctor",
      senderName: state.doctor?.name || "Doctor",
      text
    })
  });
  const payload = await response.json().catch(() => null);
  if (!response.ok || !payload?.message) throw new Error(payload?.message || "Message send failed.");
  renderDoctorMessage(payload.message);
}

async function postDoctorSignal(type, payload = null) {
  const roomId = state.activeAppointment?.roomId;
  if (!roomId) return;
  await fetch(apiUrl(`/api/consultations/${encodeURIComponent(roomId)}/signals`), {
    method: "POST",
    credentials: apiCredentials(),
    headers: { "Content-Type": "application/json", "x-csrf-token": state.csrfToken },
    body: JSON.stringify({ type, senderType: state.role, payload })
  });
}

function createDoctorPeer() {
  if (state.peerConnection) return state.peerConnection;
  const peer = new RTCPeerConnection({
    iceServers: [{ urls: "stun:stun.l.google.com:19302" }]
  });
  state.peerConnection = peer;
  peer.onicecandidate = (event) => {
    if (event.candidate) postDoctorSignal("candidate", event.candidate).catch(() => {});
  };
  peer.ontrack = (event) => {
    const [stream] = event.streams;
    if (stream) showDoctorRemoteStream(stream);
  };
  peer.onconnectionstatechange = () => {
    if (peer.connectionState === "connected") updateDoctorCallStatus("Video call connected with patient.", true);
    if (["failed", "disconnected"].includes(peer.connectionState)) updateDoctorCallStatus("Video call disconnected. Chat remains active.", false);
  };
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => peer.addTrack(track, state.localStream));
  }
  return peer;
}

async function ensureDoctorMedia() {
  if (state.localStream) return state.localStream;
  if (!navigator.mediaDevices?.getUserMedia) throw new Error("Media devices unavailable");
  const stream = await navigator.mediaDevices.getUserMedia({ video: true, audio: true });
  state.localStream = stream;
  const localVideo = document.querySelector("#doctorLocalVideo");
  localVideo.srcObject = stream;
  await localVideo.play().catch(() => {});
  localVideo.parentElement.classList.add("has-camera");
  if (state.peerConnection) {
    stream.getTracks().forEach((track) => state.peerConnection.addTrack(track, stream));
  }
  return stream;
}

async function joinDoctorCall() {
  try {
    updateDoctorCallStatus("Requesting camera and microphone permission...", false);
    await ensureDoctorMedia();
    createDoctorPeer();
    await postDoctorSignal("join");
    updateDoctorCallStatus("Waiting for patient. Patient must open this room and click Join VC.", true);
    updateDoctorButtons();
  } catch {
    updateDoctorCallStatus("Camera permission unavailable. Chat remains active.", false);
  }
}

async function flushDoctorCandidates() {
  if (!state.peerConnection?.remoteDescription) return;
  const candidates = state.pendingCandidates.splice(0);
  for (const candidate of candidates) {
    try {
      await state.peerConnection.addIceCandidate(new RTCIceCandidate(candidate));
    } catch {
      // Candidate can expire when the other side reconnects.
    }
  }
}

function processDoctorSignal(signal) {
  if (!signal?.id || state.processedSignals.has(signal.id)) return;
  state.processedSignals.add(signal.id);
  handleDoctorSignal(signal);
}

async function handleDoctorSignal(signal) {
  if (!signal || signal.senderType === state.role) return;
  try {
    if (signal.type === "offer") {
      const peer = createDoctorPeer();
      await ensureDoctorMedia();
      await peer.setRemoteDescription(new RTCSessionDescription(signal.payload));
      await flushDoctorCandidates();
      const answer = await peer.createAnswer();
      await peer.setLocalDescription(answer);
      await postDoctorSignal("answer", peer.localDescription);
      updateDoctorCallStatus("Answer sent. Video call connecting...", true);
      updateDoctorButtons();
      return;
    }
    if (signal.type === "candidate" && signal.payload) {
      if (state.peerConnection?.remoteDescription) {
        await state.peerConnection.addIceCandidate(new RTCIceCandidate(signal.payload));
      } else {
        state.pendingCandidates.push(signal.payload);
      }
      return;
    }
    if (signal.type === "call-ended") {
      endDoctorCall(false);
      updateDoctorCallStatus("Patient ended the video call. Chat remains active.", false);
    }
  } catch {
    updateDoctorCallStatus("Video signaling issue. Chat remains active.", false);
  }
}

function showDoctorRemoteStream(stream) {
  const remoteVideo = document.querySelector("#doctorRemoteVideo");
  if (!remoteVideo) return;
  remoteVideo.srcObject = stream;
  remoteVideo.play().catch(() => {});
  remoteVideo.closest(".doctor-video")?.classList.add("has-remote");
}

function toggleDoctorMic() {
  if (!state.localStream) return;
  const enabled = !state.localStream.getAudioTracks().every((track) => track.enabled);
  state.localStream.getAudioTracks().forEach((track) => {
    track.enabled = enabled;
  });
  updateDoctorCallStatus(enabled ? "Mic enabled." : "Mic muted.", true);
  updateDoctorButtons();
}

function toggleDoctorCamera() {
  if (!state.localStream) return;
  const enabled = !state.localStream.getVideoTracks().every((track) => track.enabled);
  state.localStream.getVideoTracks().forEach((track) => {
    track.enabled = enabled;
  });
  document.querySelector("#doctorLocalVideo")?.parentElement.classList.toggle("has-camera", enabled);
  updateDoctorCallStatus(enabled ? "Camera enabled." : "Camera off.", true);
  updateDoctorButtons();
}

function endDoctorCall(shouldSignal = true) {
  if (shouldSignal && state.localStream) postDoctorSignal("call-ended").catch(() => {});
  if (state.localStream) {
    state.localStream.getTracks().forEach((track) => track.stop());
    state.localStream = null;
  }
  if (state.peerConnection) {
    state.peerConnection.close();
    state.peerConnection = null;
  }
  state.pendingCandidates = [];
  document.querySelectorAll("#doctorLocalVideo, #doctorRemoteVideo").forEach((video) => {
    video.srcObject = null;
    video.parentElement?.classList.remove("has-camera");
    video.closest(".doctor-video")?.classList.remove("has-remote");
  });
  updateDoctorCallStatus("Call ended. Chat remains available.", false);
  updateDoctorButtons();
}

function updateDoctorCallStatus(message, connected) {
  const status = document.querySelector("#doctorCallStatus");
  if (!status) return;
  status.innerHTML = `<span></span>${escapeHtml(message)}`;
  status.classList.toggle("connected", connected);
}

function updateDoctorButtons() {
  const join = document.querySelector("#doctorJoinCall");
  if (!join) return;
  join.classList.toggle("active", Boolean(state.localStream));
  join.innerHTML = state.localStream ? `<i data-lucide="video"></i>Connected` : `<i data-lucide="video"></i>Join VC`;
  refreshIcons();
}

async function updateAppointmentStatus(id, status) {
  try {
    const response = await fetch(apiUrl(`/api/doctor/appointments/${encodeURIComponent(id)}`), {
      method: "PATCH",
      credentials: apiCredentials(),
      headers: {
        "Content-Type": "application/json",
        "x-csrf-token": state.csrfToken
      },
      body: JSON.stringify({ status })
    });
    const payload = await response.json().catch(() => null);
    if (!response.ok) throw new Error(payload?.message || "Status update failed.");
    showToast(`Appointment marked ${statusLabel(status).toLowerCase()}.`);
    await loadDashboard();
  } catch (error) {
    showToast(error.message || "Status update failed.");
  }
}

function bindEvents() {
  document.querySelector("#refreshDashboard")?.addEventListener("click", loadDashboard);
  document.querySelectorAll("[data-status-filter]").forEach((button) => {
    button.addEventListener("click", () => {
      document.querySelectorAll("[data-status-filter]").forEach((item) => item.classList.remove("active"));
      button.classList.add("active");
      state.filter = button.dataset.statusFilter;
      renderAppointments();
    });
  });
  document.querySelector("#doctorLogoutButton")?.addEventListener("click", logoutDoctor);
}

async function logoutDoctor() {
  try {
    await fetch(apiUrl("/api/doctor/session"), {
      method: "DELETE",
      credentials: apiCredentials(),
      headers: { "x-csrf-token": state.csrfToken }
    });
  } catch {
    // Redirect below clears local state even when network fails.
  }
  sessionStorage.removeItem("doctorCsrfToken");
  window.location.href = "doctor-login.html";
}

function statusLabel(status) {
  return {
    pending: "Pending",
    confirmed: "Upcoming",
    completed: "Completed",
    cancelled: "Cancelled"
  }[status] || "Upcoming";
}

function showToast(message) {
  toast.textContent = message;
  toast.classList.add("show");
  clearTimeout(showToast.timer);
  showToast.timer = setTimeout(() => toast.classList.remove("show"), 3200);
}

function refreshIcons() {
  if (window.lucide) window.lucide.createIcons();
}

function safeImageUrl(value) {
  try {
    const url = new URL(String(value), window.location.origin);
    return ["http:", "https:"].includes(url.protocol) ? url.href : "";
  } catch {
    return "";
  }
}

function escapeHtml(value) {
  return String(value ?? "").replace(/[&<>"']/g, (char) => ({
    "&": "&amp;",
    "<": "&lt;",
    ">": "&gt;",
    "\"": "&quot;",
    "'": "&#039;"
  }[char]));
}

initDoctorDashboard();
